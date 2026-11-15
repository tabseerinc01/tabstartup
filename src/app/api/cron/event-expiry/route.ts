import {
  createHash,
  timingSafeEqual,
} from 'node:crypto';

import {
  NextResponse,
} from 'next/server';

import {
  isEventExpiryWorkerEnabled,
  runEventExpiryWorker,
} from '@/services/payments/event-expiry-worker.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export const maxDuration = 60;

function respond(
  body: Record<string, unknown>,
  status: number
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'private, no-store, max-age=0',

        'Vary': 'Authorization',

        'X-Content-Type-Options':
          'nosniff',
      },
    }
  );
}

function digest(
  value: string
): Buffer {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest();
}

function validSecret(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 32 &&
    value.length <= 256 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function isAuthorized(
  request: Request,
  secret: string
): boolean {
  const authorization =
    request.headers.get(
      'authorization'
    );

  if (
    !authorization ||
    authorization.length > 300 ||
    !authorization.startsWith(
      'Bearer '
    )
  ) {
    return false;
  }

  const supplied =
    authorization.slice(7);

  if (!validSecret(supplied)) {
    return false;
  }

  return timingSafeEqual(
    digest(supplied),
    digest(secret)
  );
}

/**
 * Scheduled event expiry maintenance.
 *
 * Authentication:
 * Authorization: Bearer CRON_SECRET
 *
 * Disabled unless explicitly enabled.
 *
 * No customer-controlled input.
 */
export async function GET(
  request: Request
) {
  const secret =
    process.env.CRON_SECRET;

  if (!validSecret(secret)) {
    return respond(
      {
        success: false,

        error:
          'MAINTENANCE_UNAVAILABLE',
      },
      503
    );
  }

  if (
    !isAuthorized(request, secret)
  ) {
    return respond(
      {
        success: false,

        error: 'UNAUTHORIZED',
      },
      401
    );
  }

  if (
    !isEventExpiryWorkerEnabled()
  ) {
    return respond(
      {
        success: false,

        error:
          'EVENT_EXPIRY_WORKER_DISABLED',
      },
      503
    );
  }

  try {
    const summary =
      await runEventExpiryWorker();

    const hasErrors =
      summary.unpaidReservations.errors > 0 ||
      summary.bkashReviews.errors > 0 ||
      summary.unpaidReservations.queryFailed ||
      summary.bkashReviews.queryFailed;

    console.info(
      '[event-expiry-cron] completed',
      summary
    );

    return respond(
      {
        success: !hasErrors,

        ...(hasErrors
          ? {
              error:
                'EVENT_EXPIRY_PARTIAL_FAILURE',
            }
          : {}),

        data: summary,
      },
      hasErrors ? 503 : 200
    );
  } catch (error) {
    console.error(
      '[event-expiry-cron] failed',
      {
        errorName:
          error instanceof Error
            ? error.name
            : 'UnknownError',
      }
    );

    return respond(
      {
        success: false,

        error:
          'EVENT_EXPIRY_WORKER_FAILED',
      },
      500
    );
  }
}
