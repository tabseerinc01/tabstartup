import 'server-only';

import {
  parseAccountEmailVerification,
  matchesAccountEmailVerificationBinding,
} from './account-email-verification-schema';

import {
  revokeTransactionalEmailVerification,
} from './email-verification-revocation.service';

import {
  assertEmailOtpLifecycleFence,
  type EmailOtpLifecycleFence,
} from './email-otp-lifecycle-fence.service';

import {
  recoverExpiredEmailOtpClaim,
} from './email-otp-finalization.service';

import {
  normalizeAuthAccountCreatedAt,
} from '@/lib/email-verification';

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
  assertGlobalAccountNotSuspended,
} from '@/services/account-suspension-guard.service';

import {
  resolveLegacyStartupStatus,
} from '@/lib/legacy-startup-profile';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  requireEmailOtpAccount,
} from './email-otp-account.service';

import {
  generateEmailOtp,
  generateEmailOtpChallengeId,
  createEmailOtpDigest,
} from './email-otp-crypto.service';

import {
  createPendingEmailOtpChallenge,
  parseEmailOtpChallenge,
  type EmailOtpChallenge,
} from './email-otp-schema';

import {
  prepareEmailOtpRateLimit,
} from './email-otp-rate-limit.service';

import {
  assertEmailOtpDeliveryConfigured,
  sendEmailOtp,
  EmailOtpDeliveryError,
} from './email-otp-delivery.service';

export type SendEmailOtpChallengeResult =
  | {
      status: 'already_verified';
    }
  | {
      status: 'sent';
      expiresAtMs: number;
      resendAvailableAtMs: number;
    }
  | {
      status:
        | 'cooldown'
        | 'rate_limited';
      retryAfterSeconds: number;
    }
  | {
      status:
        | 'verification_in_progress'
        | 'delivery_failed'
        | 'delivery_uncertain'
        | 'superseded'
        | 'expired';
    };

type DeliveryOutcome =
  | {
      status: 'accepted';
      providerEmailId: string;
    }
  | {
      status:
        | 'delivery_failed'
        | 'delivery_uncertain';
    };

/**
 * Finalize only the exact pending challenge.
 *
 * A late provider response cannot overwrite
 * a newer challenge.
 */
async function finalizeEmailOtpDelivery(
  uid: string,
  lifecycleFence: EmailOtpLifecycleFence,
  challengeId: string,
  outcome: DeliveryOutcome
): Promise<SendEmailOtpChallengeResult> {
  const { adminDb } = getFirebaseAdmin();

  const ref = adminDb
    .collection(
      EMAIL_VERIFICATION_CHALLENGES_COLLECTION
    )
    .doc(uid);

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  return adminDb.runTransaction(
    async transaction => {
      const [
        identitySnap,
        snapshot,
      ] = await transaction.getAll(
        identityRef,
        ref
      );

      assertEmailOtpLifecycleFence(
        uid,
        lifecycleFence,
        identitySnap
      );

      if (!snapshot.exists) {
        return { status: 'superseded' };
      }

      const challenge =
        parseEmailOtpChallenge(
          uid,
          snapshot.data()
        );

      if (
        challenge.challengeId !== challengeId ||
        challenge.status !== 'pending_delivery'
      ) {
        return { status: 'superseded' };
      }

      const nowMs = Date.now();

      if (
        nowMs < challenge.updatedAt.toMillis()
      ) {
        throw new Error('INVALID_EMAIL_OTP_CLOCK');
      }

      const now =
        Timestamp.fromMillis(nowMs);

      if (
        challenge.expiresAt.toMillis() <= nowMs
      ) {
        const expired: EmailOtpChallenge = {
          ...challenge,

          status: 'expired',

          codeDigest: null,

          updatedAt: now,
        };

        parseEmailOtpChallenge(uid, expired);

        transaction.set(ref, expired);

        return { status: 'expired' };
      }

      if (outcome.status === 'accepted') {
        const active: EmailOtpChallenge = {
          ...challenge,

          status: 'active',

          providerEmailId:
            outcome.providerEmailId,

          deliveryAcceptedAt: now,

          updatedAt: now,
        };

        parseEmailOtpChallenge(uid, active);

        transaction.set(ref, active);

        return {
          status: 'sent',

          expiresAtMs:
            active.expiresAt.toMillis(),

          resendAvailableAtMs:
            active.resendAvailableAt.toMillis(),
        };
      }

      const failed: EmailOtpChallenge = {
        ...challenge,

        status: outcome.status,

        codeDigest: null,

        updatedAt: now,
      };

      parseEmailOtpChallenge(uid, failed);

      transaction.set(ref, failed);

      return {
        status: outcome.status,
      };
    }
  );
}

/**
 * Create and deliver a new email OTP.
 *
 * One current challenge per Firebase UID.
 * All challenge and rate-limit writes are atomic.
 *
 * Provider requests occur outside transactions.
 */
