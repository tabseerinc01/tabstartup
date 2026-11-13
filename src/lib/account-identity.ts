/**
 * TabStartup Global Account Identity.
 *
 * One Firebase Authentication UID may own independent
 * Startup and Event Organizer profiles.
 *
 * Global identity does not grant professional roles
 * or Event Organizer permissions.
 */

import type { Timestamp } from 'firebase-admin/firestore';

export const ACCOUNT_IDENTITIES_COLLECTION =
  'accountIdentities' as const;

export const ACCOUNT_IDENTITY_SCHEMA_VERSION = 1 as const;

export type AccountStatus =
  | 'active'
  | 'suspended';

export interface AccountIdentity {
  uid: string;
  email: string;
  status: AccountStatus;
  schemaVersion: typeof ACCOUNT_IDENTITY_SCHEMA_VERSION;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AccountPortal =
  | 'startup'
  | 'event_organizer';

export interface AccountProfilePresence {
  hasStartupProfile: boolean;
  hasEventOrganizerProfile: boolean;
}

export type AccountIdentitySource =
  | 'global_identity'
  | 'legacy_startup'
  | 'unprovisioned';

export interface ResolvedAccountIdentity {
  uid: string;
  status: AccountStatus | 'unprovisioned';
  source: AccountIdentitySource;
  profiles: AccountProfilePresence;
}
