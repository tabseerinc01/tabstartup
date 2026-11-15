import 'server-only';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventReservation,
  type PersistedEventOrder,
  type EventRegistration,
  type EventRegistrationRequest,
} from '@/lib/event-types';

import {
  PAYMENT_COLLECTIONS,
  type PaymentOrder,
  type PaymentRecord,
} from '@/lib/payment-types';

import {
  isValidEventDocumentId,
  calculateTicketTotalMinor,
} from '@/lib/event-validation';

import {
  canTransitionPaymentStatus,
  canTransitionPaymentOrderStatus,
} from '@/lib/payment-lifecycle';

import {
  validatePendingPaymentIntegrity,
} from '@/services/payments/payment-provider.service';

import {
  prepareEventInventoryRelease,
  applyEventInventoryRelease,
} from '@/services/event-inventory-release.service';

function invalid(): never {
  throw new Error(
    'INVALID_UNPAID_RESERVATION'
  );
}

function validId(
  value: unknown
): value is string {
  return (
    isValidEventDocumentId(value) &&
    !/^__.*__$/.test(value)
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

export type UnpaidExpiryResult = {
  reservationId: string;

  status:
    | 'missing'
    | 'not_active'
    | 'not_due'
    | 'expired'
    | 'requires_review';

  inventoryReleased: boolean;
};

/**
 * Internal maintenance operation.
 *
 * No customer-facing access.
 * Caller must be an authorized worker.
 *
 * Provider-side payment outcomes are
 * never inferred from local expiry.
 */
export async function expireUnpaidEventReservation(
  reservationId: string
): Promise<UnpaidExpiryResult> {
  if (!validId(reservationId)) {
    return invalid();
  }

  const { adminDb } =
    getFirebaseAdmin();

  const reservationRef = adminDb
    .collection(
      EVENT_COLLECTIONS.reservations
    )
    .doc(reservationId);

  return adminDb.runTransaction(
    async tx => {
      const reservationSnap =
        await tx.get(reservationRef);

      if (!reservationSnap.exists) {
        return {
          reservationId,
          status: 'missing',
          inventoryReleased: false,
        };
      }

      const reservation =
        reservationSnap.data() as
          EventReservation;

      if (
        reservation.status !== 'active'
      ) {
        return {
          reservationId,
          status: 'not_active',
          inventoryReleased: false,
        };
      }

      if (
        reservation.reservationId !==
          reservationId ||
        !validId(reservation.eventId) ||
        !validId(reservation.orderId) ||
        reservation.consumedAt !== null ||
        reservation.releasedAt !== null ||
        reservation.reviewDeadlineAt !==
          undefined
      ) {
        return invalid();
      }

      const now = Timestamp.now();

      const nowMs = now.toMillis();

      const expiresAtMs =
        timestampMs(reservation.expiresAt);

      if (expiresAtMs > nowMs) {
        return {
          reservationId,
          status: 'not_due',
          inventoryReleased: false,
        };
      }

      const orderRef = adminDb
        .collection(EVENT_COLLECTIONS.orders)
        .doc(reservation.orderId);

      const orderSnap =
        await tx.get(orderRef);

      if (!orderSnap.exists) {
        return invalid();
      }

      const order =
        orderSnap.data() as
          PersistedEventOrder;

      if (
        order.schemaVersion !==
          EVENT_SCHEMA_VERSION ||
        order.orderId !==
          reservation.orderId ||
        order.eventId !==
          reservation.eventId ||
        order.organizerType !== 'platform' ||
        order.organizerId !==
          PLATFORM_EVENT_ORGANIZER_ID ||
        order.reservationId !==
          reservationId ||
        order.paymentRequired !== true ||
        !validId(order.paymentOrderId) ||
        !validId(order.registrationRequestId) ||
        order.status !== 'awaiting_payment' ||
        order.successfulPaymentId !== null ||
        order.paidAt !== null ||
        order.fulfilledAt !== null ||
        timestampMs(order.expiresAt) !==
          expiresAtMs ||
        !Array.isArray(order.items) ||
        order.items.length !== 1
      ) {
        return invalid();
      }

      const item = order.items[0];

      if (
        !item ||
        !validId(item.ticketTypeId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 20 ||
        !Number.isSafeInteger(
          item.unitAmountMinor
        ) ||
        item.unitAmountMinor <= 0 ||
        (
          item.attendanceMode !== 'online' &&
          item.attendanceMode !== 'offline'
        )
      ) {
        return invalid();
      }

      const total =
        calculateTicketTotalMinor(
          item.unitAmountMinor,
          item.quantity
        );

      if (
        total !== order.totalAmountMinor
      ) {
        return invalid();
      }

      const paymentOrderRef = adminDb
        .collection(
          PAYMENT_COLLECTIONS.orders
        )
        .doc(order.paymentOrderId);

      const requestRef = adminDb
        .collection(
          EVENT_COLLECTIONS.registrationRequests
        )
        .doc(order.registrationRequestId);

      const [
        paymentOrderSnap,
        requestSnap,
      ] = await tx.getAll(
        paymentOrderRef,
        requestRef
      );

      if (
        !paymentOrderSnap.exists ||
        !requestSnap.exists
      ) {
        return invalid();
      }

      const paymentOrder =
        paymentOrderSnap.data() as
          PaymentOrder;

      if (
        paymentOrder.orderId !==
          order.paymentOrderId ||
        paymentOrder.productOrderId !==
          order.orderId ||
        paymentOrder.resourceId !==
          order.eventId ||
        paymentOrder.purpose !==
          'event_ticket' ||
        paymentOrder.payerUid !==
          order.purchaserUid ||
        paymentOrder.payerEmail !==
          order.purchaserEmail ||
        paymentOrder.amountMinor !==
          order.totalAmountMinor ||
        paymentOrder.provider !==
          order.provider ||
        paymentOrder.currency !==
          order.currency ||
        paymentOrder.verificationMode !==
          order.verificationMode ||
        !validId(paymentOrder.activePaymentId)
      ) {
        return invalid();
      }

      const paymentRef = adminDb
        .collection(
          PAYMENT_COLLECTIONS.payments
        )
        .doc(paymentOrder.activePaymentId);

      const submissionRef = adminDb
        .collection(
          PAYMENT_COLLECTIONS.manualSubmissions
        )
        .doc(paymentOrder.activePaymentId);

      const [
        paymentSnap,
        submissionSnap,
      ] = await tx.getAll(
        paymentRef,
        submissionRef
      );

      if (
        !paymentSnap.exists ||
        submissionSnap.exists
      ) {
        return invalid();
      }

      const payment =
        paymentSnap.data() as PaymentRecord;

      const context =
        validatePendingPaymentIntegrity(
          paymentOrder,
          payment
        );

      if (
        context.paymentId !== paymentRef.id ||
        context.expiresAtMs !== expiresAtMs ||
        payment.manualSubmissionId !==
          undefined
      ) {
        return invalid();
      }

      const request =
        requestSnap.data() as
          EventRegistrationRequest;

      if (
        request.schemaVersion !==
          EVENT_SCHEMA_VERSION ||
        request.requestId !==
          order.registrationRequestId ||
        request.orderId !== order.orderId ||
        request.eventId !== order.eventId ||
        request.purchaserUid !==
          order.purchaserUid ||
        !Array.isArray(request.registrationIds) ||
        request.registrationIds.length !==
          item.quantity ||
        !request.registrationIds.every(validId) ||
        new Set(
          request.registrationIds
        ).size !== item.quantity
      ) {
        return invalid();
      }

      const registrationRefs =
        request.registrationIds.map(
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

      for (
        const snap of registrationSnaps
      ) {
        if (!snap.exists) {
          return invalid();
        }

        const registration =
          snap.data() as EventRegistration;

        if (
          registration.registrationId !==
            snap.id ||
          registration.orderId !==
            order.orderId ||
          registration.eventId !==
            order.eventId ||
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

      // Any evidence of provider interaction
      // requires conservative recovery.
      //
      // Never erase checkout claims or
      // immutable receiving account snapshots.

      const hasPaymentEvidence =
        payment.bkashAccountSnapshot !==
          undefined ||
        payment.checkoutInitiation !==
          undefined ||
        payment.providerPaymentId !== null ||
        payment.providerReference !== null;

      const nextStatus =
        hasPaymentEvidence
          ? 'requires_review' as const
          : 'expired' as const;

      if (
        !canTransitionPaymentStatus(
          payment,
          nextStatus,
          'system'
        ) ||
        !canTransitionPaymentOrderStatus(
          paymentOrder.status,
          nextStatus
        ) ||
        !canTransitionPaymentOrderStatus(
          order.status,
          nextStatus
        )
      ) {
        return invalid();
      }

      const releasePlan =
        await prepareEventInventoryRelease(
          tx,
          adminDb,
          {
            reservationId,

            eventId: order.eventId,

            orderId: order.orderId,

            ticketTypeId:
              item.ticketTypeId,

            quantity: item.quantity,

            expectedStatus: 'active',

            releaseStatus: 'expired',

            reason:
              'payment_window_expired',

            actor: {
              actorType: 'system',

              actorUid: null,
            },

            now,
          }
        );

      // All transaction reads are complete.

      tx.update(paymentRef, {
        status: nextStatus,

        updatedAt: now,
      });

      tx.update(paymentOrderRef, {
        status: nextStatus,

        updatedAt: now,
      });

      tx.update(orderRef, {
        status: nextStatus,

        updatedAt: now,
      });

      for (
        const ref of registrationRefs
      ) {
        tx.update(ref, {
          status: hasPaymentEvidence
            ? 'requires_review'
            : 'cancelled',

          updatedAt: now,
        });
      }

      applyEventInventoryRelease(
        tx,
        releasePlan
      );

      return {
        reservationId,

        status: nextStatus,

        inventoryReleased: true,
      };
    }
  );
}
