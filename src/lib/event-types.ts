/**
 * TabStartup Shared Event Management Architecture.
 *
 * Release A: TabStartup official events.
 * Future: Verified Event Organizer events.
 *
 * Supports free and paid ticketing,
 * USD via TabEdge and BDT via bKash.
 */

import type { Timestamp } from 'firebase-admin/firestore';

import type {
  ActivePaymentMethod,
  DualCurrencyPrice,
  PaymentOrderStatus,
} from '@/lib/payment-types';

export const EVENT_SCHEMA_VERSION = 1 as const;

export const PLATFORM_EVENT_ORGANIZER_ID =
  'tabstartup' as const;

/**
 * Event-specific business collections.
 *
 * Financial records use PAYMENT_COLLECTIONS
 * from the shared payment architecture.
 *
 * Public collections contain allowlisted
 * projections only, never canonical records.
 */
export const EVENT_COLLECTIONS = {
  events: 'events',
  publicEvents: 'publicEvents',
  publicTicketTypes: 'publicEventTicketTypes',
  slugs: 'eventSlugs',
  privateDetails: 'eventPrivateDetails',
  ticketTypes: 'eventTicketTypes',
  inventory: 'eventTicketInventory',
  registrations: 'eventRegistrations',
  registrationRequests: 'eventRegistrationRequests',
  orders: 'eventOrders',
  reservations: 'eventReservations',
  tickets: 'eventTickets',
  checkIns: 'eventCheckIns',
  auditLogs: 'eventAuditLogs',
} as const;

export const EVENT_MODES = [
  'online',
  'offline',
  'hybrid',
] as const;

export type EventMode =
  typeof EVENT_MODES[number];

export type EventAttendanceMode =
  | 'online'
  | 'offline';

export const EVENT_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'published',
  'ongoing',
  'completed',
  'cancelled',
  'archived',
] as const;

export type EventStatus =
  typeof EVENT_STATUSES[number];

export type EventVisibility =
  | 'public'
  | 'private'
  | 'invite_only';

export type EventRegistrationType =
  | 'free'
  | 'paid'
  | 'mixed';

export type EventRegistrationStatus =
  | 'not_open'
  | 'open'
  | 'paused'
  | 'closed';

export type EventCategory =
  | 'startup_pitch'
  | 'networking'
  | 'workshop'
  | 'webinar'
  | 'demo_day'
  | 'conference'
  | 'summit'
  | 'competition'
  | 'mentorship'
  | 'other';

export type EventOwnership =
  | {
      organizerType: 'platform';
      organizerId: typeof PLATFORM_EVENT_ORGANIZER_ID;
    }
  | {
      organizerType: 'verified_organizer';
      organizerId: string;
    };

export interface EventVenue {
  name: string;
  address: string;
  city: string;
  countryCode: string;
  mapUrl: string | null;
}

export interface EventCapacity {
  online: number;
  offline: number;
}

export interface EventSpeaker {
  speakerId: string;
  fullName: string;
  designation: string;
  organization: string;
  bio: string;
  imageUrl: string | null;
  profileUid: string | null;
}

export interface EventSponsor {
  sponsorId: string;
  name: string;
  tier: string;
  logoUrl: string | null;
  websiteUrl: string | null;
}

export interface EventAgendaItem {
  agendaItemId: string;
  title: string;
  description: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  speakerIds: string[];
  attendanceMode: EventAttendanceMode | null;
}

export interface EventRecordBase {
  eventId: string;
  slug: string;

  title: string;
  shortDescription: string;
  description: string;

  organizerName: string;
  organizerLogoUrl: string | null;

  category: EventCategory;
  mode: EventMode;
  status: EventStatus;
  visibility: EventVisibility;

  registrationType: EventRegistrationType;
  registrationStatus: EventRegistrationStatus;

  bannerUrl: string | null;

  timezone: string;
  startsAt: Timestamp;
  endsAt: Timestamp;

