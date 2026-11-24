import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/firebase/admin';
import { ACCOUNT_IDENTITIES_COLLECTION } from '@/lib/account-identity';
import { requirePortalAccess } from '@/services/account-authorization.service';
import { isGlobalAccountEligible } from '@/services/account-suspension-guard.service';
import { readTransactionalEmailVerification } from '@/services/email/email-verification-transaction.service';
import { evaluateVerifiedProfileReadiness } from '@/services/professional-profile-image-readiness.service';
import { isValidProfessionalProfileUid } from '@/lib/professional-profile-validation';

export async function publishOwnStartup(idToken: string) {
  const account = await requirePortalAccess(idToken, 'startup');
  const uid = account.uid;

  if (!isValidProfessionalProfileUid(uid)) {
    throw new Error('INVALID_STARTUP_OWNER');
  }

  const { adminAuth, adminDb } = getFirebaseAdmin();
  const authUser = await adminAuth.getUser(uid);

  if (authUser.uid !== uid || authUser.disabled) {
    throw new Error('ACCOUNT_NOT_ACTIVE');
  }

  const identityRef = adminDb.collection(ACCOUNT_IDENTITIES_COLLECTION).doc(uid);
  const userRef = adminDb.collection('users').doc(uid);
  const startupRef = adminDb.collection('startups').doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap = await transaction.get(identityRef);
    const userSnap = await transaction.get(userRef);
    const startupSnap = await transaction.get(startupRef);

    if (!userSnap.exists) {
      throw new Error('USER_NOT_FOUND');
    }

    if (!startupSnap.exists) {
      throw new Error('STARTUP_NOT_FOUND');
    }

    const startup = startupSnap.data()!;

    if (startup.ownerUid !== uid) {
      throw new Error('STARTUP_OWNER_MISMATCH');
    }

    const accountActive = isGlobalAccountEligible(uid, identitySnap);

    const { emailVerified } = await readTransactionalEmailVerification({
      transaction,
      db: adminDb,
      uid,
      authUser,
      accountActive,
    });

    const readiness = await evaluateVerifiedProfileReadiness(
      userSnap.data()!,
      'founder',
      { uid, emailVerified, accountActive }
    );

    if (!readiness.ready) {
      return {
        status: 'not_ready' as const,
        readiness,
      };
    }

    const requiredStartupFields = [
      'name',
      'shortDescription',
      'industry',
    ] as const;

    const missingStartupFields = requiredStartupFields.filter(
      field =>
        typeof startup[field] !== 'string' ||
        !startup[field].trim()
    );

    if (missingStartupFields.length > 0) {
      return {
        status: 'startup_not_ready' as const,
        readiness,
        missingStartupFields,
      };
    }

    if (startup.status === 'active') {
      return {
        status: 'active' as const,
        readiness,
      };
    }

    if (startup.status !== 'draft') {
      throw new Error('INVALID_STARTUP_STATUS');
    }

    transaction.update(startupRef, {
      status: 'active',
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      status: 'published' as const,
      readiness,
    };
  });
}
