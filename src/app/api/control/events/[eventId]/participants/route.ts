import { NextResponse } from 'next/server';

import {
  requireEventApiToken,
  eventApiSuccess,
  eventApiFailure,
} from '@/lib/event-admin-api';

import {
  listAdminEventParticipants,
  EventParticipantAdminError,
} from '@/services/event-admin-participants.service';

import type {
  EventRegistrationRecordStatus,
} from '@/lib/event-types';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

function protectResponse(
  response: Response
): Response {
  response.headers.set(
    'Cache-Control',
    'private, no-store, max-age=0'
  );

  response.headers.set(
    'Vary',
    'Authorization'
  );

  response.headers.set(
    'X-Content-Type-Options',
    'nosniff'
  );

  response.headers.set(
    'X-Robots-Tag',
    'noindex, nofollow'
  );

  return response;
}

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const token =
      requireEventApiToken(request);

    const { eventId } =
      await context.params;

    const params =
      new URL(request.url).searchParams;

    for (const key of params.keys()) {
      if (
        !['limit', 'cursor', 'status']
          .includes(key) ||
        params.getAll(key).length !== 1
      ) {
        throw new EventParticipantAdminError(
          'INVALID_PARTICIPANT_QUERY'
        );
      }
    }

    const rawLimit = params.get('limit');

    if (
      rawLimit !== null &&
      !/^[1-9][0-9]{0,2}$/.test(rawLimit)
    ) {
      throw new EventParticipantAdminError(
        'INVALID_PARTICIPANT_QUERY'
      );
    }

    const result =
      await listAdminEventParticipants(
        token,
        eventId,
        {
          limit:
            rawLimit === null
              ? undefined
              : Number(rawLimit),

          cursor:
            params.get('cursor'),

          status:
            params.get('status') as
              EventRegistrationRecordStatus |
              null,
        }
      );

    return protectResponse(
      eventApiSuccess(result)
    );
  } catch (error) {
    if (
      error instanceof
        EventParticipantAdminError
    ) {
      const status =
        error.code ===
          'INVALID_PARTICIPANT_QUERY'
          ? 400
          : error.code ===
              'EVENT_NOT_FOUND'
            ? 404
            : 500;

      return protectResponse(
        NextResponse.json(
          {
            success: false,

            error: {
              code: error.code,
              message: error.code,
            },
          },
          { status }
        )
      );
    }

    return protectResponse(
      eventApiFailure(error)
    );
  }
}
