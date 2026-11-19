import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import {
  EMAIL_VERIFICATION_SCHEMA_VERSION,
  EMAIL_OTP_POLICY,
  requireExactVerificationEmail,
  normalizeAuthAccountCreatedAt,
  type EmailVerificationChallengeStatus,
} from '@/lib/email-verification';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

export interface EmailOtpChallenge {
  schemaVersion:
    typeof EMAIL_VERIFICATION_SCHEMA_VERSION;

  uid: string;

  email: string;

  authAccountCreatedAt: string;

  challengeId: string;

  status: EmailVerificationChallengeStatus;

  codeDigest: string | null;

  attempts: number;

  createdAt: Timestamp;

  updatedAt: Timestamp;

  expiresAt: Timestamp;

  resendAvailableAt: Timestamp;

  deliveryAcceptedAt: Timestamp | null;

  providerEmailId: string | null;

  verificationClaimId: string | null;

  verificationClaimedAt: Timestamp | null;

  consumedAt: Timestamp | null;
}

export interface EmailOtpRateLimitDocument {
  schemaVersion:
    typeof EMAIL_VERIFICATION_SCHEMA_VERSION;

  count: number;

  expiresAt: Timestamp;

  updatedAt: Timestamp;
}

const VALID_STATUSES =
  new Set<EmailVerificationChallengeStatus>([
    'pending_delivery',
    'active',
    'verifying',
    'consumed',
    'delivery_failed',
    'delivery_uncertain',
    'expired',
    'locked',
    'superseded',
    'requires_review',
  ]);

function isHexDigest(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{64}$/.test(value)
  );
}

function isNullableTimestamp(
  value: unknown
): boolean {
  return (
    value === null ||
    value instanceof Timestamp
  );
}

export function createPendingEmailOtpChallenge(
  input: {
    uid: string;
    email: string;
    authAccountCreatedAt: string;
    challengeId: string;
    codeDigest: string;
    nowMs: number;
  }
): EmailOtpChallenge {
  assertValidAccountUid(input.uid);

  const email =
    requireExactVerificationEmail(input.email);

  const authAccountCreatedAt =
    normalizeAuthAccountCreatedAt(
      input.authAccountCreatedAt
    );

  if (
    !isHexDigest(input.challengeId) ||
    !isHexDigest(input.codeDigest) ||
    !Number.isSafeInteger(input.nowMs) ||
    input.nowMs <= 0 ||
    input.nowMs < Date.parse(authAccountCreatedAt)
  ) {
    throw new Error('INVALID_EMAIL_OTP_CHALLENGE');
  }

  const now = Timestamp.fromMillis(input.nowMs);

  return {
    schemaVersion:
      EMAIL_VERIFICATION_SCHEMA_VERSION,

    uid: input.uid,
    email,
    authAccountCreatedAt,
    challengeId: input.challengeId,

    status: 'pending_delivery',

    codeDigest: input.codeDigest,

    attempts: 0,

    createdAt: now,
    updatedAt: now,

    expiresAt: Timestamp.fromMillis(
      input.nowMs + EMAIL_OTP_POLICY.validityMs
    ),

    resendAvailableAt: Timestamp.fromMillis(
      input.nowMs +
        EMAIL_OTP_POLICY.resendCooldownMs
    ),

    deliveryAcceptedAt: null,
    providerEmailId: null,

    verificationClaimId: null,
    verificationClaimedAt: null,

    consumedAt: null,
  };
}

export function parseEmailOtpChallenge(
  uid: string,
  value: unknown
): EmailOtpChallenge {
  assertValidAccountUid(uid);

  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error('INVALID_EMAIL_OTP_CHALLENGE');
  }

  const data =
    value as Record<string, unknown>;

  if (
    data.schemaVersion !==
      EMAIL_VERIFICATION_SCHEMA_VERSION ||

    data.uid !== uid ||

    typeof data.email !== 'string' ||

    requireExactVerificationEmail(data.email) !==
      data.email ||

    normalizeAuthAccountCreatedAt(
      data.authAccountCreatedAt
    ) !== data.authAccountCreatedAt ||

    !isHexDigest(data.challengeId) ||

    typeof data.status !== 'string' ||

    !VALID_STATUSES.has(
      data.status as EmailVerificationChallengeStatus
    ) ||

    (
      data.codeDigest !== null &&
      !isHexDigest(data.codeDigest)
    ) ||

    typeof data.attempts !== 'number' ||

    !Number.isSafeInteger(data.attempts) ||

    data.attempts < 0 ||

    data.attempts >
      EMAIL_OTP_POLICY.maxAttemptsPerChallenge ||

    !(data.createdAt instanceof Timestamp) ||

    !(data.updatedAt instanceof Timestamp) ||

    !(data.expiresAt instanceof Timestamp) ||

    !(data.resendAvailableAt instanceof Timestamp) ||

    !isNullableTimestamp(data.deliveryAcceptedAt) ||

    !isNullableTimestamp(data.verificationClaimedAt) ||

    !isNullableTimestamp(data.consumedAt) ||

    (
      data.providerEmailId !== null &&
      (
        typeof data.providerEmailId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,200}$/.test(
          data.providerEmailId
        )
      )
    ) ||

    (
      data.verificationClaimId !== null &&
      !isHexDigest(data.verificationClaimId)
    )
  ) {
    throw new Error('INVALID_EMAIL_OTP_CHALLENGE');
  }

  const challenge =
    data as unknown as EmailOtpChallenge;

  const createdMs =
    challenge.createdAt.toMillis();

  if (
    createdMs <
      Date.parse(challenge.authAccountCreatedAt) ||

    challenge.updatedAt.toMillis() < createdMs ||

    challenge.expiresAt.toMillis() !==
      createdMs + EMAIL_OTP_POLICY.validityMs ||

    challenge.resendAvailableAt.toMillis() !==
      createdMs +
        EMAIL_OTP_POLICY.resendCooldownMs
  ) {
    throw new Error('INVALID_EMAIL_OTP_TIMESTAMPS');
  }

  const requiresDigest =
    challenge.status === 'pending_delivery' ||
    challenge.status === 'active';

  if (
    requiresDigest &&
    !isHexDigest(challenge.codeDigest)
  ) {
    throw new Error('INVALID_EMAIL_OTP_DIGEST_STATE');
  }

  if (
    !requiresDigest &&
    challenge.codeDigest !== null
  ) {
    throw new Error('INVALID_EMAIL_OTP_DIGEST_STATE');
  }

  if (
    challenge.status === 'active' &&
    (
      !challenge.deliveryAcceptedAt ||
      !challenge.providerEmailId ||
      challenge.attempts >=
        EMAIL_OTP_POLICY.maxAttemptsPerChallenge
    )
  ) {
    throw new Error('INVALID_EMAIL_OTP_ACTIVE_STATE');
  }

  if (
    challenge.status === 'verifying' &&
    (
      !challenge.verificationClaimId ||
      !challenge.verificationClaimedAt ||
      !challenge.deliveryAcceptedAt ||
      !challenge.providerEmailId
    )
  ) {
    throw new Error('INVALID_EMAIL_OTP_CLAIM_STATE');
  }

  if (
    challenge.status === 'consumed' &&
    !challenge.consumedAt
  ) {
    throw new Error('INVALID_EMAIL_OTP_CONSUMED_STATE');
  }

  return challenge;
}
