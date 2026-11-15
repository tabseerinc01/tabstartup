import type { User } from 'firebase/auth';

import {
  EventAdminClientError,
} from '@/lib/event-admin-client';

export async function paymentAdminRequest<T>(
  user: User,
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  if (
    !/^\/api\/control\/payments(?:\/[A-Za-z0-9_-]+)+$/.test(
      endpoint
    )
  ) {
    throw new Error('INVALID_PAYMENT_ENDPOINT');
  }

  const token = await user.getIdToken();

  const response = await fetch(endpoint, {
    method: options.method ?? 'GET',

    headers: {
      Authorization: 'Bearer ' + token,

      ...(options.body !== undefined
        ? {
            'Content-Type': 'application/json',
          }
        : {}),
    },

    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body),

    signal: options.signal,
    cache: 'no-store',
  });

  const result = await response
    .json()
    .catch(() => null);

  if (
    !response.ok ||
    result?.success !== true
  ) {
    throw new EventAdminClientError(
      typeof result?.error === 'string'
        ? result.error
        : 'PAYMENT_REQUEST_FAILED',
      response.status,
      typeof result?.field === 'string'
        ? result.field
        : undefined
    );
  }

  return result.data as T;
}