  registrationOpensAt: Timestamp | null;
  registrationClosesAt: Timestamp | null;

  venue: EventVenue | null;
  capacity: EventCapacity;

  allowGuestRegistration: boolean;
  maxTicketsPerOrder: number;

  speakers: EventSpeaker[];
  sponsors: EventSponsor[];
  agenda: EventAgendaItem[];

  terms: string;
  refundPolicy: string;

  createdByUid: string;
  updatedByUid: string;

  approvedByUid: string | null;
  approvedAt: Timestamp | null;

  publishedByUid: string | null;
  publishedAt: Timestamp | null;

  cancelledAt: Timestamp | null;
  cancellationReason: string | null;

  schemaVersion: typeof EVENT_SCHEMA_VERSION;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type EventRecord =
  EventRecordBase & EventOwnership;

/**
 * Never include these fields in public event responses.
 */
export interface EventPrivateDetails {
  eventId: string;

  meetingProvider:
    | 'zoom'
    | 'google_meet'
    | 'microsoft_teams'
    | 'other'
    | null;

  meetingUrl: string | null;
  meetingId: string | null;
  meetingPasscode: string | null;

  privateParticipantInstructions: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type EventTicketTypeStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'closed'
  | 'archived';

export type EventTicketPricing =
  | {
      pricingType: 'free';
      price: {
        usdAmountMinor: 0;
        bdtAmountMinor: 0;
      };
    }
  | {
      pricingType: 'paid';
      price: DualCurrencyPrice;
    };

export interface EventTicketTypeBase {
  ticketTypeId: string;
  eventId: string;

  name: string;
  description: string;
  benefits: string[];

  attendanceMode: EventAttendanceMode;

  status: EventTicketTypeStatus;

  salesStartAt: Timestamp | null;
  salesEndAt: Timestamp | null;

  maxPerOrder: number;

  sortOrder: number;

  schemaVersion: typeof EVENT_SCHEMA_VERSION;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type EventTicketType =
  EventTicketTypeBase & EventTicketPricing;

/**
 * Inventory is server-managed.
 * Capacity changes and reservations must be transactional.
 */
export interface EventTicketInventory {
  eventId: string;
  ticketTypeId: string;

  capacity: number;
  reservedQuantity: number;
  issuedQuantity: number;

  updatedAt: Timestamp;
}

export interface EventParticipant {
  uid: string | null;

  fullName: string;
  email: string;
  phone: string | null;

  organization: string | null;
  designation: string | null;
}

export type EventRegistrationRecordStatus =
  | 'pending_payment'
  | 'pending_verification'
  | 'confirmed'
  | 'requires_review'
  | 'cancelled'
  | 'refunded';

export interface EventRegistration {
  registrationId: string;
  eventId: string;
  orderId: string;

  ticketTypeId: string;
  attendanceMode: EventAttendanceMode;

  participant: EventParticipant;

  status: EventRegistrationRecordStatus;

  confirmedAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventOrderItem {
  ticketTypeId: string;
  ticketName: string;

  attendanceMode: EventAttendanceMode;

  quantity: number;
  unitAmountMinor: number;
  totalAmountMinor: number;
}

export type EventOrderPayment =
  | {
      paymentRequired: false;
      currency: null;
      provider: null;
      verificationMode: null;
      totalAmountMinor: 0;
    }
  | ({
      paymentRequired: true;
      totalAmountMinor: number;
    } & ActivePaymentMethod);

export interface EventTermsAcceptance {
  acceptedAt: Timestamp;
  termsHash: string;
  refundPolicyHash: string;
}

export interface EventOrderBase {
  orderId: string;
  eventId: string;

  purchaserUid: string | null;
  purchaserEmail: string;

  /**
   * Required for newly persisted registration orders.
   * Optional in the shared base for foundation compatibility.
   */
  paymentOrderId?: string | null;

  /**
   * Private guest ownership proof.
   * Never expose in API responses.
   */
  guestSessionHash?: string | null;
  registrationRequestId?: string;
  termsAcceptance?: EventTermsAcceptance;

