import 'server-only';

import {
  resolveLegacyStartupStatus,
} from '@/lib/legacy-startup-profile';

import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/firebase/admin';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
  ACCOUNT_IDENTITY_SCHEMA_VERSION,
  type AccountStatus,
} from '@/lib/account-identity';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

export interface AccountIdentityProvisioningResult {
  uid: string;
  status: AccountStatus;
  created: boolean;
}

/**
 * Provision a global identity for an existing Startup account.
 *
 * Caller must authenticate and authorize the UID.
 * This service does not provision arbitrary Auth-only users.
 * Existing identities are never overwritten.
 * Legacy suspension remains authoritative during migration.
 */
export async function provisionLegacyAccountIdentity(
  uid: string
): Promise<AccountIdentityProvisioningResult> {
  assertValidAccountUid(uid);

  const { adminAuth, adminDb } = getFirebaseAdmin();

  const authUser = await adminAuth.getUser(uid);

  if (authUser.disabled) {
    throw new Error('ACCOUNT_DISABLED');
  }

  if (!authUser.email) {
    throw new Error('ACCOUNT_EMAIL_REQUIRED');
  }

  const email = authUser.email.trim().toLowerCase();

  if (!email) {
    throw new Error('ACCOUNT_EMAIL_REQUIRED');
  }

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const startupRef = adminDb
    .collection('users')
    .doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap = await transaction.get(identityRef);
    const startupSnap = await transaction.get(startupRef);

    if (!startupSnap.exists) {
      throw new Error('STARTUP_PROFILE_REQUIRED');
    }

    const startup = startupSnap.data();

    if (
      !startup ||
      (
        startup.uid !== undefined &&
        startup.uid !== uid
      )
    ) {
      throw new Error('INVALID_STARTUP_PROFILE');
    }

    const legacyStatus =
      resolveLegacyStartupStatus(uid, startup);

    if (!legacyStatus) {
      throw new Error('INVALID_LEGACY_ACCOUNT_STATUS');
    }

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
          legacyStatus === 'suspended'
            ? 'suspended'
            : 'active',
        created: false,
      };
    }

    // Do not migrate a suspended legacy account into
    // a persistent global suspension during transition.
    if (legacyStatus === 'suspended') {
      throw new Error('LEGACY_ACCOUNT_SUSPENDED');
    }

    transaction.create(identityRef, {
      uid,
      email,
      status: legacyStatus,
      schemaVersion: ACCOUNT_IDENTITY_SCHEMA_VERSION,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      uid,
      status: legacyStatus,
      created: true,
    };
  });
}
