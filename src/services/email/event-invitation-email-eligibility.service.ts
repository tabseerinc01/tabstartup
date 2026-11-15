import 'server-only';

import {
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  EVENT_COLLECTIONS,
  type EventRecord,
  type EventTicketType,
} from '@/lib/event-types';

import type {
  EventInvitation,
} from '@/lib/event-invitation-types';

import {
  EVENT_EMAIL_SCHEMA_VERSION,
} from '@/lib/event-email-types';

import type {
  EventInvitationEmailOutboxRecord,
} from '@/lib/event-invitation-email-types';

import {
  deriveEventInvitationToken,
  isValidEventInvitationId,
  verifyEventInvitationToken,
} from '@/lib/event-invitation-token';

import {
  buildEventInvitationEmailId,
  buildEventInvitationEmailOutboxRecord,
} from './event-invitation-email-outbox.service';

import type {
  EventEmailEligibility,
} from './event-email-eligibility.service';

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
    /^[A-Za-z0-9_-]{1,200}$/.test(value) &&
    !/^__.*__$/.test(value)
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
 * Canonical invitation email eligibility.
 *
 * Read-only.
 * No email provider calls.
 * No raw token persistence.
 *
 * Must run before transaction writes.
 */
export async function checkEventInvitationEmailEligibility(
  tx: Transaction,
  db: Firestore,
  job: EventInvitationEmailOutboxRecord,
  now: Timestamp
): Promise<EventEmailEligibility> {
  if (
    !job ||
    job.schemaVersion !== EVENT_EMAIL_SCHEMA_VERSION ||
    job.type !== 'event_invitation' ||
    job.provider !== 'resend' ||
    job.orderId !== null ||
    !validId(job.eventId) ||
    !isValidEventInvitationId(job.invitationId) ||
    !Number.isSafeInteger(job.tokenVersion) ||
    job.tokenVersion < 1 ||
    !validTimestamp(now) ||
    !job.templateInput ||
    job.templateInput.invitationId !== job.invitationId ||
    job.templateInput.tokenVersion !== job.tokenVersion
  ) {
    return skip(
      'INVALID_INVITATION_EMAIL_JOB'
    );
  }

  const expectedEmailId =
    buildEventInvitationEmailId(
      job.eventId,
      job.invitationId,
      job.tokenVersion
    );

  if (
    job.emailId !== expectedEmailId ||
    job.idempotencyKey !== expectedEmailId
  ) {
    return skip(
      'INVITATION_EMAIL_ID_MISMATCH'
    );
  }

  const eventRef = db
    .collection(EVENT_COLLECTIONS.events)
    .doc(job.eventId);

  const invitationRef = db
    .collection(EVENT_COLLECTIONS.invitations)
    .doc(job.invitationId);

  const [eventSnap, invitationSnap] =
    await tx.getAll(
      eventRef,
      invitationRef
    );

  if (
    !eventSnap.exists ||
    !invitationSnap.exists
  ) {
    return skip(
      'INVITATION_EMAIL_CANONICAL_RECORD_MISSING'
    );
  }

  const event =
    eventSnap.data() as EventRecord;

  const invitation =
    invitationSnap.data() as EventInvitation;

  if (
    event.eventId !== job.eventId ||
    invitation.invitationId !== job.invitationId ||
    invitation.eventId !== job.eventId ||
    invitation.guestEmail !== job.recipientEmail ||
    !validId(invitation.ticketTypeId)
  ) {
    return skip(
      'INVITATION_EMAIL_LINKAGE_MISMATCH'
    );
  }

  if (invitation.status !== 'pending') {
    return skip(
      'INVITATION_EMAIL_NOT_PENDING'
    );
  }

  if (
    !validTimestamp(invitation.expiresAt) ||
    invitation.expiresAt.toMillis() <=
      now.toMillis()
  ) {
    return skip(
      'INVITATION_EMAIL_EXPIRED'
    );
  }

  if (
    invitation.tokenVersion !==
      job.tokenVersion
  ) {
    return skip(
      'INVITATION_EMAIL_TOKEN_VERSION_OUTDATED'
    );
  }

  const ticketRef = db
    .collection(EVENT_COLLECTIONS.ticketTypes)
    .doc(invitation.ticketTypeId);

  const ticketSnap = await tx.get(ticketRef);

  if (!ticketSnap.exists) {
    return skip(
      'INVITATION_EMAIL_TICKET_MISSING'
    );
  }

  const ticket =
    ticketSnap.data() as EventTicketType;

  let expected: EventInvitationEmailOutboxRecord;

  try {
    // Reuse canonical event, invitation,
    // ticket and template validation.
    expected =
      buildEventInvitationEmailOutboxRecord({
        event,
        ticket,
        invitation,
        trigger: job.trigger,
        now,
      });
  } catch {
    return skip(
      'INVITATION_EMAIL_CANONICAL_STATE_INVALID'
    );
  }

  const actualInput = job.templateInput;

  const expectedInput = expected.templateInput;

  if (
    expected.emailId !== job.emailId ||
    expected.recipientEmail !== job.recipientEmail ||
    expected.trigger !== job.trigger ||

    actualInput.invitationId !==
      expectedInput.invitationId ||

    actualInput.tokenVersion !==
      expectedInput.tokenVersion ||

    actualInput.eventTitle !==
      expectedInput.eventTitle ||

    actualInput.guestName !==
      expectedInput.guestName ||

    actualInput.ticketName !==
      expectedInput.ticketName ||

    actualInput.startsAtMs !==
      expectedInput.startsAtMs ||

    actualInput.expiresAtMs !==
      expectedInput.expiresAtMs ||

    actualInput.timezone !==
      expectedInput.timezone ||

    actualInput.attendanceMode !==
      expectedInput.attendanceMode ||

    actualInput.venue !==
      expectedInput.venue
  ) {
    return skip(
      'INVITATION_EMAIL_SNAPSHOT_OUTDATED'
    );
  }

  // A missing secret is an operational
  // configuration error, not an expired
  // or revoked invitation.
  //
  // Let configuration failures propagate
  // to the worker's error handling.

  const reconstructedToken =
    deriveEventInvitationToken(
      invitation.invitationId,
      invitation.tokenVersion
    );

  if (
    !verifyEventInvitationToken(
      reconstructedToken,
      invitation.tokenHash
    )
  ) {
    return skip(
      'INVITATION_EMAIL_TOKEN_HASH_MISMATCH'
    );
  }

  return {
    eligible: true,
  };
}
