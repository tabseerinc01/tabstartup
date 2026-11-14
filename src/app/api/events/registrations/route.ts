import { NextRequest } from 'next/server';

import {
  assertRegistrationOrigin,
  readRegistrationAccess,
} from '@/lib/event-registration-access';

import {
  requireRegistrationEnabled,
  readRegistrationApiBody,
  registrationApiSuccess,
  registrationApiFailure,
} from '@/lib/event-registration-api';

import {
  createEventRegistration,
} from '@/services/event-registration.service';

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
      'registration'
    );

    const access =
      readRegistrationAccess(request);

    const input =
      await readRegistrationApiBody(request);

    const result =
      await createEventRegistration(
        input,
        access
      );

    return registrationApiSuccess(
      result,
      result.replayed ? 200 : 201
    );
  } catch (error) {
    return registrationApiFailure(error);
  }
}
