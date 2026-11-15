import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import {
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventRecord,
  type EventCategory,
  type EventVisibility,
  type EventRegistrationType,
  type EventPrivateDetails,
} from '@/lib/event-types';

import {
  EVENT_LIMITS,
  isValidEventDocumentId,
  isValidEventMode,
  isValidEventSlug,
  isValidEventTitle,
  isValidEventTimezone,
  isValidEventDateRange,
  isValidEventCapacity,
  isVenueAllowedForEventMode,
  isValidHttpsUrl,
  isValidEventRegistrationWindow,
} from '@/lib/event-validation';

export class EventInputError extends Error {
  constructor(public readonly field: string) {
    super(`Invalid event field: ${field}`);
    this.name = 'EventInputError';
  }
}

function requireField(
  condition: unknown,
  field: string
): asserts condition {
  if (!condition) {
    throw new EventInputError(field);
  }
}

function asObject(
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
  requireField(typeof value === 'string', field);

  const result = value.trim();

  requireField(
    result.length <= max &&
      (!required || result.length > 0),
    field
  );

  return result;
}

function nullableText(
  value: unknown,
  field: string,
  max: number
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return text(value, field, max) || null;
}

function nullableUrl(
  value: unknown,
  field: string
): string | null {
  const result = nullableText(value, field, 2048);

  requireField(
    result === null || isValidHttpsUrl(result),
    field
  );

  return result;
}

function timestampMs(
  value: unknown,
  field: string
): number {
  requireField(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= 253402300799999,
    field
  );

  return value;
}

function optionalTimestampMs(
  value: unknown,
  field: string
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return timestampMs(value, field);
}

const categories: readonly EventCategory[] = [
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

const visibilities: readonly EventVisibility[] = [
  'public',
  'private',
  'invite_only',
];

const registrationTypes:
  readonly EventRegistrationType[] = [
    'free',
    'paid',
    'mixed',
  ];

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  field: string
): T {
  requireField(
    typeof value === 'string' &&
      values.includes(value as T),
    field
  );

  return value as T;
}

export interface ValidatedEventDraft {
  event: EventRecord;
  privateDetails: EventPrivateDetails;
}

