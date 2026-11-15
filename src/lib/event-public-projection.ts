/**
 * TabStartup Public Event Data Projection.
 *
 * Canonical event records are private.
 *
 * Public projections contain explicitly
 * allowlisted fields only.
 *
 * Never copy canonical documents using
 * object spreads into public collections.
 */

import {
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventRecord,
  type EventTicketType,
  type EventTicketInventory,
} from '@/lib/event-types';

import {
  isPublicEventDiscoverable,
  isEventRegistrationOpen,
} from '@/lib/event-lifecycle';

import {
  isValidEventDocumentId,
  isValidEventOwnership,
  isValidEventSlug,
  isValidEventMode,
  isValidEventDateRange,
  isValidEventCapacity,
  isVenueAllowedForEventMode,
  isValidEventTicketPricing,
  isValidInventoryCounters,
  isAttendanceModeAllowed,
  isTicketPricingAllowed,
  getAvailableTicketQuantity,
  isValidHttpsUrl,
  isValidEventTimezone,
  isValidEventRegistrationWindow,
} from '@/lib/event-validation';

export const PUBLIC_EVENT_SCHEMA_VERSION =
  1 as const;

type PublicEventStatus =
  | 'published'
  | 'ongoing'
  | 'completed';

export interface PublicEventProjection {
  eventId: string;
  slug: string;

  title: string;
  shortDescription: string;
  description: string;

  organizerName: string;
  organizerLogoUrl: string | null;

  category: EventRecord['category'];
  mode: EventRecord['mode'];

  status: PublicEventStatus;
  visibility: 'public';

  registrationType:
    EventRecord['registrationType'];

  registrationAccess?:
    | 'public'
    | 'invite_only'
    | 'public_and_invitation';

  registrationStatus:
    EventRecord['registrationStatus'];

  bannerUrl: string | null;
  timezone: string;

  startsAtMs: number;
  endsAtMs: number;

  registrationOpensAtMs: number | null;
  registrationClosesAtMs: number | null;

  venue: {
    name: string;
    address: string;
    city: string;
    countryCode: string;
    mapUrl: string | null;
  } | null;

  allowGuestRegistration: boolean;
  maxTicketsPerOrder: number;

  speakers: Array<{
    speakerId: string;
    fullName: string;
    designation: string;
    organization: string;
    bio: string;
    imageUrl: string | null;
  }>;

  sponsors: Array<{
    sponsorId: string;
    name: string;
    tier: string;
    logoUrl: string | null;
    websiteUrl: string | null;
  }>;

  agenda: Array<{
    agendaItemId: string;
    title: string;
    description: string;
    startsAtMs: number;
    endsAtMs: number;
    speakerIds: string[];
    attendanceMode:
      'online' | 'offline' | null;
  }>;

  terms: string;
  refundPolicy: string;

  schemaVersion:
    typeof PUBLIC_EVENT_SCHEMA_VERSION;

  updatedAtMs: number;
}

export type PublicTicketAvailability =
  | 'available'
  | 'sold_out'
  | 'not_open'
  | 'closed';

export interface PublicEventTicketProjection {
  eventId: string;
  ticketTypeId: string;

  name: string;
  description: string;
  benefits: string[];

  attendanceMode: 'online' | 'offline';

  pricingType: 'free' | 'paid';

  price: {
    usdAmountMinor: number;
    bdtAmountMinor: number;
  };

  salesStartAtMs: number | null;
  salesEndAtMs: number | null;

  maxPerOrder: number;
  sortOrder: number;

  availability: PublicTicketAvailability;

  schemaVersion:
    typeof PUBLIC_EVENT_SCHEMA_VERSION;

  updatedAtMs: number;
}


/**
 * Firestore records are runtime data.
 * TypeScript types alone do not protect
 * public projection boundaries.
 */

function assertPublicField(
  condition: boolean,
  field: string
): asserts condition {
  if (!condition) {
    throw new Error(
      'INVALID_PUBLIC_FIELD:' + field
    );
  }
}

function isPublicString(
  value: unknown,
  maxLength: number,
  required = false
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (!required || value.trim().length > 0)
  );
}

function isPublicObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function isPublicEnum(
  value: unknown,
  allowed: readonly string[]
): boolean {
  return (
    typeof value === 'string' &&
    allowed.includes(value)
  );
}

