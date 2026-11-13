import type { User } from 'firebase/auth';

import type {
  AccountPortal,
  AccountProfilePresence,
  AccountStatus,
} from '@/lib/account-identity';

import type {
  PortalAccessDecision,
  StartupProfessionalRole,
} from '@/lib/account-authorization';

import type {
  EventOrganizerVerificationStatus,
} from '@/lib/event-organizer-profile';

export interface AccountAccessResponse {
  uid: string;
  status: AccountStatus | 'unprovisioned';
  emailVerified: boolean;
  profiles: AccountProfilePresence;
  startupRoles: StartupProfessionalRole[];
  isAdmin: boolean;
  eventOrganizerVerificationStatus:
    EventOrganizerVerificationStatus | null;
  portals: Record<AccountPortal, PortalAccessDecision>;
}

export async function fetchAccountAccess(
  user: User,
  signal?: AbortSignal
): Promise<AccountAccessResponse> {
  const idToken = await user.getIdToken();

  const response = await fetch('/api/account/access', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: 'no-store',
    signal,
  });

  if (response.status === 401) {
    throw new Error('UNAUTHENTICATED');
  }

  if (!response.ok) {
    throw new Error('ACCOUNT_ACCESS_UNAVAILABLE');
  }

  const account =
    await response.json() as AccountAccessResponse;

  if (
    account.uid !== user.uid ||
    typeof account.isAdmin !== 'boolean' ||
    (account.status === 'suspended' && account.isAdmin) ||
    ![
      'active',
      'suspended',
      'unprovisioned',
    ].includes(account.status) ||
    typeof account.portals?.startup?.allowed !== 'boolean' ||
    typeof account.portals?.event_organizer?.allowed !== 'boolean'
  ) {
    throw new Error('INVALID_ACCOUNT_ACCESS_RESPONSE');
  }

  if (
    account.status !== 'active' &&
    (
      account.portals.startup.allowed ||
      account.portals.event_organizer.allowed
    )
  ) {
    throw new Error('INVALID_ACCOUNT_ACCESS_RESPONSE');
  }

  return account;
}
