import 'server-only';

import { getFirebaseAdmin } from '@/firebase/admin';
import { buildPublicProfile } from '@/lib/public-profile';

export async function syncPublicProfile(uid: string) {
  if (!uid || uid.includes('/')) {
    throw new Error('Invalid user UID');
  }

  const { adminDb } = getFirebaseAdmin();

  const userRef = adminDb.collection('users').doc(uid);
  const publicRef = adminDb.collection('publicProfiles').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists) {
      transaction.delete(publicRef);
      return { status: 'removed' as const };
    }

    const data = userSnap.data()!;

    if (data.status === 'suspended') {
      transaction.delete(publicRef);
      return { status: 'removed' as const };
    }

    const projection = buildPublicProfile(uid, data);

    if (!Array.isArray(projection.roles) ||
        projection.roles.length === 0) {
      transaction.delete(publicRef);
      return { status: 'removed' as const };
    }

    transaction.set(publicRef, {
      ...projection,
      createdAt: data.createdAt ?? null,
      isVerified: data.isVerified === true,
    });

    return { status: 'synced' as const };
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

  const userRef = adminDb.collection('users').doc(uid);
  const publicRef = adminDb.collection('publicProfiles').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(userRef);

    if (!snapshot.exists) {
      throw new Error('USER_NOT_FOUND');
    }

    const data = snapshot.data()!;
    const status = suspended ? 'suspended' : 'active';

    transaction.update(userRef, {
      status,
      updatedAt: new Date(),
    });

    if (suspended) {
      transaction.delete(publicRef);
    } else {
      const projection = buildPublicProfile(uid, data);

      if (Array.isArray(projection.roles) &&
          projection.roles.length > 0) {
        transaction.set(publicRef, {
          ...projection,
          createdAt: data.createdAt ?? null,
          isVerified: data.isVerified === true,
        });
      } else {
        transaction.delete(publicRef);
      }
    }

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

  const userRef = adminDb.collection('users').doc(uid);
  const publicRef = adminDb.collection('publicProfiles').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(userRef);

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

    transaction.update(userRef, updates);

    if (data.status === 'suspended') {
      transaction.delete(publicRef);
    } else {
      transaction.set(publicRef, {
        ...buildPublicProfile(uid, {
          ...data,
          ...updates,
        }),
        createdAt: data.createdAt ?? null,
        isVerified: data.isVerified === true,
      });
    }

    return { roles, role: nextRole, primaryRole };
  });
}
