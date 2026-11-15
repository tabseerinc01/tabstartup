import 'server-only';

import {
  Timestamp,
  FieldPath,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventRecord,
  type EventRegistration,
  type EventRegistrationRecordStatus,
  type EventOrder,
  type EventIssuedTicket,
} from '@/lib/event-types';

import {
  requireEventAdmin,
} from './event-authorization.service';

import {
  assertCurrentEventAdmin,
} from './event-management.service';

import {
  buildEventTicketId,
} from './event-ticket-issuance.service';

export const EVENT_PARTICIPANT_PAGE_LIMIT = 100;

const REGISTRATION_STATUSES:
  readonly EventRegistrationRecordStatus[] = [
    'pending_payment',
    'pending_verification',
    'confirmed',
    'requires_review',
    'cancelled',
    'refunded',
  ];

export type EventParticipantAdminErrorCode =
  | 'INVALID_PARTICIPANT_QUERY'
  | 'EVENT_NOT_FOUND'
  | 'INVALID_PARTICIPANT_RECORD';

export class EventParticipantAdminError
  extends Error {
  constructor(
    public readonly code:
      EventParticipantAdminErrorCode
  ) {
    super(code);

    this.name =
      'EventParticipantAdminError';
  }
}

export interface EventParticipantListOptions {
  cursor?: string | null;

  limit?: number;

  status?: EventRegistrationRecordStatus | null;
}

export interface AdminEventParticipant {
  registrationId: string;

  eventId: string;

  orderId: string;

  fullName: string;

  email: string;

  phone: string | null;

  organization: string | null;

  designation: string | null;

  attendanceMode: 'online' | 'offline';

  registrationStatus:
    EventRegistrationRecordStatus;

  ticketTypeId: string;

  ticketName: string;

  paymentRequired: boolean;

  currency: 'BDT' | 'USD' | null;

  provider: EventOrder['provider'];

  orderStatus: EventOrder['status'];

  unitAmountMinor: number;

  orderTotalAmountMinor: number;

  orderQuantity: number;

  purchaserEmail: string;

  registeredAtMs: number;

  confirmedAtMs: number | null;

  paidAtMs: number | null;

  paymentDeadlineMs: number | null;

  ticket: {
    ticketId: string;

    ticketNumber: string;

    status: EventIssuedTicket['status'];

    issuedAtMs: number;
  } | null;
}

export interface AdminEventParticipantList {
  eventId: string;

  eventTitle: string;

  items: AdminEventParticipant[];

  nextCursor: string | null;

  hasMore: boolean;
}

function validId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(value)
  );
}

function invalidRecord(): never {
  throw new EventParticipantAdminError(
    'INVALID_PARTICIPANT_RECORD'
  );
}

function requiredMillis(
  value: unknown
): number {
  if (!(value instanceof Timestamp)) {
    return invalidRecord();
  }

  const millis = value.toMillis();

  if (
    !Number.isSafeInteger(millis) ||
    millis <= 0
  ) {
    return invalidRecord();
  }

  return millis;
}

function optionalMillis(
  value: unknown
): number | null {
  if (value === null) {
    return null;
  }

  return requiredMillis(value);
}

function optionalText(
  value: unknown
): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return invalidRecord();
  }

  return value;
}

