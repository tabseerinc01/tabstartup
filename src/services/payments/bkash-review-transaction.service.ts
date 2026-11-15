import 'server-only';

import {
  BKASH_REVIEW_WINDOW_MS,
} from '@/lib/bkash-review-policy';

import { createHash } from 'node:crypto';

import {
  Timestamp,
  type Transaction,
  type Firestore,
} from 'firebase-admin/firestore';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventRecord,
  type EventReservation,
  type EventTicketInventory,
  type EventRegistration,
  type EventRegistrationRequest,
} from '@/lib/event-types';

import {
  PAYMENT_COLLECTIONS,
  PAYMENT_SCHEMA_VERSION,
  type PaymentOrder,
  type PaymentRecord,
  type ManualPaymentSubmission,
  type BkashTransactionClaim,
} from '@/lib/payment-types';

import {
  isValidInventoryCounters,
  calculateTicketTotalMinor,
} from '@/lib/event-validation';

import {
  BkashAdminReviewError,
  isValidReviewDocumentId as validId,
  projectPendingBkashSubmission,
} from '@/services/payments/bkash-admin-review.service';

import {
  validateBkashAccountSnapshot,
} from '@/services/payments/bkash-manual-provider.service';

function invalid(): never {
  throw new BkashAdminReviewError(
    'INVALID_PAYMENT_SUBMISSION'
  );
}

function timestampMs(
  value: unknown
): number {
  if (!(value instanceof Timestamp)) {
    return invalid();
  }

  const ms = value.toMillis();

  if (
    !Number.isSafeInteger(ms) ||
    ms <= 0 ||
    ms > 253402300799999
  ) {
    return invalid();
  }

  return ms;
}

function validOwner(
  value: unknown
): boolean {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false;
  }

  const owner = value as {
    ownerType?: unknown;
    ownerId?: unknown;
  };

  return (
    owner.ownerType === 'platform' &&
    owner.ownerId ===
      PLATFORM_EVENT_ORGANIZER_ID
  );
}

/**
 * Internal canonical review guard.
 *
 * Caller must authenticate and revalidate
 * administrative payment permissions
 * inside the same transaction.
 *
 * No writes or provider calls.
 */
