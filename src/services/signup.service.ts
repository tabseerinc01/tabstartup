import 'server-only';

import {
  hasActiveStartupProfile,
} from '@/lib/legacy-startup-profile';

import { randomInt } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/firebase/admin';
import {
  PROFESSIONAL_PROFILES_COLLECTION,
  getProfessionalProfileId,
} from '@/lib/professional-profile';
import type { ValidatedSignup } from '@/lib/signup-validation';

import {
  isGlobalAccountEligible,
} from '@/services/account-suspension-guard.service';
import {
  ACCOUNT_IDENTITIES_COLLECTION,
  ACCOUNT_IDENTITY_SCHEMA_VERSION,
} from '@/lib/account-identity';

function generateReferralCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  return 'TAB-' + Array.from(
    { length: 10 },
    () => alphabet[randomInt(alphabet.length)]
  ).join('');
}

export async function createSignupProfile(
  uid: string,
  input: Omit<ValidatedSignup, 'password'>
) {
  if (!uid || uid.includes('/')) {
    throw new Error('INVALID_USER');
  }

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb.collection('users').doc(uid);
  // Legacy public document is read only for
  // signup recovery protection.
  const publicRef = adminDb.collection('publicProfiles').doc(uid);

  const professionalRefs = (
    ['founder', 'investor', 'mentor'] as const
  ).map(role =>
    adminDb
      .collection(PROFESSIONAL_PROFILES_COLLECTION)
      .doc(getProfessionalProfileId(uid, role))
  );
  const referralRef = adminDb.collection('referrals').doc(`referral_${uid}`);

  for (let attempt = 0; attempt < 5; attempt++) {
    const referralCode = generateReferralCode();

    const codeRef = adminDb
      .collection('referralCodes')
      .doc(referralCode);

    try {
      return await adminDb.runTransaction(async transaction => {
        const identitySnap = await transaction.get(identityRef);
        const userSnap = await transaction.get(userRef);
        const publicSnap = await transaction.get(publicRef);

        const professionalSnaps =
          await transaction.getAll(...professionalRefs);
        const codeSnap = await transaction.get(codeRef);
        const existingReferral = await transaction.get(referralRef);

        if (userSnap.exists) {
          throw new Error('PROFILE_ALREADY_EXISTS');
        }

        if (
          identitySnap.exists ||
          publicSnap.exists ||
          professionalSnaps.some(snapshot => snapshot.exists) ||
          existingReferral.exists
        ) {
          throw new Error('RECOVERY_VERIFICATION_REQUIRED');
        }

        if (codeSnap.exists) {
          throw new Error('REFERRAL_CODE_COLLISION');
        }

        let referrerUid: string | null = null;

        if (input.referralCode) {
          const sourceCodeRef = adminDb
            .collection('referralCodes')
            .doc(input.referralCode);

          const sourceCodeSnap =
            await transaction.get(sourceCodeRef);

          if (sourceCodeSnap.exists) {
            const ownerUid = sourceCodeSnap.data()?.ownerUid;

            if (
              typeof ownerUid === 'string' &&
              ownerUid &&
              ownerUid.length <= 128 &&
              ownerUid.trim() === ownerUid &&
              ownerUid !== '.' &&
              ownerUid !== '..' &&
              !ownerUid.includes('/') &&
              ownerUid !== uid
            ) {
              const referrerSnap = await transaction.get(
                adminDb.collection('users').doc(ownerUid)
              );

              const referrerIdentitySnap =
                await transaction.get(
                  adminDb
                    .collection(ACCOUNT_IDENTITIES_COLLECTION)
                    .doc(ownerUid)
                );

              if (
                referrerSnap.exists &&
                isGlobalAccountEligible(
                  ownerUid,
                  referrerIdentitySnap
                ) &&
                hasActiveStartupProfile(
                  ownerUid,
                  referrerSnap.data()
                ) &&
                referrerSnap.data()?.referralCode === input.referralCode
              ) {
                referrerUid = ownerUid;
              }
            }
          }
        }

        const userData = {
          uid,
          fullName: input.fullName,
          email: input.email,
          role: input.role,
          primaryRole: input.role,
          roles: [input.role],
          isMentor: input.role === 'mentor',
          plan: 'basic',
          subscriptionStatus: 'inactive',
          status: 'active',
          isVerified: false,
          referralCode,
          referralCount: 0,
          bonusLimits: {
            connections: 0,
            pitches: 0,
            contacts: 0,
            deals: 0,
            tasks: 0,
            invoices: 0
          },
          headline: '',
          bio: '',
          location: '',
          stage: '',
          skills: [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        };

        transaction.create(identityRef, {
          uid,
          email: input.email,
          status: 'active',
          schemaVersion: ACCOUNT_IDENTITY_SCHEMA_VERSION,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.create(userRef, userData);

        // Professional profiles remain private until
        // the owner explicitly publishes an eligible role.
        // Signup must never create a public projection.

        transaction.create(codeRef, {
          ownerUid: uid,
          createdAt: FieldValue.serverTimestamp()
        });

        if (referrerUid) {
          transaction.create(referralRef, {
            referrerUid,
            referredUid: uid,
            referredProfileCompleted: false,
            rewardGranted: false,
            createdAt: FieldValue.serverTimestamp()
          });
        }

        return {
          success: true,
          uid,
          referralCode,
          referralApplied: Boolean(referrerUid)
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'REFERRAL_CODE_COLLISION'
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('REFERRAL_CODE_ALLOCATION_FAILED');
}