export function buildEventDraft(
  input: unknown,
  eventId: string,
  adminUid: string,
  nowMs: number
): ValidatedEventDraft {
  requireField(
    isValidEventDocumentId(eventId),
    'eventId'
  );

  requireField(
    isValidEventDocumentId(adminUid),
    'adminUid'
  );

  const data = asObject(input, 'event');

  const title = text(
    data.title,
    'title',
    EVENT_LIMITS.titleMaxLength,
    true
  );

  requireField(
    isValidEventTitle(title),
    'title'
  );

  const slug = text(
    data.slug,
    'slug',
    120,
    true
  );

  requireField(
    isValidEventSlug(slug),
    'slug'
  );

  const mode = data.mode;

  requireField(
    isValidEventMode(mode),
    'mode'
  );

  const timezone = text(
    data.timezone,
    'timezone',
    100,
    true
  );

  requireField(
    isValidEventTimezone(timezone),
    'timezone'
  );

  const startsAtMs = timestampMs(
    data.startsAtMs,
    'startsAtMs'
  );

  const endsAtMs = timestampMs(
    data.endsAtMs,
    'endsAtMs'
  );

  requireField(
    isValidEventDateRange(
      startsAtMs,
      endsAtMs
    ),
    'eventDateRange'
  );

  requireField(
    endsAtMs > nowMs,
    'endsAtMs'
  );

  const registrationOpensAtMs =
    optionalTimestampMs(
      data.registrationOpensAtMs,
      'registrationOpensAtMs'
    );

  const registrationClosesAtMs =
    optionalTimestampMs(
      data.registrationClosesAtMs,
      'registrationClosesAtMs'
    );

  requireField(
    isValidEventRegistrationWindow(
      registrationOpensAtMs,
      registrationClosesAtMs,
      endsAtMs
    ),
    'registrationWindow'
  );

  const capacityInput = asObject(
    data.capacity,
    'capacity'
  );

  const capacity = {
    online: capacityInput.online,
    offline: capacityInput.offline,
  };

  requireField(
    isValidEventCapacity(mode, capacity),
    'capacity'
  );

  let venue = null;

  if (mode !== 'online') {
    const raw = asObject(data.venue, 'venue');

    venue = {
      name: text(raw.name, 'venue.name', 200, true),
      address: text(
        raw.address,
        'venue.address',
        1000,
        true
      ),
      city: text(raw.city, 'venue.city', 120, true),
      countryCode: text(
        raw.countryCode,
        'venue.countryCode',
        2,
        true
      ).toUpperCase(),
      mapUrl: nullableUrl(
        raw.mapUrl,
        'venue.mapUrl'
      ),
    };
  } else {
    requireField(
      data.venue === undefined ||
        data.venue === null,
      'venue'
    );
  }

  requireField(
    isVenueAllowedForEventMode(mode, venue),
    'venue'
  );

  const maxTicketsPerOrder =
    data.maxTicketsPerOrder;

  requireField(
    typeof maxTicketsPerOrder === 'number' &&
      Number.isSafeInteger(maxTicketsPerOrder) &&
      maxTicketsPerOrder >= 1 &&
      maxTicketsPerOrder <= 20,
    'maxTicketsPerOrder'
  );

  requireField(
    typeof data.allowGuestRegistration === 'boolean',
    'allowGuestRegistration'
  );

  const now = Timestamp.fromMillis(
    timestampMs(nowMs, 'nowMs')
  );

  const registrationAccess = enumValue(
    data.registrationAccess === undefined
      ? 'public'
      : data.registrationAccess,
    [
      'public',
      'invite_only',
      'public_and_invitation',
    ] as const,
    'registrationAccess'
  );

  const invitationInput = asObject(
    data.invitationSettings === undefined
      ? {}
      : data.invitationSettings,
    'invitationSettings'
  );

  // Never accept server-managed counters from clients.

  requireField(
    Object.keys(invitationInput).every(
      key =>
        key === 'enabled' ||
        key === 'allowComplimentary' ||
        key === 'maxAcceptedInvitations'
    ),
    'invitationSettings'
  );

  const invitationEnabled =
    invitationInput.enabled === undefined
      ? false
      : invitationInput.enabled;

  const allowComplimentary =
    invitationInput.allowComplimentary === undefined
      ? false
      : invitationInput.allowComplimentary;

  const maxAcceptedInvitations =
    invitationInput.maxAcceptedInvitations === undefined
      ? 0
      : invitationInput.maxAcceptedInvitations;

  requireField(
    typeof invitationEnabled === 'boolean',
    'invitationSettings.enabled'
  );

  requireField(
    typeof allowComplimentary === 'boolean',
    'invitationSettings.allowComplimentary'
  );

  const totalEventCapacity =
    (capacity.online as number) +
    (capacity.offline as number);

  requireField(
    typeof maxAcceptedInvitations === 'number' &&
      Number.isSafeInteger(maxAcceptedInvitations) &&
      maxAcceptedInvitations >= 0 &&
      maxAcceptedInvitations <= totalEventCapacity,
    'invitationSettings.maxAcceptedInvitations'
  );

  if (registrationAccess === 'public') {
    requireField(
      invitationEnabled === false &&
        allowComplimentary === false &&
        maxAcceptedInvitations === 0,
      'invitationSettings'
    );
  } else {
    requireField(
      invitationEnabled === true &&
        allowComplimentary === true &&
        maxAcceptedInvitations > 0,
      'invitationSettings'
    );

    requireField(
      data.registrationType === 'free' ||
        data.registrationType === 'mixed',
      'registrationType'
    );

    if (registrationAccess === 'invite_only') {
      requireField(
        data.registrationType === 'free',
        'registrationType'
      );
    }
  }

  const event: EventRecord = {
    eventId,
    slug,
    title,

    shortDescription: text(
      data.shortDescription,
      'shortDescription',
      500,
      true
    ),

    description: text(
      data.description,
      'description',
      30000,
      true
    ),

    organizerType: 'platform',
    organizerId: PLATFORM_EVENT_ORGANIZER_ID,
    organizerName: 'TabStartup',
    organizerLogoUrl: null,

    category: enumValue(
      data.category,
      categories,
      'category'
    ),

    mode,
    status: 'draft',

    visibility: enumValue(
      data.visibility,
      visibilities,
      'visibility'
    ),

    registrationType: enumValue(
      data.registrationType,
      registrationTypes,
      'registrationType'
    ),

    registrationStatus: 'not_open',

    registrationAccess,

    invitationSettings: {
      enabled: invitationEnabled,
      allowComplimentary,
      maxAcceptedInvitations,

      // Draft events cannot have accepted invitations.
      acceptedInvitationCount: 0,
    },

    bannerUrl: nullableUrl(
      data.bannerUrl,
      'bannerUrl'
    ),

    timezone,

    startsAt: Timestamp.fromMillis(startsAtMs),
    endsAt: Timestamp.fromMillis(endsAtMs),

    registrationOpensAt:
      registrationOpensAtMs === null
        ? null
        : Timestamp.fromMillis(
            registrationOpensAtMs
          ),

    registrationClosesAt:
      registrationClosesAtMs === null
        ? null
        : Timestamp.fromMillis(
            registrationClosesAtMs
          ),

    venue,

    capacity: {
      online: capacity.online as number,
      offline: capacity.offline as number,
    },

    allowGuestRegistration:
      data.allowGuestRegistration,

    maxTicketsPerOrder,

    speakers: [],
    sponsors: [],
    agenda: [],

    terms: text(
      data.terms ?? '',
      'terms',
      30000
    ),

    refundPolicy: text(
      data.refundPolicy ?? '',
      'refundPolicy',
      30000
    ),

    createdByUid: adminUid,
    updatedByUid: adminUid,

    approvedByUid: null,
    approvedAt: null,

    publishedByUid: null,
    publishedAt: null,

    cancelledAt: null,
    cancellationReason: null,

    schemaVersion: EVENT_SCHEMA_VERSION,

    createdAt: now,
    updatedAt: now,
  };

  const privateInput = asObject(
    data.privateDetails ?? {},
    'privateDetails'
  );

  const provider = privateInput.meetingProvider;

  const meetingProvider =
    provider === undefined || provider === null
      ? null
      : enumValue(
          provider,
          [
            'zoom',
            'google_meet',
            'microsoft_teams',
            'other',
          ] as const,
          'meetingProvider'
        );

  const privateDetails: EventPrivateDetails = {
    eventId,

    meetingProvider,

    meetingUrl: nullableUrl(
      privateInput.meetingUrl,
      'meetingUrl'
    ),

    meetingId: nullableText(
      privateInput.meetingId,
      'meetingId',
      300
    ),

    meetingPasscode: nullableText(
      privateInput.meetingPasscode,
      'meetingPasscode',
      300
    ),

    privateParticipantInstructions: text(
      privateInput.privateParticipantInstructions
        ?? '',
      'privateParticipantInstructions',
      10000
    ),

    createdAt: now,
    updatedAt: now,
  };

  if (mode === 'offline') {
    requireField(
      privateDetails.meetingProvider === null &&
        privateDetails.meetingUrl === null &&
        privateDetails.meetingId === null &&
        privateDetails.meetingPasscode === null,
      'offlineMeetingDetails'
    );
  }

  return {
    event,
    privateDetails,
  };
}
