/**
 * TabStartup Event Lifecycle Policy.
 *
 * Release A: Admin-managed official events.
 * External Event Organizer mutations remain disabled.
 *
 * These policies are not authentication or database
 * transaction boundaries.
 */

import type {
  EventRecord,
  EventStatus,
  EventTicketType,
  EventTicketInventory,
} from '@/lib/event-types';

import {
  EVENT_LIMITS,
  isValidEventOwnership,
  isValidEventTitle,
  isValidEventSlug,
  isValidEventMode,
  isValidEventTimezone,
  isValidEventDateRange,
  isValidEventCapacity,
  isVenueAllowedForEventMode,
  isValidEventRegistrationWindow,
  isAttendanceModeAllowed,
  isTicketPricingAllowed,
  isValidInventoryCounters,
  isValidEventDocumentId,
  isValidTicketQuantity,
} from '@/lib/event-validation';

export const EXTERNAL_EVENT_ORGANIZER_ENABLED:
  boolean = false;

export type EventLifecycleActor =
  | {
      actorType: 'admin';
      uid: string;
    }
  | {
      actorType: 'event_organizer';
      uid: string;
      organizerId: string;
    }
  | {
      actorType: 'system';
    };

export const EVENT_STATUS_TRANSITIONS:
  Readonly<Record<EventStatus, readonly EventStatus[]>> = {
    draft: [
      'pending_review',
      'published',
      'cancelled',
      'archived',
    ],

    pending_review: [
      'approved',
      'rejected',
      'draft',
      'cancelled',
    ],

    approved: [
      'published',
      'draft',
      'cancelled',
    ],

    rejected: [
      'draft',
      'cancelled',
      'archived',
    ],

    published: [
      'ongoing',
      'cancelled',
    ],

    ongoing: [
      'completed',
      'cancelled',
    ],

    completed: [
      'archived',
    ],

    cancelled: [
      'archived',
    ],

    archived: [],
  };

export type EventTransitionDenialReason =
  | 'INVALID_EVENT_OWNERSHIP'
  | 'INVALID_STATUS_TRANSITION'
  | 'INVALID_ACTOR'
  | 'EXTERNAL_EVENT_ORGANIZER_DISABLED'
  | 'EVENT_ORGANIZER_MISMATCH'
  | 'ADMIN_APPROVAL_REQUIRED'
  | 'ACTION_NOT_ALLOWED';

export type EventTransitionDecision =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: EventTransitionDenialReason;
    };

function deny(
  reason: EventTransitionDenialReason
): EventTransitionDecision {
  return {
    allowed: false,
    reason,
  };
}

function allow(): EventTransitionDecision {
  return {
    allowed: true,
    reason: null,
  };
}

export function canTransitionEventStatus(
  event: Pick<
    EventRecord,
    'organizerType' |
    'organizerId' |
    'status'
  >,
  nextStatus: EventStatus,
  actor: EventLifecycleActor
): EventTransitionDecision {
  if (!isValidEventOwnership(event)) {
    return deny('INVALID_EVENT_OWNERSHIP');
  }

  const transitions =
    EVENT_STATUS_TRANSITIONS[event.status];

  if (
    !Array.isArray(transitions) ||
    !transitions.includes(nextStatus)
  ) {
    return deny('INVALID_STATUS_TRANSITION');
  }

  if (
    event.organizerType === 'verified_organizer' &&
    !EXTERNAL_EVENT_ORGANIZER_ENABLED
  ) {
    return deny('EXTERNAL_EVENT_ORGANIZER_DISABLED');
  }

  if (actor.actorType === 'system') {
    if (
      (
        event.status === 'published' &&
        nextStatus === 'ongoing'
      ) ||
      (
        event.status === 'ongoing' &&
        nextStatus === 'completed'
      )
    ) {
      return allow();
    }

    return deny('ACTION_NOT_ALLOWED');
  }

  if (!isValidEventDocumentId(actor.uid)) {
    return deny('INVALID_ACTOR');
  }

  if (actor.actorType === 'admin') {
    if (
      event.organizerType === 'verified_organizer' &&
      nextStatus === 'published' &&
      event.status !== 'approved'
    ) {
      return deny('ADMIN_APPROVAL_REQUIRED');
    }

    return allow();
  }

  if (actor.actorType === 'event_organizer') {
    if (!EXTERNAL_EVENT_ORGANIZER_ENABLED) {
      return deny('EXTERNAL_EVENT_ORGANIZER_DISABLED');
    }

    if (
      event.organizerType !== 'verified_organizer' ||
      event.organizerId !== actor.organizerId
    ) {
      return deny('EVENT_ORGANIZER_MISMATCH');
    }

    if (
      event.status === 'draft' &&
      nextStatus === 'pending_review'
    ) {
      return allow();
    }

    if (
      (
        event.status === 'pending_review' ||
        event.status === 'rejected' ||
        event.status === 'approved'
      ) &&
      nextStatus === 'draft'
    ) {
      return allow();
    }

    return deny('ACTION_NOT_ALLOWED');
  }

  return deny('INVALID_ACTOR');
}

