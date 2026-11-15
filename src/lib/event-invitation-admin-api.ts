import 'server-only';

import { NextResponse } from 'next/server';

import {
  eventApiFailure,
} from '@/lib/event-admin-api';

import {
  EventInvitationError,
} from '@/services/event-invitation.service';

export function protectInvitationResponse(
  response: Response
): Response {
  response.headers.set(
    'Cache-Control',
    'private, no-store, max-age=0'
  );

  response.headers.set(
    'Vary',
    'Authorization'
  );

  response.headers.set(
    'X-Content-Type-Options',
    'nosniff'
  );

  response.headers.set(
    'X-Robots-Tag',
    'noindex, nofollow'
  );

  response.headers.set(
    'Referrer-Policy',
    'no-referrer'
  );

  return response;
}

export function invitationApiFailure(
  error: unknown
): Response {
  if (error instanceof EventInvitationError) {
    const status =
      error.code === 'INVALID_INVITATION_REQUEST' ||
      error.code === 'INVITATION_EXPIRY_INVALID'
        ? 400
        : error.code === 'INVITATION_NOT_FOUND'
          ? 404
          : 409;

    return protectInvitationResponse(
      NextResponse.json(
        {
          success: false,
          error: error.code,
        },
        { status }
      )
    );
  }

  if (
    error instanceof Error &&
    error.message ===
      'EVENT_INVITATION_SECRET_NOT_CONFIGURED'
  ) {
    return protectInvitationResponse(
      NextResponse.json(
        {
          success: false,
          error: 'INVITATION_SERVICE_UNAVAILABLE',
        },
        { status: 503 }
      )
    );
  }

  return protectInvitationResponse(
    eventApiFailure(error)
  );
}

export function readSingleInvitationField(
  input: unknown,
  field: string
): unknown {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new EventInvitationError(
      'INVALID_INVITATION_REQUEST'
    );
  }

  const data =
    input as Record<string, unknown>;

  if (
    Object.keys(data).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(
      data,
      field
    )
  ) {
    throw new EventInvitationError(
      'INVALID_INVITATION_REQUEST'
    );
  }

  return data[field];
}