function isPublicInteger(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isPublicUrl(
  value: unknown
): boolean {
  return (
    value === null ||
    isValidHttpsUrl(value)
  );
}

function assertPublicEventFields(
  event: EventRecord
): void {
  assertPublicField(
    isPublicString(event.title, 160, true),
    'title'
  );

  assertPublicField(
    isPublicString(
      event.shortDescription,
      500,
      true
    ),
    'shortDescription'
  );

  assertPublicField(
    isPublicString(
      event.description,
      30000,
      true
    ),
    'description'
  );

  assertPublicField(
    isPublicString(
      event.organizerName,
      200,
      true
    ),
    'organizerName'
  );

  assertPublicField(
    isPublicUrl(event.organizerLogoUrl),
    'organizerLogoUrl'
  );

  assertPublicField(
    isPublicUrl(event.bannerUrl),
    'bannerUrl'
  );

  assertPublicField(
    isPublicEnum(event.category, [
      'startup_pitch',
      'networking',
      'workshop',
      'webinar',
      'demo_day',
      'conference',
      'summit',
      'competition',
      'mentorship',
      'other',
    ]),
    'category'
  );

  assertPublicField(
    isPublicEnum(event.registrationType, [
      'free',
      'paid',
      'mixed',
    ]),
    'registrationType'
  );

  assertPublicField(
    event.registrationAccess === undefined ||
    isPublicEnum(event.registrationAccess, [
      'public',
      'invite_only',
      'public_and_invitation',
    ]),
    'registrationAccess'
  );

  assertPublicField(
    isPublicEnum(event.registrationStatus, [
      'not_open',
      'open',
      'paused',
      'closed',
    ]),
    'registrationStatus'
  );

  assertPublicField(
    isValidEventTimezone(event.timezone),
    'timezone'
  );

  assertPublicField(
    typeof event.allowGuestRegistration ===
      'boolean',
    'allowGuestRegistration'
  );

  assertPublicField(
    isPublicInteger(
      event.maxTicketsPerOrder,
      1,
      20
    ),
    'maxTicketsPerOrder'
  );

  assertPublicField(
    isPublicString(event.terms, 30000),
    'terms'
  );

  assertPublicField(
    isPublicString(
      event.refundPolicy,
      30000
    ),
    'refundPolicy'
  );

  // Speakers

  assertPublicField(
    Array.isArray(event.speakers) &&
      event.speakers.length <= 100,
    'speakers'
  );

  for (const speaker of event.speakers) {
    assertPublicField(
      isPublicObject(speaker),
      'speaker'
    );

    assertPublicField(
      isValidEventDocumentId(
        speaker.speakerId
      ),
      'speaker.speakerId'
    );

    assertPublicField(
      isPublicString(
        speaker.fullName,
        200,
        true
      ),
      'speaker.fullName'
    );

    assertPublicField(
      isPublicString(
        speaker.designation,
        200
      ),
      'speaker.designation'
    );

    assertPublicField(
      isPublicString(
        speaker.organization,
        200
      ),
      'speaker.organization'
    );

    assertPublicField(
      isPublicString(
        speaker.bio,
        5000
      ),
      'speaker.bio'
    );

    assertPublicField(
      isPublicUrl(speaker.imageUrl),
      'speaker.imageUrl'
    );
  }

  // Sponsors

  assertPublicField(
    Array.isArray(event.sponsors) &&
      event.sponsors.length <= 100,
    'sponsors'
  );

  for (const sponsor of event.sponsors) {
    assertPublicField(
      isPublicObject(sponsor),
      'sponsor'
    );

    assertPublicField(
      isValidEventDocumentId(
        sponsor.sponsorId
      ),
      'sponsor.sponsorId'
    );

    assertPublicField(
      isPublicString(
        sponsor.name,
        200,
        true
      ),
      'sponsor.name'
    );

    assertPublicField(
      isPublicString(sponsor.tier, 100),
      'sponsor.tier'
    );

    assertPublicField(
      isPublicUrl(sponsor.logoUrl),
      'sponsor.logoUrl'
    );

    assertPublicField(
      isPublicUrl(sponsor.websiteUrl),
      'sponsor.websiteUrl'
    );
  }

  // Agenda

  assertPublicField(
    Array.isArray(event.agenda) &&
      event.agenda.length <= 200,
    'agenda'
  );

  for (const item of event.agenda) {
    assertPublicField(
      isPublicObject(item),
      'agendaItem'
    );

    assertPublicField(
      isValidEventDocumentId(
        item.agendaItemId
      ),
      'agendaItem.agendaItemId'
    );

    assertPublicField(
      isPublicString(
        item.title,
        200,
        true
      ),
      'agendaItem.title'
    );

    assertPublicField(
      isPublicString(
        item.description,
        5000
      ),
      'agendaItem.description'
    );

    assertPublicField(
      Array.isArray(item.speakerIds) &&
        item.speakerIds.length <= 100 &&
        item.speakerIds.every(
          id => isValidEventDocumentId(id)
        ),
      'agendaItem.speakerIds'
    );

    assertPublicField(
      item.attendanceMode === null ||
        (
          isPublicEnum(
            item.attendanceMode,
            ['online', 'offline']
          ) &&
          isAttendanceModeAllowed(
            event.mode,
            item.attendanceMode
          )
        ),
      'agendaItem.attendanceMode'
    );

    const agendaStart =
      timestampMillis(item.startsAt);

    const agendaEnd =
      timestampMillis(item.endsAt);

    assertPublicField(
      isValidEventDateRange(
        agendaStart,
        agendaEnd
      ),
      'agendaItem.dateRange'
    );
  }
}

function assertPublicTicketFields(
  ticket: EventTicketType
): void {
  assertPublicField(
    isPublicString(
      ticket.name,
      120,
      true
    ),
    'ticket.name'
  );

  assertPublicField(
    isPublicString(
      ticket.description,
      3000
    ),
    'ticket.description'
  );

  assertPublicField(
    Array.isArray(ticket.benefits) &&
      ticket.benefits.length <= 100 &&
      ticket.benefits.every(
        benefit => isPublicString(
          benefit,
          1000,
          true
        )
      ),
    'ticket.benefits'
  );

  assertPublicField(
    isPublicInteger(
      ticket.sortOrder,
      0,
      100000
    ),
    'ticket.sortOrder'
  );
}

function timestampMillis(
  value: unknown
): number {
  if (
    !value ||
    typeof value !== 'object' ||
    !('toMillis' in value) ||
    typeof value.toMillis !== 'function'
  ) {
    throw new Error(
      'INVALID_PUBLIC_EVENT_TIMESTAMP'
    );
  }

  const millis = value.toMillis();

  if (
    typeof millis !== 'number' ||
    !Number.isFinite(millis) ||
    millis < 0 ||
    millis > 253402300799999
  ) {
    throw new Error(
      'INVALID_PUBLIC_EVENT_TIMESTAMP'
    );
  }

  return Math.floor(millis);
}

function optionalTimestampMillis(
  value: unknown
): number | null {
  return value === null
    ? null
    : timestampMillis(value);
}

function assertValidProjectionTime(
  nowMs: number
): void {
  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs <= 0 ||
    nowMs > 253402300799999
  ) {
    throw new Error(
      'INVALID_PUBLIC_PROJECTION_TIME'
    );
  }
}