/**
 * Validate the timestamp shape before conversion.
 */
function timestampMillis(value: unknown): number {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (
      value as { toMillis?: unknown }
    ).toMillis !== 'function'
  ) {
    return Number.NaN;
  }

  try {
    return (
      value as { toMillis(): number }
    ).toMillis();
  } catch {
    return Number.NaN;
  }
}

function optionalTimestampMillis(
  value: unknown
): number | null {
  return value === null
    ? null
    : timestampMillis(value);
}

export interface EventPublicationTicket {
  ticketType: EventTicketType;
  inventory: EventTicketInventory;
}

export interface EventPublicationDecision {
  ready: boolean;
  errors: string[];
}

/**
 * Validate publication readiness using trusted
 * event and ticket records loaded from Firestore.
 *
 * Call inside the publishing transaction.
 */
export function validateEventPublication(
  event: EventRecord,
  tickets: readonly EventPublicationTicket[],
  nowMs: number
): EventPublicationDecision {
  const errors: string[] = [];

  if (!isValidEventOwnership(event)) {
    errors.push('INVALID_EVENT_OWNERSHIP');
  }

  if (
    event.organizerType === 'verified_organizer' &&
    !EXTERNAL_EVENT_ORGANIZER_ENABLED
  ) {
    errors.push('EXTERNAL_EVENT_ORGANIZER_DISABLED');
  }

  if (!isValidEventTitle(event.title)) {
    errors.push('INVALID_EVENT_TITLE');
  }

  if (!isValidEventSlug(event.slug)) {
    errors.push('INVALID_EVENT_SLUG');
  }

  if (
    typeof event.shortDescription !== 'string' ||
    event.shortDescription.trim().length === 0 ||
    event.shortDescription.length >
      EVENT_LIMITS.shortDescriptionMaxLength
  ) {
    errors.push('INVALID_SHORT_DESCRIPTION');
  }

  if (
    typeof event.description !== 'string' ||
    event.description.trim().length === 0 ||
    event.description.length >
      EVENT_LIMITS.descriptionMaxLength
  ) {
    errors.push('INVALID_EVENT_DESCRIPTION');
  }

  if (!isValidEventMode(event.mode)) {
    errors.push('INVALID_EVENT_MODE');
  }

  if (!isValidEventTimezone(event.timezone)) {
    errors.push('INVALID_EVENT_TIMEZONE');
  }

  if (
    !isValidEventCapacity(
      event.mode,
      event.capacity
    )
  ) {
    errors.push('INVALID_EVENT_CAPACITY');
  }

  if (
    !isVenueAllowedForEventMode(
      event.mode,
      event.venue
    )
  ) {
    errors.push('INVALID_EVENT_VENUE');
  }

  const startsAtMs =
    timestampMillis(event.startsAt);

  const endsAtMs =
    timestampMillis(event.endsAt);

  if (
    !isValidEventDateRange(
      startsAtMs,
      endsAtMs
    )
  ) {
    errors.push('INVALID_EVENT_DATES');
  }

  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs <= 0 ||
    !Number.isFinite(endsAtMs) ||
    endsAtMs <= nowMs
  ) {
    errors.push('EVENT_ALREADY_ENDED');
  }

  if (
    !isValidEventRegistrationWindow(
      optionalTimestampMillis(
        event.registrationOpensAt
      ),
      optionalTimestampMillis(
        event.registrationClosesAt
      ),
      endsAtMs
    )
  ) {
    errors.push('INVALID_REGISTRATION_WINDOW');
  }

  if (
    !isValidTicketQuantity(
      event.maxTicketsPerOrder
    )
  ) {
    errors.push('INVALID_EVENT_ORDER_LIMIT');
  }

  if (
    tickets.length === 0 ||
    tickets.length >
      EVENT_LIMITS.maxTicketTypesPerEvent
  ) {
    errors.push('INVALID_TICKET_TYPE_COUNT');
  }

  let onlineCapacity = 0;
  let offlineCapacity = 0;

  let activeTicketTypes = 0;
  let activeOnlineTicketTypes = 0;
  let activeOfflineTicketTypes = 0;
  let activeFreeTicketTypes = 0;
  let activePaidTicketTypes = 0;

  const seenTicketTypes = new Set<string>();

  for (const entry of tickets) {
    const { ticketType, inventory } = entry;

    if (
      !isValidEventDocumentId(
        ticketType.ticketTypeId
      ) ||
      seenTicketTypes.has(
        ticketType.ticketTypeId
      )
    ) {
      errors.push('INVALID_OR_DUPLICATE_TICKET_TYPE');
      continue;
    }

    seenTicketTypes.add(
      ticketType.ticketTypeId
    );

    if (
      ticketType.eventId !== event.eventId ||
      inventory.eventId !== event.eventId ||
      inventory.ticketTypeId !==
        ticketType.ticketTypeId
    ) {
      errors.push('TICKET_EVENT_MISMATCH');
      continue;
    }

    if (
      !isAttendanceModeAllowed(
        event.mode,
        ticketType.attendanceMode
      )
    ) {
      errors.push('INVALID_TICKET_ATTENDANCE_MODE');
      continue;
    }

    if (
      !isValidInventoryCounters(inventory)
    ) {
      errors.push('INVALID_TICKET_INVENTORY');
      continue;
    }

    if (
      !isTicketPricingAllowed(
        event.registrationType,
        ticketType
      )
    ) {
      errors.push('INVALID_TICKET_PRICING');
    }

    if (
      !isValidTicketQuantity(
        ticketType.maxPerOrder
      ) ||
      ticketType.maxPerOrder >
        event.maxTicketsPerOrder
    ) {
      errors.push('INVALID_TICKET_ORDER_LIMIT');
    }

    // All inventory allocations count toward
    // the event-wide capacity.
    if (
      ticketType.attendanceMode === 'online'
    ) {
      onlineCapacity += inventory.capacity;
    } else {
      offlineCapacity += inventory.capacity;
    }

    if (ticketType.status === 'active') {
      activeTicketTypes += 1;

      if (
        ticketType.attendanceMode === 'online'
      ) {
        activeOnlineTicketTypes += 1;
      } else {
        activeOfflineTicketTypes += 1;
      }

      if (ticketType.pricingType === 'free') {
        activeFreeTicketTypes += 1;
      } else if (
        ticketType.pricingType === 'paid'
      ) {
        activePaidTicketTypes += 1;
      }
    }
  }

  if (activeTicketTypes === 0) {
    errors.push('ACTIVE_TICKET_TYPE_REQUIRED');
  }

  if (
    !event.capacity ||
    onlineCapacity > event.capacity.online ||
    offlineCapacity > event.capacity.offline
  ) {
    errors.push('EVENT_CAPACITY_EXCEEDED');
  }

  if (
    (
      event.mode === 'online' ||
      event.mode === 'hybrid'
    ) &&
    activeOnlineTicketTypes === 0
  ) {
    errors.push('ONLINE_TICKET_TYPE_REQUIRED');
  }

  if (
    (
      event.mode === 'offline' ||
      event.mode === 'hybrid'
    ) &&
    activeOfflineTicketTypes === 0
  ) {
    errors.push('OFFLINE_TICKET_TYPE_REQUIRED');
  }

  if (
    event.registrationType === 'mixed' &&
    (
      activeFreeTicketTypes === 0 ||
      activePaidTicketTypes === 0
    )
  ) {
    errors.push('MIXED_TICKET_TYPES_REQUIRED');
  }

  return {
    ready: errors.length === 0,
    errors: [...new Set(errors)],
  };
}

