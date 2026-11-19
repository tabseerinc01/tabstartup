/**
 * Global account email verification.
 *
 * Firebase Auth provides account identity.
 * TabStartup manages its own OTP verification
 * authority without modifying native Auth state.
 *
 * These constants do not grant portal access,
 * professional roles or publication permission.
 */

export const EMAIL_VERIFICATION_SCHEMA_VERSION = 1;

export const EMAIL_VERIFICATION_CHALLENGES_COLLECTION =
  'emailVerificationChallenges';

export const EMAIL_VERIFICATION_RATE_LIMITS_COLLECTION =
  'emailVerificationRateLimits';

export const EMAIL_OTP_POLICY = Object.freeze({
  codeLength: 6,

  validityMs: 10 * 60 * 1000,

  resendCooldownMs: 60 * 1000,

  maxAttemptsPerChallenge: 5,

  verificationClaimValidityMs: 60 * 1000,

  rateLimitWindowMs: 60 * 60 * 1000,

  maxSendPerUid: 5,
  maxSendPerEmail: 5,
  maxSendPerIp: 30,

  maxVerifyPerUid: 15,
  maxVerifyPerEmail: 15,
  maxVerifyPerIp: 60,
});

export type EmailVerificationChallengeStatus =
  | 'pending_delivery'
  | 'active'
  | 'verifying'
  | 'consumed'
  | 'delivery_failed'
  | 'delivery_uncertain'
  | 'expired'
  | 'locked'
  | 'superseded'
  | 'requires_review';

export type EmailVerificationRateLimitScope =
  | 'uid'
  | 'email'
  | 'ip';

export type EmailVerificationRateLimitAction =
  | 'send'
  | 'verify';

export function isValidEmailOtp(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length === EMAIL_OTP_POLICY.codeLength &&
    /^[0-9]{6}$/.test(value)
  );
}

export function normalizeVerificationEmail(
  value: unknown
): string {
  if (
    typeof value !== 'string' ||
    value.length > 254 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error('INVALID_VERIFICATION_EMAIL');
  }

  const email = value.trim().toLowerCase();

  if (
    !email ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
  ) {
    throw new Error('INVALID_VERIFICATION_EMAIL');
  }

  return email;
}


/**
 * Validate an authoritative Auth email without
 * changing its case or destination.
 *
 * Normalization is reserved for rate limiting
 * and abuse prevention.
 */
export function requireExactVerificationEmail(
  value: unknown
): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim()
  ) {
    throw new Error('INVALID_VERIFICATION_EMAIL');
  }

  normalizeVerificationEmail(value);

  return value;
}


export const ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION =
  'accountEmailVerifications';

export const ACCOUNT_EMAIL_VERIFICATION_SCHEMA_VERSION = 1;

export type AccountEmailVerificationStatus =
  | 'verified'
  | 'revoked';

/**
 * Validate the Firebase Auth account creation
 * timestamp and convert it to a stable UTC value.
 *
 * This is a lifecycle binding component,
 * not a standalone identity guarantee.
 */
export function normalizeAuthAccountCreatedAt(
  value: unknown
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 100 ||
    value !== value.trim()
  ) {
    throw new Error(
      'INVALID_AUTH_ACCOUNT_CREATION_TIME'
    );
  }

  const timestamp = Date.parse(value);

  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0
  ) {
    throw new Error(
      'INVALID_AUTH_ACCOUNT_CREATION_TIME'
    );
  }

  const date = new Date(timestamp);

  const canonical = date.toISOString();

  if (
    value !== canonical &&
    value !== date.toUTCString()
  ) {
    throw new Error(
      'INVALID_AUTH_ACCOUNT_CREATION_TIME'
    );
  }

  return canonical;
}