export async function readPendingBkashReviewTransaction(
  tx: Transaction,
  db: Firestore,
  submissionId: string
) {
  if (!validId(submissionId)) {
    return invalid();
  }

  const submissionRef = db
    .collection(
      PAYMENT_COLLECTIONS.manualSubmissions
    )
    .doc(submissionId);

  const submissionSnap =
    await tx.get(submissionRef);

  if (!submissionSnap.exists) {
    throw new BkashAdminReviewError(
      'PAYMENT_SUBMISSION_NOT_FOUND'
    );
  }

  const submission =
    submissionSnap.data() as
      ManualPaymentSubmission;

  if (
    submission.status !==
      'pending_verification'
  ) {
    throw new BkashAdminReviewError(
      'PAYMENT_REVIEW_CONFLICT'
    );
  }

  const summary =
    projectPendingBkashSubmission(
      submissionId,
      submission
    );

  const claimId = createHash('sha256')
    .update(
      JSON.stringify([
        'bkash-transaction-v1',
        submission.transactionId,
      ])
    )
    .digest('hex');

  if (
    submission.transactionClaimId !==
      claimId
  ) {
    return invalid();
  }

  const paymentRef = db
    .collection(PAYMENT_COLLECTIONS.payments)
    .doc(submission.paymentId);

  const paymentOrderRef = db
    .collection(PAYMENT_COLLECTIONS.orders)
    .doc(submission.orderId);

  const claimRef = db
    .collection(
      PAYMENT_COLLECTIONS.transactionClaims
    )
    .doc(claimId);

  const [
    paymentSnap,
    paymentOrderSnap,
    claimSnap,
  ] = await tx.getAll(
    paymentRef,
    paymentOrderRef,
    claimRef
  );

  if (
    !paymentSnap.exists ||
    !paymentOrderSnap.exists ||
    !claimSnap.exists
  ) {
    return invalid();
  }

  const payment =
    paymentSnap.data() as PaymentRecord;

  const paymentOrder =
    paymentOrderSnap.data() as PaymentOrder;

  const claim =
    claimSnap.data() as BkashTransactionClaim;

  const amount =
    submission.claimedAmountMinor;

  if (
    payment.schemaVersion !==
      PAYMENT_SCHEMA_VERSION ||
    paymentOrder.schemaVersion !==
      PAYMENT_SCHEMA_VERSION ||
    payment.paymentId !== paymentRef.id ||
    payment.orderId !== paymentOrderRef.id ||
    paymentOrder.orderId !==
      paymentOrderRef.id ||
    paymentOrder.activePaymentId !==
      paymentRef.id ||
    payment.manualSubmissionId !==
      submissionId ||
    payment.status !==
      'pending_verification' ||
    paymentOrder.status !==
      'pending_verification' ||
    payment.purpose !== 'event_ticket' ||
    paymentOrder.purpose !== 'event_ticket' ||
    payment.provider !== 'bkash_manual' ||
    paymentOrder.provider !== 'bkash_manual' ||
    payment.currency !== 'BDT' ||
    paymentOrder.currency !== 'BDT' ||
    payment.verificationMode !== 'manual' ||
    paymentOrder.verificationMode !== 'manual' ||
    payment.amountMinor !== amount ||
    paymentOrder.amountMinor !== amount ||
    payment.refundedAmountMinor !== 0 ||
    paymentOrder.refundedAmountMinor !== 0 ||
    payment.providerPaymentId !== null ||
    payment.providerReference !== null ||
    payment.verifiedAt !== null ||
    payment.verifiedByUid !== null ||
    payment.checkoutInitiation !== undefined ||
    paymentOrder.successfulPaymentId !== null ||
    paymentOrder.paidAt !== null ||
    paymentOrder.fulfilledAt !== null ||
    !validOwner(payment.owner) ||
    !validOwner(paymentOrder.owner) ||
    payment.payerUid !== paymentOrder.payerUid ||
    !validId(paymentOrder.productOrderId) ||
    !validId(paymentOrder.resourceId) ||
    payment.resourceId !==
      paymentOrder.resourceId
  ) {
    return invalid();
  }

  if (
    claim.schemaVersion !==
      PAYMENT_SCHEMA_VERSION ||
    claim.claimId !== claimId ||
    claim.provider !== 'bkash_manual' ||
    claim.currency !== 'BDT' ||
    claim.transactionId !==
      submission.transactionId ||
    claim.paymentId !== paymentRef.id ||
    claim.paymentOrderId !==
      paymentOrderRef.id ||
    claim.productOrderId !==
      paymentOrder.productOrderId ||
    claim.resourceId !==
      paymentOrder.resourceId ||
    claim.submissionId !== submissionId ||
    claim.amountMinor !== amount ||
    timestampMs(claim.createdAt) !==
      summary.submittedAtMs
  ) {
    return invalid();
  }

  const paymentSnapshot =
    validateBkashAccountSnapshot(
      payment.bkashAccountSnapshot
    );

  const submissionSnapshot =
    validateBkashAccountSnapshot(
      submission.bkashAccountSnapshot
    );

  if (
    paymentSnapshot.receivingNumber !==
      submissionSnapshot.receivingNumber ||
    paymentSnapshot.accountType !==
      submissionSnapshot.accountType ||
    paymentSnapshot.paymentMethod !==
      submissionSnapshot.paymentMethod ||
    paymentSnapshot.configVersion !==
      submissionSnapshot.configVersion ||
    timestampMs(paymentSnapshot.capturedAt) !==
      timestampMs(submissionSnapshot.capturedAt)
  ) {
    return invalid();
  }

  const orderRef = db
    .collection(EVENT_COLLECTIONS.orders)
    .doc(paymentOrder.productOrderId);

  const eventRef = db
    .collection(EVENT_COLLECTIONS.events)
    .doc(paymentOrder.resourceId);

  const [
    orderSnap,
    eventSnap,
  ] = await tx.getAll(
    orderRef,
    eventRef
  );

  if (
    !orderSnap.exists ||
    !eventSnap.exists
  ) {
    return invalid();
  }

  const order = orderSnap.data()!;

  const event =
    eventSnap.data() as EventRecord;

  if (
    order.schemaVersion !==
      EVENT_SCHEMA_VERSION ||
    order.orderId !== orderRef.id ||
    order.eventId !== eventRef.id ||
    order.organizerType !== 'platform' ||
    order.organizerId !==
      PLATFORM_EVENT_ORGANIZER_ID ||
    order.paymentRequired !== true ||
    order.paymentOrderId !==
      paymentOrderRef.id ||
    order.status !== 'pending_verification' ||
    order.provider !== 'bkash_manual' ||
    order.currency !== 'BDT' ||
    order.verificationMode !== 'manual' ||
    order.totalAmountMinor !== amount ||
    order.purchaserUid !==
      paymentOrder.payerUid ||
    order.purchaserEmail !==
      paymentOrder.payerEmail ||
    order.successfulPaymentId !== null ||
    order.paidAt !== null ||
    order.fulfilledAt !== null ||
    !validId(order.reservationId) ||
    !validId(order.registrationRequestId) ||
    !Array.isArray(order.items) ||
    order.items.length !== 1 ||
    event.schemaVersion !==
      EVENT_SCHEMA_VERSION ||
    event.eventId !== eventRef.id ||
    event.organizerType !== 'platform' ||
    event.organizerId !==
      PLATFORM_EVENT_ORGANIZER_ID
  ) {
    return invalid();
  }

  const item = order.items[0];

  if (
    !item ||
    !validId(item.ticketTypeId) ||
    (
      item.attendanceMode !== 'online' &&
      item.attendanceMode !== 'offline'
    ) ||
    !Number.isSafeInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 20 ||
    !Number.isSafeInteger(
      item.unitAmountMinor
    ) ||
    item.unitAmountMinor <= 0 ||
    item.totalAmountMinor !== amount ||
    calculateTicketTotalMinor(
      item.unitAmountMinor,
      item.quantity
    ) !== amount
  ) {
    return invalid();
  }

  const reservationRef = db
    .collection(EVENT_COLLECTIONS.reservations)
    .doc(order.reservationId);

  const inventoryRef = db
    .collection(EVENT_COLLECTIONS.inventory)
    .doc(item.ticketTypeId);

  const requestRef = db
    .collection(
      EVENT_COLLECTIONS.registrationRequests
    )
    .doc(order.registrationRequestId);

  const [
    reservationSnap,
    inventorySnap,
    requestSnap,
  ] = await tx.getAll(
    reservationRef,
    inventoryRef,
    requestRef
  );

  if (
    !reservationSnap.exists ||
    !inventorySnap.exists ||
    !requestSnap.exists
  ) {
    return invalid();
  }

  const reservation =
    reservationSnap.data() as
      EventReservation;

  const inventory =
    inventorySnap.data() as
      EventTicketInventory;

  const registrationRequest =
    requestSnap.data() as
      EventRegistrationRequest;

  if (
    reservation.reservationId !==
      reservationRef.id ||
    reservation.eventId !== eventRef.id ||
    reservation.orderId !== orderRef.id ||
    reservation.status !==
      'pending_verification' ||
    reservation.consumedAt !== null ||
    reservation.releasedAt !== null ||
    !Array.isArray(reservation.items) ||
    reservation.items.length !== 1 ||
    !reservation.items[0] ||
    reservation.items[0].ticketTypeId !==
      item.ticketTypeId ||
    reservation.items[0].quantity !==
      item.quantity ||
    inventory.eventId !== eventRef.id ||
    inventory.ticketTypeId !==
      item.ticketTypeId ||
    !isValidInventoryCounters(inventory) ||
    inventory.reservedQuantity <
      item.quantity
  ) {
    return invalid();
  }

  const expiresAtMs =
    timestampMs(order.expiresAt);

  if (
    timestampMs(paymentOrder.expiresAt) !==
      expiresAtMs ||
    timestampMs(reservation.expiresAt) !==
      expiresAtMs ||
    summary.submittedAtMs >= expiresAtMs ||
    timestampMs(paymentSnapshot.capturedAt) <
      timestampMs(payment.createdAt) ||
    timestampMs(paymentSnapshot.capturedAt) >
      summary.submittedAtMs
  ) {
    return invalid();
  }

  if (
    registrationRequest.schemaVersion !==
      EVENT_SCHEMA_VERSION ||
    registrationRequest.requestId !==
      requestRef.id ||
    registrationRequest.orderId !==
      orderRef.id ||
    registrationRequest.eventId !==
      eventRef.id ||
    registrationRequest.purchaserUid !==
      order.purchaserUid ||
    !Array.isArray(
      registrationRequest.registrationIds
    ) ||
    registrationRequest.registrationIds.length !==
      item.quantity ||
    !registrationRequest.registrationIds.every(
      validId
    ) ||
    new Set(
      registrationRequest.registrationIds
    ).size !== item.quantity
  ) {
    return invalid();
  }

  const registrationRefs =
    registrationRequest.registrationIds.map(
      id => db
        .collection(
          EVENT_COLLECTIONS.registrations
        )
        .doc(id)
    );

  const registrationSnaps =
    await tx.getAll(
      ...registrationRefs
    );

  const registrations =
    registrationSnaps.map(snap => {
      if (!snap.exists) {
        return invalid();
      }

      const registration =
        snap.data() as EventRegistration;

      if (
        registration.registrationId !==
          snap.id ||
        registration.orderId !==
          orderRef.id ||
        registration.eventId !==
          eventRef.id ||
        registration.ticketTypeId !==
          item.ticketTypeId ||
        registration.attendanceMode !==
          item.attendanceMode ||
        registration.status !==
          'pending_verification' ||
        registration.confirmedAt !== null
      ) {
        return invalid();
      }

      return registration;
    });

  const nowMs = Date.now();

  if (summary.submittedAtMs > nowMs) {
    return invalid();
  }

  const submissionDeadline =
    submission.reviewDeadlineAt;

  const reservationDeadline =
    reservation.reviewDeadlineAt;

  let reviewDeadlineAtMs: number | null = null;

  if (
    submissionDeadline !== undefined ||
    reservationDeadline !== undefined
  ) {
    if (
      submissionDeadline === undefined ||
      reservationDeadline === undefined
    ) {
      return invalid();
    }

    const submittedDeadlineMs =
      timestampMs(submissionDeadline);

    const reservedDeadlineMs =
      timestampMs(reservationDeadline);

    if (
      submittedDeadlineMs !== reservedDeadlineMs ||
      submittedDeadlineMs <= summary.submittedAtMs ||
      submittedDeadlineMs >
        summary.submittedAtMs + BKASH_REVIEW_WINDOW_MS
    ) {
      return invalid();
    }

    reviewDeadlineAtMs =
      submittedDeadlineMs;
  }

  const eventEligible =
    (
      event.status === 'published' ||
      event.status === 'ongoing'
    ) &&
    event.cancelledAt === null &&
    timestampMs(event.endsAt) > nowMs;

  const approvalBlockers: string[] = [];

  if (!eventEligible) {
    approvalBlockers.push(
      'EVENT_NOT_ELIGIBLE'
    );
  }

  if (reviewDeadlineAtMs === null) {
    approvalBlockers.push(
      'REVIEW_DEADLINE_MISSING'
    );
  } else if (
    reviewDeadlineAtMs <= nowMs
  ) {
    approvalBlockers.push(
      'REVIEW_DEADLINE_ELAPSED'
    );
  }

  return {
    summary,

    submission,
    claim,
    payment,
    paymentOrder,
    order,
    event,
    item,
    reservation,
    inventory,
    registrationRequest,
    registrations,

    expiresAtMs,

    reviewDeadlineAtMs,

    approvalBlockers,

    refs: {
      submission: submissionRef,
      claim: claimRef,
      payment: paymentRef,
      paymentOrder: paymentOrderRef,
      order: orderRef,
      event: eventRef,
      reservation: reservationRef,
      inventory: inventoryRef,
      registrationRequest: requestRef,
      registrations: registrationRefs,
    },
  };
}
