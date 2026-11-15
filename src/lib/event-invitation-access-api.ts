import 'server-only';

import { NextResponse } from 'next/server';

import {
  EventInvitationAccessError,
} from '@/services/event-invitation-access.service';

import {
  eventPaymentApiFailure,
} from '@/lib/event-payment-api';

import {
  isValidEventInvitationToken,
} from '@/lib/event-invitation-token';

export function protectInvitationAccessResponse(
  response: NextResponse
): NextResponse {
  response.headers.set(
    'Cache-Control',
    'private, no-store, max-age=0'
  );

  response.headers.set(
    'Vary',
    'Authorization, Cookie'
  );

  response.headers.set(
    'Referrer-Policy',
    'no-referrer'
  );

  response.headers.set(
    'X-Content-Type-Options',
    'nosniff'
  );

  response.headers.set(
    'X-Robots-Tag',
    'noindex, nofollow'
  );

  return response;
}

export function readInvitationAccessBody(
  raw: unknown,
  acceptance: boolean
): {
  token: string;
  registration: unknown;
} {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) {
    throw new EventInvitationAccessError(
      'INVITATION_ACCESS_DENIED'
    );
  }

  const body =
    raw as Record<string, unknown>;

  const keys = Object.keys(body);

  const validFields = acceptance
    ? keys.length === 2 &&
      keys.includes('token') &&
      keys.includes('registration')
    : keys.length === 1 &&
      keys.includes('token');

  if (
    !validFields ||
    typeof body.token !== 'string' ||
    !isValidEventInvitationToken(body.token)
  ) {
    throw new EventInvitationAccessError(
      'INVITATION_ACCESS_DENIED'
    );
  }

  return {
    token: body.token,
    registration:
      acceptance ? body.registration : null,
  };
}

export function invitationAccessApiFailure(
  error: unknown
): NextResponse {
  if (
    error instanceof EventInvitationAccessError
  ) {
    return protectInvitationAccessResponse(
      NextResponse.json(
        {
          success: false,
          error: error.code,
        },
        {
          status:
            error.code ===
              'INVITATION_SERVICE_DISABLED'
              ? 503
              : 403,
        }
      )
    );
  }

  return protectInvitationAccessResponse(
    eventPaymentApiFailure(error)
  );
}
