import 'server-only';

import {
  assertEmailOtpLifecycleFence,
} from './email-otp-lifecycle-fence.service';

import type {
  UserRecord,
} from 'firebase-admin/auth';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION,
  normalizeAuthAccountCreatedAt,
  requireExactVerificationEmail,
} from '@/lib/email-verification';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

import {
  assertGlobalAccountNotSuspended,
} from '@/services/account-suspension-guard.service';

import {
  resolveLegacyStartupStatus,
} from '@/lib/legacy-startup-profile';

import {
  parseAccountEmailVerification,
  matchesAccountEmailVerificationBinding,
} from './account-email-verification-schema';

import {
  requireEmailOtpAccount,
  type EmailOtpAccount,
} from './email-otp-account.service';

export type EffectiveEmailVerification =
  | {
      emailVerified: true;

      source:
        | 'firebase_auth'
        | 'tabstartup_otp';
    }
  | {
      emailVerified: false;

      source: 'none';

      reason:
        | 'account_not_active'
        | 'email_missing'
        | 'email_invalid'
        | 'verification_missing'
        | 'verification_revoked'
        | 'authority_binding_mismatch'
        | 'binding_mismatch'
        | 'verification_invalid';
    };

type UnverifiedReason = Extract<
  EffectiveEmailVerification,
  { emailVerified: false }
>['reason'];

function unverified(
  reason: UnverifiedReason
): EffectiveEmailVerification {
  return {
    emailVerified: false,

    source: 'none',

    reason,
  };
}

/**
 * Evaluate trusted Auth state and an authority
 * record without performing database operations.
 *
 * The caller must provide a trusted UserRecord
 * obtained from Firebase Admin Auth.
 *
 * accountActive must be established independently.
 *
 * This function grants no role, admin permission,
 * portal access or publication authorization.
 */
export function evaluateEffectiveEmailVerification(
  input: {
    uid: string;
    authUser: UserRecord;
    accountActive: boolean;
    authorityRecord: unknown;
    nowMs: number;
  }
): EffectiveEmailVerification {
  assertValidAccountUid(input.uid);

  if (
    input.accountActive !== true ||
    input.authUser.uid !== input.uid ||
    input.authUser.disabled !== false
  ) {
    return unverified('account_not_active');
  }

  if (
    !Number.isSafeInteger(input.nowMs) ||
    input.nowMs <= 0
  ) {
    throw new Error(
      'INVALID_EMAIL_VERIFICATION_CLOCK'
    );
  }

  if (!input.authUser.email) {
    return unverified('email_missing');
  }

  let email: string;

  try {
    email = requireExactVerificationEmail(
      input.authUser.email
    );
  } catch {
    return unverified('email_invalid');
  }

  // Preserve native Firebase verification for
  // existing users. Custom verification does
  // not modify this native Auth property.
  if (input.authUser.emailVerified === true) {
    return {
      emailVerified: true,

      source: 'firebase_auth',
    };
  }

  if (
    input.authorityRecord === null ||
    input.authorityRecord === undefined
  ) {
    return unverified('verification_missing');
  }

  try {
    const authAccountCreatedAt =
      normalizeAuthAccountCreatedAt(
        input.authUser.metadata.creationTime
      );

    const authority =
      parseAccountEmailVerification(
        input.uid,
        input.authorityRecord
      );

    if (
      authority.updatedAt.toMillis() >
        input.nowMs ||

      authority.verifiedAt.toMillis() >
        input.nowMs
    ) {
      return unverified('verification_invalid');
    }

    if (authority.status === 'revoked') {
      return unverified('verification_revoked');
    }

    if (
      !matchesAccountEmailVerificationBinding(
        authority,
        {
          uid: input.uid,
          email,
          authAccountCreatedAt,
        }
      )
    ) {
      return unverified('authority_binding_mismatch');
    }

    return {
      emailVerified: true,

      source: 'tabstartup_otp',
    };

  } catch {
    return unverified('verification_invalid');
  }
}

/**
 * Internal read-only resolver.
 *
 * This is not an authenticated public API.
 * Callers must independently authorize access
 * to the target account.
 *
 * Do not use effective verification as a
 * replacement for native Auth admin checks.
 */
export async function resolveEffectiveEmailVerification(
  uid: string,
  expectedAccount?: EmailOtpAccount
): Promise<EffectiveEmailVerification> {
  assertValidAccountUid(uid);

  const {
    adminAuth,
    adminDb,
  } = getFirebaseAdmin();

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
        return null;
      }

      throw error;
    });

  if (
    !authUser ||
    authUser.uid !== uid ||
    authUser.disabled !== false
  ) {
    return unverified('account_not_active');
  }

  if (expectedAccount) {
    if (
      expectedAccount.uid !== uid ||
      authUser.email !== expectedAccount.email ||
      normalizeAuthAccountCreatedAt(
        authUser.metadata.creationTime
      ) !== expectedAccount.authAccountCreatedAt ||
      authUser.emailVerified !==
        expectedAccount.emailVerified
    ) {
      return unverified('binding_mismatch');
    }
  }

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const startupRef = adminDb
    .collection('users')
    .doc(uid);

  const authorityRef = adminDb
    .collection(
      ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION
    )
    .doc(uid);

  return adminDb.runTransaction(
    async transaction => {
      const [
        identitySnap,
        startupSnap,
        authoritySnap,
      ] = await transaction.getAll(
        identityRef,
        startupRef,
        authorityRef
      );

      // Invalid or suspended identity state
      // must never produce verified access.
      try {
        assertGlobalAccountNotSuspended(
          uid,
          identitySnap
        );
      } catch {
        return unverified('account_not_active');
      }

      if (expectedAccount) {
        assertEmailOtpLifecycleFence(
          uid,
          expectedAccount.lifecycleFence,
          identitySnap
        );
      }

      if (
        startupSnap.exists &&
        resolveLegacyStartupStatus(
          uid,
          startupSnap.data()
        ) !== 'active'
      ) {
        return unverified('account_not_active');
      }

      return evaluateEffectiveEmailVerification({
        uid,

        authUser,

        accountActive: true,

        authorityRecord:
          authoritySnap.exists
            ? authoritySnap.data()
            : null,

        nowMs: Date.now(),
      });
    },
    {
      readOnly: true,
    }
  );
}

/**
 * Resolve the authenticated caller's verification.
 *
 * The caller cannot choose the target UID or email.
 * A fresh account check is performed after reading
 * the verification authority.
 *
 * Auth and Firestore are separate systems:
 * these checks do not create a cross-system
 * atomic transaction.
 */
export async function resolveOwnEmailVerification(
  idToken: string
): Promise<EffectiveEmailVerification> {
  const before =
    await requireEmailOtpAccount(idToken);

  const result =
    await resolveEffectiveEmailVerification(
      before.uid,
      before
    );

  const after =
    await requireEmailOtpAccount(idToken);

  if (
    before.uid !== after.uid ||

    before.email !== after.email ||

    before.authAccountCreatedAt !==
      after.authAccountCreatedAt ||

    before.lifecycleFence !==
      after.lifecycleFence ||

    before.emailVerified !== after.emailVerified
  ) {
    return unverified('binding_mismatch');
  }

  if (
    result.emailVerified &&
    result.source === 'firebase_auth' &&
    after.emailVerified !== true
  ) {
    return unverified('binding_mismatch');
  }

  return result;
}
