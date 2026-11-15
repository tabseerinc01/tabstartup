import {
  requireEventApiToken,
  readEventApiBody,
  eventApiSuccess,
} from '@/lib/event-admin-api';

import {
  protectInvitationResponse,
  invitationApiFailure,
} from '@/lib/event-invitation-admin-api';

import {
  createAdminEventInvitation,
  listAdminEventInvitations,
  EventInvitationError,
} from '@/services/event-invitation.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const token =
      requireEventApiToken(request);

    const { eventId } =
      await context.params;

    const params =
      new URL(request.url).searchParams;

    for (const key of params.keys()) {
      if (
        !['limit', 'cursor'].includes(key) ||
        params.getAll(key).length !== 1
      ) {
        throw new EventInvitationError(
          'INVALID_INVITATION_REQUEST'
        );
      }
    }

    const rawLimit =
      params.get('limit');

    if (
      rawLimit !== null &&
      !/^[1-9][0-9]{0,2}$/.test(rawLimit)
    ) {
      throw new EventInvitationError(
        'INVALID_INVITATION_REQUEST'
      );
    }

    const result =
      await listAdminEventInvitations(
        token,
        eventId,
        params.get('cursor'),
        rawLimit === null
          ? 100
          : Number(rawLimit)
      );

    return protectInvitationResponse(
      eventApiSuccess(result)
    );
  } catch (error) {
    return invitationApiFailure(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const token =
      requireEventApiToken(request);

    const { eventId } =
      await context.params;

    const input =
      await readEventApiBody(request);

    const result =
      await createAdminEventInvitation(
        token,
        eventId,
        input
      );

    return protectInvitationResponse(
      eventApiSuccess(result, 201)
    );
  } catch (error) {
    return invitationApiFailure(error);
  }
}
