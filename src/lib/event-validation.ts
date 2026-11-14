/**
 * Shared Event Management business validation.
 *
 * These helpers validate business invariants.
 * They do not replace authentication, authorization,
 * strict request parsing or transactional enforcement.
 */

import {
  EVENT_MODES,
  EVENT_STATUSES,
  PLATFORM_EVENT_ORGANIZER_ID,
} from '@/lib/event-types';

import type {
  EventMode,
  EventStatus,
  EventOwnership,
  EventAttendanceMode,
  EventCapacity,
  EventVenue,
  EventTicketPricing,
  EventTicketInventory,
  EventRegistrationType,
} from '@/lib/event-types';

import {
  isValidDualCurrencyPrice,
  isValidMinorAmount,
  isValidPaidAmount,
} from '@/lib/payment-types';

export const EVENT_LIMITS = {
  titleMaxLength: 160,
  slugMaxLength: 120,
  shortDescriptionMaxLength: 500,
  descriptionMaxLength: 30000,
  ticketNameMaxLength: 120,
  ticketDescriptionMaxLength: 3000,
  maxCapacityPerMode: 100000,
  maxTicketsPerOrder: 20,
  maxTicketTypesPerEvent: 50,
} as const;

export function isValidEventDocumentId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value === value.trim() &&
    value !== '.' &&
    value !== '..' &&
    !/[\/\u0000-\u001f\u007f]/.test(value)
  );
}

export function isValidEventMode(
  value: unknown
): value is EventMode {
  return EVENT_MODES.some(mode => mode === value);
}

export function isValidEventStatus(
  value: unknown
): value is EventStatus {
  return EVENT_STATUSES.some(status => status === value);
}

export function isValidEventSlug(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= EVENT_LIMITS.slugMaxLength &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

export function isValidEventTitle(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= 3 &&
    value.length <= EVENT_LIMITS.titleMaxLength
  );
}

export function isValidEventTimezone(
  value: unknown
): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 100
  ) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone: value,
    });

    return true;
  } catch {
    return false;
  }
}

export function isValidEventDateRange(
  startsAtMs: unknown,
  endsAtMs: unknown
): boolean {
  return (
    typeof startsAtMs === 'number' &&
    typeof endsAtMs === 'number' &&
    Number.isSafeInteger(startsAtMs) &&
    Number.isSafeInteger(endsAtMs) &&
    startsAtMs > 0 &&
    endsAtMs > startsAtMs &&
    endsAtMs <= 253402300799999
  );
}

export function isValidEventOwnership(
  value: unknown
): value is EventOwnership {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const owner = value as Record<string, unknown>;

  if (owner.organizerType === 'platform') {
    return (
      owner.organizerId ===
      PLATFORM_EVENT_ORGANIZER_ID
    );
  }

  if (owner.organizerType === 'verified_organizer') {
    return (
      isValidEventDocumentId(owner.organizerId) &&
      owner.organizerId !==
        PLATFORM_EVENT_ORGANIZER_ID
    );
  }

  return false;
}

export function isValidEventCapacity(
  mode: EventMode,
  value: unknown
): value is EventCapacity {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const capacity = value as Record<string, unknown>;

  const online = capacity.online;
  const offline = capacity.offline;

  if (
    !isValidMinorAmount(online) ||
    !isValidMinorAmount(offline) ||
    online > EVENT_LIMITS.maxCapacityPerMode ||
    offline > EVENT_LIMITS.maxCapacityPerMode
  ) {
    return false;
  }

  switch (mode) {
    case 'online':
      return online > 0 && offline === 0;

    case 'offline':
      return offline > 0 && online === 0;

    case 'hybrid':
      return online > 0 && offline > 0;

    default:
      return false;
  }
}

export function isAttendanceModeAllowed(
  eventMode: EventMode,
  attendanceMode: EventAttendanceMode
): boolean {
  if (
    attendanceMode !== 'online' &&
    attendanceMode !== 'offline'
  ) {
    return false;
  }

  switch (eventMode) {
    case 'online':
      return attendanceMode === 'online';

    case 'offline':
      return attendanceMode === 'offline';

    case 'hybrid':
      return true;

    default:
      return false;
  }
}

function isNonEmptyBoundedString(
  value: unknown,
  maxLength: number
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

export function isValidHttpsUrl(
  value: unknown
): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    value !== value.trim()
  ) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.hostname.length > 0 &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

