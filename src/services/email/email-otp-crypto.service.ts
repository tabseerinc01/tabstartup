import 'server-only';

import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { isIP } from 'node:net';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

import {
  isValidEmailOtp,
  normalizeVerificationEmail,
  requireExactVerificationEmail,
  normalizeAuthAccountCreatedAt,
  type EmailVerificationRateLimitAction,
  type EmailVerificationRateLimitScope,
} from '@/lib/email-verification';

function getOtpSecret(): Buffer {
  const raw = process.env.EMAIL_OTP_SECRET;

  // Require a dedicated 256-bit secret,
  // represented by exactly 64 hexadecimal characters.
  if (
    typeof raw !== 'string' ||
    !/^[a-fA-F0-9]{64}$/.test(raw)
  ) {
    throw new Error('EMAIL_OTP_SECRET_INVALID');
  }

  return Buffer.from(raw, 'hex');
}

export function isEmailOtpEnabled(): boolean {
  return process.env.EMAIL_OTP_ENABLED === 'true';
}

function digest(parts: readonly string[]): string {
  return createHmac('sha256', getOtpSecret())
    .update(JSON.stringify(parts), 'utf8')
    .digest('hex');
}

export function generateEmailOtp(): string {
  return randomInt(0, 1000000)
    .toString()
    .padStart(6, '0');
}

export function generateEmailOtpChallengeId(): string {
  return randomBytes(32).toString('hex');
}

export function createEmailOtpDigest(
  uid: string,
  email: string,
  challengeId: string,
  code: string,
  authAccountCreatedAt: string
): string {
  assertValidAccountUid(uid);

  const normalizedEmail =
    requireExactVerificationEmail(email);

  if (
    typeof challengeId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(challengeId) ||
    !isValidEmailOtp(code)
  ) {
    throw new Error('INVALID_EMAIL_OTP_INPUT');
  }

  return digest([
    'tabstartup:email-otp:v2',
    normalizeAuthAccountCreatedAt(
      authAccountCreatedAt
    ),
    uid,
    normalizedEmail,
    challengeId,
    code,
  ]);
}

export function verifyEmailOtpDigest(
  expectedDigest: string,
  uid: string,
  email: string,
  challengeId: string,
  code: string,
  authAccountCreatedAt: string
): boolean {
  if (
    typeof expectedDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(expectedDigest) ||
    !isValidEmailOtp(code)
  ) {
    return false;
  }

  const actualDigest = createEmailOtpDigest(
    uid,
    email,
    challengeId,
    code,
          authAccountCreatedAt
  );

  return timingSafeEqual(
    Buffer.from(expectedDigest, 'hex'),
    Buffer.from(actualDigest, 'hex')
  );
}

export function createEmailOtpRateLimitKey(
  action: EmailVerificationRateLimitAction,
  scope: EmailVerificationRateLimitScope,
  value: string
): string {
  if (action !== 'send' && action !== 'verify') {
    throw new Error('INVALID_EMAIL_OTP_RATE_ACTION');
  }

  let normalizedValue: string;

  switch (scope) {
    case 'uid':
      assertValidAccountUid(value);
      normalizedValue = value;
      break;

    case 'email':
      normalizedValue =
        normalizeVerificationEmail(value);
      break;

    case 'ip':
      if (typeof value !== 'string' || !isIP(value)) {
        throw new Error('INVALID_CLIENT_IP');
      }

      // Canonicalize equivalent IPv6 representations.
      normalizedValue =
        isIP(value) === 6
          ? new URL('http://[' + value + ']/')
              .hostname
              .slice(1, -1)
          : value;

      // Treat IPv4-mapped IPv6 addresses as IPv4.
      const mapped = normalizedValue.match(
        /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/
      );

      if (mapped) {
        const high = parseInt(mapped[1], 16);
        const low = parseInt(mapped[2], 16);

        normalizedValue = [
          high >> 8,
          high & 255,
          low >> 8,
          low & 255,
        ].join('.');
      }

      break;

    default:
      throw new Error('INVALID_EMAIL_OTP_RATE_SCOPE');
  }

  return digest([
    'tabstartup:email-otp-rate-limit:v1',
    action,
    scope,
    normalizedValue,
  ]);
}
