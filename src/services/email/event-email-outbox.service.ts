import 'server-only';

import { createHash } from 'node:crypto';

import {
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import { EVENT_COLLECTIONS } from '@/lib/event-types';

import {
  EVENT_EMAIL_SCHEMA_VERSION,
  type EventEmailOutboxRecord,
  type EventEmailTrigger,
} from '@/lib/event-email-types';

import {
  buildEventEmailTemplate,
  type EventEmailTemplateInput,
  type EventEmailType,
} from './event-email-template.service';

export interface QueueEventEmailInput {
  eventId: string;
  orderId: string;

  recipientEmail: string;

  trigger: EventEmailTrigger;

  occurrenceKey: string;

  templateInput: EventEmailTemplateInput;

  scheduledAt: Timestamp;
  now: Timestamp;
}

const VALID_TRIGGERS: Record<
  EventEmailType,
  readonly EventEmailTrigger[]
> = {
  registration_confirmed: [
    'registration',
    'payment_decision',
  ],

  payment_submitted: [
    'payment_submission',
  ],

  payment_rejected: [
    'payment_decision',
  ],

  registration_requires_review: [
    'payment_expiry',
    'payment_decision',
  ],

  payment_pending: [
    'registration',
  ],

  payment_reminder: [
    'scheduled_reminder',
    'admin_reminder',
  ],

  registration_expired: [
    'payment_expiry',
  ],

  event_reminder: [
    'scheduled_reminder',
    'admin_reminder',
  ],
};

function validId(value: string): boolean {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(value)
  );
}

function validTimestamp(
  value: Timestamp
): boolean {
  return (
    value instanceof Timestamp &&
    Number.isSafeInteger(value.toMillis()) &&
    value.toMillis() > 0
  );
}

function validEmail(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    value === value.trim() &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function buildEventEmailId(
  eventId: string,
  orderId: string,
  type: EventEmailType,
  occurrenceKey: string
): string {
  if (
    !validId(eventId) ||
    !validId(orderId) ||
    !validId(occurrenceKey) ||
    !Object.prototype.hasOwnProperty.call(
      VALID_TRIGGERS,
      type
    )
  ) {
    throw new Error('INVALID_EVENT_EMAIL_ID_INPUT');
  }

  const hash = createHash('sha256')
    .update(
      JSON.stringify([
        'tabstartup-event-email-v1',
        eventId,
        orderId,
        type,
        occurrenceKey,
      ])
    )
    .digest('hex');

  return 'email_' + hash;
}

export function buildEventEmailOutboxRecord(
  input: QueueEventEmailInput
): EventEmailOutboxRecord {
  const type = input.templateInput.type;

  const emailId = buildEventEmailId(
    input.eventId,
    input.orderId,
    type,
    input.occurrenceKey
  );

  if (
    !validEmail(input.recipientEmail) ||
    input.templateInput.orderId !== input.orderId ||
    !VALID_TRIGGERS[type].includes(input.trigger) ||
    !validTimestamp(input.now) ||
    !validTimestamp(input.scheduledAt) ||
    input.scheduledAt.toMillis() <
      input.now.toMillis()
  ) {
    throw new Error('INVALID_EVENT_EMAIL_QUEUE_INPUT');
  }

  const paymentReminder =
    type === 'payment_pending' ||
    type === 'payment_reminder';

  if (
    paymentReminder &&
    (
      input.templateInput.paymentDeadlineMs === null ||
      input.scheduledAt.toMillis() >=
        input.templateInput.paymentDeadlineMs
    )
  ) {
    throw new Error(
      'EMAIL_SCHEDULE_AFTER_PAYMENT_DEADLINE'
    );
  }

  if (
    type === 'event_reminder' &&
    input.scheduledAt.toMillis() >=
      input.templateInput.startsAtMs
  ) {
    throw new Error(
      'EMAIL_SCHEDULE_AFTER_EVENT_START'
    );
  }

  // Validate the template before storing the job.
  buildEventEmailTemplate(input.templateInput);

  return {
    emailId,

    eventId: input.eventId,
    orderId: input.orderId,

    type,
    trigger: input.trigger,

    recipientEmail: input.recipientEmail,

    templateInput: {
      ...input.templateInput,
    },

    provider: 'resend',

    idempotencyKey:
      'tabstartup-event-email/' + emailId,

    status: 'pending',

    attemptCount: 0,

    scheduledAt: input.scheduledAt,
    nextAttemptAt: input.scheduledAt,

    firstAttemptAt: null,
    lastAttemptAt: null,

    leaseToken: null,
    leaseExpiresAt: null,

    providerEmailId: null,
    acceptedAt: null,

    lastErrorCode: null,
    skipReason: null,

    schemaVersion: EVENT_EMAIL_SCHEMA_VERSION,

    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function queueEventEmails(
  tx: Transaction,
  db: Firestore,
  inputs: readonly QueueEventEmailInput[]
): string[] {
  if (
    !Array.isArray(inputs) ||
    inputs.length < 1 ||
    inputs.length > 20
  ) {
    throw new Error('INVALID_EVENT_EMAIL_BATCH');
  }

  const records = inputs.map(
    buildEventEmailOutboxRecord
  );

  const emailIds = records.map(
    record => record.emailId
  );

  if (
    new Set(emailIds).size !== emailIds.length
  ) {
    throw new Error('DUPLICATE_EVENT_EMAIL_JOB');
  }

  const collection = db.collection(
    EVENT_COLLECTIONS.emailOutbox
  );

  // All records are validated before any writes.
  // Create-only prevents overwriting delivery history.
  for (const record of records) {
    tx.create(
      collection.doc(record.emailId),
      record
    );
  }

  return emailIds;
}


/**
 * Optional notification preparation must not block
 * payment lifecycle transitions.
 *
 * Only preparation errors are handled here.
 * Transaction write failures must still propagate.
 */
export function queueEventEmailsSafely(
  tx: Transaction,
  db: Firestore,
  context: {
    eventId: string;
    orderId: string;
    trigger: EventEmailTrigger;
  },
  prepare: () => readonly QueueEventEmailInput[]
): string[] {
  let records: EventEmailOutboxRecord[];

  try {
    const inputs = prepare();

    if (inputs.length === 0) {
      return [];
    }

    if (inputs.length > 20) {
      throw new Error('INVALID_EVENT_EMAIL_BATCH');
    }

    records = inputs.map(
      buildEventEmailOutboxRecord
    );

    const ids = records.map(
      record => record.emailId
    );

    if (new Set(ids).size !== ids.length) {
      throw new Error('DUPLICATE_EVENT_EMAIL_JOB');
    }

    for (const record of records) {
      if (
        record.eventId !== context.eventId ||
        record.orderId !== context.orderId
      ) {
        throw new Error('EMAIL_CONTEXT_MISMATCH');
      }
    }
  } catch {
    console.error(
      '[event-email] Queue preparation failed',
      {
        eventId: context.eventId,
        orderId: context.orderId,
        trigger: context.trigger,
        code: 'EMAIL_PREPARATION_FAILED',
      }
    );

    return [];
  }

  const collection = db.collection(
    EVENT_COLLECTIONS.emailOutbox
  );

  for (const record of records) {
    tx.create(
      collection.doc(record.emailId),
      record
    );
  }

  return records.map(
    record => record.emailId
  );
}
