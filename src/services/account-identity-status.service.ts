import 'server-only';

import {
  resolveLegacyStartupStatus,
} from '@/lib/legacy-startup-profile';

import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/firebase/admin';
import { buildPublicProfile } from '@/lib/public-profile';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
  ACCOUNT_IDENTITY_SCHEMA_VERSION,
  type AccountStatus,
} from '@/lib/account-identity';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

export interface AccountStatusUpdateResult {
  uid: string;
  previousStatus: AccountStatus;
  status: AccountStatus;
  effectiveStatus: AccountStatus;
  changed: boolean;
}

/**
 * Internal global identity status operation.
 *
 * Caller must enforce administrative authorization.
 *
 * This is a foundation service, not a complete
 * account suspension workflow.
 *
 * Do not expose through an API until portal access,
 * public profile visibility and administrative
 * authorization enforcement are implemented.
 */
export async function setGlobalAccountStatus(
  uid: string,
  status: AccountStatus
): Promise<AccountStatusUpdateResult> {
  assertValidAccountUid(uid);

  if (status !== 'active' && status !== 'suspended') {
    throw new Error('INVALID_ACCOUNT_STATUS');
  }

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const startupRef = adminDb
    .collection('users')
    .doc(uid);

  const publicRef = adminDb
    .collection('publicProfiles')
    .doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap = await transaction.get(identityRef);
    const startupSnap = await transaction.get(startupRef);

    if (!identitySnap.exists) {
      throw new Error('ACCOUNT_IDENTITY_NOT_FOUND');
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

    const previousStatus: AccountStatus = identity.status;

    const effectiveStatus: AccountStatus =
      status === 'suspended' ||
      startupSnap.data()?.status === 'suspended'
        ? 'suspended'
        : 'active';

    const changed = previousStatus !== status;

    if (changed) {
      transaction.update(identityRef, {
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const startup = startupSnap.data();

    // Reconcile visibility even when the requested
    // global status is already set.
    if (
      effectiveStatus === 'suspended' ||
      !startupSnap.exists ||
      !startup ||
      resolveLegacyStartupStatus(
        uid,
        startup
      ) !== 'active'
    ) {
      transaction.delete(publicRef);
    } else {
      const projection = buildPublicProfile(
        uid,
        startup
      );

      if (
        Array.isArray(projection.roles) &&
        projection.roles.length > 0
      ) {
        transaction.set(publicRef, {
          ...projection,
          createdAt: startup.createdAt ?? null,
          isVerified: startup.isVerified === true,
        });
      } else {
        transaction.delete(publicRef);
      }
    }

    return {
      uid,
      previousStatus,
      status,
      effectiveStatus,
      changed,
    };
  });
}
