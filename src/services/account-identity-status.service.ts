import 'server-only';

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

    if (previousStatus === status) {
      return {
        uid,
        previousStatus,
        status,
        effectiveStatus,
        changed: false,
      };
    }

    transaction.update(identityRef, {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      uid,
      previousStatus,
      status,
      effectiveStatus,
      changed: true,
    };
  });
}