function projectParticipant(
  eventId: string,
  registrationId: string,
  registration: EventRegistration,
  order: EventOrder,
  ticket: EventIssuedTicket | null
): AdminEventParticipant {
  if (
    registration.registrationId !==
      registrationId ||
    registration.eventId !== eventId ||
    !validId(registration.orderId) ||
    !validId(registration.ticketTypeId) ||
    !REGISTRATION_STATUSES.includes(
      registration.status
    ) ||
    (
      registration.attendanceMode !== 'online' &&
      registration.attendanceMode !== 'offline'
    ) ||
    !registration.participant ||
    typeof registration.participant.fullName !==
      'string' ||
    typeof registration.participant.email !==
      'string'
  ) {
    return invalidRecord();
  }

  if (
    order.schemaVersion !== EVENT_SCHEMA_VERSION ||
    order.orderId !== registration.orderId ||
    order.eventId !== eventId ||
    order.organizerType !== 'platform' ||
    order.organizerId !==
      PLATFORM_EVENT_ORGANIZER_ID ||
    typeof order.purchaserEmail !== 'string' ||
    typeof order.paymentRequired !== 'boolean' ||
    !Array.isArray(order.items) ||
    order.items.length !== 1
  ) {
    return invalidRecord();
  }

  const item = order.items[0];

  if (
    !item ||
    item.ticketTypeId !==
      registration.ticketTypeId ||
    item.attendanceMode !==
      registration.attendanceMode ||
    typeof item.ticketName !== 'string' ||
    !Number.isSafeInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 20 ||
    !Number.isSafeInteger(item.unitAmountMinor) ||
    item.unitAmountMinor < 0 ||
    !Number.isSafeInteger(item.totalAmountMinor) ||
    !Number.isSafeInteger(order.totalAmountMinor) ||
    item.totalAmountMinor !==
      item.quantity * item.unitAmountMinor ||
    order.totalAmountMinor !==
      item.totalAmountMinor
  ) {
    return invalidRecord();
  }

  if (order.paymentRequired) {
    if (
      order.totalAmountMinor <= 0 ||
      (
        order.currency !== 'BDT' &&
        order.currency !== 'USD'
      ) ||
      (
        order.provider !== 'bkash_manual' &&
        order.provider !== 'tabedge'
      )
    ) {
      return invalidRecord();
    }
  } else if (
    order.totalAmountMinor !== 0 ||
    order.currency !== null ||
    order.provider !== null
  ) {
    return invalidRecord();
  }

  let projectedTicket:
    AdminEventParticipant['ticket'] = null;

  if (ticket) {
    if (
      ticket.ticketId !==
        buildEventTicketId(registrationId) ||
      ticket.registrationId !== registrationId ||
      ticket.eventId !== eventId ||
      ticket.orderId !== registration.orderId ||
      ticket.ticketTypeId !==
        registration.ticketTypeId ||
      ticket.attendanceMode !==
        registration.attendanceMode ||
      ticket.attendeeUid !==
        registration.participant.uid ||
      typeof ticket.ticketNumber !== 'string' ||
      ![
        'issued',
        'checked_in',
        'cancelled',
        'refunded',
        'revoked',
      ].includes(ticket.status)
    ) {
      return invalidRecord();
    }

    projectedTicket = {
      ticketId: ticket.ticketId,

      ticketNumber: ticket.ticketNumber,

      status: ticket.status,

      issuedAtMs:
        requiredMillis(ticket.issuedAt),
    };
  }

  return {
    registrationId,

    eventId,

    orderId: order.orderId,

    fullName:
      registration.participant.fullName,

    email:
      registration.participant.email,

    phone:
      optionalText(
        registration.participant.phone
      ),

    organization:
      optionalText(
        registration.participant.organization
      ),

    designation:
      optionalText(
        registration.participant.designation
      ),

    attendanceMode:
      registration.attendanceMode,

    registrationStatus:
      registration.status,

    ticketTypeId:
      registration.ticketTypeId,

    ticketName: item.ticketName,

    paymentRequired:
      order.paymentRequired,

    currency: order.currency,

    provider: order.provider,

    orderStatus: order.status,

    unitAmountMinor:
      item.unitAmountMinor,

    orderTotalAmountMinor:
      order.totalAmountMinor,

    orderQuantity: item.quantity,

    purchaserEmail:
      order.purchaserEmail,

    registeredAtMs:
      requiredMillis(registration.createdAt),

    confirmedAtMs:
      optionalMillis(registration.confirmedAt),

    paidAtMs:
      optionalMillis(order.paidAt),

    paymentDeadlineMs:
      optionalMillis(order.expiresAt),

    ticket: projectedTicket,
  };
}

/**
 * Read an authorized, bounded page of
 * official event participants.
 *
 * Never returns raw Firestore documents.
 * Never modifies event or payment records.
 */
