import 'server-only';

import type {
  UserRecord,
} from 'firebase-admin/auth';

import type {
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

import {
  ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION,
} from '@/lib/email-verification';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

import {
  evaluateEffectiveEmailVerification,
  type EffectiveEmailVerification,
} from './account-email-verification.service';

import {
  isEmailOtpEnabled,
} from './email-otp-crypto.service';

/**
 * Application-controlled lifecycle release policy.
 * External Auth lifecycle reconciliation remains pending.
 * OTP feature flag and authority validation remain mandatory.
 */
export function isCustomEmailVerificationPublicationReady(): boolean {
  return true;
}

export type TransactionEmailVerificationInput = {
  transaction: Transaction;
  db: Firestore;
  uid: string;
  authUser: UserRecord | null;
  accountActive: boolean;
};

export type TransactionEmailVerificationResult =
  | EffectiveEmailVerification
  | {
      emailVerified: false;
      source: 'none';
      reason: 'publication_authority_disabled';
    };

/**
 * Resolve verification inside the caller's
 * existing Firestore transaction.
 *
 * Security contract:
 *
 * - The caller must independently authorize
 *   the requested operation.
 * - authUser must originate from Firebase Admin.
 * - accountActive must be established using
 *   the caller's transactional account reads.
 * - This helper must run before any transaction
 *   writes have been queued.
 * - The caller must not reuse this result outside
 *   the current transaction attempt.
 *
 * Reading the authority through the supplied
 * transaction protects against conflicting
 * Firestore authority updates.
 *
 * This does not make Firebase Auth and
 * Firestore a cross-system atomic transaction.
 *
 * No writes, role grants, portal grants,
 * native Auth mutations or automatic
 * publication are performed here.
 */
export async function readTransactionalEmailVerification(
  input: TransactionEmailVerificationInput
): Promise<TransactionEmailVerificationResult> {
  assertValidAccountUid(input.uid);

  if (typeof input.accountActive !== 'boolean') {
    throw new Error(
      'INVALID_TRANSACTION_VERIFICATION_CONTEXT'
    );
  }

  if (
    input.accountActive !== true ||
    !input.authUser ||
    input.authUser.uid !== input.uid ||
    input.authUser.disabled !== false
  ) {
    return {
      emailVerified: false,
      source: 'none',
      reason: 'account_not_active',
    };
  }

  const authorityRef = input.db
    .collection(
      ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION
    )
    .doc(input.uid);

  // This must use the caller's transaction.
  // Never replace with authorityRef.get()
  // or a separate read-only transaction.
  const authoritySnap =
    await input.transaction.get(authorityRef);

  if (
    authoritySnap.id !== input.uid ||
    authoritySnap.ref.path !== authorityRef.path
  ) {
    throw new Error(
      'EMAIL_VERIFICATION_AUTHORITY_PATH_MISMATCH'
    );
  }

  const result =
    evaluateEffectiveEmailVerification({
      uid: input.uid,

      authUser: input.authUser,

      accountActive: input.accountActive,

      authorityRecord:
        authoritySnap.exists
          ? authoritySnap.data()
          : null,

      nowMs: Date.now(),
    });

  // Preserve independently verified native
  // Firebase accounts.
  if (
    result.emailVerified &&
    result.source === 'firebase_auth'
  ) {
    return result;
  }

  // Custom verification cannot authorize
  // professional publication until both
  // the OTP feature and release gate permit it.
  if (
    result.emailVerified &&
    result.source === 'tabstartup_otp' &&
    (
      !isEmailOtpEnabled() ||
      !isCustomEmailVerificationPublicationReady()
    )
  ) {
    return {
      emailVerified: false,
      source: 'none',
      reason: 'publication_authority_disabled',
    };
  }

  return result;
}
