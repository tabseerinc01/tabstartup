import 'server-only';

import { createHash } from 'node:crypto';

import { getFirebaseAdmin } from '@/firebase/admin';

import {
  EVENT_COLLECTIONS,
} from '@/lib/event-types';

import {
  PUBLIC_EVENT_SCHEMA_VERSION,
  type PublicEventProjection,
  type PublicEventTicketProjection,
} from '@/lib/event-public-projection';

import {
  isValidEventDocumentId,
  isValidEventSlug,
  isValidEventMode,
  isValidEventDateRange,
  isValidEventTimezone,
  isValidHttpsUrl,
} from '@/lib/event-validation';

const MAX_PUBLIC_EVENTS = 100;
const MAX_EVENT_TICKETS = 50;

export type PublicEventSummary = Pick<
  PublicEventProjection,
  | 'eventId'
  | 'slug'
  | 'title'
  | 'shortDescription'
  | 'organizerName'
  | 'category'
  | 'mode'
  | 'status'
  | 'registrationType'
  | 'registrationAccess'
  | 'registrationStatus'
  | 'bannerUrl'
  | 'timezone'
  | 'startsAtMs'
  | 'endsAtMs'
  | 'venue'
>;

export type PublicEventDetails = PublicEventSummary &
  Pick<
    PublicEventProjection,
    | 'description'
    | 'organizerLogoUrl'
    | 'registrationOpensAtMs'
    | 'registrationClosesAtMs'
    | 'allowGuestRegistration'
    | 'maxTicketsPerOrder'
    | 'terms'
    | 'refundPolicy'
  > & {
    termsHash: string;
    refundPolicyHash: string;
  };

export type PublicEventTicket = Pick<
  PublicEventTicketProjection,
  | 'eventId'
  | 'ticketTypeId'
  | 'name'
  | 'description'
  | 'benefits'
  | 'attendanceMode'
  | 'pricingType'
  | 'price'
  | 'salesStartAtMs'
  | 'salesEndAtMs'
  | 'maxPerOrder'
  | 'sortOrder'
  | 'availability'
>;

export interface PublicEventDetailsResult {
  event: PublicEventDetails;
  tickets: PublicEventTicket[];
}

function isText(
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

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function isTimestamp(
  value: unknown
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 253402300799999
  );
}

function isOptionalTimestamp(
  value: unknown
): value is number | null {
  return (
    value === null ||
    isTimestamp(value)
  );
}

function isOptionalUrl(
  value: unknown
): value is string | null {
  return (
    value === null ||
    (
      typeof value === 'string' &&
      isValidHttpsUrl(value)
    )
  );
}

function readVenue(
  value: unknown
): PublicEventProjection['venue'] | undefined {
  if (value === null) {
    return null;
  }

  if (
    !isObject(value) ||
    !isText(value.name, 200, true) ||
    !isText(value.address, 1000, true) ||
    !isText(value.city, 120, true) ||
    typeof value.countryCode !== 'string' ||
    !/^[A-Z]{2}$/.test(value.countryCode) ||
    !isOptionalUrl(value.mapUrl)
  ) {
    return undefined;
  }

  return {
    name: value.name,
    address: value.address,
    city: value.city,
    countryCode: value.countryCode,
    mapUrl: value.mapUrl,
  };
}

/**
 * Public projections are still runtime data.
 * Never return an entire Firestore document.
 */