export async function listAdminEventParticipants(
  idToken: string,
  eventId: string,
  options: EventParticipantListOptions = {}
): Promise<AdminEventParticipantList> {
  const context =
    await requireEventAdmin(
      idToken,
      'event:manage_participants'
    );

  const limit =
    options.limit ??
    EVENT_PARTICIPANT_PAGE_LIMIT;

  if (
    !validId(eventId) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > EVENT_PARTICIPANT_PAGE_LIMIT ||
    (
      options.cursor != null &&
      !validId(options.cursor)
    ) ||
    (
      options.status != null &&
      !REGISTRATION_STATUSES.includes(
        options.status
      )
    )
  ) {
    throw new EventParticipantAdminError(
      'INVALID_PARTICIPANT_QUERY'
    );
  }

  const { adminDb } =
    getFirebaseAdmin();

  const eventRef = adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const registrations = adminDb.collection(
    EVENT_COLLECTIONS.registrations
  );

  let query = registrations
    .where('eventId', '==', eventId);

  if (options.status != null) {
    query = query.where(
      'status',
      '==',
      options.status
    );
  }

  query = query.orderBy(
    FieldPath.documentId(),
    'asc'
  );

  if (options.cursor != null) {
    query = query.startAfter(options.cursor);
  }

  query = query.limit(limit + 1);

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const eventSnap =
        await tx.get(eventRef);

      if (!eventSnap.exists) {
        throw new EventParticipantAdminError(
          'EVENT_NOT_FOUND'
        );
      }

      const event =
        eventSnap.data() as EventRecord;

      if (
        event.schemaVersion !==
          EVENT_SCHEMA_VERSION ||
        event.eventId !== eventId ||
        event.organizerType !== 'platform' ||
        event.organizerId !==
          PLATFORM_EVENT_ORGANIZER_ID ||
        typeof event.title !== 'string'
      ) {
        throw new EventParticipantAdminError(
          'EVENT_NOT_FOUND'
        );
      }

      const result = await tx.get(query);

      const hasMore =
        result.docs.length > limit;

      const page = result.docs.slice(
        0,
        limit
      );

      const orderIds = new Set<string>();

      for (const doc of page) {
        const registration =
          doc.data() as EventRegistration;

        if (
          registration.eventId !== eventId ||
          !validId(registration.orderId)
        ) {
          return invalidRecord();
        }

        orderIds.add(registration.orderId);
      }

      const orderRefs = [...orderIds].map(
        orderId => adminDb
          .collection(EVENT_COLLECTIONS.orders)
          .doc(orderId)
      );

      const ticketRefs = page.map(
        doc => adminDb
          .collection(EVENT_COLLECTIONS.tickets)
          .doc(buildEventTicketId(doc.id))
      );

      const orderSnaps = orderRefs.length
        ? await tx.getAll(...orderRefs)
        : [];

      const ticketSnaps = ticketRefs.length
        ? await tx.getAll(...ticketRefs)
        : [];

      const orders =
        new Map<string, EventOrder>();

      for (const snap of orderSnaps) {
        if (!snap.exists) {
          return invalidRecord();
        }

        orders.set(
          snap.id,
          snap.data() as EventOrder
        );
      }

      const tickets =
        new Map<string, EventIssuedTicket>();

      for (const snap of ticketSnaps) {
        if (snap.exists) {
          tickets.set(
            snap.id,
            snap.data() as EventIssuedTicket
          );
        }
      }

      const items = page.map(doc => {
        const registration =
          doc.data() as EventRegistration;

        const order =
          orders.get(registration.orderId);

        if (!order) {
          return invalidRecord();
        }

        const ticket =
          tickets.get(
            buildEventTicketId(doc.id)
          ) ?? null;

        return projectParticipant(
          eventId,
          doc.id,
          registration,
          order,
          ticket
        );
      });

      return {
        eventId,

        eventTitle: event.title,

        items,

        hasMore,

        nextCursor:
          hasMore && page.length > 0
            ? page[page.length - 1].id
            : null,
      };
    },
    { readOnly: true }
  );
}