  items: EventOrderItem[];

  status: PaymentOrderStatus;

  reservationId: string;
  successfulPaymentId: string | null;

  expiresAt: Timestamp | null;

  paidAt: Timestamp | null;
  fulfilledAt: Timestamp | null;

  schemaVersion: typeof EVENT_SCHEMA_VERSION;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type EventOrder =
  EventOrderBase &
  EventOrderPayment &
  EventOwnership;

/**
 * New registration orders must persist their
 * financial linkage and accepted terms.
 */
export type PersistedEventOrder =
  EventOrder & {
    registrationRequestId: string;
    guestSessionHash: string | null;
    termsAcceptance: EventTermsAcceptance;
  } & (
    | {
        paymentRequired: false;
        paymentOrderId: null;
      }
    | {
        paymentRequired: true;
        paymentOrderId: string;
      }
  );

/**
 * Server-only request identity record.
 * Never return this document directly to clients.
 */
export interface EventRegistrationRequest {
  requestId: string;

  eventId: string;
  orderId: string;

  purchaserUid: string | null;

  requestHash: string;

  registrationIds: string[];

  schemaVersion: typeof EVENT_SCHEMA_VERSION;

  createdAt: Timestamp;
}

export type EventReservationStatus =
  | 'active'
  | 'pending_verification'
  | 'consumed'
  | 'released'
  | 'expired'
  | 'requires_review';

export interface EventReservationItem {
  ticketTypeId: string;
  quantity: number;
}

export interface EventReservation {
  reservationId: string;
  eventId: string;
  orderId: string;

  items: EventReservationItem[];

  status: EventReservationStatus;

  expiresAt: Timestamp;

  /**
   * Separate deadline for submitted manual payments.
   * Original payment expiry remains unchanged.
   */
  reviewDeadlineAt?: Timestamp;

  consumedAt: Timestamp | null;
  releasedAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type EventIssuedTicketStatus =
  | 'issued'
  | 'checked_in'
  | 'cancelled'
  | 'refunded'
  | 'revoked';

export interface EventIssuedTicket {
  ticketId: string;
  ticketNumber: string;

  eventId: string;
  orderId: string;
  registrationId: string;
  ticketTypeId: string;

  attendeeUid: string | null;

  attendanceMode: EventAttendanceMode;

  status: EventIssuedTicketStatus;

  qrTokenHash: string;

  issuedAt: Timestamp;
  checkedInAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventCheckIn {
  checkInId: string;

  eventId: string;
  ticketId: string;
  registrationId: string;

  attendanceMode: EventAttendanceMode;

  checkedInByUid: string;

  method: 'qr' | 'manual';

  checkedInAt: Timestamp;
}

export type EventAuditAction =
  | 'event_created'
  | 'event_updated'
  | 'event_submitted'
  | 'event_approved'
  | 'event_rejected'
  | 'event_published'
  | 'event_registration_opened'
  | 'event_registration_paused'
  | 'event_registration_resumed'
  | 'event_registration_closed'
  | 'event_unpublished'
  | 'event_cancelled'
  | 'event_archived'
  | 'ticket_type_created'
  | 'ticket_type_updated'
  | 'inventory_reserved'
  | 'inventory_released'
  | 'registration_created'
  | 'registration_confirmed'
  | 'payment_submitted'
  | 'payment_verified'
  | 'payment_rejected'
  | 'ticket_issued'
  | 'ticket_revoked'
  | 'ticket_checked_in'
  | 'refund_requested'
  | 'refund_completed';

export interface EventAuditLog {
  auditId: string;
  eventId: string;

  action: EventAuditAction;

  actorType:
    | 'admin'
    | 'event_organizer'
    | 'participant'
    | 'system';

  actorUid: string | null;

  resourceType: string;
  resourceId: string;

  reason: string | null;

  createdAt: Timestamp;
}
