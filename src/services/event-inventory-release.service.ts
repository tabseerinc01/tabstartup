import 'server-only';

import {
  Timestamp,
  type Transaction,
  type Firestore,
} from 'firebase-admin/firestore';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventRecord,
  type EventTicketType,
  type EventTicketInventory,
  type EventReservation,
  type EventAuditLog,
} from '@/lib/event-types';

import {
  isValidEventDocumentId,
  isValidInventoryCounters,
} from '@/lib/event-validation';

import {
  buildPublicTicketProjection,
} from '@/lib/event-public-projection';

export type ReservationReleaseStatus =
  | 'released'
  | 'expired';

export type ReservationReleaseReason =
  | 'payment_window_expired'
  | 'payment_review_expired'
  | 'payment_rejected'
  | 'order_cancelled';

export type ReservationReleaseActor =
  | {
      actorType: 'system';
      actorUid: null;
    }
  | {
      actorType: 'admin';
      actorUid: string;
    };

export class EventInventoryReleaseError
  extends Error {
  constructor(
    public readonly code:
      | 'INVALID_RESERVATION_RELEASE'
      | 'RESERVATION_NOT_FOUND'
      | 'RESERVATION_RELEASE_CONFLICT'
      | 'INVALID_RELEASE_INVENTORY'
  ) {
    super(code);

    this.name =
      'EventInventoryReleaseError';
  }
}

function invalid(): never {
  throw new EventInventoryReleaseError(
    'INVALID_RESERVATION_RELEASE'
  );
}