function readPublicEvent(
  documentId: string,
  value: unknown
): PublicEventDetails | null {
  if (
    !isObject(value) ||
    value.schemaVersion !==
      PUBLIC_EVENT_SCHEMA_VERSION ||
    value.eventId !== documentId ||
    !isValidEventDocumentId(documentId) ||
    value.visibility !== 'public' ||
    (
      value.status !== 'published' &&
      value.status !== 'ongoing' &&
      value.status !== 'completed'
    ) ||
    typeof value.slug !== 'string' ||
    !isValidEventSlug(value.slug) ||
    !isText(value.title, 160, true) ||
    !isText(value.shortDescription, 500, true) ||
    !isText(value.description, 30000, true) ||
    !isText(value.organizerName, 200, true) ||
    !isText(value.category, 100, true) ||
    typeof value.mode !== 'string' ||
    !isValidEventMode(value.mode) ||
    (
      value.registrationType !== 'free' &&
      value.registrationType !== 'paid' &&
      value.registrationType !== 'mixed'
    ) ||
    (
      value.registrationAccess !== undefined &&
      value.registrationAccess !== 'public' &&
      value.registrationAccess !== 'invite_only' &&
      value.registrationAccess !== 'public_and_invitation'
    ) ||
    (
      value.registrationStatus !== 'not_open' &&
      value.registrationStatus !== 'open' &&
      value.registrationStatus !== 'paused' &&
      value.registrationStatus !== 'closed'
    ) ||
    !isOptionalUrl(value.bannerUrl) ||
    !isOptionalUrl(value.organizerLogoUrl) ||
    typeof value.timezone !== 'string' ||
    !isValidEventTimezone(value.timezone) ||
    !isTimestamp(value.startsAtMs) ||
    !isTimestamp(value.endsAtMs) ||
    !isValidEventDateRange(
      value.startsAtMs,
      value.endsAtMs
    ) ||
    !isOptionalTimestamp(
      value.registrationOpensAtMs
    ) ||
    !isOptionalTimestamp(
      value.registrationClosesAtMs
    ) ||
    typeof value.allowGuestRegistration !== 'boolean' ||
    typeof value.maxTicketsPerOrder !== 'number' ||
    !Number.isSafeInteger(value.maxTicketsPerOrder) ||
    value.maxTicketsPerOrder < 1 ||
    value.maxTicketsPerOrder > 20 ||
    !isText(value.terms, 30000) ||
    !isText(value.refundPolicy, 30000)
  ) {
    return null;
  }

  const venue = readVenue(value.venue);

  if (
    venue === undefined ||
    (value.mode === 'online' && venue !== null) ||
    (value.mode !== 'online' && venue === null)
  ) {
    return null;
  }

  const categories = [
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
  ];

  if (!categories.includes(value.category)) {
    return null;
  }

  const opensAt =
    value.registrationOpensAtMs;

  const closesAt =
    value.registrationClosesAtMs;

  if (
    (opensAt !== null &&
      opensAt >= value.endsAtMs) ||
    (closesAt !== null &&
      closesAt > value.endsAtMs) ||
    (opensAt !== null &&
      closesAt !== null &&
      opensAt >= closesAt)
  ) {
    return null;
  }

  const now = Date.now();

  let registrationStatus:
    PublicEventProjection['registrationStatus'] =
      value.registrationStatus;

  if (
    value.status === 'completed' ||
    now >= value.endsAtMs ||
    (closesAt !== null && now >= closesAt)
  ) {
    registrationStatus = 'closed';
  } else if (
    opensAt !== null &&
    now < opensAt &&
    registrationStatus === 'open'
  ) {
    registrationStatus = 'not_open';
  }

  return {
    eventId: documentId,
    slug: value.slug,
    title: value.title,
    shortDescription: value.shortDescription,
    description: value.description,
    organizerName: value.organizerName,
    organizerLogoUrl: value.organizerLogoUrl,

    category:
      value.category as PublicEventProjection['category'],

    mode:
      value.mode as PublicEventProjection['mode'],

    status: value.status,
    registrationType: value.registrationType,

    registrationAccess:
      value.registrationAccess ?? 'public',

    registrationStatus,

    bannerUrl: value.bannerUrl,
    timezone: value.timezone,
    startsAtMs: value.startsAtMs,
    endsAtMs: value.endsAtMs,

    registrationOpensAtMs: opensAt,
    registrationClosesAtMs: closesAt,

    venue,
    allowGuestRegistration:
      value.allowGuestRegistration,

    maxTicketsPerOrder:
      value.maxTicketsPerOrder,

    terms: value.terms,
    refundPolicy: value.refundPolicy,

    termsHash: createHash('sha256')
      .update(value.terms, 'utf8')
      .digest('hex'),

    refundPolicyHash: createHash('sha256')
      .update(value.refundPolicy, 'utf8')
      .digest('hex'),
  };
}

