import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import {
  EVENT_SCHEMA_VERSION,
  type EventRecord,
  type EventTicketType,
  type EventTicketInventory,
} from '@/lib/event-types';

import {
  EVENT_LIMITS,
  isValidEventDocumentId,
  isAttendanceModeAllowed,
  isValidEventTicketPricing,
  isTicketPricingAllowed,
  isValidInventoryCounters,
} from '@/lib/event-validation';

import {
  EventInputError,
} from '@/lib/event-management-input';

export interface ManagedTicketConfiguration {
  ticketType: EventTicketType;
  inventory: EventTicketInventory;
}

function requireField(
  condition: unknown,
  field: string
): asserts condition {
  if (!condition) {
    throw new EventInputError(field);
  }
}

function object(
  value: unknown,
  field: string
): Record<string, unknown> {
  requireField(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value),
    field
  );

  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  field: string,
  max: number,
  required = false
): string {
  requireField(
    typeof value === 'string',
    field
  );

  const result = value.trim();

  requireField(
    result.length <= max &&
      (!required || result.length > 0),
    field
  );

  return result;
}

function integer(
  value: unknown,
  field: string,
  min: number,
  max: number
): number {
  requireField(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
    field
  );

  return value;
}

function optionalDate(
  value: unknown,
  field: string
): Timestamp | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  return Timestamp.fromMillis(
    integer(
      value,
      field,
      1,
      253402300799999
    )
  );
}

export function buildTicketConfiguration(
  event: EventRecord,
  ticketTypeId: string,
  input: unknown,
  nowMs: number
): ManagedTicketConfiguration {
  requireField(
    isValidEventDocumentId(event.eventId),
    'eventId'
  );

  requireField(
    isValidEventDocumentId(ticketTypeId) &&
      !/^__.*__$/.test(ticketTypeId),
    'ticketTypeId'
  );

  requireField(
    event.status === 'draft',
    'eventStatus'
  );

  const data = object(input, 'ticket');

  const attendanceMode =
    data.attendanceMode;

  requireField(
    attendanceMode === 'online' ||
      attendanceMode === 'offline',
    'attendanceMode'
  );

  requireField(
    isAttendanceModeAllowed(
      event.mode,
      attendanceMode
    ),
    'attendanceMode'
  );

  const price = object(
    data.price,
    'price'
  );

  const pricing = {
    pricingType: data.pricingType,
    price: {
      usdAmountMinor: price.usdAmountMinor,
      bdtAmountMinor: price.bdtAmountMinor,
    },
  };

  requireField(
    isValidEventTicketPricing(pricing),
    'pricing'
  );

  requireField(
    isTicketPricingAllowed(
      event.registrationType,
      pricing
    ),
    'registrationType'
  );

  const capacity = integer(
    data.capacity,
    'capacity',
    1,
    event.capacity[attendanceMode]
  );

  const maxPerOrder = integer(
    data.maxPerOrder,
    'maxPerOrder',
    1,
    Math.min(
      event.maxTicketsPerOrder,
      capacity
    )
  );

  const salesStartAt = optionalDate(
    data.salesStartAtMs,
    'salesStartAtMs'
  );

  const salesEndAt = optionalDate(
    data.salesEndAtMs,
    'salesEndAtMs'
  );

  const eventEndMs =
    event.endsAt.toMillis();

  requireField(
    salesStartAt === null ||
      salesStartAt.toMillis() < eventEndMs,
    'salesStartAtMs'
  );

  requireField(
    salesEndAt === null ||
      salesEndAt.toMillis() <= eventEndMs,
    'salesEndAtMs'
  );

  requireField(
    salesStartAt === null ||
      salesEndAt === null ||
      salesStartAt.toMillis() <
        salesEndAt.toMillis(),
    'salesWindow'
  );

  const rawBenefits =
    data.benefits ?? [];

  requireField(
    Array.isArray(rawBenefits) &&
      rawBenefits.length <= 100,
    'benefits'
  );

  const benefits = rawBenefits.map(
    (value, index) =>
      text(
        value,
        'benefits.' + index,
        1000,
        true
      )
  );

  const status =
    data.status ?? 'active';

  requireField(
    status === 'active' ||
      status === 'draft',
    'ticketStatus'
  );

  const now = Timestamp.fromMillis(
    integer(
      nowMs,
      'nowMs',
      1,
      253402300799999
    )
  );

  const ticketType: EventTicketType = {
    ticketTypeId,
    eventId: event.eventId,

    name: text(
      data.name,
      'name',
      EVENT_LIMITS.ticketNameMaxLength,
      true
    ),

    description: text(
      data.description ?? '',
      'description',
      EVENT_LIMITS.ticketDescriptionMaxLength
    ),

    benefits,

    attendanceMode,
    status,

    ...pricing,

    salesStartAt,
    salesEndAt,
    maxPerOrder,

    sortOrder: integer(
      data.sortOrder ?? 0,
      'sortOrder',
      0,
      100000
    ),

    schemaVersion: EVENT_SCHEMA_VERSION,

    createdAt: now,
    updatedAt: now,
  };

  const inventory: EventTicketInventory = {
    eventId: event.eventId,
    ticketTypeId,
    capacity,
    reservedQuantity: 0,
    issuedQuantity: 0,
    updatedAt: now,
  };

  requireField(
    isValidInventoryCounters(inventory),
    'inventory'
  );

  return {
    ticketType,
    inventory,
  };
}

/**
 * Validates the complete draft ticket allocation.
 *
 * All ticket categories share the event's
 * attendance-specific capacity limits.
 */
export function assertTicketAllocation(
  event: EventRecord,
  configurations:
    readonly ManagedTicketConfiguration[]
): void {
  requireField(
    configurations.length <=
      EVENT_LIMITS.maxTicketTypesPerEvent,
    'ticketTypeLimit'
  );

  const seen = new Set<string>();

  const totals = {
    online: 0,
    offline: 0,
  };

  for (const configuration of configurations) {
    const {
      ticketType,
      inventory,
    } = configuration;

    requireField(
      ticketType.eventId === event.eventId &&
        inventory.eventId === event.eventId &&
        inventory.ticketTypeId ===
          ticketType.ticketTypeId,
      'ticketOwnership'
    );

    requireField(
      !seen.has(ticketType.ticketTypeId),
      'duplicateTicketType'
    );

    seen.add(ticketType.ticketTypeId);

    requireField(
      isAttendanceModeAllowed(
        event.mode,
        ticketType.attendanceMode
      ),
      'attendanceMode'
    );

    requireField(
      isValidInventoryCounters(inventory),
      'inventory'
    );

    requireField(
      inventory.reservedQuantity === 0 &&
        inventory.issuedQuantity === 0,
      'existingTicketActivity'
    );

    requireField(
      isTicketPricingAllowed(
        event.registrationType,
        ticketType
      ),
      'registrationType'
    );

    requireField(
      Number.isSafeInteger(
        ticketType.maxPerOrder
      ) &&
        ticketType.maxPerOrder >= 1 &&
        ticketType.maxPerOrder <=
          event.maxTicketsPerOrder &&
        ticketType.maxPerOrder <=
          inventory.capacity,
      'maxPerOrder'
    );

    totals[ticketType.attendanceMode] +=
      inventory.capacity;
  }

  requireField(
    totals.online <= event.capacity.online,
    'onlineCapacityExceeded'
  );

  requireField(
    totals.offline <= event.capacity.offline,
    'offlineCapacityExceeded'
  );
}
