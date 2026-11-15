import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import type {
  EventRecord,
  EventOrder,
} from '@/lib/event-types';

import type {
  EventEmailTrigger,
} from '@/lib/event-email-types';

import type {
  EventEmailType,
  EventEmailTemplateInput,
} from './event-email-template.service';

import type {
  QueueEventEmailInput,
} from './event-email-outbox.service';

const HOUR_MS = 60 * 60 * 1000;

export interface EventEmailContext {
  event: EventRecord;
  order: EventOrder;
  now: Timestamp;
}

function buildTemplateInput(
  context: EventEmailContext,
  type: EventEmailType
): EventEmailTemplateInput {
  const { event, order } = context;

  if (
    event.eventId !== order.eventId ||
    order.items.length !== 1
  ) {
    throw new Error(
      'INVALID_EVENT_EMAIL_CONTEXT'
    );
  }

  const item = order.items[0];

  const venue =
    item.attendanceMode === 'offline' &&
    event.venue !== null
      ? [
          event.venue.name,
          event.venue.address,
          event.venue.city,
          event.venue.countryCode,
        ].join(', ')
      : null;

  return {
    type,

    eventTitle: event.title,
    eventSlug: event.slug,

    // Notifications belong to the purchaser.
    // Do not assume the purchaser is an attendee.
    participantName: 'Participant',

    orderId: order.orderId,

    startsAtMs: event.startsAt.toMillis(),
    timezone: event.timezone,

    venue,

    attendanceMode: item.attendanceMode,

    quantity: item.quantity,

    currency: order.currency,

    totalAmountMinor: order.totalAmountMinor,

    paymentDeadlineMs:
      order.expiresAt?.toMillis() ?? null,
  };
}

function buildJob(
  context: EventEmailContext,
  type: EventEmailType,
  trigger: EventEmailTrigger,
  occurrenceKey: string,
  scheduledAt: Timestamp
): QueueEventEmailInput {
  return {
    eventId: context.event.eventId,

    orderId: context.order.orderId,

    recipientEmail:
      context.order.purchaserEmail,

    trigger,

    occurrenceKey,

    templateInput:
      buildTemplateInput(context, type),

    scheduledAt,

    now: context.now,
  };
}

export function buildConfirmedEventEmailJobs(
  context: EventEmailContext,
  trigger: 'registration' | 'payment_decision'
): QueueEventEmailInput[] {
  const { event, order, now } = context;

  if (
    order.status !== 'fulfilled' ||
    order.fulfilledAt === null
  ) {
    throw new Error(
      'EMAIL_ORDER_NOT_FULFILLED'
    );
  }

  const jobs: QueueEventEmailInput[] = [
    buildJob(
      context,
      'registration_confirmed',
      trigger,
      'initial',
      now
    ),
  ];

  const startsAtMs =
    event.startsAt.toMillis();

  const reminders = [
    {
      key: 'before_24h',
      offset: 24 * HOUR_MS,
    },
    {
      key: 'before_3h',
      offset: 3 * HOUR_MS,
    },
  ];

  for (const reminder of reminders) {
    const scheduledMs =
      startsAtMs - reminder.offset;

    if (scheduledMs <= now.toMillis()) {
      continue;
    }

    jobs.push(
      buildJob(
        context,
        'event_reminder',
        'scheduled_reminder',
        reminder.key,
        Timestamp.fromMillis(scheduledMs)
      )
    );
  }

  return jobs;
}

export function buildRegistrationEmailJobs(
  context: EventEmailContext
): QueueEventEmailInput[] {
  const { order, now } = context;

  if (!order.paymentRequired) {
    return buildConfirmedEventEmailJobs(
      context,
      'registration'
    );
  }

  if (
    order.status !== 'awaiting_payment' ||
    order.expiresAt === null
  ) {
    throw new Error(
      'EMAIL_ORDER_NOT_AWAITING_PAYMENT'
    );
  }

  const nowMs = now.toMillis();

  const deadlineMs =
    order.expiresAt.toMillis();

  if (deadlineMs <= nowMs) {
    return [];
  }

  const jobs: QueueEventEmailInput[] = [
    buildJob(
      context,
      'payment_pending',
      'registration',
      'initial',
      now
    ),
  ];

  const reminderMs =
    nowMs +
    Math.floor((deadlineMs - nowMs) / 2);

  if (
    reminderMs > nowMs &&
    reminderMs < deadlineMs
  ) {
    jobs.push(
      buildJob(
        context,
        'payment_reminder',
        'scheduled_reminder',
        'payment_window_midpoint',
        Timestamp.fromMillis(reminderMs)
      )
    );
  }

  return jobs;
}

export function buildPaymentSubmittedEmailJobs(
  context: EventEmailContext
): QueueEventEmailInput[] {
  if (
    !context.order.paymentRequired ||
    context.order.status !== 'pending_verification'
  ) {
    throw new Error(
      'EMAIL_PAYMENT_NOT_SUBMITTED'
    );
  }

  return [
    buildJob(
      context,
      'payment_submitted',
      'payment_submission',
      'initial',
      context.now
    ),
  ];
}

export function buildPaymentRejectedEmailJobs(
  context: EventEmailContext
): QueueEventEmailInput[] {
  if (
    !context.order.paymentRequired ||
    context.order.status !== 'cancelled'
  ) {
    throw new Error(
      'EMAIL_PAYMENT_NOT_REJECTED'
    );
  }

  return [
    buildJob(
      context,
      'payment_rejected',
      'payment_decision',
      'initial',
      context.now
    ),
  ];
}

export function buildExpiredRegistrationEmailJobs(
  context: EventEmailContext
): QueueEventEmailInput[] {
  if (!context.order.paymentRequired) {
    throw new Error(
      'EMAIL_EXPIRY_REQUIRES_PAID_ORDER'
    );
  }

  if (context.order.status === 'requires_review') {
    return [
      buildJob(
        context,
        'registration_requires_review',
        'payment_expiry',
        'initial',
        context.now
      ),
    ];
  }

  if (context.order.status !== 'expired') {
    throw new Error(
      'EMAIL_ORDER_NOT_EXPIRED'
    );
  }

  return [
    buildJob(
      context,
      'registration_expired',
      'payment_expiry',
      'initial',
      context.now
    ),
  ];
}
