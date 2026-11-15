import 'server-only';

import {
  createHash,
  randomBytes,
} from 'node:crypto';

import type {
  Firestore,
  Transaction,
  Timestamp,
} from 'firebase-admin/firestore';

import {
  EVENT_COLLECTIONS,
  type EventRegistration,
  type EventIssuedTicket,
  type EventAuditLog,
} from '@/lib/event-types';

import {
  isValidEventDocumentId,
} from '@/lib/event-validation';

export class EventTicketIssuanceError
  extends Error {
  constructor() {
    super('INVALID_TICKET_ISSUANCE');
    this.name = 'EventTicketIssuanceError';
  }
}

type TicketIssuanceInput = {
  eventId: string;

  orderId: string;

  ticketTypeId: string;

  expectedQuantity: number;

  registrations: readonly EventRegistration[];

  actor:
    | {
        type: 'participant';
        uid: string | null;
      }
    | {
        type: 'admin';
        uid: string;
      }
    | {
        type: 'system';
        uid: null;
      };

  now: Timestamp;
};

function invalid(): never {
  throw new EventTicketIssuanceError();
}

function hash(value: string): string {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}

export function buildEventTicketId(
  registrationId: string
): string {
  if (
    !isValidEventDocumentId(
      registrationId
    )
  ) {
    return invalid();
  }

  return 'ticket_' + hash(
    JSON.stringify([
      'tabstartup-event-ticket-v1',
      registrationId,
    ])
  );
}

export function issueConfirmedEventTickets(
  tx: Transaction,
  db: Firestore,
  input: TicketIssuanceInput
): EventIssuedTicket[] {
  const {
    eventId,
    orderId,
    ticketTypeId,
    expectedQuantity,
    registrations,
    actor,
    now,
  } = input;

  if (
    !isValidEventDocumentId(eventId) ||
    !isValidEventDocumentId(orderId) ||
    !isValidEventDocumentId(ticketTypeId) ||
    !Number.isSafeInteger(expectedQuantity) ||
    expectedQuantity < 1 ||
    expectedQuantity > 20 ||
    registrations.length !== expectedQuantity ||
    !Number.isSafeInteger(now.toMillis()) ||
    now.toMillis() <= 0
  ) {
    return invalid();
  }

  if (
    actor.type === 'admin' &&
    !isValidEventDocumentId(actor.uid)
  ) {
    return invalid();
  }

  if (
    actor.uid !== null &&
    !isValidEventDocumentId(actor.uid)
  ) {
    return invalid();
  }

  const seen = new Set<string>();

  const tickets = registrations.map(
    registration => {
      if (
        !isValidEventDocumentId(
          registration.registrationId
        ) ||
        seen.has(registration.registrationId) ||
        registration.eventId !== eventId ||
        registration.orderId !== orderId ||
        registration.ticketTypeId !== ticketTypeId ||
        registration.status !== 'confirmed' ||
        registration.confirmedAt === null ||
        registration.confirmedAt.toMillis() !==
          now.toMillis() ||
        !registration.participant ||
        (
          registration.participant.uid !== null &&
          !isValidEventDocumentId(
            registration.participant.uid
          )
        )
      ) {
        return invalid();
      }

      seen.add(registration.registrationId);

      const ticketId = buildEventTicketId(
        registration.registrationId
      );

      const ticketNumber =
        'TS-' +
        ticketId.slice('ticket_'.length)
          .toUpperCase();

      // Reserve the QR hash field for a future
      // authenticated QR credential activation.
      // No raw QR credential is persisted.
      const qrTokenHash = createHash('sha256')
        .update(randomBytes(32))
        .digest('hex');

      const ticket: EventIssuedTicket = {
        ticketId,

        ticketNumber,

        eventId,

        orderId,

        registrationId:
          registration.registrationId,

        ticketTypeId,

        attendeeUid:
          registration.participant.uid,

        attendanceMode:
          registration.attendanceMode,

        status: 'issued',

        qrTokenHash,

        issuedAt: now,

        checkedInAt: null,

        createdAt: now,

        updatedAt: now,
      };

      return ticket;
    }
  );

  // Validate every registration before adding
  // ticket writes to the caller's transaction.

  for (const ticket of tickets) {
    const ticketRef = db
      .collection(EVENT_COLLECTIONS.tickets)
      .doc(ticket.ticketId);

    const auditRef = db
      .collection(EVENT_COLLECTIONS.auditLogs)
      .doc('issued_' + ticket.ticketId);

    const audit: EventAuditLog = {
      auditId: auditRef.id,

      eventId,

      action: 'ticket_issued',

      actorType: actor.type,

      actorUid: actor.uid,

      resourceType: 'ticket',

      resourceId: ticket.ticketId,

      reason: null,

      createdAt: now,
    };

    // Never overwrite an existing ticket or
    // its original issuance audit record.
    tx.create(ticketRef, ticket);

    tx.create(auditRef, audit);
  }

  return tickets;
}
