import {
  listManagedEventTickets,
  replaceDraftEventTickets,
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

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const token =
      requireEventApiToken(request);

    const { eventId } =
      await context.params;

    const tickets =
      await listManagedEventTickets(
        token,
        eventId
      );

    return eventApiSuccess(tickets);
  } catch (error) {
    return eventApiFailure(error);
  }
}

export async function PUT(
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

    const tickets =
      await replaceDraftEventTickets(
        token,
        eventId,
        input,
        requireEventRevision(request)
      );

    return eventApiSuccess(tickets);
  } catch (error) {
    return eventApiFailure(error);
  }
}
