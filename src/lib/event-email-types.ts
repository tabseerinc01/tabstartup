import type { Timestamp } from 'firebase-admin/firestore';

import type {
  EventEmailType,
  EventEmailTemplateInput,
} from '@/services/email/event-email-template.service';

export const EVENT_EMAIL_SCHEMA_VERSION = 1;

export const EVENT_EMAIL_OUTBOX_STATUSES = [
  'pending',
  'processing',
  'retry_pending',
  'accepted',
  'failed',
  'skipped',
  'requires_review',
] as const;

export type EventEmailOutboxStatus =
  typeof EVENT_EMAIL_OUTBOX_STATUSES[number];

export type EventEmailTrigger =
  | 'registration'
  | 'payment_submission'
  | 'payment_decision'
  | 'payment_expiry'
  | 'scheduled_reminder'
  | 'admin_reminder';

export interface EventEmailOutboxRecord {
  emailId: string;

  eventId: string;
  orderId: string;

  type: EventEmailType;
  trigger: EventEmailTrigger;

  recipientEmail: string;

  templateInput: EventEmailTemplateInput;

  provider: 'resend';

  idempotencyKey: string;

  deliveryPayloadHash?: string;

  status: EventEmailOutboxStatus;

  attemptCount: number;

  scheduledAt: Timestamp;
  nextAttemptAt: Timestamp | null;

  firstAttemptAt: Timestamp | null;
  lastAttemptAt: Timestamp | null;

  leaseToken: string | null;
  leaseExpiresAt: Timestamp | null;

  providerEmailId: string | null;

  acceptedAt: Timestamp | null;

  lastErrorCode: string | null;
  skipReason: string | null;

  schemaVersion: typeof EVENT_EMAIL_SCHEMA_VERSION;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
