import 'server-only';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  ACCOUNT_EMAIL_VERIFICATION_SCHEMA_VERSION,
  normalizeAuthAccountCreatedAt,
  requireExactVerificationEmail,
  type AccountEmailVerificationStatus,
} from '@/lib/email-verification';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

export interface AccountEmailVerification {
  schemaVersion:
    typeof ACCOUNT_EMAIL_VERIFICATION_SCHEMA_VERSION;

  uid: string;

  verifiedEmail: string;

  authAccountCreatedAt: string;

  status: AccountEmailVerificationStatus;

  verificationMethod: 'email_otp';

  verificationChallengeId: string;

  verifiedAt: Timestamp;

  updatedAt: Timestamp;

  revokedAt: Timestamp | null;
}

export interface AccountEmailVerificationBinding {
  uid: string;

  email: string;

  authAccountCreatedAt: string;
}

const RECORD_FIELDS = new Set([
  'schemaVersion',
  'uid',
  'verifiedEmail',
  'authAccountCreatedAt',
  'status',
  'verificationMethod',
  'verificationChallengeId',
  'verifiedAt',
  'updatedAt',
  'revokedAt',
]);

function isChallengeId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{64}$/.test(value)
  );
}

function readTimestampMs(
  value: unknown
): number {
  if (!(value instanceof Timestamp)) {
    throw new Error(
      'INVALID_ACCOUNT_EMAIL_VERIFICATION_TIMESTAMP'
    );
  }

  const ms = value.toMillis();

  if (
    !Number.isSafeInteger(ms) ||
    ms <= 0
  ) {
    throw new Error(
      'INVALID_ACCOUNT_EMAIL_VERIFICATION_TIMESTAMP'
    );
  }

  return ms;
}

/**
 * Parse a trusted server-managed verification
 * record. Invalid records fail closed.
 */
export function parseAccountEmailVerification(
  uid: string,
  value: unknown
): AccountEmailVerification {
  assertValidAccountUid(uid);

  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      'INVALID_ACCOUNT_EMAIL_VERIFICATION'
    );
  }

  const data =
    value as Record<string, unknown>;

  const keys = Object.keys(data);

  if (
    keys.length !== RECORD_FIELDS.size ||
    keys.some(key => !RECORD_FIELDS.has(key))
  ) {
    throw new Error(
      'INVALID_ACCOUNT_EMAIL_VERIFICATION_FIELDS'
    );
  }

  if (
    data.schemaVersion !==
      ACCOUNT_EMAIL_VERIFICATION_SCHEMA_VERSION ||

    data.uid !== uid ||

    data.verificationMethod !== 'email_otp' ||

    (
      data.status !== 'verified' &&
      data.status !== 'revoked'
    ) ||

    !isChallengeId(
      data.verificationChallengeId
    )
  ) {
    throw new Error(
      'INVALID_ACCOUNT_EMAIL_VERIFICATION'
    );
  }

  const verifiedEmail =
    requireExactVerificationEmail(
      data.verifiedEmail
    );

  const authAccountCreatedAt =
    normalizeAuthAccountCreatedAt(
      data.authAccountCreatedAt
    );

  if (
    verifiedEmail !== data.verifiedEmail ||
    authAccountCreatedAt !==
      data.authAccountCreatedAt
  ) {
    throw new Error(
      'INVALID_ACCOUNT_EMAIL_VERIFICATION_BINDING'
    );
  }

  const verifiedMs =
    readTimestampMs(data.verifiedAt);

  const updatedMs =
    readTimestampMs(data.updatedAt);

  if (
    verifiedMs <
      Date.parse(authAccountCreatedAt) ||

    updatedMs < verifiedMs
  ) {
    throw new Error(
      'INVALID_ACCOUNT_EMAIL_VERIFICATION_TIMELINE'
    );
  }

  if (
    data.status === 'verified' &&
    data.revokedAt !== null
  ) {
    throw new Error(
      'INVALID_ACCOUNT_EMAIL_VERIFICATION_STATE'
    );
  }

  if (data.status === 'revoked') {
    const revokedMs =
      readTimestampMs(data.revokedAt);

    if (
      revokedMs < verifiedMs ||
      revokedMs > updatedMs
    ) {
      throw new Error(
        'INVALID_ACCOUNT_EMAIL_VERIFICATION_REVOCATION'
      );
    }
  }

  return data as unknown as
    AccountEmailVerification;
}

/**
 * Build a verification record for a validated
 * exclusive OTP claim.
 *
 * This helper does not write to Firestore.
 * The finalization service must establish claim
 * ownership, account eligibility and transaction
 * consistency before calling it.
 */
export function createAccountEmailVerification(
  input: AccountEmailVerificationBinding & {
    challengeId: string;
    nowMs: number;
  }
): AccountEmailVerification {
  assertValidAccountUid(input.uid);

  const verifiedEmail =
    requireExactVerificationEmail(
      input.email
    );

  const authAccountCreatedAt =
    normalizeAuthAccountCreatedAt(
      input.authAccountCreatedAt
    );

  if (
    !isChallengeId(input.challengeId) ||

    !Number.isSafeInteger(input.nowMs) ||

    input.nowMs <
      Date.parse(authAccountCreatedAt)
  ) {
    throw new Error(
      'INVALID_ACCOUNT_EMAIL_VERIFICATION_INPUT'
    );
  }

  const now =
    Timestamp.fromMillis(input.nowMs);

  const record: AccountEmailVerification = {
    schemaVersion:
      ACCOUNT_EMAIL_VERIFICATION_SCHEMA_VERSION,

    uid: input.uid,

    verifiedEmail,

    authAccountCreatedAt,

    status: 'verified',

    verificationMethod: 'email_otp',

    verificationChallengeId:
      input.challengeId,

    verifiedAt: now,

    updatedAt: now,

    revokedAt: null,
  };

  return parseAccountEmailVerification(
    input.uid,
    record
  );
}

/**
 * Compare the record against current Auth
 * account identity.
 *
 * This is only a binding check.
 * It does not grant account access, roles,
 * admin permissions or publication rights.
 *
 * The caller must separately enforce account
 * activity, suspension, feature policy and
 * lifecycle invalidation.
 */
export function matchesAccountEmailVerificationBinding(
  record: AccountEmailVerification,
  current: AccountEmailVerificationBinding
): boolean {
  const parsed =
    parseAccountEmailVerification(
      current.uid,
      record
    );

  return (
    parsed.status === 'verified' &&

    parsed.uid === current.uid &&

    parsed.verifiedEmail ===
      requireExactVerificationEmail(
        current.email
      ) &&

    parsed.authAccountCreatedAt ===
      normalizeAuthAccountCreatedAt(
        current.authAccountCreatedAt
      )
  );
}