export function isEventRegistrationOpen(
  event: EventRecord,
  nowMs: number
): boolean {
  if (
    event.status !== 'published' &&
    event.status !== 'ongoing'
  ) {
    return false;
  }

  if (
    event.registrationStatus !== 'open' ||
    !Number.isSafeInteger(nowMs) ||
    nowMs <= 0
  ) {
    return false;
  }

  const opensAtMs =
    optionalTimestampMillis(
      event.registrationOpensAt
    );

  const closesAtMs =
    optionalTimestampMillis(
      event.registrationClosesAt
    );

  const endsAtMs =
    timestampMillis(event.endsAt);

  if (
    !isValidEventRegistrationWindow(
      opensAtMs,
      closesAtMs,
      endsAtMs
    )
  ) {
    return false;
  }

  if (nowMs >= endsAtMs) {
    return false;
  }

  if (
    opensAtMs !== null &&
    nowMs < opensAtMs
  ) {
    return false;
  }

  if (
    closesAtMs !== null &&
    nowMs >= closesAtMs
  ) {
    return false;
  }

  return true;
}

export function isPublicEventDiscoverable(
  event: Pick<
    EventRecord,
    'status' | 'visibility'
  >
): boolean {
  return (
    event.visibility === 'public' &&
    (
      event.status === 'published' ||
      event.status === 'ongoing' ||
      event.status === 'completed'
    )
  );
}
