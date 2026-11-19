'use client';

import type { User } from 'firebase/auth';

export type EmailVerificationSource =
  | 'firebase_auth'
  | 'tabstartup_otp'
  | 'none';

export interface EmailVerificationStatus {
  emailVerified: boolean;
  source: EmailVerificationSource;
  otpEnabled: boolean;
}

export type EmailOtpActionResult =
  | {
      status: 'sent';
      expiresAtMs: number;
      resendAvailableAtMs: number;
    }
  | {
      status: 'verified' | 'already_verified';
    }
  | {
      status: 'failed';
      errorCode: string;
      retryAfterSeconds?: number;
      attemptsRemaining?: number;
    };

const API_BASE =
  '/api/auth/email-verification';

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isPositiveInteger(
  value: unknown
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

async function requestVerification(
  user: User,
  action: 'status' | 'send' | 'verify',
  signal: AbortSignal,
  code?: string
): Promise<{
  ok: boolean;
  data: Record<string, unknown>;
}> {
  const token = await user.getIdToken(true);

  if (signal.aborted) {
    throw new Error('REQUEST_CANCELLED');
  }

  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/json',
  };

  const options: RequestInit = {
    method: action === 'status' ? 'GET' : 'POST',
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    signal,
  };

  if (action !== 'status') {
    headers['Content-Type'] = 'application/json';

    options.body = JSON.stringify(
      action === 'verify'
        ? { code }
        : {}
    );
  }

  const response = await fetch(
    API_BASE + '/' + action,
    options
  );

  const data: unknown =
    await response.json();

  if (
    !isRecord(data) ||
    typeof data.success !== 'boolean'
  ) {
    throw new Error(
      'INVALID_VERIFICATION_RESPONSE'
    );
  }

  return {
    ok: response.ok,
    data,
  };
}

export async function fetchEmailVerificationStatus(
  user: User,
  signal: AbortSignal
): Promise<EmailVerificationStatus> {
  const { ok, data } =
    await requestVerification(
      user,
      'status',
      signal
    );

  if (
    !ok ||
    data.success !== true ||
    typeof data.emailVerified !== 'boolean' ||
    typeof data.otpEnabled !== 'boolean'
  ) {
    throw new Error(
      'VERIFICATION_STATUS_UNAVAILABLE'
    );
  }

  if (
    data.source !== 'firebase_auth' &&
    data.source !== 'tabstartup_otp' &&
    data.source !== 'none'
  ) {
    throw new Error(
      'INVALID_VERIFICATION_SOURCE'
    );
  }

  if (
    data.emailVerified !==
      (data.source !== 'none')
  ) {
    throw new Error(
      'INVALID_VERIFICATION_STATUS'
    );
  }

  return {
    emailVerified: data.emailVerified,
    source: data.source,
    otpEnabled: data.otpEnabled,
  };
}

function parseActionResult(
  ok: boolean,
  data: Record<string, unknown>,
  action: 'send' | 'verify'
): EmailOtpActionResult {
  if (ok && data.success === true) {
    if (
      data.status === 'already_verified' &&
      data.emailVerified === true
    ) {
      return {
        status: 'already_verified',
      };
    }

    if (
      action === 'verify' &&
      data.status === 'verified' &&
      data.emailVerified === true
    ) {
      return {
        status: 'verified',
      };
    }

    if (
      action === 'send' &&
      data.status === 'sent' &&
      isPositiveInteger(data.expiresAtMs) &&
      isPositiveInteger(data.resendAvailableAtMs) &&
      data.resendAvailableAtMs <= data.expiresAtMs
    ) {
      return {
        status: 'sent',
        expiresAtMs: data.expiresAtMs,
        resendAvailableAtMs:
          data.resendAvailableAtMs,
      };
    }

    throw new Error(
      'INVALID_VERIFICATION_RESPONSE'
    );
  }

  if (ok || data.success !== false) {
    throw new Error(
      'INVALID_VERIFICATION_RESPONSE'
    );
  }

  return {
    status: 'failed',

    errorCode:
      typeof data.status === 'string'
        ? data.status
        : 'temporarily_unavailable',

    retryAfterSeconds:
      isPositiveInteger(data.retryAfterSeconds)
        ? data.retryAfterSeconds
        : undefined,

    attemptsRemaining:
      typeof data.attemptsRemaining === 'number' &&
      Number.isInteger(data.attemptsRemaining) &&
      data.attemptsRemaining >= 0 &&
      data.attemptsRemaining <= 5
        ? data.attemptsRemaining
        : undefined,
  };
}

export async function sendEmailVerificationCode(
  user: User,
  signal: AbortSignal
): Promise<EmailOtpActionResult> {
  const { ok, data } =
    await requestVerification(
      user,
      'send',
      signal
    );

  return parseActionResult(
    ok,
    data,
    'send'
  );
}

export async function verifyEmailVerificationCode(
  user: User,
  code: string,
  signal: AbortSignal
): Promise<EmailOtpActionResult> {
  if (!/^[0-9]{6}$/.test(code)) {
    throw new Error('INVALID_OTP_CODE');
  }

  const { ok, data } =
    await requestVerification(
      user,
      'verify',
      signal,
      code
    );

  return parseActionResult(
    ok,
    data,
    'verify'
  );
}
