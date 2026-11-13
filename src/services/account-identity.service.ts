import 'server-only';

import {
  resolveLegacyStartupStatus,
} from '@/lib/legacy-startup-profile';

import { getFirebaseAdmin } from '@/firebase/admin';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
  ACCOUNT_IDENTITY_SCHEMA_VERSION,
  type ResolvedAccountIdentity,
} from '@/lib/account-identity';

export function assertValidAccountUid(uid: string): void {
  if (
    typeof uid !== 'string' ||
    !uid ||
    uid.length > 128 ||
    uid.includes('/') ||
    uid.trim() !== uid ||
    uid === '.' ||
    uid === '..'
  ) {
    throw new Error('INVALID_ACCOUNT_UID');
  }
}

/**
 * Read-only account identity resolution.
 *
 * Caller must authenticate the UID before invoking.
 * Profile presence does not grant portal authorization.
 * No account or profile is created by this resolver.
 */
export async function resolveAccountIdentity(
  uid: string
): Promise<ResolvedAccountIdentity> {
  assertValidAccountUid(uid);

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const startupRef = adminDb
    .collection('users')
    .doc(uid);

  const eventOrganizerRef = adminDb
    .collection('eventOrganizerProfiles')
    .doc(uid);

  const [
    identitySnap,
    startupSnap,
    eventOrganizerSnap,
  ] = await adminDb.getAll(
    identityRef,
    startupRef,
    eventOrganizerRef
  );

  const profiles = {
    hasStartupProfile: startupSnap.exists,
    hasEventOrganizerProfile: eventOrganizerSnap.exists,
  };

  if (identitySnap.exists) {
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

    return {
      uid,
      status:
        identity.status === 'suspended' ||
        startupSnap.data()?.status === 'suspended'
          ? 'suspended'
          : 'active',
      source: 'global_identity',
      profiles,
    };
  }

  if (startupSnap.exists) {
    const startup = startupSnap.data();

    const legacyStatus =
      resolveLegacyStartupStatus(uid, startup);

    if (legacyStatus === 'suspended') {
      return {
        uid,
        status: 'suspended',
        source: 'legacy_startup',
        profiles,
      };
    }

    if (legacyStatus === 'active') {
      return {
        uid,
        status: 'active',
        source: 'legacy_startup',
        profiles,
      };
    }
  }

  return {
    uid,
    status: 'unprovisioned',
    source: 'unprovisioned',
    profiles,
  };
}
