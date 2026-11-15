import { NextRequest } from 'next/server';

import {
  assertRegistrationOrigin,
  readRegistrationAccess,
} from '@/lib/event-registration-access';

import {
  requireRegistrationEnabled,
  readRegistrationApiBody,
  registrationApiSuccess,
} from '@/lib/event-registration-api';

import {
  consumeEventRegistrationAttempt,
} from '@/services/event-registration-rate-limit.service';

import {
  getAuthorizedInvitationDetails,
  EventInvitationAccessError,
} from '@/services/event-invitation-access.service';

import {
  readInvitationAccessBody,
  protectInvitationAccessResponse,
  invitationAccessApiFailure,
} from '@/lib/event-invitation-access-api';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      invitationId: string;
    }>;
  }
) {
  try {
    requireRegistrationEnabled();

    assertRegistrationOrigin(request);

    await consumeEventRegistrationAttempt(
      request,
      'registration'
    );

    const access =
      readRegistrationAccess(request);

    if (!access.idToken) {
      throw new EventInvitationAccessError(
        'INVITATION_ACCESS_DENIED'
      );
    }

    const { invitationId } =
      await context.params;

    const raw =
      await readRegistrationApiBody(request);

    const { token } =
      readInvitationAccessBody(raw, false);

    const result =
      await getAuthorizedInvitationDetails(
        access.idToken,
        invitationId,
        token
      );

    return protectInvitationAccessResponse(
      registrationApiSuccess(result, 200)
    );
  } catch (error) {
    return invitationAccessApiFailure(error);
  }
}
