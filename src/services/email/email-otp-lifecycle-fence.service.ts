import 'server-only';

import type {
  DocumentSnapshot,
} from 'firebase-admin/firestore';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

import {
  assertGlobalAccountNotSuspended,
} from '@/services/account-suspension-guard.service';

/**
 * Firestore document version fence.
 *
 * This is an operation-level concurrency guard.
 * It is not a Firebase Auth lifecycle identifier.
 *
 * Preserve nanosecond precision. Do not convert
 * updateTime to milliseconds or a Date.
 */
export type EmailOtpLifecycleFence =
  | 'missing'
  | string;

export function captureEmailOtpLifecycleFence(
  uid: string,
  snapshot: DocumentSnapshot
): EmailOtpLifecycleFence {
  assertValidAccountUid(uid);

  const expectedPath =
    ACCOUNT_IDENTITIES_COLLECTION + '/' + uid;

  if (
    snapshot.id !== uid ||
    snapshot.ref.path !== expectedPath
  ) {
    throw new Error(
      'EMAIL_OTP_LIFECYCLE_PATH_MISMATCH'
    );
  }

  assertGlobalAccountNotSuspended(
    uid,
    snapshot
  );

  if (!snapshot.exists) {
    return 'missing';
  }

  const version = snapshot.updateTime;

  if (
    !version ||
    !Number.isSafeInteger(version.seconds) ||
    version.seconds <= 0 ||
    !Number.isInteger(version.nanoseconds) ||
    version.nanoseconds < 0 ||
    version.nanoseconds >= 1000000000
  ) {
    throw new Error(
      'INVALID_EMAIL_OTP_LIFECYCLE_VERSION'
    );
  }

  return (
    String(version.seconds) +
    ':' +
    String(version.nanoseconds)
      .padStart(9, '0')
  );
}

export function assertEmailOtpLifecycleFence(
  uid: string,
  expected: EmailOtpLifecycleFence,
  snapshot: DocumentSnapshot
): void {
  if (
    typeof expected !== 'string' ||
    (
      expected !== 'missing' &&
      !/^[1-9][0-9]*:[0-9]{9}$/.test(expected)
    )
  ) {
    throw new Error(
      'INVALID_EMAIL_OTP_LIFECYCLE_FENCE'
    );
  }

  const current =
    captureEmailOtpLifecycleFence(
      uid,
      snapshot
    );

  if (current !== expected) {
    throw new Error(
      'EMAIL_OTP_AUTH_REFRESH_REQUIRED'
    );
  }
}
