import 'server-only';

import { NextResponse } from 'next/server';
import { readBoundedJson } from '@/lib/bounded-request-body';
import {
  isProfessionalProfileRole,
  type ProfessionalProfileRole,
} from '@/lib/profile-readiness';

export function profileApiResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Vary': 'Authorization',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function requireProfileApiToken(
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

  const token = authorization.slice(7);

  if (
    token.length > 16384 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  ) {
    throw new Error('UNAUTHENTICATED');
  }

  return token;
}

export async function readProfileApiRole(
  request: Request
): Promise<ProfessionalProfileRole> {
  const body = await readBoundedJson(request, 1024);

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(body, 'role')
  ) {
    throw new Error('INVALID_PROFILE_REQUEST');
  }

  const role = (body as Record<string, unknown>).role;

  if (!isProfessionalProfileRole(role)) {
    throw new Error('INVALID_PROFESSIONAL_ROLE');
  }

  return role;
}

export function profileApiError(error: unknown) {
  const code = error instanceof Error
    ? error.message
    : '';

  switch (code) {
    case 'UNAUTHENTICATED':
      return profileApiResponse({
        success: false,
        status: 'unauthenticated',
      }, 401);

    case 'ACCOUNT_NOT_ACTIVE':
    case 'ACCOUNT_SUSPENDED':
    case 'ACCOUNT_UNPROVISIONED':
    case 'STARTUP_PROFILE_REQUIRED':
    case 'EVENT_ORGANIZER_PROFILE_REQUIRED':
    case 'EVENT_ORGANIZER_PROFILE_SUSPENDED':
    case 'INVALID_EVENT_ORGANIZER_PROFILE':
    case 'USER_SUSPENDED':
    case 'INVALID_ACCOUNT_IDENTITY':
    case 'INVALID_STARTUP_PROFILE':
    case 'PORTAL_ACCESS_DENIED':
    case 'PROFESSIONAL_ROLE_NOT_ELIGIBLE':
      return profileApiResponse({
        success: false,
        status: 'not_eligible',
      }, 403);

    case 'USER_NOT_FOUND':
      return profileApiResponse({
        success: false,
        status: 'profile_not_found',
      }, 404);

    case 'REQUEST_TOO_LARGE':
      return profileApiResponse({
        success: false,
        status: 'request_too_large',
      }, 413);

    case 'INVALID_CONTENT_TYPE':
      return profileApiResponse({
        success: false,
        status: 'invalid_content_type',
      }, 415);

    case 'INVALID_PROFILE_REQUEST':
    case 'INVALID_PROFESSIONAL_ROLE':
    case 'INVALID_CONTENT_LENGTH':
    case 'EMPTY_REQUEST_BODY':
    case 'INVALID_JSON':
      return profileApiResponse({
        success: false,
        status: 'invalid_request',
      }, 400);

    default:
      console.error('[professional-profile] Request failed');

      return profileApiResponse({
        success: false,
        status: 'temporarily_unavailable',
      }, 503);
  }
}