function invalidInventory(): never {
  throw new EventInventoryReleaseError(
    'INVALID_RELEASE_INVENTORY'
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

/**
 * Prepare an inventory release.
 *
 * Internal service only.
 *
 * Caller must validate authorization and
 * canonical order/payment lifecycle inside
 * this same transaction.
 *
 * This function performs reads only.
 */
export async function prepareEventInventoryRelease(
  tx: Transaction,
  db: Firestore,
  input: {
    reservationId: string;
    eventId: string;
    orderId: string;
    ticketTypeId: string;
    quantity: number;
    expectedStatus:
      | 'active'
      | 'pending_verification';
    releaseStatus: ReservationReleaseStatus;
    reason: ReservationReleaseReason;
    actor: ReservationReleaseActor;
    now: Timestamp;
  }
) {
  if (
    !validId(input.reservationId) ||
    !validId(input.eventId) ||
    !validId(input.orderId) ||
    !validId(input.ticketTypeId) ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 20 ||
    (
      input.expectedStatus !== 'active' &&
      input.expectedStatus !==
        'pending_verification'
    ) ||
    (
      input.releaseStatus !== 'released' &&
      input.releaseStatus !== 'expired'
    )
  ) {
    return invalid();
  }

  if (
    ![
      'payment_window_expired',
      'payment_review_expired',
      'payment_rejected',
      'order_cancelled',
    ].includes(input.reason)
  ) {
    return invalid();
  }

  if (
    (
      input.actor.actorType !== 'admin' &&
      input.actor.actorType !== 'system'
    ) ||
    (
      input.actor.actorType === 'admin' &&
      !validId(input.actor.actorUid)
    ) ||
    (
      input.actor.actorType === 'system' &&
      input.actor.actorUid !== null
    )
  ) {
    return invalid();
  }

  const nowMs =
    timestampMs(input.now);

  const reservationRef = db
    .collection(EVENT_COLLECTIONS.reservations)
    .doc(input.reservationId);

  const eventRef = db
    .collection(EVENT_COLLECTIONS.events)
    .doc(input.eventId);

  const ticketRef = db
    .collection(EVENT_COLLECTIONS.ticketTypes)
    .doc(input.ticketTypeId);

  const inventoryRef = db
    .collection(EVENT_COLLECTIONS.inventory)
    .doc(input.ticketTypeId);

  const publicTicketRef = db
    .collection(EVENT_COLLECTIONS.publicTicketTypes)
    .doc(input.ticketTypeId);

  const publicEventRef = db
    .collection(EVENT_COLLECTIONS.publicEvents)
    .doc(input.eventId);

  const [
    reservationSnap,
    eventSnap,
    ticketSnap,
    inventorySnap,
    publicTicketSnap,
    publicEventSnap,
  ] = await tx.getAll(
    reservationRef,
    eventRef,
    ticketRef,
    inventoryRef,
    publicTicketRef,
    publicEventRef
  );

  if (!reservationSnap.exists) {
    throw new EventInventoryReleaseError(
      'RESERVATION_NOT_FOUND'
    );
  }

  const reservation =
    reservationSnap.data() as EventReservation;

  if (
    reservation.reservationId !==
      input.reservationId ||
    reservation.eventId !== input.eventId ||
    reservation.orderId !== input.orderId ||
    !Array.isArray(reservation.items) ||
    reservation.items.length !== 1 ||
    !reservation.items[0] ||
    reservation.items[0].ticketTypeId !==
      input.ticketTypeId ||
    reservation.items[0].quantity !==
      input.quantity
  ) {
    return invalid();
  }

  if (
    reservation.status !==
      input.expectedStatus ||
    reservation.consumedAt !== null ||
    reservation.releasedAt !== null
  ) {
    throw new EventInventoryReleaseError(
      'RESERVATION_RELEASE_CONFLICT'
    );
  }

  if (
    timestampMs(reservation.createdAt) > nowMs ||
    timestampMs(reservation.updatedAt) > nowMs
  ) {
    return invalid();
  }

  if (
    input.reason === 'payment_window_expired'
  ) {
    if (
      input.expectedStatus !== 'active' ||
      input.releaseStatus !== 'expired' ||
      timestampMs(reservation.expiresAt) > nowMs
    ) {
      return invalid();
    }
  }

  if (
    input.reason === 'payment_review_expired'
  ) {
    if (
      input.expectedStatus !==
        'pending_verification' ||
      input.releaseStatus !== 'expired' ||
      timestampMs(
        reservation.reviewDeadlineAt
      ) > nowMs
    ) {
      return invalid();
    }
  }

  if (
    input.reason === 'payment_rejected' &&
    (
      input.expectedStatus !==
        'pending_verification' ||
      input.releaseStatus !== 'released' ||
      input.actor.actorType !== 'admin'
    )
  ) {
    return invalid();
  }

  if (
    input.reason === 'order_cancelled' &&
    input.releaseStatus !== 'released'
  ) {
    return invalid();
  }

  if (
    !eventSnap.exists ||
    !ticketSnap.exists ||
    !inventorySnap.exists
  ) {
    return invalidInventory();
  }

  const event =
    eventSnap.data() as EventRecord;

  const ticket =
    ticketSnap.data() as EventTicketType;

  const inventory =
    inventorySnap.data() as EventTicketInventory;

  if (
    event.schemaVersion !==
      EVENT_SCHEMA_VERSION ||
    event.eventId !== input.eventId ||
    event.organizerType !== 'platform' ||
    event.organizerId !==
      PLATFORM_EVENT_ORGANIZER_ID ||
    ticket.schemaVersion !==
      EVENT_SCHEMA_VERSION ||
    ticket.ticketTypeId !== input.ticketTypeId ||
    ticket.eventId !== input.eventId ||
    inventory.eventId !== input.eventId ||
    inventory.ticketTypeId !==
      input.ticketTypeId ||
    !isValidInventoryCounters(inventory) ||
    inventory.reservedQuantity <
      input.quantity ||
    timestampMs(inventory.updatedAt) > nowMs
  ) {
    return invalidInventory();
  }

  const nextInventory: EventTicketInventory = {
    ...inventory,

    reservedQuantity:
      inventory.reservedQuantity -
      input.quantity,

    updatedAt: input.now,
  };

  if (
    !isValidInventoryCounters(nextInventory) ||
    nextInventory.issuedQuantity !==
      inventory.issuedQuantity ||
    nextInventory.capacity !==
      inventory.capacity
  ) {
    return invalidInventory();
  }

  if (
    publicTicketSnap.exists &&
    (
      publicTicketSnap.data()?.eventId !==
        input.eventId ||
      publicTicketSnap.data()?.ticketTypeId !==
        input.ticketTypeId
    )
  ) {
    return invalidInventory();
  }

  if (
    publicEventSnap.exists &&
    publicEventSnap.data()?.eventId !==
      input.eventId
  ) {
    return invalidInventory();
  }

  const nextProjection =
    buildPublicTicketProjection(
      event,
      ticket,
      nextInventory,
      nowMs
    );

  const auditRef = db
    .collection(EVENT_COLLECTIONS.auditLogs)
    .doc();

  const audit: EventAuditLog = {
    auditId: auditRef.id,

    eventId: input.eventId,

    action: 'inventory_released',

    actorType: input.actor.actorType,

    actorUid: input.actor.actorUid,

    resourceType: 'reservation',

    resourceId: input.reservationId,

    reason: input.reason,

    createdAt: input.now,
  };

  return {
    reservation,

    nextInventory,

    nextProjection,

    publicTicketExists:
      publicTicketSnap.exists,

    publicEventExists:
      publicEventSnap.exists,

    reservationUpdate: {
      status: input.releaseStatus,

      releasedAt: input.now,

      updatedAt: input.now,
    },

    audit,

    refs: {
      reservation: reservationRef,

      inventory: inventoryRef,

      publicTicket: publicTicketRef,

      audit: auditRef,
    },
  };
}

type InventoryReleasePlan =
  Awaited<
    ReturnType<
      typeof prepareEventInventoryRelease
    >
  >;

/**
 * Apply a prepared release plan.
 *
 * Must use the same transaction that
 * prepared the plan.
 *
 * Call only once, after all reads and
 * financial lifecycle checks are complete.
 */
export function applyEventInventoryRelease(
  tx: Transaction,
  plan: InventoryReleasePlan
): void {
  tx.update(
    plan.refs.reservation,
    plan.reservationUpdate
  );

  tx.set(
    plan.refs.inventory,
    plan.nextInventory
  );

  if (
    plan.nextProjection !== null &&
    plan.publicEventExists &&
    plan.publicTicketExists
  ) {
    tx.set(
      plan.refs.publicTicket,
      plan.nextProjection
    );
  } else if (
    plan.publicTicketExists &&
    (
      plan.nextProjection === null ||
      !plan.publicEventExists
    )
  ) {
    tx.delete(
      plan.refs.publicTicket
    );
  }

  tx.create(
    plan.refs.audit,
    plan.audit
  );
}
