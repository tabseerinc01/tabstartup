import 'server-only';

import {
  hasActiveStartupProfile,
} from '@/lib/legacy-startup-profile';

import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/firebase/admin';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  assertGlobalAccountNotSuspended,
} from '@/services/account-suspension-guard.service';
import { buildPublicProfile } from '@/lib/public-profile';

import {
  readProfessionalPublicationSnapshots,
  prepareProfessionalPublicationSync,
  applyProfessionalPublicationSync,
} from '@/services/professional-profile-publishing.service';
import { validateProfileUpdate } from '@/lib/profile-update-validation';

export async function updateOwnProfile(
  uid: string,
  input: unknown
) {
  if (!uid || uid.includes('/')) {
    throw new Error('INVALID_USER');
  }

  const updates = validateProfileUpdate(input);

  const { adminDb, adminAuth } = getFirebaseAdmin();

  const authUser = await adminAuth
    .getUser(uid)
    .catch((error: unknown) => {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? error.code
          : undefined;

      if (code === 'auth/user-not-found') {
        throw new Error('ACCOUNT_NOT_ACTIVE');
      }

      throw error;
    });

  if (authUser.uid !== uid || authUser.disabled) {
    throw new Error('ACCOUNT_NOT_ACTIVE');
  }

  const emailVerified =
    authUser.emailVerified === true;

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb.collection('users').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap =
      await transaction.get(identityRef);

    const userSnap = await transaction.get(userRef);

    const professionalPublications =
      await readProfessionalPublicationSnapshots(
        transaction,
        adminDb,
        uid
      );

    assertGlobalAccountNotSuspended(
      uid,
      identitySnap
    );

    if (!userSnap.exists) {
      throw new Error('USER_NOT_FOUND');
    }

    const current = userSnap.data()!;

    if (current.status === 'suspended') {
      throw new Error('USER_SUSPENDED');
    }

    if (
      !hasActiveStartupProfile(
        uid,
        current
      )
    ) {
      throw new Error('INVALID_STARTUP_PROFILE');
    }

    const merged = {
      ...current,
      ...updates,
    };

    const projection = buildPublicProfile(uid, merged);

    const publicationActions =
      prepareProfessionalPublicationSync(
        merged,
        professionalPublications,
        {
          uid,
          emailVerified,
          accountActive: true,
        }
      );

    const profileComplete = [
      merged.fullName,
      merged.bio,
      merged.location,
    ].every(
      value =>
        typeof value === 'string' &&
        value.trim().length > 0
    ) && hasActiveStartupProfile(uid, merged);

    const referralSnap = profileComplete
      ? await transaction.get(
          adminDb.collection('referrals')
            .where('referredUid', '==', uid)
            .limit(2)
        )
      : null;

    if (
      referralSnap &&
      referralSnap.size === 1
    ) {
      const referral = referralSnap.docs[0];

      if (
        referral.data().referredUid === uid &&
        referral.data().referredProfileCompleted === false
      ) {
        transaction.update(referral.ref, {
          referredProfileCompleted: true,
        });
      }
    }

    transaction.update(userRef, {
      ...updates,
      isMentor: projection.isMentor === true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Legacy projections are frozen until the
    // controlled relationship and discovery migration.
    // Private profile updates must never refresh them.

    applyProfessionalPublicationSync(
      transaction,
      publicationActions
    );

    return {
      success: true,
      status: 'updated' as const,
    };
  });
}

export async function activateOwnProfessionalRole(
  uid: string,
  role: unknown
) {
  const allowedRoles = ['founder', 'investor', 'mentor'];

  if (!uid || uid.includes('/')) {
    throw new Error('INVALID_USER');
  }

  if (typeof role !== 'string' || !allowedRoles.includes(role)) {
    throw new Error('INVALID_ROLE');
  }

  const { adminDb, adminAuth } = getFirebaseAdmin();

  const authUser = await adminAuth
    .getUser(uid)
    .catch((error: unknown) => {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? error.code
          : undefined;

      if (code === 'auth/user-not-found') {
        throw new Error('ACCOUNT_NOT_ACTIVE');
      }

      throw error;
    });

  if (authUser.uid !== uid || authUser.disabled) {
    throw new Error('ACCOUNT_NOT_ACTIVE');
  }

  const emailVerified =
    authUser.emailVerified === true;

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb.collection('users').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap =
      await transaction.get(identityRef);

    const userSnap = await transaction.get(userRef);

    const professionalPublications =
      await readProfessionalPublicationSnapshots(
        transaction,
        adminDb,
        uid
      );

    assertGlobalAccountNotSuspended(
      uid,
      identitySnap
    );

    if (!userSnap.exists) {
      throw new Error('USER_NOT_FOUND');
    }

    const current = userSnap.data()!;

    if (current.status === 'suspended') {
      throw new Error('USER_SUSPENDED');
    }

    if (
      !hasActiveStartupProfile(
        uid,
        current
      )
    ) {
      throw new Error('INVALID_STARTUP_PROFILE');
    }

    const existingRoles = Array.isArray(current.roles)
      ? current.roles.filter(
          (value): value is string => typeof value === 'string'
        )
      : typeof current.role === 'string'
        ? [current.role]
        : [];

    const roles = [...new Set([...existingRoles, role])];

    const merged = {
      ...current,
      roles,
    };

    const projection = buildPublicProfile(uid, merged);

    const publicationActions =
      prepareProfessionalPublicationSync(
        current,
        professionalPublications,
        {
          uid,
          emailVerified,
          accountActive: true,
        }
      );

    transaction.update(userRef, {
      roles,
      isMentor: projection.isMentor === true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Role activation grants private role ownership,
    // not public publication authorization.
    applyProfessionalPublicationSync(
      transaction,
      publicationActions
    );

    return {
      success: true,
      status: 'activated' as const,
      roles,
    };
  });
}