/**
 * Release A publishes official TabStartup
 * events only.
 */
export function canProjectPublicEvent(
  event: EventRecord
): boolean {
  return (
    event.schemaVersion ===
      EVENT_SCHEMA_VERSION &&
    isValidEventOwnership(event) &&
    event.organizerType === 'platform' &&
    event.organizerId ===
      PLATFORM_EVENT_ORGANIZER_ID &&
    isPublicEventDiscoverable(event)
  );
}

/**
 * Explicit public event projection.
 *
 * Returns null when an event must not
 * be publicly accessible.
 *
 * The persistence service must delete
 * any existing projection in that case.
 */
export function buildPublicEventProjection(
  event: EventRecord,
  nowMs: number
): PublicEventProjection | null {
  assertValidProjectionTime(nowMs);

  if (!canProjectPublicEvent(event)) {
    return null;
  }

  if (
    !isValidEventDocumentId(event.eventId) ||
    !isValidEventSlug(event.slug) ||
    !isValidEventMode(event.mode) ||
    !isValidEventCapacity(
      event.mode,
      event.capacity
    ) ||
    !isVenueAllowedForEventMode(
      event.mode,
      event.venue
    )
  ) {
    throw new Error(
      'INVALID_PUBLIC_EVENT_SOURCE'
    );
  }

  assertPublicEventFields(event);

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
    throw new Error(
      'INVALID_PUBLIC_EVENT_DATE_RANGE'
    );
  }

  const registrationOpensAtMs =
    optionalTimestampMillis(
      event.registrationOpensAt
    );

  const registrationClosesAtMs =
    optionalTimestampMillis(
      event.registrationClosesAt
    );

  assertPublicField(
    isValidEventRegistrationWindow(
      registrationOpensAtMs,
      registrationClosesAtMs,
      endsAtMs
    ),
    'registrationWindow'
  );

  const status = event.status;

  if (
    status !== 'published' &&
    status !== 'ongoing' &&
    status !== 'completed'
  ) {
    return null;
  }

  return {
    eventId: event.eventId,
    slug: event.slug,

    title: event.title,
    shortDescription:
      event.shortDescription,
    description: event.description,

    organizerName: event.organizerName,
    organizerLogoUrl:
      event.organizerLogoUrl,

    category: event.category,
    mode: event.mode,

    status,
    visibility: 'public',

    registrationType:
      event.registrationType,

    registrationAccess:
      event.registrationAccess ?? 'public',

    registrationStatus:
      status === 'completed' ||
      nowMs >= endsAtMs ||
      (
        registrationClosesAtMs !== null &&
        nowMs >= registrationClosesAtMs
      )
        ? 'closed'
        : (
            event.registrationStatus === 'open' &&
            registrationOpensAtMs !== null &&
            nowMs < registrationOpensAtMs
          )
          ? 'not_open'
          : event.registrationStatus,

    bannerUrl: event.bannerUrl,
    timezone: event.timezone,

    startsAtMs,
    endsAtMs,

    registrationOpensAtMs,
    registrationClosesAtMs,

    venue: event.venue
      ? {
          name: event.venue.name,
          address: event.venue.address,
          city: event.venue.city,
          countryCode:
            event.venue.countryCode,
          mapUrl: event.venue.mapUrl,
        }
      : null,

    allowGuestRegistration:
      event.allowGuestRegistration,

    maxTicketsPerOrder:
      event.maxTicketsPerOrder,

    speakers: event.speakers.map(
      speaker => ({
        speakerId: speaker.speakerId,
        fullName: speaker.fullName,
        designation: speaker.designation,
        organization: speaker.organization,
        bio: speaker.bio,
        imageUrl: speaker.imageUrl,
      })
    ),

    sponsors: event.sponsors.map(
      sponsor => ({
        sponsorId: sponsor.sponsorId,
        name: sponsor.name,
        tier: sponsor.tier,
        logoUrl: sponsor.logoUrl,
        websiteUrl: sponsor.websiteUrl,
      })
    ),

    agenda: event.agenda.map(
      item => ({
        agendaItemId: item.agendaItemId,
        title: item.title,
        description: item.description,

        startsAtMs:
          timestampMillis(item.startsAt),

        endsAtMs:
          timestampMillis(item.endsAt),

        speakerIds:
          item.speakerIds.map(id => id),

        attendanceMode:
          item.attendanceMode,
      })
    ),

    terms: event.terms,
    refundPolicy: event.refundPolicy,

    schemaVersion:
      PUBLIC_EVENT_SCHEMA_VERSION,

    updatedAtMs: nowMs,
  };
}

