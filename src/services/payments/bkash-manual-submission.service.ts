import 'server-only';

import {
  calculateBkashReviewDeadlineMs,
} from '@/lib/bkash-review-policy';

import { createHash } from 'node:crypto';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  PAYMENT_COLLECTIONS,
  PAYMENT_SCHEMA_VERSION,
  type PaymentRecord,
  type PaymentOrder,
  type ManualPaymentSubmission,
  type BkashTransactionClaim,
} from '@/lib/payment-types';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  type EventRegistration,
  type EventRegistrationRequest,
} from '@/lib/event-types';

import {
  validateBkashSubmission,
} from '@/lib/payment-lifecycle';

import {
  PaymentProviderError,
} from '@/lib/payment-provider';

import {
  RegistrationApiError,
} from '@/lib/event-registration-api';

import {
  resolveEventOrderAccessUid,
  readAuthorizedEventOrder,
} from '@/services/event-order-access.service';

import {
  readEventPaymentTransaction,
} from '@/services/payments/event-payment-transaction.service';

import {
  validateBkashAccountSnapshot,
} from '@/services/payments/bkash-manual-provider.service';

import type {
  RegistrationAccessContext,
} from '@/services/event-registration.service';

import type { EventRecord } from '@/lib/event-types';

import {
  buildPaymentSubmittedEmailJobs,
} from '@/services/email/event-email-scheduling.service';

import {
  queueEventEmailsSafely,
} from '@/services/email/event-email-outbox.service';

export interface BkashSubmissionResult {
  status: 'pending_verification';

  replayed: boolean;
}

function invalid(): never {
  throw new PaymentProviderError(
    'PAYMENT_RECORD_MISMATCH'
  );
}

function validId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value === value.trim() &&
    value !== '.' &&
    value !== '..' &&
    !/^__.*__$/.test(value) &&
    !/[/\x00-\x1f\x7f]/.test(value)
  );
}

function getClaimId(
  transactionId: string
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'bkash-transaction-v1',
        transactionId,
      ])
    )
    .digest('hex');
}

/**
 * Accept customer-reported payment information.
 *
 * Submission is not proof of payment.
 * No ticket issuance or payment confirmation.
 */
