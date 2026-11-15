import 'server-only';

import {
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventRecord,
  type EventOrder,
} from '@/lib/event-types';

import {
  PAYMENT_COLLECTIONS,
} from '@/lib/payment-types';

import {
  EVENT_EMAIL_SCHEMA_VERSION,
  type EventEmailOutboxRecord,
} from '@/lib/event-email-types';

import {
  buildEventEmailTemplate,
} from './event-email-template.service';

export type EventEmailEligibility =
  | {
      eligible: true;
    }
  | {
      eligible: false;
      reason: string;
    };

function skip(
  reason: string
): EventEmailEligibility {
  return {
    eligible: false,
    reason,
  };
}

function validId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(value)
  );
}

function validTimestamp(
  value: unknown
): value is Timestamp {
  return (
    value instanceof Timestamp &&
    Number.isSafeInteger(value.toMillis()) &&
    value.toMillis() > 0
  );
}

/**
 * Read-only canonical eligibility guard.
 *
 * Caller must execute this before any
 * transaction writes.
 *
 * Never authorizes payment or ticket issuance.
 */
export async function checkEventEmailEligibility(
  tx: Transaction,
  db: Firestore,
  job: EventEmailOutboxRecord,
  now: Timestamp
): Promise<EventEmailEligibility> {
  if (
    job.schemaVersion !== EVENT_EMAIL_SCHEMA_VERSION ||
    !validId(job.emailId) ||
    !validId(job.eventId) ||
    !validId(job.orderId) ||
    job.provider !== 'resend' ||
    !job.templateInput ||
    job.templateInput.type !== job.type ||
    job.templateInput.orderId !== job.orderId ||
    !validTimestamp(now)
  ) {
    return skip('INVALID_EMAIL_JOB');
  }

  const eventRef = db
    .collection(EVENT_COLLECTIONS.events)
    .doc(job.eventId);

  const orderRef = db
    .collection(EVENT_COLLECTIONS.orders)
    .doc(job.orderId);

  const [eventSnap, orderSnap] =
    await tx.getAll(eventRef, orderRef);

  if (!eventSnap.exists || !orderSnap.exists) {
    return skip('CANONICAL_RECORD_MISSING');
  }

  const event = eventSnap.data() as EventRecord;
  const order = orderSnap.data() as EventOrder;

  if (
    event.schemaVersion !== EVENT_SCHEMA_VERSION ||
    order.schemaVersion !== EVENT_SCHEMA_VERSION ||
    event.eventId !== job.eventId ||
    order.eventId !== job.eventId ||
    order.orderId !== job.orderId ||
    event.organizerType !== 'platform' ||
    order.organizerType !== 'platform' ||
    event.organizerId !== PLATFORM_EVENT_ORGANIZER_ID ||
    order.organizerId !== PLATFORM_EVENT_ORGANIZER_ID ||
    order.purchaserEmail !== job.recipientEmail ||
    !Array.isArray(order.items) ||
    order.items.length !== 1
  ) {
    return skip('CANONICAL_LINKAGE_MISMATCH');
  }

  const item = order.items[0];
  const input = job.templateInput;

  if (
    !validTimestamp(event.startsAt) ||
    !validTimestamp(event.endsAt) ||
    event.endsAt.toMillis() <= event.startsAt.toMillis() ||
    (
      order.expiresAt !== null &&
      !validTimestamp(order.expiresAt)
    )
  ) {
    return skip('INVALID_CANONICAL_TIMESTAMPS');
  }

  const nowMs = now.toMillis();
  const startsAtMs = event.startsAt.toMillis();
  const endsAtMs = event.endsAt.toMillis();

  const deadlineMs =
    order.expiresAt?.toMillis() ?? null;

  const venue =
    item.attendanceMode === 'offline' &&
    event.venue
      ? [
          event.venue.name,
          event.venue.address,
          event.venue.city,
          event.venue.countryCode,
        ].join(', ')
      : null;

  if (
    input.eventTitle !== event.title ||
    input.eventSlug !== event.slug ||
    input.startsAtMs !== startsAtMs ||
    input.timezone !== event.timezone ||
    input.venue !== venue ||
    input.attendanceMode !== item.attendanceMode ||
    input.quantity !== item.quantity ||
    input.currency !== order.currency ||
    input.totalAmountMinor !== order.totalAmountMinor ||
    input.paymentDeadlineMs !== deadlineMs
  ) {
    return skip('EMAIL_SNAPSHOT_OUTDATED');
  }

  try {
    buildEventEmailTemplate(input);
  } catch {
    return skip('INVALID_EMAIL_TEMPLATE');
  }

  const eventActive =
    (
      event.status === 'published' ||
      event.status === 'ongoing'
    ) &&
    event.cancelledAt === null &&
    endsAtMs > nowMs;

  switch (job.type) {
    case 'payment_pending':
    case 'payment_reminder': {
      if (
        !eventActive ||
        !order.paymentRequired ||
        order.status !== 'awaiting_payment' ||
        deadlineMs === null ||
        deadlineMs <= nowMs
      ) {
        return skip('PAYMENT_NO_LONGER_PENDING');
      }

      break;
    }

    case 'payment_submitted': {
      if (
        !order.paymentRequired ||
        order.status !== 'pending_verification'
      ) {
        return skip('PAYMENT_SUBMISSION_OUTDATED');
      }

      break;
    }

    case 'registration_confirmed': {
      if (
        !eventActive ||
        order.status !== 'fulfilled' ||
        !validTimestamp(order.fulfilledAt)
      ) {
        return skip('REGISTRATION_NOT_CONFIRMED');
      }

      break;
    }

    case 'event_reminder': {
      if (
        !eventActive ||
        order.status !== 'fulfilled' ||
        !validTimestamp(order.fulfilledAt) ||
        startsAtMs <= nowMs
      ) {
        return skip('EVENT_REMINDER_OUTDATED');
      }

      break;
    }

    case 'registration_expired': {
      if (
        !order.paymentRequired ||
        order.status !== 'expired'
      ) {
        return skip('REGISTRATION_NOT_EXPIRED');
      }

      break;
    }

    case 'registration_requires_review': {
      if (
        !order.paymentRequired ||
        order.status !== 'requires_review'
      ) {
        return skip('REGISTRATION_REVIEW_OUTDATED');
      }

      break;
    }

    case 'payment_rejected': {
      if (
        !order.paymentRequired ||
        order.status !== 'cancelled' ||
        !validId(order.paymentOrderId)
      ) {
        return skip('PAYMENT_REJECTION_OUTDATED');
      }

      const paymentOrderSnap = await tx.get(
        db
          .collection(PAYMENT_COLLECTIONS.orders)
          .doc(order.paymentOrderId)
      );

      if (!paymentOrderSnap.exists) {
        return skip('PAYMENT_ORDER_MISSING');
      }

      const paymentOrder = paymentOrderSnap.data()!;

      if (
        paymentOrder.productOrderId !== order.orderId ||
        paymentOrder.resourceId !== event.eventId ||
        paymentOrder.status !== 'cancelled'
      ) {
        return skip('PAYMENT_ORDER_MISMATCH');
      }

      const paymentsSnap = await tx.get(
        db
          .collection(PAYMENT_COLLECTIONS.payments)
          .where(
            'paymentOrderId',
            '==',
            order.paymentOrderId
          )
          .limit(2)
      );

      if (paymentsSnap.size !== 1) {
        return skip('PAYMENT_REJECTION_AMBIGUOUS');
      }

      const payment = paymentsSnap.docs[0].data();

      if (
        payment.status !== 'rejected' ||
        payment.paymentOrderId !== order.paymentOrderId ||
        payment.provider !== order.provider ||
        payment.currency !== order.currency ||
        payment.amountMinor !== order.totalAmountMinor
      ) {
        return skip('PAYMENT_NOT_REJECTED');
      }

      break;
    }

    default:
      return skip('UNSUPPORTED_EMAIL_TYPE');
  }

  return {
    eligible: true,
  };
}
