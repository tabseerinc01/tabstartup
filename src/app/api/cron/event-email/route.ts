import {
  createHash,
  timingSafeEqual,
} from 'node:crypto';

import {
  NextResponse,
} from 'next/server';

import {
  isEventEmailEnabled,
} from '@/services/email/resend-email.service';

import {
  runEventEmailWorker,
} from '@/services/email/event-email-worker.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export const maxDuration = 60;

function json(
  body: Record<string, unknown>,
  status: number
) {
  return NextResponse.json(body, {
    status,

    headers: {
      'Cache-Control':
        'private, no-store, max-age=0',

      'Vary':
        'Authorization',

      'X-Content-Type-Options':
        'nosniff',

      'X-Robots-Tag':
        'noindex, nofollow',
    },
  });
}

function getCronSecret(): string | null {
  const secret =
    process.env.CRON_SECRET || '';

  if (
    !/^[A-Za-z0-9_-]{32,256}$/.test(secret)
  ) {
    return null;
  }

  return secret;
}

function isAuthorized(
  request: Request,
  secret: string
): boolean {
  const authorization =
    request.headers.get('authorization');

  if (
    !authorization ||
    authorization.length > 300 ||
    !authorization.startsWith('Bearer ')
  ) {
    return false;
  }

  const provided =
    authorization.slice(7);

  if (
    !/^[A-Za-z0-9_-]{32,256}$/.test(provided)
  ) {
    return false;
  }

  const expectedHash = createHash('sha256')
    .update(secret, 'utf8')
    .digest();

  const providedHash = createHash('sha256')
    .update(provided, 'utf8')
    .digest();

  return timingSafeEqual(
    expectedHash,
    providedHash
  );
}

/**
 * External scheduler compatible endpoint.
 *
 * Requires CRON_SECRET authorization.
 * Does not depend on Vercel Cron.
 */
export async function GET(
  request: Request
) {
  const secret = getCronSecret();

  if (!secret) {
    return json(
      {
        success: false,
        error: 'CRON_NOT_CONFIGURED',
      },
      503
    );
  }

  if (!isAuthorized(request, secret)) {
    return json(
      {
        success: false,
        error: 'UNAUTHORIZED',
      },
      401
    );
  }

  if (!isEventEmailEnabled()) {
    return json(
      {
        success: true,
        enabled: false,
        status: 'disabled',
      },
      200
    );
  }

  try {
    const summary =
      await runEventEmailWorker();

    const partialFailure =
      summary.queryFailed ||
      summary.errors > 0;

    return json(
      {
        success: !partialFailure,
        summary,
      },
      partialFailure ? 503 : 200
    );
  } catch {
    console.error(
      '[event-email-cron] Worker execution failed'
    );

    return json(
      {
        success: false,
        error: 'EMAIL_WORKER_FAILED',
      },
      500
    );
  }
}
