import { NextResponse } from 'next/server';

import {
  requireEventApiToken,
  readEventApiBody,
  eventApiSuccess,
  eventApiFailure,
} from '@/lib/event-admin-api';

import {
  queueAdminPaymentReminder,
  EventAdminReminderError,
} from '@/services/event-admin-reminder.service';

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

function parseOrderId(
  input: unknown
): string {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new EventAdminReminderError(
      'INVALID_REMINDER_REQUEST'
    );
  }

  const record =
    input as Record<string, unknown>;

  if (
    Object.keys(record).length !== 1 ||
    typeof record.orderId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(
      record.orderId
    ) ||
    /^__.*__$/.test(record.orderId)
  ) {
    throw new EventAdminReminderError(
      'INVALID_REMINDER_REQUEST'
    );
  }

  return record.orderId;
}

export async function POST(
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

    const orderId =
      parseOrderId(input);

    const result =
      await queueAdminPaymentReminder(
        token,
        eventId,
        orderId
      );

    return protectResponse(
      eventApiSuccess(
        result,
        result.status === 'queued'
          ? 201
          : 200
      )
    );
  } catch (error) {
    if (
      error instanceof
        EventAdminReminderError
    ) {
      const status =
        error.code ===
          'INVALID_REMINDER_REQUEST'
          ? 400
          : error.code ===
              'EVENT_ORDER_NOT_FOUND'
            ? 404
            : error.code ===
                'EVENT_EMAIL_DISABLED'
              ? 503
              : 409;

      return protectResponse(
        NextResponse.json(
          {
            success: false,
            error: error.code,
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
