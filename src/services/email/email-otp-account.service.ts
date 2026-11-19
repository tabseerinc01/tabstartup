import 'server-only';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  captureEmailOtpLifecycleFence,
  type EmailOtpLifecycleFence,
} from './email-otp-lifecycle-fence.service';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  resolveAccountAuthorization,
} from '@/services/account-authorization.service';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

import {
  requireExactVerificationEmail,
  normalizeAuthAccountCreatedAt,
} from '@/lib/email-verification';

export interface EmailOtpAccount {
  uid: string;

  email: string;

  authEmail: string;

  authAccountCreatedAt: string;

  lifecycleFence: EmailOtpLifecycleFence;

  emailVerified: boolean;
}

/**
 * Authenticate the caller and read current
 * authoritative Firebase Auth state.
 *
 * Never accept a client-supplied UID or email
 * as the verification destination.
 */
export async function requireEmailOtpAccount(
  idToken: string
): Promise<EmailOtpAccount> {
  if (
    typeof idToken !== 'string' ||
    !idToken.trim()
  ) {
    throw new Error('UNAUTHENTICATED');
  }

  const { adminAuth, adminDb } = getFirebaseAdmin();

  const decoded = await adminAuth
    .verifyIdToken(idToken.trim(), true)
    .catch(() => {
      throw new Error('UNAUTHENTICATED');
    });

  assertValidAccountUid(decoded.uid);

  const authUser = await adminAuth
    .getUser(decoded.uid)
    .catch((error: unknown) => {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? error.code
          : undefined;

      if (code === 'auth/user-not-found') {
        throw new Error('ACCOUNT_NOT_ACTIVE');
      }

      throw error;
    });

  if (
    authUser.uid !== decoded.uid ||
    authUser.disabled ||
    !authUser.email
  ) {
    throw new Error('ACCOUNT_NOT_ACTIVE');
  }

  const email =
    requireExactVerificationEmail(authUser.email);

  if (
    typeof decoded.email !== 'string' ||
    decoded.email !== email
  ) {
    throw new Error('EMAIL_OTP_AUTH_REFRESH_REQUIRED');
  }

  const account =
    await resolveAccountAuthorization(
      authUser.uid,
      {
        email: authUser.email,

        emailVerified:
          authUser.emailVerified === true,
      }
    );

  if (
    account.uid !== authUser.uid ||
    account.identity.status !== 'active'
  ) {
    throw new Error('ACCOUNT_NOT_ACTIVE');
  }

  if (
    !account.portals.startup.allowed &&
    !account.portals.event_organizer.allowed
  ) {
    throw new Error('EMAIL_OTP_ACCOUNT_NOT_ELIGIBLE');
  }

  // Capture the current global identity version.
  // Transaction consumers must compare this version
  // before performing OTP writes.

  const identitySnap = await adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(authUser.uid)
    .get();

  const lifecycleFence =
    captureEmailOtpLifecycleFence(
      authUser.uid,
      identitySnap
    );

  return {
    uid: authUser.uid,

    lifecycleFence,

    email,

    authEmail: authUser.email,

    authAccountCreatedAt:
      normalizeAuthAccountCreatedAt(
        authUser.metadata.creationTime
      ),

    emailVerified:
      authUser.emailVerified === true,
  };
}