/**
 * Public ticket availability is advisory.
 *
 * The registration service must always
 * re-check authoritative inventory,
 * event status and sales windows inside
 * a server-side transaction.
 */
function resolveTicketAvailability(
  event: EventRecord,
  ticket: EventTicketType,
  inventory: EventTicketInventory,
  nowMs: number,
  salesStartAtMs: number | null,
  salesEndAtMs: number | null
): PublicTicketAvailability {
  if (
    event.status === 'completed' ||
    nowMs >= timestampMillis(event.endsAt) ||
    ticket.status === 'closed' ||
    ticket.status === 'paused'
  ) {
    return 'closed';
  }

  if (
    salesEndAtMs !== null &&
    nowMs >= salesEndAtMs
  ) {
    return 'closed';
  }

  if (
    event.registrationClosesAt !== null &&
    nowMs >= timestampMillis(
      event.registrationClosesAt
    )
  ) {
    return 'closed';
  }

  if (
    event.registrationStatus === 'closed' ||
    event.registrationStatus === 'paused'
  ) {
    return 'closed';
  }

  if (
    salesStartAtMs !== null &&
    nowMs < salesStartAtMs
  ) {
    return 'not_open';
  }

  if (
    !isEventRegistrationOpen(event, nowMs)
  ) {
    return 'not_open';
  }

  if (
    getAvailableTicketQuantity(inventory) === 0
  ) {
    return 'sold_out';
  }

  return 'available';
}