function toSummary(
  event: PublicEventDetails
): PublicEventSummary {
  return {
    eventId: event.eventId,
    slug: event.slug,
    title: event.title,
    shortDescription: event.shortDescription,
    organizerName: event.organizerName,
    category: event.category,
    mode: event.mode,
    status: event.status,
    registrationType: event.registrationType,

    registrationAccess:
      event.registrationAccess ?? 'public',

    registrationStatus: event.registrationStatus,
    bannerUrl: event.bannerUrl,
    timezone: event.timezone,
    startsAtMs: event.startsAtMs,
    endsAtMs: event.endsAtMs,
    venue: event.venue,
  };
}

function readPublicTicket(
  event: PublicEventDetails,
  documentId: string,
  value: unknown
): PublicEventTicket | null {
  if (
    !isObject(value) ||
    value.schemaVersion !==
      PUBLIC_EVENT_SCHEMA_VERSION ||
    value.eventId !== event.eventId ||
    typeof value.ticketTypeId !== 'string' ||
    !isValidEventDocumentId(value.ticketTypeId) ||
    documentId !== value.ticketTypeId ||
    /^__.*__$/.test(documentId) ||
    !isText(value.name, 120, true) ||
    !isText(value.description, 3000) ||
    !Array.isArray(value.benefits) ||
    value.benefits.length > 100 ||
    !value.benefits.every(
      item => isText(item, 1000, true)
    ) ||
    (
      value.attendanceMode !== 'online' &&
      value.attendanceMode !== 'offline'
    ) ||
    (
      value.pricingType !== 'free' &&
      value.pricingType !== 'paid'
    ) ||
    !isObject(value.price) ||
    typeof value.price.usdAmountMinor !== 'number' ||
    typeof value.price.bdtAmountMinor !== 'number' ||
    !Number.isSafeInteger(value.price.usdAmountMinor) ||
    !Number.isSafeInteger(value.price.bdtAmountMinor) ||
    !isOptionalTimestamp(value.salesStartAtMs) ||
    !isOptionalTimestamp(value.salesEndAtMs) ||
    typeof value.maxPerOrder !== 'number' ||
    !Number.isSafeInteger(value.maxPerOrder) ||
    value.maxPerOrder < 1 ||
    value.maxPerOrder > event.maxTicketsPerOrder ||
    typeof value.sortOrder !== 'number' ||
    !Number.isSafeInteger(value.sortOrder) ||
    value.sortOrder < 0 ||
    value.sortOrder > 100000 ||
    (
      value.availability !== 'available' &&
      value.availability !== 'sold_out' &&
      value.availability !== 'not_open' &&
      value.availability !== 'closed'
    )
  ) {
    return null;
  }

  const usd = value.price.usdAmountMinor;
  const bdt = value.price.bdtAmountMinor;

  if (
    (
      value.pricingType === 'free' &&
      (usd !== 0 || bdt !== 0)
    ) ||
    (
      value.pricingType === 'paid' &&
      (usd <= 0 || bdt <= 0)
    ) ||
    (
      event.registrationType !== 'mixed' &&
      event.registrationType !== value.pricingType
    ) ||
    (
      event.mode !== 'hybrid' &&
      event.mode !== value.attendanceMode
    )
  ) {
    return null;
  }

  const salesStartAtMs =
    value.salesStartAtMs;

  const salesEndAtMs =
    value.salesEndAtMs;

  if (
    (salesStartAtMs !== null &&
      salesStartAtMs >= event.endsAtMs) ||
    (salesEndAtMs !== null &&
      salesEndAtMs > event.endsAtMs) ||
    (salesStartAtMs !== null &&
      salesEndAtMs !== null &&
      salesStartAtMs >= salesEndAtMs)
  ) {
    return null;
  }

  const now = Date.now();

  let availability:
    PublicEventTicketProjection['availability'] =
      value.availability;

  if (
    event.registrationStatus === 'closed' ||
    event.registrationStatus === 'paused' ||
    (
      salesEndAtMs !== null &&
      now >= salesEndAtMs
    )
  ) {
    availability = 'closed';
  } else if (
    event.registrationStatus !== 'open' ||
    (
      salesStartAtMs !== null &&
      now < salesStartAtMs
    )
  ) {
    if (availability !== 'closed') {
      availability = 'not_open';
    }
  }

  return {
    eventId: event.eventId,
    ticketTypeId: value.ticketTypeId,
    name: value.name,
    description: value.description,
    benefits: value.benefits,
    attendanceMode: value.attendanceMode,
    pricingType: value.pricingType,

    price: {
      usdAmountMinor: usd,
      bdtAmountMinor: bdt,
    },

    salesStartAtMs,
    salesEndAtMs,
    maxPerOrder: value.maxPerOrder,
    sortOrder: value.sortOrder,
    availability,
  };
}

