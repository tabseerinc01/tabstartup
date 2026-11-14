import 'server-only';

import { createHash } from 'node:crypto';

import { Timestamp } from 'firebase-admin/firestore';

import {
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventRecord,
  type EventTicketType,
  type EventTicketInventory,
  type EventOrderItem,
  type EventOrderPayment,
} from '@/lib/event-types';

import type {
  EventRegistrationInput,
} from '@/lib/event-registration-input';

import {
  EVENT_LIMITS,
  isValidEventDocumentId,
  isValidEventCapacity,
  isAttendanceModeAllowed,
  isTicketPricingAllowed,
  isValidInventoryCounters,
  getAvailableTicketQuantity,
  calculateTicketTotalMinor,
  isValidEventRegistrationWindow,
} from '@/lib/event-validation';

import {
  isEventRegistrationOpen,
} from '@/lib/event-lifecycle';

import {
  getActivePaymentMethod,
  getPriceForCurrency,
} from '@/lib/payment-types';

export const EVENT_PAID_RESERVATION_TTL_MS =
  30 * 60 * 1000;

export type EventRegistrationErrorCode =
  | 'EVENT_NOT_FOUND'
  | 'EVENT_DATA_INVALID'
  | 'REGISTRATION_NOT_OPEN'
  | 'GUEST_REGISTRATION_DISABLED'
  | 'TICKET_NOT_FOUND'
  | 'TICKET_UNAVAILABLE'
  | 'TICKET_QUANTITY_EXCEEDED'
  | 'INSUFFICIENT_TICKET_INVENTORY'
  | 'INVALID_REGISTRATION_CURRENCY'
  | 'INVALID_TICKET_PRICE'
  | 'INVALID_EVENT_INVENTORY'
  | 'REGISTRATION_WINDOW_TOO_SHORT'
  | 'REGISTRATION_REQUEST_CONFLICT'
  | 'EVENT_POLICIES_CHANGED'
  | 'TICKET_PRICE_CHANGED'
  | 'REGISTRATION_DATA_INVALID'
  | 'UNAUTHENTICATED'
  | 'ACCOUNT_ACCESS_DENIED';

export class EventRegistrationError
  extends Error {

  constructor(
    public readonly code:
      EventRegistrationErrorCode
  ) {
    super(code);
    this.name = 'EventRegistrationError';
  }
}

export interface EventRegistrationPlan {
  item: EventOrderItem;

  payment: EventOrderPayment;

  reservationExpiresAt: Timestamp;

  orderExpiresAt: Timestamp | null;
}

function ensure(
  condition: unknown,
  code: EventRegistrationErrorCode
): asserts condition {
  if (!condition) {
    throw new EventRegistrationError(code);
  }
}

function readTimestamp(
  value: unknown,
  code: EventRegistrationErrorCode
): number {
  ensure(
    value instanceof Timestamp,
    code
  );

  const millis = value.toMillis();

  ensure(
    Number.isSafeInteger(millis) &&
    millis > 0 &&
    millis <= 253402300799999,
    code
  );

  return millis;
}

function readOptionalTimestamp(
  value: unknown,
  code: EventRegistrationErrorCode
): number | null {
  if (value === null) {
    return null;
  }

  return readTimestamp(value, code);
}

export function hashEventPolicy(
  value: string
): string {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}

