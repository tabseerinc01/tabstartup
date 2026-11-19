import 'server-only';

import { NextResponse } from 'next/server';

import {
  readBoundedJson,
} from '@/lib/bounded-request-body';

import {
  getTrustedClientIp,
} from '@/lib/trusted-client-ip';

import {
  isValidEmailOtp,
} from '@/lib/email-verification';

import {
  isEmailOtpEnabled,
} from './email-otp-crypto.service';

export function otpApiResponse(
  body: Record<string, unknown>,
  status: number = 200,
  retryAfterSeconds?: number
) {
  const headers: Record<string, string> = {
    'Cache-Control':
      'private, no-store, max-age=0',

    'Vary': 'Authorization',

    'X-Content-Type-Options': 'nosniff',
  };

  if (
    retryAfterSeconds !== undefined &&
    Number.isSafeInteger(retryAfterSeconds) &&
    retryAfterSeconds > 0
  ) {
    headers['Retry-After'] =
      String(retryAfterSeconds);
  }

  return NextResponse.json(body, {
    status,
    headers,
  });
}

export function requireOtpApiToken(
  request: Request
): string {
  const authorization =
    request.headers.get('authorization');

  if (
    !authorization ||
    authorization.length > 16391 ||
    !authorization.startsWith('Bearer ')
  ) {
    throw new Error('UNAUTHENTICATED');
  }

  const token =
    authorization.slice(7);

  if (
    !token ||
    token.length > 16384 ||
    token !== token.trim() ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  ) {
    throw new Error('UNAUTHENTICATED');
  }

  return token;
}

export function requireOtpApiEnabled(): void {
  if (!isEmailOtpEnabled()) {
    throw new Error('EMAIL_OTP_DISABLED');
  }
}

export function requireOtpApiTrustedIp(
  request: Request
): string {
  return getTrustedClientIp(request);
}

async function readOtpObject(
  request: Request
): Promise<Record<string, unknown>> {
  const body: unknown =
    await readBoundedJson(request, 1024);

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new Error('INVALID_OTP_REQUEST');
  }

  return body as Record<string, unknown>;
}

export async function validateOtpSendRequest(
  request: Request
): Promise<void> {
  const body = await readOtpObject(request);

  // Send accepts an empty JSON object only.
  // No caller-selected UID, email or destination.
  if (Object.keys(body).length !== 0) {
    throw new Error('INVALID_OTP_REQUEST');
  }
}

export async function readOtpVerifyCode(
  request: Request
): Promise<string> {
  const body = await readOtpObject(request);

  if (
    Object.keys(body).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(
      body,
      'code'
    ) ||
    !isValidEmailOtp(body.code)
  ) {
    throw new Error('INVALID_EMAIL_OTP_CODE');
  }

  return body.code;
}

/**
 * Map only known errors to public responses.
 *
 * Never expose provider errors, raw exception
 * messages, tokens, OTPs or internal claim data.
 */
export function otpApiError(
  error: unknown
) {
  const code =
    error instanceof Error
      ? error.message
      : '';

  switch (code) {
    case 'UNAUTHENTICATED':
      return otpApiResponse({
        success: false,
        status: 'unauthenticated',
      }, 401);

    case 'ACCOUNT_NOT_ACTIVE':
    case 'EMAIL_OTP_ACCOUNT_NOT_ELIGIBLE':
    case 'ACCOUNT_SUSPENDED':
      return otpApiResponse({
        success: false,
        status: 'account_not_eligible',
      }, 403);

    case 'EMAIL_OTP_AUTH_REFRESH_REQUIRED':
      return otpApiResponse({
        success: false,
        status: 'auth_refresh_required',
      }, 409);

    case 'EMAIL_OTP_DISABLED':
      return otpApiResponse({
        success: false,
        status: 'disabled',
      }, 503);

    case 'REQUEST_TOO_LARGE':
      return otpApiResponse({
        success: false,
        status: 'request_too_large',
      }, 413);

    case 'INVALID_CONTENT_TYPE':
      return otpApiResponse({
        success: false,
        status: 'invalid_content_type',
      }, 415);

    case 'INVALID_EMAIL_OTP_CODE':
    case 'INVALID_OTP_REQUEST':
    case 'INVALID_JSON':
      return otpApiResponse({
        success: false,
        status: 'invalid_request',
      }, 400);

    default:
      console.error(
        '[email-verification] Request failed'
      );

      return otpApiResponse({
        success: false,
        status: 'temporarily_unavailable',
      }, 503);
  }
}
