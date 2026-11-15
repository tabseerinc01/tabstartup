import type {
  AdminEventInvitation,
  EventInvitationCategory,
} from '@/lib/event-invitation-types';

export interface CreateInvitationInput {
  ticketTypeId: string;
  category: EventInvitationCategory;
  guestName: string;
  guestEmail: string;
  expiresAtMs: number;
}

export interface InvitationMutationResult {
  invitation: AdminEventInvitation;
  invitationUrl: string;
}

export interface InvitationListResult {
  eventId: string;
  items: AdminEventInvitation[];
  hasMore: boolean;
  nextCursor: string | null;
}

function invitationEndpoint(
  eventId: string
): string {
  return (
    '/api/control/events/' +
    encodeURIComponent(eventId) +
    '/invitations'
  );
}

async function invitationRequest<T>(
  url: string,
  idToken: string,
  method: 'GET' | 'POST',
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    signal,

    headers: {
      Authorization: 'Bearer ' + idToken,

      ...(body !== undefined
        ? {
            'Content-Type': 'application/json',
          }
        : {}),
    },

    ...(body !== undefined
      ? {
          body: JSON.stringify(body),
        }
      : {}),
  });

  const result = await response
    .json()
    .catch(() => null);

  if (
    !response.ok ||
    result?.success !== true ||
    result.data === undefined
  ) {
    const message =
      typeof result?.error === 'string'
        ? result.error
        : typeof result?.error?.message === 'string'
          ? result.error.message
          : typeof result?.message === 'string'
            ? result.message
            : 'Invitation request failed.';

    throw new Error(message);
  }

  return result.data as T;
}

export async function listEventInvitations(
  idToken: string,
  eventId: string,
  cursor: string | null = null,
  signal?: AbortSignal
): Promise<InvitationListResult> {
  const query = new URLSearchParams({
    limit: '100',
  });

  if (cursor !== null) {
    query.set('cursor', cursor);
  }

  const result =
    await invitationRequest<InvitationListResult>(
      invitationEndpoint(eventId) +
        '?' + query.toString(),
      idToken,
      'GET',
      undefined,
      signal
    );

  if (
    result.eventId !== eventId ||
    !Array.isArray(result.items) ||
    typeof result.hasMore !== 'boolean' ||
    (
      result.hasMore &&
      (
        typeof result.nextCursor !== 'string' ||
        !result.nextCursor
      )
    ) ||
    result.items.some(
      item => item.eventId !== eventId
    )
  ) {
    throw new Error(
      'Invalid invitation list response.'
    );
  }

  return result;
}

function validateInvitationMutation(
  result: InvitationMutationResult,
  eventId: string,
  invitationId?: string
): InvitationMutationResult {
  const invitation = result?.invitation;

  if (
    !invitation ||
    invitation.eventId !== eventId ||
    !/^inv_[a-f0-9]{48}$/.test(
      invitation.invitationId
    ) ||
    (
      invitationId !== undefined &&
      invitation.invitationId !== invitationId
    ) ||
    invitation.status !== 'pending' ||
    typeof result.invitationUrl !== 'string'
  ) {
    throw new Error(
      'Invalid invitation response.'
    );
  }

  const url = new URL(result.invitationUrl);

  if (
    url.origin !== 'https://tabstartup.com' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !==
      '/events/invitations/' +
      invitation.invitationId ||
    url.search !== '' ||
    !/^#token=[a-f0-9]{64}$/.test(url.hash)
  ) {
    throw new Error(
      'Invalid secure invitation link.'
    );
  }

  return result;
}

export async function createEventInvitation(
  idToken: string,
  eventId: string,
  input: CreateInvitationInput,
  signal?: AbortSignal
): Promise<InvitationMutationResult> {
  const result =
    await invitationRequest<InvitationMutationResult>(
      invitationEndpoint(eventId),
      idToken,
      'POST',
      input,
      signal
    );

  return validateInvitationMutation(
    result,
    eventId
  );
}

export async function revokeEventInvitation(
  idToken: string,
  eventId: string,
  invitationId: string,
  reason: string,
  signal?: AbortSignal
): Promise<unknown> {
  return invitationRequest<unknown>(
    invitationEndpoint(eventId) +
      '/' +
      encodeURIComponent(invitationId) +
      '/revoke',
    idToken,
    'POST',
    { reason },
    signal
  );
}

export async function renewEventInvitation(
  idToken: string,
  eventId: string,
  invitationId: string,
  expiresAtMs: number,
  signal?: AbortSignal
): Promise<InvitationMutationResult> {
  const result =
    await invitationRequest<InvitationMutationResult>(
      invitationEndpoint(eventId) +
        '/' +
        encodeURIComponent(invitationId) +
        '/renew',
      idToken,
      'POST',
      { expiresAtMs },
      signal
    );

  return validateInvitationMutation(
    result,
    eventId,
    invitationId
  );
}