export function buildEventRegistrationPlan(
  event: EventRecord,
  ticket: EventTicketType,
  inventory: EventTicketInventory,
  input: EventRegistrationInput,
  purchaserUid: string | null,
  now: Timestamp
): EventRegistrationPlan {
  const nowMs = readTimestamp(
    now,
    'REGISTRATION_DATA_INVALID'
  );

  // Release A supports official TabStartup events.

  ensure(
    event.schemaVersion === EVENT_SCHEMA_VERSION &&
    isValidEventDocumentId(event.eventId) &&
    event.slug === input.eventSlug &&
    event.organizerType === 'platform' &&
    event.organizerId === PLATFORM_EVENT_ORGANIZER_ID &&
    event.visibility === 'public',
    'EVENT_DATA_INVALID'
  );

  ensure(
    typeof event.allowGuestRegistration === 'boolean' &&
    typeof event.terms === 'string' &&
    typeof event.refundPolicy === 'string' &&
    Number.isSafeInteger(event.maxTicketsPerOrder) &&
    event.maxTicketsPerOrder >= 1 &&
    event.maxTicketsPerOrder <=
      EVENT_LIMITS.maxTicketsPerOrder,
    'EVENT_DATA_INVALID'
  );

  ensure(
    isValidEventCapacity(
      event.mode,
      event.capacity
    ),
    'EVENT_DATA_INVALID'
  );

  const eventEndsAtMs = readTimestamp(
    event.endsAt,
    'EVENT_DATA_INVALID'
  );

  const registrationOpensAtMs =
    readOptionalTimestamp(
      event.registrationOpensAt,
      'EVENT_DATA_INVALID'
    );

  const registrationClosesAtMs =
    readOptionalTimestamp(
      event.registrationClosesAt,
      'EVENT_DATA_INVALID'
    );

  ensure(
    isValidEventRegistrationWindow(
      registrationOpensAtMs,
      registrationClosesAtMs,
      eventEndsAtMs
    ),
    'EVENT_DATA_INVALID'
  );

  ensure(
    isEventRegistrationOpen(event, nowMs),
    'REGISTRATION_NOT_OPEN'
  );

  ensure(
    purchaserUid !== null ||
    event.allowGuestRegistration,
    'GUEST_REGISTRATION_DISABLED'
  );

  // The purchaser must accept the current
  // canonical event policies.

  ensure(
    input.termsHash ===
      hashEventPolicy(event.terms) &&
    input.refundPolicyHash ===
      hashEventPolicy(event.refundPolicy),
    'EVENT_POLICIES_CHANGED'
  );

  // Ticket identity and parent ownership.

  ensure(
    ticket.schemaVersion === EVENT_SCHEMA_VERSION &&
    ticket.ticketTypeId === input.ticketTypeId &&
    ticket.eventId === event.eventId,
    'TICKET_NOT_FOUND'
  );

  ensure(
    ticket.status === 'active',
    'TICKET_UNAVAILABLE'
  );

  ensure(
    typeof ticket.name === 'string' &&
    ticket.name.trim().length > 0 &&
    ticket.name.length <= EVENT_LIMITS.ticketNameMaxLength &&
    isAttendanceModeAllowed(
      event.mode,
      ticket.attendanceMode
    ),
    'EVENT_DATA_INVALID'
  );

  ensure(
    isTicketPricingAllowed(
      event.registrationType,
      ticket
    ),
    'INVALID_TICKET_PRICE'
  );

  // Sales window.

  const salesStartAtMs =
    readOptionalTimestamp(
      ticket.salesStartAt,
      'EVENT_DATA_INVALID'
    );

  const salesEndAtMs =
    readOptionalTimestamp(
      ticket.salesEndAt,
      'EVENT_DATA_INVALID'
    );

  ensure(
    (salesStartAtMs === null ||
      salesStartAtMs < eventEndsAtMs) &&
    (salesEndAtMs === null ||
      salesEndAtMs <= eventEndsAtMs) &&
    (salesStartAtMs === null ||
      salesEndAtMs === null ||
      salesStartAtMs < salesEndAtMs),
    'EVENT_DATA_INVALID'
  );

  ensure(
    (salesStartAtMs === null ||
      nowMs >= salesStartAtMs) &&
    (salesEndAtMs === null ||
      nowMs < salesEndAtMs),
    'TICKET_UNAVAILABLE'
  );

  // Quantity and inventory.

  ensure(
    Number.isSafeInteger(ticket.maxPerOrder) &&
    ticket.maxPerOrder >= 1 &&
    ticket.maxPerOrder <= event.maxTicketsPerOrder,
    'EVENT_DATA_INVALID'
  );

  ensure(
    Number.isSafeInteger(input.quantity) &&
    input.quantity >= 1 &&
    input.quantity <= ticket.maxPerOrder &&
    input.quantity <= event.maxTicketsPerOrder &&
    input.participants.length === input.quantity,
    'TICKET_QUANTITY_EXCEEDED'
  );

  ensure(
    inventory.eventId === event.eventId &&
    inventory.ticketTypeId === ticket.ticketTypeId &&
    isValidInventoryCounters(inventory) &&
    inventory.capacity <=
      event.capacity[ticket.attendanceMode],
    'INVALID_EVENT_INVENTORY'
  );

  ensure(
    getAvailableTicketQuantity(inventory) >=
      input.quantity,
    'INSUFFICIENT_TICKET_INVENTORY'
  );

  // Prices are always derived from canonical ticket data.

  let payment: EventOrderPayment;
  let unitAmountMinor: number;

  if (ticket.pricingType === 'free') {
    ensure(
      input.currency === null,
      'INVALID_REGISTRATION_CURRENCY'
    );

    unitAmountMinor = 0;

    payment = {
      paymentRequired: false,
      currency: null,
      provider: null,
      verificationMode: null,
      totalAmountMinor: 0,
    };
  } else {
    ensure(
      input.currency === 'USD' ||
      input.currency === 'BDT',
      'INVALID_REGISTRATION_CURRENCY'
    );

    unitAmountMinor = getPriceForCurrency(
      ticket.price,
      input.currency
    ).amountMinor;

    let totalAmountMinor: number;

    try {
      totalAmountMinor =
        calculateTicketTotalMinor(
          unitAmountMinor,
          input.quantity
        );
    } catch {
      throw new EventRegistrationError(
        'INVALID_TICKET_PRICE'
      );
    }

    ensure(
      totalAmountMinor > 0,
      'INVALID_TICKET_PRICE'
    );

    payment = {
      paymentRequired: true,
      ...getActivePaymentMethod(input.currency),
      totalAmountMinor,
    };
  }

  // Client price is an expectation only.
  // Canonical pricing remains authoritative.

  ensure(
    input.expectedUnitAmountMinor ===
      unitAmountMinor,
    'TICKET_PRICE_CHANGED'
  );

  const item: EventOrderItem = {
    ticketTypeId: ticket.ticketTypeId,
    ticketName: ticket.name,
    attendanceMode: ticket.attendanceMode,
    quantity: input.quantity,
    unitAmountMinor,
    totalAmountMinor: payment.totalAmountMinor,
  };

  // Reservation cannot outlive registration or ticket sales.

  const reservationDeadlineMs = Math.min(
    nowMs + EVENT_PAID_RESERVATION_TTL_MS,
    eventEndsAtMs,
    registrationClosesAtMs ?? eventEndsAtMs,
    salesEndAtMs ?? eventEndsAtMs
  );

  if (payment.paymentRequired) {
    ensure(
      reservationDeadlineMs - nowMs >= 60_000,
      'REGISTRATION_WINDOW_TOO_SHORT'
    );
  }

  const reservationExpiresAt =
    Timestamp.fromMillis(
      payment.paymentRequired
        ? reservationDeadlineMs
        : nowMs
    );

  return {
    item,
    payment,
    reservationExpiresAt,

    orderExpiresAt:
      payment.paymentRequired
        ? reservationExpiresAt
        : null,
  };
}
