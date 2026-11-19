import 'server-only';

import {
  assertEmailOtpLifecycleFence,
  type EmailOtpLifecycleFence,
} from './email-otp-lifecycle-fence.service';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  EMAIL_VERIFICATION_CHALLENGES_COLLECTION,
  EMAIL_OTP_POLICY,
  isValidEmailOtp,
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
  generateEmailOtpChallengeId,
  verifyEmailOtpDigest,
} from './email-otp-crypto.service';

import {
  parseEmailOtpChallenge,
  type EmailOtpChallenge,
} from './email-otp-schema';

import {
  prepareEmailOtpRateLimit,
} from './email-otp-rate-limit.service';

/**
 * Internal claim metadata.
 *
 * Never return this object directly to a client.
 * A claim is not proof that Firebase Auth has
 * already been updated.
 */
export interface EmailOtpVerificationClaim {
  uid: string;

  email: string;

  authEmail: string;

  authAccountCreatedAt: string;

  lifecycleFence: EmailOtpLifecycleFence;

  challengeId: string;

  claimId: string;

  claimedAtMs: number;
}

export type ClaimEmailOtpResult =
  | {
      status: 'already_verified';
    }
  | {
      status: 'claimed';

      claim: EmailOtpVerificationClaim;
    }
  | {
      status: 'invalid_code';

      attemptsRemaining: number;
    }
  | {
      status: 'rate_limited';

      retryAfterSeconds: number;
    }
  | {
      status:
        | 'no_active_challenge'
        | 'delivery_pending'
        | 'expired'
        | 'locked'
        | 'email_changed'
        | 'verification_in_progress';
    };

/**
 * Validate and exclusively claim a current OTP.
 *
 * All challenge mutations and verification
 * rate-limit counters are committed atomically.
 *
 * This function does not modify Firebase Auth.
 */