export function isValidEventVenue(
  value: unknown
): value is EventVenue {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const venue = value as Record<string, unknown>;

  return (
    isNonEmptyBoundedString(venue.name, 200) &&
    isNonEmptyBoundedString(venue.address, 1000) &&
    isNonEmptyBoundedString(venue.city, 120) &&
    typeof venue.countryCode === 'string' &&
    /^[A-Z]{2}$/.test(venue.countryCode) &&
    (
      venue.mapUrl === null ||
      isValidHttpsUrl(venue.mapUrl)
    )
  );
}

export function isVenueAllowedForEventMode(
  mode: EventMode,
  venue: unknown
): boolean {
  switch (mode) {
    case 'online':
      return venue === null;

    case 'offline':
    case 'hybrid':
      return isValidEventVenue(venue);

    default:
      return false;
  }
}

export function isValidEventTicketPricing(
  value: unknown
): value is EventTicketPricing {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const pricing = value as Record<string, unknown>;

  if (!isValidDualCurrencyPrice(pricing.price)) {
    return false;
  }

  const price = pricing.price;

  if (pricing.pricingType === 'free') {
    return (
      price.usdAmountMinor === 0 &&
      price.bdtAmountMinor === 0
    );
  }

  if (pricing.pricingType === 'paid') {
    return (
      isValidPaidAmount(price.usdAmountMinor) &&
      isValidPaidAmount(price.bdtAmountMinor)
    );
  }

  return false;
}

export function isTicketPricingAllowed(
  registrationType: EventRegistrationType,
  pricing: EventTicketPricing
): boolean {
  if (!isValidEventTicketPricing(pricing)) {
    return false;
  }

  switch (registrationType) {
    case 'free':
      return pricing.pricingType === 'free';

    case 'paid':
      return pricing.pricingType === 'paid';

    case 'mixed':
      return true;

    default:
      return false;
  }
}

export function isValidTicketQuantity(
  value: unknown
): value is number {
  return (
    isValidPaidAmount(value) &&
    value <= EVENT_LIMITS.maxTicketsPerOrder
  );
}

export function isValidInventoryCounters(
  inventory: Pick<
    EventTicketInventory,
    'capacity' |
    'reservedQuantity' |
    'issuedQuantity'
  >
): boolean {
  const {
    capacity,
    reservedQuantity,
    issuedQuantity,
  } = inventory;

  return (
    isValidPaidAmount(capacity) &&
    capacity <= EVENT_LIMITS.maxCapacityPerMode &&
    isValidMinorAmount(reservedQuantity) &&
    isValidMinorAmount(issuedQuantity) &&
    reservedQuantity <= capacity &&
    issuedQuantity <= capacity - reservedQuantity
  );
}

export function getAvailableTicketQuantity(
  inventory: Pick<
    EventTicketInventory,
    'capacity' |
    'reservedQuantity' |
    'issuedQuantity'
  >
): number {
  if (!isValidInventoryCounters(inventory)) {
    throw new Error('INVALID_EVENT_INVENTORY');
  }

  return (
    inventory.capacity -
    inventory.reservedQuantity -
    inventory.issuedQuantity
  );
}

export function calculateTicketTotalMinor(
  unitAmountMinor: number,
  quantity: number
): number {
  if (!isValidMinorAmount(unitAmountMinor)) {
    throw new Error('INVALID_TICKET_PRICE');
  }

  if (!isValidTicketQuantity(quantity)) {
    throw new Error('INVALID_TICKET_QUANTITY');
  }

  const total = unitAmountMinor * quantity;

  if (!isValidMinorAmount(total)) {
    throw new Error('INVALID_TICKET_TOTAL');
  }

  return total;
}

export function isValidEventRegistrationWindow(
  opensAtMs: number | null,
  closesAtMs: number | null,
  eventEndsAtMs: number
): boolean {
  if (
    !Number.isSafeInteger(eventEndsAtMs) ||
    eventEndsAtMs <= 0 ||
    eventEndsAtMs > 253402300799999
  ) {
    return false;
  }

  if (
    opensAtMs !== null &&
    (
      !Number.isSafeInteger(opensAtMs) ||
      opensAtMs <= 0 ||
      opensAtMs >= eventEndsAtMs
    )
  ) {
    return false;
  }

  if (
    closesAtMs !== null &&
    (
      !Number.isSafeInteger(closesAtMs) ||
      closesAtMs <= 0 ||
      closesAtMs > eventEndsAtMs
    )
  ) {
    return false;
  }

  if (
    opensAtMs !== null &&
    closesAtMs !== null &&
    opensAtMs >= closesAtMs
  ) {
    return false;
  }

  return true;
}