export async function submitEventBkashPayment(
  orderId: string,
  access: RegistrationAccessContext,
  input: unknown
): Promise<BkashSubmissionResult> {
  let validated;

  try {
    validated = validateBkashSubmission(
      input
    );
  } catch {
    throw new RegistrationApiError(
      400,
      'INVALID_BKASH_SUBMISSION'
    );
  }

  const {
    senderNumber,
    transactionId,
  } = validated;

  const { adminDb } =
    getFirebaseAdmin();

  const uid =
    await resolveEventOrderAccessUid(
      access
    );

  const claimId =
    getClaimId(transactionId);

  const claimRef = adminDb
    .collection(
      PAYMENT_COLLECTIONS.transactionClaims
    )
    .doc(claimId);

  return adminDb.runTransaction(
    async tx => {
      // Authorize before reading financial records.

      const authorizedOrder =
        await readAuthorizedEventOrder(
          tx,
          adminDb,
          orderId,
          access,
          uid
        );

      if (
        !authorizedOrder.paymentRequired ||
        authorizedOrder.provider !== 'bkash_manual' ||
        authorizedOrder.currency !== 'BDT' ||
        !validId(
          authorizedOrder.paymentOrderId
        )
      ) {
        throw new PaymentProviderError(
          'PAYMENT_METHOD_MISMATCH'
        );
      }

      // Handle a committed submission replay.

      if (
        authorizedOrder.status ===
          'pending_verification'
      ) {
        const paymentOrderRef = adminDb
          .collection(
            PAYMENT_COLLECTIONS.orders
          )
          .doc(
            authorizedOrder.paymentOrderId
          );

        const paymentOrderSnap =
          await tx.get(paymentOrderRef);

        if (!paymentOrderSnap.exists) {
          return invalid();
        }

        const paymentOrder =
          paymentOrderSnap.data() as PaymentOrder;

        if (
          paymentOrder.schemaVersion !==
            PAYMENT_SCHEMA_VERSION ||
          paymentOrder.orderId !==
            paymentOrderRef.id ||
          paymentOrder.productOrderId !== orderId ||
          paymentOrder.resourceId !==
            authorizedOrder.eventId ||
          paymentOrder.purpose !== 'event_ticket' ||
          paymentOrder.status !==
            'pending_verification' ||
          paymentOrder.provider !== 'bkash_manual' ||
          paymentOrder.currency !== 'BDT' ||
          paymentOrder.payerUid !==
            authorizedOrder.purchaserUid ||
          paymentOrder.amountMinor !==
            authorizedOrder.totalAmountMinor ||
          !validId(
            paymentOrder.activePaymentId
          )
        ) {
          return invalid();
        }

        const paymentRef = adminDb
          .collection(
            PAYMENT_COLLECTIONS.payments
          )
          .doc(
            paymentOrder.activePaymentId
          );

        const paymentSnap =
          await tx.get(paymentRef);

        if (!paymentSnap.exists) {
          return invalid();
        }

        const payment =
          paymentSnap.data() as PaymentRecord;

        if (
          payment.schemaVersion !==
            PAYMENT_SCHEMA_VERSION ||
          payment.paymentId !== paymentRef.id ||
          payment.orderId !== paymentOrderRef.id ||
          payment.resourceId !==
            authorizedOrder.eventId ||
          payment.purpose !== 'event_ticket' ||
          payment.payerUid !==
            authorizedOrder.purchaserUid ||
          payment.status !==
            'pending_verification' ||
          payment.provider !== 'bkash_manual' ||
          payment.currency !== 'BDT' ||
          payment.amountMinor !==
            paymentOrder.amountMinor ||
          payment.manualSubmissionId !==
            payment.paymentId
        ) {
          return invalid();
        }

        const submissionRef = adminDb
          .collection(
            PAYMENT_COLLECTIONS.manualSubmissions
          )
          .doc(payment.manualSubmissionId);

        const [submissionSnap, claimSnap] =
          await tx.getAll(
            submissionRef,
            claimRef
          );

        if (!submissionSnap.exists) {
          return invalid();
        }

        const submission =
          submissionSnap.data() as
            ManualPaymentSubmission;

        if (
          submission.senderNumber !== senderNumber ||
          submission.transactionId !== transactionId
        ) {
          throw new RegistrationApiError(
            409,
            'PAYMENT_SUBMISSION_CONFLICT'
          );
        }

        if (!claimSnap.exists) {
          return invalid();
        }

        const claim =
          claimSnap.data() as BkashTransactionClaim;

        if (
          submission.submissionId !==
            submissionRef.id ||
          submission.paymentId !== paymentRef.id ||
          submission.orderId !== paymentOrderRef.id ||
          submission.provider !== 'bkash_manual' ||
          submission.currency !== 'BDT' ||
          submission.status !==
            'pending_verification' ||
          submission.claimedAmountMinor !==
            payment.amountMinor ||
          submission.transactionClaimId !== claimId ||
          claim.schemaVersion !==
            PAYMENT_SCHEMA_VERSION ||
          claim.claimId !== claimId ||
          claim.provider !== 'bkash_manual' ||
          claim.currency !== 'BDT' ||
          claim.transactionId !== transactionId ||
          claim.paymentId !== paymentRef.id ||
          claim.paymentOrderId !== paymentOrderRef.id ||
          claim.productOrderId !== orderId ||
          claim.resourceId !==
            authorizedOrder.eventId ||
          claim.submissionId !== submissionRef.id ||
          claim.amountMinor !== payment.amountMinor
        ) {
          return invalid();
        }

        return {
          status: 'pending_verification',

          replayed: true,
        };
      }

      // Validate a new submission using the
      // shared canonical payment transaction reader.

      const records =
        await readEventPaymentTransaction(
          tx,
          adminDb,
          orderId,
          access,
          uid,
          'bkash_manual'
        );

      const {
        context,
        order,
        payment,
        refs,
      } = records;

      if (
        payment.providerPaymentId !== null ||
        payment.providerReference !== null ||
        payment.verifiedAt !== null ||
        payment.verifiedByUid !== null ||
        payment.checkoutInitiation !== undefined ||
        payment.manualSubmissionId !== undefined
      ) {
        return invalid();
      }

      const snapshot =
        validateBkashAccountSnapshot(
          payment.bkashAccountSnapshot
        );

      if (
        !validId(
          order.registrationRequestId
        )
      ) {
        return invalid();
      }

      const requestRef = adminDb
        .collection(
          EVENT_COLLECTIONS.registrationRequests
        )
        .doc(
          order.registrationRequestId
        );

      const submissionRef = adminDb
        .collection(
          PAYMENT_COLLECTIONS.manualSubmissions
        )
        .doc(context.paymentId);

      const [
        requestSnap,
        submissionSnap,
        claimSnap,
      ] = await tx.getAll(
        requestRef,
        submissionRef,
        claimRef
      );

      if (
        submissionSnap.exists ||
        !requestSnap.exists
      ) {
        return invalid();
      }

      if (claimSnap.exists) {
        throw new RegistrationApiError(
          409,
          'BKASH_TRANSACTION_ALREADY_SUBMITTED'
        );
      }

      const registrationRequest =
        requestSnap.data() as
          EventRegistrationRequest;

      const item = order.items[0];

      if (
        registrationRequest.schemaVersion !==
          EVENT_SCHEMA_VERSION ||
        registrationRequest.requestId !==
          requestRef.id ||
        registrationRequest.orderId !== orderId ||
        registrationRequest.eventId !== order.eventId ||
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
          id => adminDb
            .collection(
              EVENT_COLLECTIONS.registrations
            )
            .doc(id)
        );

      const registrationSnaps =
        await tx.getAll(
          ...registrationRefs
        );

      for (const snap of registrationSnaps) {
        if (!snap.exists) {
          return invalid();
        }

        const registration =
          snap.data() as EventRegistration;

        if (
          registration.registrationId !== snap.id ||
          registration.orderId !== orderId ||
          registration.eventId !== order.eventId ||
          registration.ticketTypeId !==
            item.ticketTypeId ||
          registration.attendanceMode !==
            item.attendanceMode ||
          registration.status !==
            'pending_payment' ||
          registration.confirmedAt !== null
        ) {
          return invalid();
        }
      }

      const eventRef = adminDb
        .collection(EVENT_COLLECTIONS.events)
        .doc(context.resourceId);

      const eventSnap =
        await tx.get(eventRef);

      const event = eventSnap.data();

      if (
        !eventSnap.exists ||
        !event ||
        event.schemaVersion !==
          EVENT_SCHEMA_VERSION ||
        event.eventId !== context.resourceId ||
        event.organizerType !== 'platform' ||
        event.organizerId !== 'tabstartup' ||
        (
          event.status !== 'published' &&
          event.status !== 'ongoing'
        ) ||
        event.cancelledAt !== null ||
        !(event.endsAt instanceof Timestamp)
      ) {
        return invalid();
      }

      const now = Timestamp.now();

      if (
        event.endsAt.toMillis() <=
          now.toMillis()
      ) {
        return invalid();
      }

      const reviewDeadlineAt =
        Timestamp.fromMillis(
          calculateBkashReviewDeadlineMs(
            now.toMillis(),
            event.endsAt.toMillis()
          )
        );

      if (
        now.toMillis() >= context.expiresAtMs
      ) {
        throw new PaymentProviderError(
          'PAYMENT_WINDOW_EXPIRED'
        );
      }

      if (
        snapshot.capturedAt.toMillis() >
          now.toMillis() ||
        snapshot.capturedAt.toMillis() <
          payment.createdAt.toMillis() ||
        snapshot.capturedAt.toMillis() >=
          context.expiresAtMs
      ) {
        return invalid();
      }

      const submission: ManualPaymentSubmission = {
        submissionId: submissionRef.id,

        paymentId: context.paymentId,

        orderId: context.paymentOrderId,

        provider: 'bkash_manual',

        currency: 'BDT',

        senderNumber,

        transactionId,

        claimedAmountMinor:
          context.amountMinor,

        bkashAccountSnapshot: snapshot,

        transactionClaimId: claimId,

        status: 'pending_verification',

        submittedAt: now,

        reviewDeadlineAt,

        reviewedByUid: null,

        reviewedAt: null,

        reviewReason: null,
      };

      const claim: BkashTransactionClaim = {
        claimId,

        provider: 'bkash_manual',

        currency: 'BDT',

        transactionId,

        paymentId: context.paymentId,

        paymentOrderId:
          context.paymentOrderId,

        productOrderId: orderId,

        resourceId: context.resourceId,

        submissionId: submissionRef.id,

        amountMinor: context.amountMinor,

        schemaVersion: PAYMENT_SCHEMA_VERSION,

        createdAt: now,
      };

      // All reads completed.
      // Commit all state changes atomically.

      queueEventEmailsSafely(
        tx,
        adminDb,
        {
          eventId: context.resourceId,
          orderId: order.orderId,
          trigger: 'payment_submission',
        },
        () => buildPaymentSubmittedEmailJobs({
          event: event as EventRecord,
          order: {
            ...order,
            status: 'pending_verification',
            updatedAt: now,
          },
          now,
        })
      );

      tx.create(claimRef, claim);

      tx.create(submissionRef, submission);

      tx.update(refs.payment, {
        status: 'pending_verification',

        manualSubmissionId: submissionRef.id,

        updatedAt: now,
      });

      tx.update(refs.paymentOrder, {
        status: 'pending_verification',

        updatedAt: now,
      });

      tx.update(refs.order, {
        status: 'pending_verification',

        updatedAt: now,
      });

      tx.update(refs.reservation, {
        status: 'pending_verification',

        reviewDeadlineAt,

        updatedAt: now,
      });

      for (const ref of registrationRefs) {
        tx.update(ref, {
          status: 'pending_verification',

          updatedAt: now,
        });
      }

      // Inventory remains reserved.
      // No ticket issuance or payment success.

      return {
        status: 'pending_verification',

        replayed: false,
      };
    }
  );
}
