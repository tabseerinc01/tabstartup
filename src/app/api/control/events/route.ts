import {
  createOfficialEvent,
  listOfficialEvents,
} from '@/services/event-management.service';

import {
  requireEventApiToken,
  readEventApiBody,
  eventApiSuccess,
  eventApiFailure,
} from '@/lib/event-admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request
) {
  try {
    const token =
      requireEventApiToken(request);

    const events =
      await listOfficialEvents(token, 100);

    return eventApiSuccess(events);
  } catch (error) {
    return eventApiFailure(error);
  }
}

export async function POST(
  request: Request
) {
  try {
    const token =
      requireEventApiToken(request);

    const input =
      await readEventApiBody(request);

    const event =
      await createOfficialEvent(
        token,
        input
      );

    return eventApiSuccess(event, 201);
  } catch (error) {
    return eventApiFailure(error);
  }
}
