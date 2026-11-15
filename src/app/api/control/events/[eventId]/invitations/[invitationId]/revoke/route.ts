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
  revokeAdminEventInvitation,
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

    const reason =
      readSingleInvitationField(
        input,
        'reason'
      );

    const result =
      await revokeAdminEventInvitation(
        token,
        eventId,
        invitationId,
        reason
      );

    return protectInvitationResponse(
      eventApiSuccess(result)
    );
  } catch (error) {
    return invitationApiFailure(error);
  }
}
