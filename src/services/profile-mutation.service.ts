import 'server-only';

import {
  hasActiveStartupProfile,
} from '@/lib/legacy-startup-profile';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/firebase/admin';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  assertGlobalAccountNotSuspended,
} from '@/services/account-suspension-guard.service';
import { buildPublicProfile } from '@/lib/public-profile';
import { validateProfileUpdate } from '@/lib/profile-update-validation';

export async function updateOwnProfile(
  uid: string,
  input: unknown
) {
  if (!uid || uid.includes('/')) {
    throw new Error('INVALID_USER');
  }

  const updates = validateProfileUpdate(input);

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb.collection('users').doc(uid);
  const publicRef = adminDb.collection('publicProfiles').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap =
      await transaction.get(identityRef);

    const userSnap = await transaction.get(userRef);

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

    if (
      !Array.isArray(projection.roles) ||
      projection.roles.length === 0
    ) {
      transaction.delete(publicRef);
    } else {
      transaction.set(publicRef, {
        ...projection,
        createdAt: current.createdAt instanceof Timestamp
          ? current.createdAt
          : null,
        isVerified: current.isVerified === true,
      });
    }

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

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb.collection('users').doc(uid);
  const publicRef = adminDb.collection('publicProfiles').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap =
      await transaction.get(identityRef);

    const userSnap = await transaction.get(userRef);

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

    const projection = buildPublicProfile(uid, {
      ...current,
      roles,
    });

    transaction.update(userRef, {
      roles,
      isMentor: projection.isMentor === true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.set(publicRef, {
      ...projection,
      createdAt: current.createdAt instanceof Timestamp
        ? current.createdAt
        : null,
      isVerified: current.isVerified === true,
    });

    return {
      success: true,
      status: 'activated' as const,
      roles,
    };
  });
}
