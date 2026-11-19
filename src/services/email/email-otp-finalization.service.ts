import 'server-only';

import {
  assertEmailOtpLifecycleFence,
} from './email-otp-lifecycle-fence.service';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION,
  EMAIL_VERIFICATION_CHALLENGES_COLLECTION,
  EMAIL_OTP_POLICY,
} from '@/lib/email-verification';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  assertGlobalAccountNotSuspended,
} from '@/services/account-suspension-guard.service';

import {
  resolveLegacyStartupStatus,
} from '@/lib/legacy-startup-profile';

import {
  requireEmailOtpAccount,
} from './email-otp-account.service';

import {
  isEmailOtpEnabled,
} from './email-otp-crypto.service';

import {
  parseEmailOtpChallenge,
  type EmailOtpChallenge,
} from './email-otp-schema';

import {
  createAccountEmailVerification,
  parseAccountEmailVerification,
  matchesAccountEmailVerificationBinding,
} from './account-email-verification-schema';

import type {
  EmailOtpVerificationClaim,
} from './email-otp-verification.service';

export type FinalizeEmailOtpResult =
  | {
      status: 'verified';
    }
  | {
      status:
        | 'claim_invalid'
        | 'claim_expired'
        | 'email_changed'
        | 'verification_conflict';
    };

function assertClaimFormat(
  claim: EmailOtpVerificationClaim
): void {
  if (
    !claim ||
    typeof claim.uid !== 'string' ||
    typeof claim.email !== 'string' ||
    claim.email !== claim.authEmail ||
    typeof claim.authAccountCreatedAt !== 'string' ||
    typeof claim.lifecycleFence !== 'string' ||
    (
      claim.lifecycleFence !== 'missing' &&
      !/^[1-9][0-9]*:[0-9]{9}$/.test(
        claim.lifecycleFence
      )
    ) ||
    typeof claim.challengeId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(claim.challengeId) ||
    typeof claim.claimId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(claim.claimId) ||
    !Number.isSafeInteger(claim.claimedAtMs) ||
    claim.claimedAtMs <= 0
  ) {
    throw new Error('INVALID_EMAIL_OTP_CLAIM');
  }
}

function getClaimDeadlineMs(
  challenge: EmailOtpChallenge
): number {
  if (!challenge.verificationClaimedAt) {
    throw new Error(
      'INVALID_EMAIL_OTP_CLAIM_STATE'
    );
  }

  return Math.min(
    challenge.expiresAt.toMillis(),

    challenge.verificationClaimedAt.toMillis() +
      EMAIL_OTP_POLICY.verificationClaimValidityMs
  );
}

/**
 * Finalize an internal exclusive OTP claim.
 *
 * Never expose this claim as a client-controlled
 * authorization mechanism.
 *
 * Firebase Auth is not modified.
 *
 * Verification authority creation and challenge
 * consumption occur in one Firestore transaction.
 */