/**
 * Public ticket projection.
 *
 * Never exposes exact inventory counters
 * or any participant/payment information.
 */
export function buildPublicTicketProjection(
  event: EventRecord,
  ticket: EventTicketType,
  inventory: EventTicketInventory,
  nowMs: number
): PublicEventTicketProjection | null {
  assertValidProjectionTime(nowMs);

  if (!canProjectPublicEvent(event)) {
    return null;
  }

  /**
   * Invitation-only tickets are canonical,
   * server-managed records.
   *
   * Never expose them through public projections.
   * Missing access preserves legacy public tickets.
   * Unknown access values fail closed.
   */
  if (
    ticket.access !== undefined &&
    ticket.access !== 'public'
  ) {
    return null;
  }

  /**
   * Invitation-only registration must not
   * advertise publicly available tickets.
   */
  if (
    event.registrationAccess !== undefined &&
    event.registrationAccess !== 'public' &&
    event.registrationAccess !== 'public_and_invitation'
  ) {
    return null;
  }

  if (
    ticket.status === 'draft' ||
    ticket.status === 'archived'
  ) {
    return null;
  }

  if (
    ticket.status !== 'active' &&
    ticket.status !== 'paused' &&
    ticket.status !== 'closed'
  ) {
    throw new Error(
      'INVALID_PUBLIC_TICKET_STATUS'
    );
  }

  if (
    ticket.schemaVersion !==
      EVENT_SCHEMA_VERSION ||

    !isValidEventDocumentId(event.eventId) ||

    !isValidEventDocumentId(
      ticket.ticketTypeId
    ) ||

    ticket.eventId !== event.eventId ||

    inventory.eventId !== event.eventId ||

    inventory.ticketTypeId !==
      ticket.ticketTypeId ||

    !isAttendanceModeAllowed(
      event.mode,
      ticket.attendanceMode
    ) ||

    !isValidEventTicketPricing(ticket) ||

    !isTicketPricingAllowed(
      event.registrationType,
      ticket
    ) ||

    !isValidInventoryCounters(inventory)
  ) {
    throw new Error(
      'INVALID_PUBLIC_TICKET_SOURCE'
    );
  }

  assertPublicTicketFields(ticket);

  assertPublicField(
    isPublicInteger(
      event.maxTicketsPerOrder,
      1,
      20
    ),
    'event.maxTicketsPerOrder'
  );

  if (
    !Number.isSafeInteger(
      ticket.maxPerOrder
    ) ||
    ticket.maxPerOrder < 1 ||
    ticket.maxPerOrder >
      event.maxTicketsPerOrder
  ) {
    throw new Error(
      'INVALID_PUBLIC_TICKET_ORDER_LIMIT'
    );
  }

  const salesStartAtMs =
    optionalTimestampMillis(
      ticket.salesStartAt
    );

  const salesEndAtMs =
    optionalTimestampMillis(
      ticket.salesEndAt
    );

  if (
    salesStartAtMs !== null &&
    salesEndAtMs !== null &&
    salesStartAtMs >= salesEndAtMs
  ) {
    throw new Error(
      'INVALID_PUBLIC_TICKET_SALES_WINDOW'
    );
  }

  return {
    eventId: event.eventId,
    ticketTypeId: ticket.ticketTypeId,

    name: ticket.name,
    description: ticket.description,

    benefits:
      ticket.benefits.map(
        benefit => benefit
      ),

    attendanceMode:
      ticket.attendanceMode,

    pricingType:
      ticket.pricingType,

    price: {
      usdAmountMinor:
        ticket.price.usdAmountMinor,

      bdtAmountMinor:
        ticket.price.bdtAmountMinor,
    },

    salesStartAtMs,
    salesEndAtMs,

    maxPerOrder:
      ticket.maxPerOrder,

    sortOrder:
      ticket.sortOrder,

    availability:
      resolveTicketAvailability(
        event,
        ticket,
        inventory,
        nowMs,
        salesStartAtMs,
        salesEndAtMs
      ),

    schemaVersion:
      PUBLIC_EVENT_SCHEMA_VERSION,

    updatedAtMs: nowMs,
  };
}
