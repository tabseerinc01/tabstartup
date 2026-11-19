import 'server-only';

import {
  readTransactionalEmailVerification,
} from '@/services/email/email-verification-transaction.service';

import {
  resolveLegacyStartupStatus,
} from '@/lib/legacy-startup-profile';

import { getFirebaseAdmin } from '@/firebase/admin';
import type { UserRecord } from 'firebase-admin/auth';
import {
  readProfessionalPublicationSnapshots,
  prepareVerifiedProfessionalPublicationSync,
  prepareProfessionalPublicationRemoval,
  applyProfessionalPublicationSync,
} from '@/services/professional-profile-publishing.service';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  isGlobalAccountEligible,
} from '@/services/account-suspension-guard.service';

async function readPublicationAuthState(
  uid: string
): Promise<{
  authActive: boolean;
  authUser: UserRecord | null;
}> {
  const { adminAuth } = getFirebaseAdmin();

  try {
    const authUser = await adminAuth.getUser(uid);

    return {
      authActive:
        authUser.uid === uid && !authUser.disabled,
      authUser,
    };
  } catch (error: unknown) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? error.code
        : undefined;

    if (code === 'auth/user-not-found') {
      return {
        authActive: false,
        authUser: null,
      };
    }

    // Infrastructure failures are not equivalent
    // to a confirmed missing authentication account.
    throw error;
  }
}

export async function syncPublicProfile(uid: string) {
  if (!uid || uid.includes('/')) {
    throw new Error('Invalid user UID');
  }

  const { adminDb } = getFirebaseAdmin();

  const {
    authActive,
    authUser,
  } = await readPublicationAuthState(uid);

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb.collection('users').doc(uid);
  const publicRef = adminDb.collection('publicProfiles').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap =
      await transaction.get(identityRef);

    const userSnap =
      await transaction.get(userRef);

    const publications =
      await readProfessionalPublicationSnapshots(
        transaction,
        adminDb,
        uid
      );

    const data = userSnap.data();

    const accountActive =
      authActive &&
      userSnap.exists &&
      resolveLegacyStartupStatus(uid, data) === 'active' &&
      isGlobalAccountEligible(uid, identitySnap);

    const { emailVerified } =
      await readTransactionalEmailVerification({
        transaction,
        db: adminDb,
        uid,
        authUser,
        accountActive: accountActive,
      });

    const actions =
      await prepareVerifiedProfessionalPublicationSync(
        data,
        publications,
        {
          uid,
          emailVerified,
          accountActive,
        }
      );

    if (!accountActive) {
      transaction.delete(publicRef);
    }

    // Compatibility endpoint: synchronize existing
    // professional publications only.
    // Never create or refresh a legacy public document.

    applyProfessionalPublicationSync(
      transaction,
      actions
    );

    return accountActive
      ? { status: 'synced' as const }
      : { status: 'removed' as const };
  });
}


/**
 * Internal server operation.
 * Caller must verify administrative authorization.
 */
export async function setUserSuspension(
  uid: string,
  suspended: boolean
) {
  if (!uid || uid.includes('/') ||
      typeof suspended !== 'boolean') {
    throw new Error('Invalid suspension request');
  }

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb.collection('users').doc(uid);
  const publicRef = adminDb.collection('publicProfiles').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap =
      await transaction.get(identityRef);

    const snapshot = await transaction.get(userRef);

    const publications =
      await readProfessionalPublicationSnapshots(
        transaction,
        adminDb,
        uid
      );

    if (!snapshot.exists) {
      throw new Error('USER_NOT_FOUND');
    }

    const data = snapshot.data()!;
    const status = suspended ? 'suspended' : 'active';

    const removePublications =
      suspended ||
      data.status === 'suspended' ||
      resolveLegacyStartupStatus(
        uid,
        { ...data, status }
      ) !== 'active' ||
      !isGlobalAccountEligible(uid, identitySnap);

    const actions = removePublications
      ? prepareProfessionalPublicationRemoval(
          publications,
          uid
        )
      : [];

    transaction.update(userRef, {
      status,
      updatedAt: new Date(),
    });

    if (removePublications) {
      transaction.delete(publicRef);

      applyProfessionalPublicationSync(
        transaction,
        actions
      );
    }

    // Reactivation never creates public profiles.

    return { status };
  });
}


export async function setUserProfessionalRole(
  uid: string,
  role: string,
  enabled: boolean
) {
  const allowedRoles = ['founder', 'investor', 'mentor'];

  if (
    !uid ||
    uid.includes('/') ||
    !allowedRoles.includes(role) ||
    typeof enabled !== 'boolean'
  ) {
    throw new Error('Invalid role request');
  }

  const { adminDb } = getFirebaseAdmin();

  const {
    authActive,
    authUser,
  } = await readPublicationAuthState(uid);

  if (enabled && !authActive) {
    throw new Error('ACCOUNT_NOT_ACTIVE');
  }

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb.collection('users').doc(uid);
  const publicRef = adminDb.collection('publicProfiles').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap =
      await transaction.get(identityRef);

    const snapshot = await transaction.get(userRef);

    const publications =
      await readProfessionalPublicationSnapshots(
        transaction,
        adminDb,
        uid
      );

    if (!snapshot.exists) {
      throw new Error('USER_NOT_FOUND');
    }

    const data = snapshot.data()!;

    const existingRoles: string[] = Array.isArray(data.roles)
      ? data.roles.filter(
          (value: unknown): value is string =>
            typeof value === 'string'
        )
      : typeof data.role === 'string'
        ? [data.role]
        : [];

    const roles = [...new Set(
      enabled
        ? [...existingRoles, role]
        : existingRoles.filter(value => value !== role)
    )];

    const professionalRoles = roles.filter(
      value => allowedRoles.includes(value)
    );

    if (professionalRoles.length === 0) {
      throw new Error('LAST_PROFESSIONAL_ROLE');
    }

    const nextRole =
      ['admin', 'super_admin'].includes(data.role)
        ? data.role
        : professionalRoles.includes(data.role)
          ? data.role
          : professionalRoles[0];

    const primaryRole =
      ['admin', 'super_admin'].includes(data.primaryRole)
        ? data.primaryRole
        : professionalRoles.includes(data.primaryRole)
          ? data.primaryRole
          : professionalRoles[0];

    const updates = {
      roles,
      role: nextRole,
      primaryRole,
      isMentor: professionalRoles.includes('mentor'),
      updatedAt: new Date(),
    };

    const accountActive =
      authActive &&
      resolveLegacyStartupStatus(uid, data) === 'active' &&
      isGlobalAccountEligible(uid, identitySnap);

    // A newly enabled role must not inherit a stale
    // publication from a previous ownership state.
    const synchronizationData = enabled
      ? data
      : { ...data, ...updates };

    const { emailVerified } =
      await readTransactionalEmailVerification({
        transaction,
        db: adminDb,
        uid,
        authUser,
        accountActive: accountActive,
      });

    const actions =
      await prepareVerifiedProfessionalPublicationSync(
        synchronizationData,
        publications,
        {
          uid,
          emailVerified,
          accountActive,
        }
      );

    transaction.update(userRef, updates);

    if (!accountActive || !enabled) {
      // Legacy documents combine multiple roles.
      // Remove rather than expose a removed role.
      transaction.delete(publicRef);
    }

    applyProfessionalPublicationSync(
      transaction,
      actions
    );

    // Administrative role enablement does not publish.

    return { roles, role: nextRole, primaryRole };
  });
}