export async function requestEmailOtp(
  idToken: string,
  trustedIp: string
): Promise<SendEmailOtpChallengeResult> {
  const account =
    await requireEmailOtpAccount(idToken);

  if (!account.emailVerified) {
    await recoverExpiredEmailOtpClaim(idToken);
  }

  if (account.emailVerified) {
    return {
      status: 'already_verified',
    };
  }

  assertEmailOtpDeliveryConfigured();

  const { adminDb, adminAuth } =
    getFirebaseAdmin();

  const code = generateEmailOtp();

  const challengeId =
    generateEmailOtpChallengeId();

  const codeDigest =
    createEmailOtpDigest(
      account.uid,
      account.email,
      challengeId,
      code,
          account.authAccountCreatedAt
    );

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

  const authorityRef = adminDb
    .collection(
      ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION
    )
    .doc(account.uid);

  const reservation =
    await adminDb.runTransaction(
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

        if (
          authoritySnap.id !== account.uid ||
          authoritySnap.ref.path !==
            authorityRef.path
        ) {
          throw new Error(
            'EMAIL_VERIFICATION_AUTHORITY_PATH_MISMATCH'
          );
        }

        const authority = authoritySnap.exists
          ? parseAccountEmailVerification(
              account.uid,
              authoritySnap.data()
            )
          : null;

        if (
          authority &&
          (
            authority.updatedAt.toMillis() > nowMs ||
            authority.verifiedAt.toMillis() > nowMs
          )
        ) {
          throw new Error(
            'INVALID_EMAIL_VERIFICATION_CLOCK'
          );
        }

        const authorityMatches =
          authority !== null &&
          matchesAccountEmailVerificationBinding(
            authority,
            account
          );

        if (authorityMatches) {
          return {
            status: 'already_verified',
          } as const;
        }

        const staleAuthority =
          authority !== null &&
          authority.status === 'verified' &&
          !authorityMatches;

        const current =
          challengeSnap.exists
            ? parseEmailOtpChallenge(
                account.uid,
                challengeSnap.data()
              )
            : null;

        if (
          current &&
          (
            current.status === 'verifying' ||
            current.status === 'requires_review'
          )
        ) {
          return {
            status: 'verification_in_progress',
          } as const;
        }

        if (
          current &&
          current.updatedAt.toMillis() > nowMs
        ) {
          throw new Error('INVALID_EMAIL_OTP_CLOCK');
        }

        if (
          current &&
          current.resendAvailableAt.toMillis() >
            nowMs
        ) {
          return {
            status: 'cooldown',

            retryAfterSeconds: Math.max(
              1,
              Math.ceil(
                (
                  current.resendAvailableAt
                    .toMillis() - nowMs
                ) / 1000
              )
            ),
          } as const;
        }

        const limit =
          await prepareEmailOtpRateLimit(
            transaction,
            adminDb,
            {
              action: 'send',

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
          } as const;
        }

        const pending =
          createPendingEmailOtpChallenge({
            uid: account.uid,

            email: account.email,

            authAccountCreatedAt:
              account.authAccountCreatedAt,

            challengeId,

            codeDigest,

            nowMs,
          });

        parseEmailOtpChallenge(
          account.uid,
          pending
        );

        // All reservation reads and preparation
        // are complete. The revocation helper
        // performs its own remaining reads before
        // applying any transaction writes.
        if (staleAuthority) {
          const revocation =
            await revokeTransactionalEmailVerification({
              transaction,
              db: adminDb,
              uid: account.uid,
              publicationPolicy: 'remove',
            });

          if (
            revocation.authorityRevoked !== true ||
            revocation.invalidAuthorityRemoved
          ) {
            throw new Error(
              'STALE_EMAIL_AUTHORITY_REVOCATION_FAILED'
            );
          }
        }

        // No transaction reads below this point.
        limit.apply();

        // Replace the previous challenge.
        // Its code can no longer be verified.
        transaction.set(
          challengeRef,
          pending
        );

        return {
          status: 'reserved',
        } as const;
      }
    );

  if (reservation.status !== 'reserved') {
    return reservation;
  }

  let outcome: DeliveryOutcome;

  try {
    // Recheck account state before sending.
    // No client-supplied email is used.
    const currentAuth =
      await adminAuth.getUser(account.uid);

    if (
      currentAuth.uid !== account.uid ||
      currentAuth.disabled ||
      currentAuth.email !== account.authEmail ||
      normalizeAuthAccountCreatedAt(
        currentAuth.metadata.creationTime
      ) !== account.authAccountCreatedAt ||
      currentAuth.emailVerified
    ) {
      return finalizeEmailOtpDelivery(
        account.uid,
        account.lifecycleFence,
        challengeId,
        { status: 'delivery_failed' }
      );
    }

    const currentAccount =
      await requireEmailOtpAccount(idToken);

    if (
      currentAccount.uid !== account.uid ||
      currentAccount.authEmail !==
        account.authEmail ||
      currentAccount.authAccountCreatedAt !==
        account.authAccountCreatedAt ||
      currentAccount.lifecycleFence !==
        account.lifecycleFence ||
      currentAccount.emailVerified
    ) {
      return finalizeEmailOtpDelivery(
        account.uid,
        account.lifecycleFence,
        challengeId,
        { status: 'delivery_failed' }
      );
    }

    const currentSnapshot =
      await challengeRef.get();

    if (!currentSnapshot.exists) {
      return { status: 'superseded' };
    }

    const currentChallenge =
      parseEmailOtpChallenge(
        account.uid,
        currentSnapshot.data()
      );

    if (
      currentChallenge.challengeId !==
        challengeId ||
      currentChallenge.status !==
        'pending_delivery'
    ) {
      return { status: 'superseded' };
    }

    if (
      currentChallenge.expiresAt.toMillis() <=
        Date.now()
    ) {
      return finalizeEmailOtpDelivery(
        account.uid,
        account.lifecycleFence,
        challengeId,
        { status: 'delivery_failed' }
      );
    }

    const delivery = await sendEmailOtp({
      email: account.email,

      code,

      challengeId,
    });

    outcome = {
      status: 'accepted',

      providerEmailId:
        delivery.providerEmailId,
    };

  } catch (error: unknown) {
    outcome = {
      status:
        error instanceof EmailOtpDeliveryError &&
        error.outcome === 'not_sent'
          ? 'delivery_failed'
          : 'delivery_uncertain',
    };
  }

  return finalizeEmailOtpDelivery(
    account.uid,
    account.lifecycleFence,
    challengeId,
    outcome
  );
}
