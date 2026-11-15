'use client';

import type { User } from 'firebase/auth';

export class EventAdminClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly field?: string
  ) {
    super(
      code === 'EVENT_STATUS_CONFLICT'
        ? 'The event has changed or its status no longer allows this action. Reload the latest event before trying again.'
        : field
          ? code + ': ' + field
          : code
    );
    this.name = 'EventAdminClientError';
  }
}

export async function eventAdminRequest<T>(
  user: User,
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    expectedUpdatedAtMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  if (
    endpoint !== '/api/control/events' &&
    !endpoint.startsWith('/api/control/events/')
  ) {
    throw new Error('INVALID_EVENT_ENDPOINT');
  }

  const token = await user.getIdToken();

  const response = await fetch(endpoint, {
    method: options.method ?? 'GET',

    headers: {
      Authorization: 'Bearer ' + token,

      ...(options.expectedUpdatedAtMs !== undefined
        ? {
            'X-Event-Revision':
              String(options.expectedUpdatedAtMs),
          }
        : {}),
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
        : 'EVENT_REQUEST_FAILED',
      response.status,
      typeof result?.field === 'string'
        ? result.field
        : undefined
    );
  }

  return result.data as T;
}

export interface AdminEventSummary {
  eventId: string;
  slug: string;
  title: string;
  shortDescription: string;
  category: string;
  mode: 'online' | 'offline' | 'hybrid';
  status: string;
  visibility: string;
  registrationType: 'free' | 'paid' | 'mixed';

  registrationAccess?:
    | 'public'
    | 'invite_only'
    | 'public_and_invitation';

  invitationSettings?: {
    enabled: boolean;
    allowComplimentary: boolean;
    maxAcceptedInvitations: number;
    acceptedInvitationCount: number;
  };
  registrationStatus: string;
  bannerUrl: string | null;
  timezone: string;
  startsAt: number;
  endsAt: number;
  capacity: {
    online: number;
    offline: number;
  };
  maxTicketsPerOrder: number;
  createdAt: number;
  updatedAt: number;
}

export function formatEventDate(
  value: number,
  timezone: string
): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return 'Invalid date';
  }
}

export function eventLabel(
  value: string
): string {
  return value
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      char => char.toUpperCase()
    );
}
