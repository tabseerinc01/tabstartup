import type { Timestamp } from 'firebase-admin/firestore';

export const EVENT_ORGANIZER_PROFILES_COLLECTION =
  'eventOrganizerProfiles' as const;

export const EVENT_ORGANIZER_PROFILE_SCHEMA_VERSION =
  1 as const;

export type EventOrganizerType =
  | 'individual'
  | 'organization';

export type EventOrganizerProfileStatus =
  | 'active'
  | 'suspended';

export type EventOrganizerVerificationStatus =
  | 'not_started'
  | 'pending'
  | 'approved'
  | 'rejected';

export interface EventOrganizerProfile {
  uid: string;
  displayName: string;
  organizerType: EventOrganizerType;
  status: EventOrganizerProfileStatus;
  verificationStatus: EventOrganizerVerificationStatus;
  schemaVersion:
    typeof EVENT_ORGANIZER_PROFILE_SCHEMA_VERSION;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