export async function claimEmailOtpVerification(
  idToken: string,
  code: string,
  trustedIp: string
): Promise<ClaimEmailOtpResult> {
  if (!isEmailOtpEnabled()) {
    throw new Error('EMAIL_OTP_DISABLED');
  }

  if (!isValidEmailOtp(code)) {
    throw new Error('INVALID_EMAIL_OTP_CODE');
  }

  const account =
    await requireEmailOtpAccount(idToken);

  if (account.emailVerified) {
    return {
      status: 'already_verified',
    };
  }

  const { adminDb } =
    getFirebaseAdmin();

  const challengeRef = adminDb
    .collection(
      EMAIL_VERIFICATION_CHALLENGES_COLLECTION
    )
    .doc(account.uid);

  const identityRef = adminDb
    .collection(
      ACCOUNT_IDENTITIES_COLLECTION
    )
    .doc(account.uid);

  const startupRef = adminDb
    .collection('users')
    .doc(account.uid);

  // Stable across retries of this transaction.
  const claimId =
    generateEmailOtpChallengeId();

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

      const nowMs = Date.now();

      const now =
        Timestamp.fromMillis(nowMs);

      const challenge =
        challengeSnap.exists
          ? parseEmailOtpChallenge(
              account.uid,
              challengeSnap.data()
            )
          : null;

      if (
        challenge &&
        challenge.updatedAt.toMillis() > nowMs
      ) {
        throw new Error('INVALID_EMAIL_OTP_CLOCK');
      }

      const limit =
        await prepareEmailOtpRateLimit(
          transaction,
          adminDb,
          {
            action: 'verify',

            uid: account.uid,

            email: account.email,

            ip: trustedIp,
          },
          nowMs
        );

      if (!limit.result.allowed) {
        return {
          status: 'rate_limited',

          retryAfterSeconds:
            limit.result.retryAfterSeconds,
        };
      }

      // All Firestore reads are complete.
      // Count every eligible verification request,
      // including missing or inactive challenges.
      limit.apply();

      if (!challenge) {
        return {
          status: 'no_active_challenge',
        };
      }

      // Never replace an outstanding claim.
      // Recovery must be handled separately.
      if (
        challenge.status === 'verifying' ||
        challenge.status === 'requires_review'
      ) {
        return {
          status: 'verification_in_progress',
        };
      }

      if (
        challenge.status !== 'active' &&
        challenge.status !== 'pending_delivery'
      ) {
        if (challenge.status === 'locked') {
          return {
            status: 'locked',
          };
        }

        if (challenge.status === 'expired') {
          return {
            status: 'expired',
          };
        }

        return {
          status: 'no_active_challenge',
        };
      }

      // A challenge issued for another email
      // must not be used for the current email.
      if (
        challenge.email !== account.email ||
        challenge.authAccountCreatedAt !==
          account.authAccountCreatedAt
      ) {
        const superseded: EmailOtpChallenge = {
          ...challenge,

          status: 'superseded',

          codeDigest: null,

          updatedAt: now,
        };

        parseEmailOtpChallenge(
          account.uid,
          superseded
        );

        transaction.set(
          challengeRef,
          superseded
        );

        return {
          status: 'email_changed',
        };
      }

      if (
        challenge.expiresAt.toMillis() <= nowMs
      ) {
        const expired: EmailOtpChallenge = {
          ...challenge,

          status: 'expired',

          codeDigest: null,

          updatedAt: now,
        };

        parseEmailOtpChallenge(
          account.uid,
          expired
        );

        transaction.set(
          challengeRef,
          expired
        );

        return {
          status: 'expired',
        };
      }

      if (
        challenge.status === 'pending_delivery'
      ) {
        return {
          status: 'delivery_pending',
        };
      }

      if (
        challenge.attempts >=
          EMAIL_OTP_POLICY.maxAttemptsPerChallenge
      ) {
        throw new Error(
          'INVALID_EMAIL_OTP_ACTIVE_STATE'
        );
      }

      if (!challenge.codeDigest) {
        throw new Error(
          'INVALID_EMAIL_OTP_DIGEST_STATE'
        );
      }

      const matches =
        verifyEmailOtpDigest(
          challenge.codeDigest,

          account.uid,

          account.email,

          challenge.challengeId,

          code,
          account.authAccountCreatedAt
        );

      if (!matches) {
        const attempts =
          challenge.attempts + 1;

        const attemptsRemaining =
          EMAIL_OTP_POLICY
            .maxAttemptsPerChallenge -
          attempts;

        const locked =
          attemptsRemaining <= 0;

        const updated: EmailOtpChallenge = {
          ...challenge,

          attempts,

          status:
            locked
              ? 'locked'
              : 'active',

          codeDigest:
            locked
              ? null
              : challenge.codeDigest,

          updatedAt: now,
        };

        parseEmailOtpChallenge(
          account.uid,
          updated
        );

        transaction.set(
          challengeRef,
          updated
        );

        // Return instead of throwing:
        // wrong attempts must remain committed.
        if (locked) {
          return {
            status: 'locked',
          };
        }

        return {
          status: 'invalid_code',

          attemptsRemaining,
        };
      }

      // Correct OTP: claim exclusively and
      // permanently remove the reusable digest.
      const verifying: EmailOtpChallenge = {
        ...challenge,

        status: 'verifying',

        codeDigest: null,

        verificationClaimId: claimId,

        verificationClaimedAt: now,

        updatedAt: now,
      };

      parseEmailOtpChallenge(
        account.uid,
        verifying
      );

      transaction.set(
        challengeRef,
        verifying
      );

      return {
        status: 'claimed',

        claim: {
          uid: account.uid,

          email: account.email,

          authEmail: account.authEmail,

          authAccountCreatedAt:
            account.authAccountCreatedAt,

          lifecycleFence:
            account.lifecycleFence,

          challengeId:
            challenge.challengeId,

          claimId,

          claimedAtMs: nowMs,
        },
      };
    }
  );
}
