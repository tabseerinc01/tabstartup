import 'server-only';

import {
  FieldValue,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  isProfessionalProfileRole,
  type ProfessionalProfileRole,
} from '@/lib/profile-readiness';

import {
  isValidProfessionalProfileUid,
} from '@/lib/professional-profile-validation';

export const PROFESSIONAL_ELIGIBILITY_COLLECTION =
  'professionalEligibility';

export function writeProfessionalEligibility(
  transaction: Transaction,
  db: Firestore,
  uid: string,
  publishedRoles: readonly ProfessionalProfileRole[]
) {
  if (!isValidProfessionalProfileUid(uid)) {
    throw new Error('INVALID_ELIGIBILITY_UID');
  }

  if (
    !Array.isArray(publishedRoles) ||
    !publishedRoles.every(isProfessionalProfileRole)
  ) {
    throw new Error('INVALID_ELIGIBILITY_ROLES');
  }

  const roles = [...new Set(publishedRoles)].sort();

  const ref = db
    .collection(PROFESSIONAL_ELIGIBILITY_COLLECTION)
    .doc(uid);

  if (roles.length === 0) {
    transaction.delete(ref);
    return;
  }

  transaction.set(ref, {
    uid,
    schemaVersion: 1,
    publishedRoles: roles,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
