import 'server-only';

import {
  revokeTransactionalEmailVerification,
} from '@/services/email/email-verification-revocation.service';

import {
  resolveLegacyStartupStatus,
} from '@/lib/legacy-startup-profile';

import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/firebase/admin';
import {
  readProfessionalPublicationSnapshots,
  prepareProfessionalPublicationRemoval,
  applyProfessionalPublicationSync,
} from '@/services/professional-profile-publishing.service';

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

    const publications =
      await readProfessionalPublicationSnapshots(
        transaction,
        adminDb,
        uid
      );

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

    const startup = startupSnap.data();

    const removePublications =
      effectiveStatus === 'suspended' ||
      previousStatus === 'suspended' ||
      !startupSnap.exists ||
      !startup ||
      resolveLegacyStartupStatus(
        uid,
        startup
      ) !== 'active';

    const actions = removePublications
      ? prepareProfessionalPublicationRemoval(
          publications,
          uid
        )
      : [];

    // Global suspension invalidates custom email
    // authority and outstanding OTP challenges.
    //
    // Reactivation also invalidates stale authority
    // inherited from a previously suspended account.
    //
    // Startup-only suspension does not independently
    // trigger global email authority revocation.

    const revokeGlobalVerification =
      status === 'suspended' ||
      previousStatus === 'suspended';

    if (revokeGlobalVerification) {
      if (!removePublications) {
        throw new Error(
          'GLOBAL_REVOCATION_REQUIRES_PUBLICATION_REMOVAL'
        );
      }

      await revokeTransactionalEmailVerification({
        transaction,
        db: adminDb,
        uid,
        publicationPolicy: 'caller_removes',
      });
    }

    // No additional transaction reads below.

    if (changed) {
      transaction.update(identityRef, {
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (removePublications) {
      transaction.delete(publicRef);

      applyProfessionalPublicationSync(
        transaction,
        actions
      );
    }

    // Global reactivation never republishes a role.
    // Event organizer profile ownership is unchanged.

    return {
      uid,
      previousStatus,
      status,
      effectiveStatus,
      changed,
    };
  });
}
