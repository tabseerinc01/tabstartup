/**
 * Universal TabStartup Event Invitations.
 *
 * Release A: platform-managed complimentary invitations.
 * Future: verified organizer invitations.
 */

import type {
  Timestamp,
} from 'firebase-admin/firestore';

import type {
  EventOwnership,
  EventAttendanceMode,
} from '@/lib/event-types';

export const EVENT_INVITATION_SCHEMA_VERSION =
  1 as const;

export const EVENT_INVITATION_CATEGORIES = [
  'vip',
  'speaker',
  'investor',
  'mentor',
  'special_guest',
  'media',
  'sponsor',
  'general',
  'other',
] as const;

export type EventInvitationCategory =
  typeof EVENT_INVITATION_CATEGORIES[number];

export type EventInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'revoked'
  | 'expired';

export interface EventInvitationBase {
  invitationId: string;

  eventId: string;

  ticketTypeId: string;

  attendanceMode: EventAttendanceMode;

  category: EventInvitationCategory;

  guestName: string;

  guestEmail: string;

  /**
   * Release A supports complimentary invitations.
   */
  pricingType: 'complimentary';

  status: EventInvitationStatus;

  /**
   * Store only a cryptographic hash.
   * Never persist the raw invitation token.
   */
  tokenHash: string;

  tokenVersion: number;

  expiresAt: Timestamp;

  createdByUid: string;

  acceptedByUid: string | null;

  acceptedAt: Timestamp | null;

  orderId: string | null;

  registrationId: string | null;

  ticketId: string | null;

  revokedByUid: string | null;

  revokedAt: Timestamp | null;

  revocationReason: string | null;

  schemaVersion:
    typeof EVENT_INVITATION_SCHEMA_VERSION;

  createdAt: Timestamp;

  updatedAt: Timestamp;
}

export type EventInvitation =
  EventInvitationBase & EventOwnership;

/**
 * Admin projection excludes token hashes.
 */
export type AdminInvitationEmailStatus =
  | 'not_queued'
  | 'pending'
  | 'processing'
  | 'retry_pending'
  | 'accepted'
  | 'failed'
  | 'skipped'
  | 'requires_review';

export interface AdminEventInvitation {
  emailDeliveryStatus?: AdminInvitationEmailStatus;

  emailAcceptedAtMs?: number | null;

  invitationId: string;

  eventId: string;

  ticketTypeId: string;

  attendanceMode: EventAttendanceMode;

  category: EventInvitationCategory;

  guestName: string;

  guestEmail: string;

  pricingType: 'complimentary';

  status: EventInvitationStatus;

  expiresAtMs: number;

  createdAtMs: number;

  acceptedAtMs: number | null;

  revokedAtMs: number | null;

  orderId: string | null;

  registrationId: string | null;

  ticketId: string | null;
}
