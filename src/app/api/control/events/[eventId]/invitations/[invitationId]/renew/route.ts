import {
  requireEventApiToken,
  readEventApiBody,
  eventApiSuccess,
} from '@/lib/event-admin-api';

import {
  protectInvitationResponse,
  invitationApiFailure,
  readSingleInvitationField,
} from '@/lib/event-invitation-admin-api';

import {
  renewAdminEventInvitation,
} from '@/services/event-invitation.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    eventId: string;
    invitationId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const token =
      requireEventApiToken(request);

    const {
      eventId,
      invitationId,
    } = await context.params;

    const input =
      await readEventApiBody(request);

    const expiresAtMs =
      readSingleInvitationField(
        input,
        'expiresAtMs'
      );

    const result =
      await renewAdminEventInvitation(
        token,
        eventId,
        invitationId,
        expiresAtMs
      );

    return protectInvitationResponse(
      eventApiSuccess(result)
    );
  } catch (error) {
    return invitationApiFailure(error);
  }
}
