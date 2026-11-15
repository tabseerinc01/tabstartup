import 'server-only';

import { createHash } from 'node:crypto';

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
  type EventTicketType,
} from '@/lib/event-types';

import {
  EVENT_INVITATION_SCHEMA_VERSION,
  type EventInvitation,
} from '@/lib/event-invitation-types';

import {
  EVENT_EMAIL_SCHEMA_VERSION,
} from '@/lib/event-email-types';

import type {
  EventInvitationEmailOutboxRecord,
  EventInvitationEmailTrigger,
} from '@/lib/event-invitation-email-types';

import {
  isValidEventInvitationId,
} from '@/lib/event-invitation-token';

import {
  validateEventInvitationEmailTemplate,
  type EventInvitationEmailTemplateInput,
} from './event-invitation-email-template.service';

export interface QueueEventInvitationEmailInput {
  event: EventRecord;

  ticket: EventTicketType;

  invitation: EventInvitation;

  trigger: EventInvitationEmailTrigger;

  now: Timestamp;
}

function validId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(value) &&
    !/^__.*__$/.test(value)
  );
}

function validEmail(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    value === value.trim().toLowerCase() &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) &&
    !/[\u0000-\u001f\u007f]/.test(value)
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

export function buildEventInvitationEmailId(
  eventId: string,
  invitationId: string,
  tokenVersion: number
): string {
  if (
    !validId(eventId) ||
    !isValidEventInvitationId(invitationId) ||
    !Number.isSafeInteger(tokenVersion) ||
    tokenVersion < 1
  ) {
    throw new Error(
      'INVALID_INVITATION_EMAIL_ID_INPUT'
    );
  }

  const hash = createHash('sha256')
    .update(
      JSON.stringify([
        'tabstartup-event-invitation-email-v1',
        eventId,
        invitationId,
        tokenVersion,
      ]),
      'utf8'
    )
    .digest('hex');

  return 'email_' + hash;
}

