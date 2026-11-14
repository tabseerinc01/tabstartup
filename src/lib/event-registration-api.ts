import 'server-only';

import { NextResponse } from 'next/server';

import {
  EventRegistrationInputError,
} from '@/lib/event-registration-input';

import {
  EventRegistrationError,
} from '@/lib/event-registration-policy';

import {
  eventApiFailure,
  readEventApiBody,
} from '@/lib/event-admin-api';

import {
  isEventRegistrationEnabled,
} from '@/lib/event-registration-access';

const responseHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Authorization, Cookie',
};

export class RegistrationApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
    this.name = 'RegistrationApiError';
  }
}

export function requireRegistrationEnabled(): void {
  if (!isEventRegistrationEnabled()) {
    throw new RegistrationApiError(
      503,
      'REGISTRATION_TEMPORARILY_UNAVAILABLE'
    );
  }
}

export function registrationApiSuccess(
  data: unknown,
  status = 200
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    {
      status,
      headers: responseHeaders,
    }
  );
}

export function registrationApiError(
  status: number,
  code: string,
  field?: string
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: code,
      ...(field ? { field } : {}),
    },
    {
      status,
      headers: responseHeaders,
    }
  );
}

export async function readRegistrationApiBody(
  request: Request
): Promise<unknown> {
  return readEventApiBody(request);
}

export function registrationApiFailure(
  error: unknown
): NextResponse {
  if (error instanceof RegistrationApiError) {
    return registrationApiError(
      error.status,
      error.code
    );
  }

  if (error instanceof EventRegistrationInputError) {
    return registrationApiError(
      400,
      'INVALID_REGISTRATION_INPUT',
      error.field
    );
  }

  if (error instanceof EventRegistrationError) {
    switch (error.code) {
      case 'UNAUTHENTICATED':
        return registrationApiError(
          401,
          error.code
        );

      case 'ACCOUNT_ACCESS_DENIED':
      case 'GUEST_REGISTRATION_DISABLED':
        return registrationApiError(
          403,
          error.code
        );

      case 'EVENT_NOT_FOUND':
      case 'TICKET_NOT_FOUND':
        return registrationApiError(
          404,
          error.code
        );

      case 'INVALID_REGISTRATION_CURRENCY':
      case 'TICKET_QUANTITY_EXCEEDED':
        return registrationApiError(
          400,
          error.code
        );

      case 'REGISTRATION_NOT_OPEN':
      case 'TICKET_UNAVAILABLE':
      case 'INSUFFICIENT_TICKET_INVENTORY':
      case 'REGISTRATION_WINDOW_TOO_SHORT':
      case 'EVENT_POLICIES_CHANGED':
      case 'TICKET_PRICE_CHANGED':
      case 'REGISTRATION_REQUEST_CONFLICT':
        return registrationApiError(
          409,
          error.code
        );

      default:
        return registrationApiError(
          500,
          'REGISTRATION_SERVICE_UNAVAILABLE'
        );
    }
  }

  if (
    error instanceof Error &&
    error.message === 'UNAUTHENTICATED'
  ) {
    return registrationApiError(
      401,
      'UNAUTHENTICATED'
    );
  }

  // Reuse existing request parser error handling.
  // Only allow known public-safe errors through.

  const response = eventApiFailure(error);

  if (
    [400, 401, 413, 415].includes(
      response.status
    )
  ) {
    response.headers.set(
      'Vary',
      'Authorization, Cookie'
    );

    return response;
  }

  return registrationApiError(
    500,
    'REGISTRATION_SERVICE_UNAVAILABLE'
  );
}