/**
 * Upcoming and ongoing public events.
 * Single-field query avoids composite indexes.
 */
export async function listPublicEvents():
  Promise<PublicEventSummary[]> {
  const { adminDb } = getFirebaseAdmin();

  const snapshot = await adminDb
    .collection(EVENT_COLLECTIONS.publicEvents)
    .where('endsAtMs', '>', Date.now())
    .orderBy('endsAtMs', 'asc')
    .limit(MAX_PUBLIC_EVENTS)
    .get();

  const events: PublicEventSummary[] = [];

  for (const doc of snapshot.docs) {
    const event = readPublicEvent(
      doc.id,
      doc.data()
    );

    if (
      event &&
      event.status !== 'completed' &&
      event.endsAtMs > Date.now()
    ) {
      events.push(toSummary(event));
    }
  }

  return events.sort(
    (a, b) =>
      a.startsAtMs - b.startsAtMs ||
      a.slug.localeCompare(b.slug)
  );
}

/**
 * Resolve public event by its public slug.
 * Event and tickets use one read-only snapshot.
 */
export async function getPublicEventBySlug(
  slug: string
): Promise<PublicEventDetailsResult | null> {
  if (!isValidEventSlug(slug)) {
    return null;
  }

  const { adminDb } = getFirebaseAdmin();

  return adminDb.runTransaction(async tx => {
    const eventQuery = adminDb
      .collection(EVENT_COLLECTIONS.publicEvents)
      .where('slug', '==', slug)
      .limit(2);

    const snapshot = await tx.get(eventQuery);

    if (snapshot.size !== 1) {
      return null;
    }

    const document = snapshot.docs[0];

    const event = readPublicEvent(
      document.id,
      document.data()
    );

    if (!event || event.slug !== slug) {
      return null;
    }

    const ticketQuery = adminDb
      .collection(EVENT_COLLECTIONS.publicTicketTypes)
      .where('eventId', '==', event.eventId)
      .limit(MAX_EVENT_TICKETS + 1);

    const ticketSnapshot =
      await tx.get(ticketQuery);

    if (
      ticketSnapshot.size >
      MAX_EVENT_TICKETS
    ) {
      throw new Error(
        'INVALID_PUBLIC_TICKET_CONFIGURATION'
      );
    }

    const tickets: PublicEventTicket[] = [];
    const seen = new Set<string>();

    for (const doc of ticketSnapshot.docs) {
      const ticket = readPublicTicket(
        event,
        doc.id,
        doc.data()
      );

      if (
        !ticket ||
        seen.has(ticket.ticketTypeId)
      ) {
        throw new Error(
          'INVALID_PUBLIC_TICKET_CONFIGURATION'
        );
      }

      seen.add(ticket.ticketTypeId);
      tickets.push(ticket);
    }

    tickets.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name)
    );

    return {
      event,
      tickets,
    };
  }, {
    readOnly: true,
  });
}
