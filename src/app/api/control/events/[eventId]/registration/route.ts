import {
  updateOfficialEventRegistration,
} from '@/services/event-management.service';

import {
  requireEventApiToken,
  requireEventRevision,
  readEventApiBody,
  eventApiSuccess,
  eventApiFailure,
} from '@/lib/event-admin-api';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const token =
      requireEventApiToken(request);

    const { eventId } =
      await context.params;

    const expectedUpdatedAtMs =
      requireEventRevision(request);

    const input =
      await readEventApiBody(request);

    const event =
      await updateOfficialEventRegistration(
        token,
        eventId,
        input,
        expectedUpdatedAtMs
      );

    return eventApiSuccess(event);
  } catch (error) {
    return eventApiFailure(error);
  }
}