export async function finalizeEmailOtpVerification(
  idToken: string,
  claim: EmailOtpVerificationClaim
): Promise<FinalizeEmailOtpResult> {
  if (!isEmailOtpEnabled()) {
    throw new Error('EMAIL_OTP_DISABLED');
  }

  assertClaimFormat(claim);

  const account =
    await requireEmailOtpAccount(idToken);

  if (account.uid !== claim.uid) {
    throw new Error('INVALID_EMAIL_OTP_CLAIM');
  }

  if (
    account.lifecycleFence !==
      claim.lifecycleFence
  ) {
    return {
      status: 'claim_invalid',
    };
  }

  if (
    account.email !== claim.email ||
    account.authEmail !== claim.authEmail ||
    account.authAccountCreatedAt !==
      claim.authAccountCreatedAt
  ) {
    return {
      status: 'email_changed',
    };
  }

  const { adminDb } =
    getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(account.uid);

  const startupRef = adminDb
    .collection('users')
    .doc(account.uid);

  const challengeRef = adminDb
    .collection(
      EMAIL_VERIFICATION_CHALLENGES_COLLECTION
    )
    .doc(account.uid);

  const authorityRef = adminDb
    .collection(
      ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION
    )
    .doc(account.uid);

  return adminDb.runTransaction(
    async transaction => {
      const [
        identitySnap,
        startupSnap,
        challengeSnap,
        authoritySnap,
      ] = await transaction.getAll(
        identityRef,
        startupRef,
        challengeRef,
        authorityRef
      );

      assertGlobalAccountNotSuspended(
        account.uid,
        identitySnap
      );

      assertEmailOtpLifecycleFence(
        account.uid,
        claim.lifecycleFence,
        identitySnap
      );

      if (
        startupSnap.exists &&
        resolveLegacyStartupStatus(
          account.uid,
          startupSnap.data()
        ) !== 'active'
      ) {
        throw new Error('ACCOUNT_NOT_ACTIVE');
      }

      if (!challengeSnap.exists) {
        return {
          status: 'claim_invalid',
        };
      }

      const challenge =
        parseEmailOtpChallenge(
          account.uid,
          challengeSnap.data()
        );

      const authority =
        authoritySnap.exists
          ? parseAccountEmailVerification(
              account.uid,
              authoritySnap.data()
            )
          : null;

      const nowMs = Date.now();

      if (
        challenge.updatedAt.toMillis() > nowMs ||
        (
          authority &&
          authority.updatedAt.toMillis() > nowMs
        )
      ) {
        throw new Error(
          'INVALID_EMAIL_OTP_CLOCK'
        );
      }

      if (
        challenge.challengeId !== claim.challengeId ||
        challenge.verificationClaimId !== claim.claimId ||
        challenge.verificationClaimedAt?.toMillis() !==
          claim.claimedAtMs
      ) {
        return {
          status: 'claim_invalid',
        };
      }

      if (
        challenge.email !== account.email ||
        challenge.authAccountCreatedAt !==
          account.authAccountCreatedAt
      ) {
        return {
          status: 'email_changed',
        };
      }

      // A repeated finalization can succeed only
      // if its matching authority remains valid.
      if (challenge.status === 'consumed') {
        if (
          authority &&
          challenge.consumedAt &&
          authority.verificationChallengeId ===
            challenge.challengeId &&
          authority.verifiedAt.toMillis() ===
            challenge.consumedAt.toMillis() &&
          matchesAccountEmailVerificationBinding(
            authority,
            account
          )
        ) {
          return {
            status: 'verified',
          };
        }

        return {
          status: 'verification_conflict',
        };
      }

      if (
        challenge.status !== 'verifying' ||
        challenge.codeDigest !== null ||
        challenge.consumedAt !== null ||
        !challenge.deliveryAcceptedAt ||
        !challenge.providerEmailId ||
        challenge.attempts >=
          EMAIL_OTP_POLICY.maxAttemptsPerChallenge
      ) {
        return {
          status: 'claim_invalid',
        };
      }

      const createdMs =
        challenge.createdAt.toMillis();

      const deliveredMs =
        challenge.deliveryAcceptedAt.toMillis();

      if (
        deliveredMs < createdMs ||
        claim.claimedAtMs < deliveredMs ||
        claim.claimedAtMs > nowMs ||
        claim.claimedAtMs >=
          challenge.expiresAt.toMillis() ||
        challenge.updatedAt.toMillis() !==
          claim.claimedAtMs
      ) {
        return {
          status: 'claim_invalid',
        };
      }

      if (
        nowMs >= getClaimDeadlineMs(challenge)
      ) {
        return {
          status: 'claim_expired',
        };
      }

      // Do not overwrite a newer verification
      // or revocation with an outstanding claim.
      if (
        authority &&
        authority.updatedAt.toMillis() >=
          claim.claimedAtMs
      ) {
        return {
          status: 'verification_conflict',
        };
      }

      const verification =
        createAccountEmailVerification({
          uid: account.uid,
          email: account.email,
          authAccountCreatedAt:
            account.authAccountCreatedAt,
          challengeId: challenge.challengeId,
          nowMs,
        });

      const now =
        Timestamp.fromMillis(nowMs);

      const consumed: EmailOtpChallenge = {
        ...challenge,

        status: 'consumed',

        codeDigest: null,

        consumedAt: now,

        updatedAt: now,
      };

      parseEmailOtpChallenge(
        account.uid,
        consumed
      );

      // All Firestore reads are complete.
      // Both writes commit or neither commits.
      transaction.set(
        authorityRef,
        verification
      );

      transaction.set(
        challengeRef,
        consumed
      );

      return {
        status: 'verified',
      };
    }
  );
}

/**
 * Recover an expired exclusive claim.
 *
 * Never restore its digest or approve verification.
 * A recovered account must request a new OTP.
 *
 * requires_review is deliberately not recovered
 * automatically.
 */
export async function recoverExpiredEmailOtpClaim(
  idToken: string
): Promise<boolean> {
  if (!isEmailOtpEnabled()) {
    throw new Error('EMAIL_OTP_DISABLED');
  }

  const account =
    await requireEmailOtpAccount(idToken);

  const { adminDb } =
    getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(account.uid);

  const startupRef = adminDb
    .collection('users')
    .doc(account.uid);

  const challengeRef = adminDb
    .collection(
      EMAIL_VERIFICATION_CHALLENGES_COLLECTION
    )
    .doc(account.uid);

  return adminDb.runTransaction(
    async transaction => {
      const [
        identitySnap,
        startupSnap,
        challengeSnap,
      ] = await transaction.getAll(
        identityRef,
        startupRef,
        challengeRef
      );

      assertGlobalAccountNotSuspended(
        account.uid,
        identitySnap
      );

      assertEmailOtpLifecycleFence(
        account.uid,
        account.lifecycleFence,
        identitySnap
      );

      if (
        startupSnap.exists &&
        resolveLegacyStartupStatus(
          account.uid,
          startupSnap.data()
        ) !== 'active'
      ) {
        throw new Error('ACCOUNT_NOT_ACTIVE');
      }

      if (!challengeSnap.exists) {
        return false;
      }

      const challenge =
        parseEmailOtpChallenge(
          account.uid,
          challengeSnap.data()
        );

      if (challenge.status !== 'verifying') {
        return false;
      }

      const nowMs = Date.now();

      if (
        challenge.updatedAt.toMillis() > nowMs
      ) {
        throw new Error(
          'INVALID_EMAIL_OTP_CLOCK'
        );
      }

      if (
        nowMs < getClaimDeadlineMs(challenge)
      ) {
        return false;
      }

      const expired: EmailOtpChallenge = {
        ...challenge,

        status: 'expired',

        codeDigest: null,

        verificationClaimId: null,

        verificationClaimedAt: null,

        consumedAt: null,

        updatedAt:
          Timestamp.fromMillis(nowMs),
      };

      parseEmailOtpChallenge(
        account.uid,
        expired
      );

      transaction.set(
        challengeRef,
        expired
      );

      return true;
    }
  );
}
