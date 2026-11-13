import 'server-only';

import type {
  DocumentSnapshot,
} from 'firebase-admin/firestore';

import {
  ACCOUNT_IDENTITY_SCHEMA_VERSION,
} from '@/lib/account-identity';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

/**
 * Validate a global identity snapshot.
 *
 * Missing global identity is permitted for
 * backward-compatible legacy Startup accounts.
 *
 * Existing malformed identities fail closed.
 */
export function assertGlobalAccountNotSuspended(
  uid: string,
  identitySnap: DocumentSnapshot
): void {
  assertValidAccountUid(uid);

  if (identitySnap.id !== uid) {
    throw new Error('INVALID_ACCOUNT_IDENTITY');
  }

  if (!identitySnap.exists) {
    return;
  }

  const identity = identitySnap.data();

  if (
    !identity ||
    identity.uid !== uid ||
    identity.schemaVersion !==
      ACCOUNT_IDENTITY_SCHEMA_VERSION ||
    (
      identity.status !== 'active' &&
      identity.status !== 'suspended'
    )
  ) {
    throw new Error('INVALID_ACCOUNT_IDENTITY');
  }

  if (identity.status === 'suspended') {
    throw new Error('USER_SUSPENDED');
  }
}


/**
 * Eligibility check for visibility and referrals.
 *
 * Legacy accounts without a global identity remain
 * eligible. Suspended or malformed identities do not.
 */
export function isGlobalAccountEligible(
  uid: string,
  identitySnap: DocumentSnapshot
): boolean {
  try {
    assertGlobalAccountNotSuspended(
      uid,
      identitySnap
    );

    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'USER_SUSPENDED',
        'INVALID_ACCOUNT_IDENTITY',
        'INVALID_ACCOUNT_UID',
      ].includes(error.message)
    ) {
      return false;
    }

    throw error;
  }
}
