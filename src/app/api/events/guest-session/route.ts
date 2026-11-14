import { NextRequest } from 'next/server';

import {
  assertRegistrationOrigin,
  createGuestSessionSecret,
  readGuestSessionSecret,
  setGuestSessionCookie,
} from '@/lib/event-registration-access';

import {
  requireRegistrationEnabled,
  registrationApiSuccess,
  registrationApiFailure,
} from '@/lib/event-registration-api';

import {
  consumeEventRegistrationAttempt,
} from '@/services/event-registration-rate-limit.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest
) {
  try {
    requireRegistrationEnabled();

    assertRegistrationOrigin(request);

    await consumeEventRegistrationAttempt(
      request,
      'guest_session'
    );

    const existing =
      readGuestSessionSecret(request);

    const secret =
      existing ?? createGuestSessionSecret();

    const response =
      registrationApiSuccess({
        ready: true,
      });

    if (existing === null) {
      setGuestSessionCookie(
        response,
        secret
      );
    }

    return response;
  } catch (error) {
    return registrationApiFailure(error);
  }
}
