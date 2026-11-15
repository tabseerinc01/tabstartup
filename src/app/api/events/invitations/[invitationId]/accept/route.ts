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
  acceptEventInvitation,
} from '@/services/event-registration.service';

import {
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

    const {
      token,
      registration,
    } = readInvitationAccessBody(raw, true);

    const result =
      await acceptEventInvitation(
        registration,
        access.idToken,
        invitationId,
        token
      );

    return protectInvitationAccessResponse(
      registrationApiSuccess(
        result,
        result.replayed ? 200 : 201
      )
    );
  } catch (error) {
    return invitationAccessApiFailure(error);
  }
}
