import 'server-only';

import { NextResponse } from 'next/server';

import {
  EventAuthorizationError,
  getEventBearerToken,
} from '@/services/event-authorization.service';

import {
  EventManagementError,
} from '@/services/event-management.service';

import {
  EventInputError,
} from '@/lib/event-management-input';

const MAX_BODY_BYTES = 512 * 1024;

const responseHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Authorization',
};

class EventApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
    this.name = 'EventApiError';
  }
}

export function requireEventApiToken(
  request: Request
): string {
  try {
    const token = getEventBearerToken(request);

    if (!token) {
      throw new Error('UNAUTHENTICATED');
    }

    return token;
  } catch {
    throw new EventApiError(
      401,
      'UNAUTHENTICATED'
    );
  }
}

export async function readEventApiBody(
  request: Request
): Promise<unknown> {
  const contentType =
    request.headers.get('content-type') ?? '';

  if (
    contentType.split(';')[0]
      .trim().toLowerCase() !== 'application/json'
  ) {
    throw new EventApiError(
      415,
      'UNSUPPORTED_CONTENT_TYPE'
    );
  }

  const length =
    request.headers.get('content-length');

  if (
    length !== null &&
    (
      !/^\d+$/.test(length) ||
      Number(length) > MAX_BODY_BYTES
    )
  ) {
    throw new EventApiError(
      413,
      'REQUEST_TOO_LARGE'
    );
  }

  if (!request.body) {
    throw new EventApiError(
      400,
      'INVALID_REQUEST_BODY'
    );
  }

  const reader = request.body.getReader();

  const chunks: Uint8Array[] = [];

  let total = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      total += result.value.byteLength;

      if (total > MAX_BODY_BYTES) {
        await reader.cancel();

        throw new EventApiError(
          413,
          'REQUEST_TOO_LARGE'
        );
      }

      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const raw = Buffer.concat(chunks)
      .toString('utf8');

    return JSON.parse(raw);
  } catch {
    throw new EventApiError(
      400,
      'INVALID_JSON'
    );
  }
}

/**
 * Serialize Firestore timestamps as milliseconds.
 * Only authenticated admin responses use this.
 */
function serialize(value: unknown): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (typeof value === 'object') {
    const candidate = value as {
      toMillis?: () => number;
    };

    if (
      typeof candidate.toMillis === 'function'
    ) {
      return candidate.toMillis();
    }

    return Object.fromEntries(
      Object.entries(value).map(
        ([key, item]) => [
          key,
          serialize(item),
        ]
      )
    );
  }

  return value;
}

export function eventApiSuccess(
  data: unknown,
  status = 200
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data: serialize(data),
    },
    {
      status,
      headers: responseHeaders,
    }
  );
}

function failure(
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

export function eventApiFailure(
  error: unknown
): NextResponse {
  if (error instanceof EventApiError) {
    return failure(
      error.status,
      error.code
    );
  }

  if (error instanceof EventInputError) {
    return failure(
      400,
      'INVALID_EVENT_INPUT',
      error.field
    );
  }

  if (error instanceof EventAuthorizationError) {
    return failure(
      403,
      error.code
    );
  }

  if (error instanceof EventManagementError) {
    switch (error.code) {
      case 'EVENT_NOT_FOUND':
        return failure(404, error.code);

      case 'INVALID_EVENT_ID':
      case 'EVENT_TICKET_DATA_INVALID':
      case 'EVENT_VISIBILITY_NOT_SUPPORTED':
        return failure(400, error.code);

      case 'EVENT_ACCESS_DENIED':
      case 'EVENT_ACCOUNT_CHANGED':
        return failure(403, error.code);

      case 'EVENT_SLUG_ALREADY_EXISTS':
      case 'EVENT_STATUS_CONFLICT':
      case 'EVENT_PUBLICATION_NOT_READY':
        return failure(409, error.code);

      default:
        return failure(500, error.code);
    }
  }

  const code =
    error &&
    typeof error === 'object' &&
    'code' in error
      ? String(error.code)
      : '';

  const message =
    error instanceof Error
      ? error.message
      : '';

  if (
    message === 'UNAUTHENTICATED' ||
    [
      'auth/argument-error',
      'auth/invalid-argument',
      'auth/invalid-id-token',
      'auth/id-token-expired',
      'auth/id-token-revoked',
      'auth/user-disabled',
      'auth/user-not-found',
    ].includes(code)
  ) {
    return failure(
      401,
      'UNAUTHENTICATED'
    );
  }

  // Never return internal error details,
  // bearer tokens or private meeting data.
  console.error(
    '[event-admin-api] Unexpected failure'
  );

  return failure(
    500,
    'EVENT_SERVICE_UNAVAILABLE'
  );
}


/**
 * Mutating an existing event requires the
 * revision obtained from the authenticated API.
 */
export function requireEventRevision(
  request: Request
): number {
  const raw =
    request.headers.get('X-Event-Revision');

  if (
    raw === null ||
    !/^[0-9]{1,15}$/.test(raw)
  ) {
    throw new EventInputError(
      'expectedUpdatedAtMs'
    );
  }

  const revision = Number(raw);

  if (
    !Number.isSafeInteger(revision) ||
    revision <= 0 ||
    revision > 253402300799999
  ) {
    throw new EventInputError(
      'expectedUpdatedAtMs'
    );
  }

  return revision;
}
