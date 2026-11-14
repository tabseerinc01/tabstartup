import {
  publishOfficialEvent,
} from '@/services/event-management.service';

import {
  requireEventApiToken,
  requireEventRevision,
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

    const event =
      await publishOfficialEvent(
        token,
        eventId,
        requireEventRevision(request)
      );

    return eventApiSuccess(event);
  } catch (error) {
    return eventApiFailure(error);
  }
}
