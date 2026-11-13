import type {
  AccountPortal,
  ResolvedAccountIdentity,
} from '@/lib/account-identity';

import type {
  EventOrganizerVerificationStatus,
} from '@/lib/event-organizer-profile';

export const STARTUP_PROFESSIONAL_ROLES = [
  'founder',
  'investor',
  'mentor',
] as const;

export type StartupProfessionalRole =
  typeof STARTUP_PROFESSIONAL_ROLES[number];

export type AccountAccessDenialReason =
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_UNPROVISIONED'
  | 'STARTUP_PROFILE_REQUIRED'
  | 'INVALID_STARTUP_PROFILE'
  | 'EVENT_ORGANIZER_PROFILE_REQUIRED'
  | 'EVENT_ORGANIZER_PROFILE_SUSPENDED'
  | 'INVALID_EVENT_ORGANIZER_PROFILE';

export interface PortalAccessDecision {
  allowed: boolean;
  reason: AccountAccessDenialReason | null;
}

export interface AccountAuthorization {
  uid: string;
  identity: ResolvedAccountIdentity;
  startupRoles: StartupProfessionalRole[];
  isAdmin: boolean;
  eventOrganizerVerificationStatus:
    EventOrganizerVerificationStatus | null;
  portals: Record<AccountPortal, PortalAccessDecision>;
}

export interface AuthenticatedAccountAuthorization
  extends AccountAuthorization {
  emailVerified: boolean;
}