export function buildEventInvitationEmailOutboxRecord(
  input: QueueEventInvitationEmailInput
): EventInvitationEmailOutboxRecord {
  const {
    event,
    ticket,
    invitation,
    trigger,
    now,
  } = input;

  if (
    !validTimestamp(now) ||
    !validId(event.eventId) ||
    event.schemaVersion !== EVENT_SCHEMA_VERSION ||
    event.organizerType !== 'platform' ||
    event.organizerId !== PLATFORM_EVENT_ORGANIZER_ID ||
    event.visibility !== 'public' ||
    !['published', 'ongoing'].includes(event.status) ||
    event.cancelledAt !== null ||
    !validTimestamp(event.startsAt) ||
    !validTimestamp(event.endsAt) ||
    event.endsAt.toMillis() <= now.toMillis() ||
    event.endsAt.toMillis() <= event.startsAt.toMillis() ||
    (
      event.registrationAccess !== 'invite_only' &&
      event.registrationAccess !== 'public_and_invitation'
    ) ||
    event.invitationSettings?.enabled !== true ||
    event.invitationSettings?.allowComplimentary !== true
  ) {
    throw new Error(
      'INVALID_INVITATION_EMAIL_EVENT'
    );
  }

  if (
    invitation.schemaVersion !==
      EVENT_INVITATION_SCHEMA_VERSION ||
    !isValidEventInvitationId(
      invitation.invitationId
    ) ||
    invitation.eventId !== event.eventId ||
    invitation.organizerType !== event.organizerType ||
    invitation.organizerId !== event.organizerId ||
    invitation.status !== 'pending' ||
    invitation.pricingType !== 'complimentary' ||
    invitation.acceptedByUid !== null ||
    invitation.acceptedAt !== null ||
    invitation.orderId !== null ||
    invitation.registrationId !== null ||
    invitation.ticketId !== null ||
    invitation.revokedAt !== null ||
    !validEmail(invitation.guestEmail) ||
    !Number.isSafeInteger(invitation.tokenVersion) ||
    invitation.tokenVersion < 1 ||
    !validTimestamp(invitation.expiresAt) ||
    invitation.expiresAt.toMillis() <= now.toMillis() ||
    invitation.expiresAt.toMillis() >
      event.endsAt.toMillis()
  ) {
    throw new Error(
      'INVALID_INVITATION_EMAIL_INVITATION'
    );
  }

  if (
    ticket.schemaVersion !== EVENT_SCHEMA_VERSION ||
    ticket.eventId !== event.eventId ||
    ticket.ticketTypeId !== invitation.ticketTypeId ||
    !validId(ticket.ticketTypeId) ||
    ticket.status !== 'active' ||
    ticket.access !== 'invite_only' ||
    ticket.pricingType !== 'free' ||
    ticket.price.usdAmountMinor !== 0 ||
    ticket.price.bdtAmountMinor !== 0 ||
    ticket.maxPerOrder !== 1 ||
    ticket.attendanceMode !== invitation.attendanceMode
  ) {
    throw new Error(
      'INVALID_INVITATION_EMAIL_TICKET'
    );
  }

  if (
    (
      trigger !== 'invitation_created' &&
      trigger !== 'invitation_renewed'
    ) ||
    (
      trigger === 'invitation_created' &&
      invitation.tokenVersion !== 1
    ) ||
    (
      trigger === 'invitation_renewed' &&
      invitation.tokenVersion <= 1
    )
  ) {
    throw new Error(
      'INVALID_INVITATION_EMAIL_TRIGGER'
    );
  }

  const venue =
    invitation.attendanceMode === 'offline' &&
    event.venue
      ? [
          event.venue.name,
          event.venue.address,
          event.venue.city,
          event.venue.countryCode,
        ].filter(Boolean).join(', ')
      : null;

  const templateInput:
    EventInvitationEmailTemplateInput = {
      invitationId: invitation.invitationId,

      tokenVersion: invitation.tokenVersion,

      eventTitle: event.title,

      guestName: invitation.guestName,

      ticketName: ticket.name,

      startsAtMs: event.startsAt.toMillis(),

      expiresAtMs:
        invitation.expiresAt.toMillis(),

      timezone: event.timezone,

      attendanceMode: invitation.attendanceMode,

      venue,
    };

  // Validate metadata only.
  // Do not reconstruct the raw invitation token.
  validateEventInvitationEmailTemplate(
    templateInput
  );

  const emailId =
    buildEventInvitationEmailId(
      event.eventId,
      invitation.invitationId,
      invitation.tokenVersion
    );

  return {
    emailId,

    eventId: event.eventId,

    orderId: null,

    invitationId: invitation.invitationId,

    tokenVersion: invitation.tokenVersion,

    type: 'event_invitation',

    trigger,

    recipientEmail: invitation.guestEmail,

    templateInput,

    provider: 'resend',

    idempotencyKey: emailId,

    status: 'pending',

    attemptCount: 0,

    scheduledAt: now,

    nextAttemptAt: now,

    firstAttemptAt: null,

    lastAttemptAt: null,

    leaseToken: null,

    leaseExpiresAt: null,

    providerEmailId: null,

    acceptedAt: null,

    lastErrorCode: null,

    skipReason: null,

    schemaVersion: EVENT_EMAIL_SCHEMA_VERSION,

    createdAt: now,

    updatedAt: now,
  };
}

/**
 * Queue within the caller's existing transaction.
 *
 * No provider calls.
 * No raw token storage.
 * No independent Firestore transaction.
 */
export function queueEventInvitationEmail(
  tx: Transaction,
  db: Firestore,
  input: QueueEventInvitationEmailInput
): EventInvitationEmailOutboxRecord {
  const record =
    buildEventInvitationEmailOutboxRecord(input);

  const ref = db
    .collection(EVENT_COLLECTIONS.emailOutbox)
    .doc(record.emailId);

  tx.create(ref, record);

  return record;
}
