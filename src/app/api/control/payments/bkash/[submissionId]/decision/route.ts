import {
  NextResponse,
} from 'next/server';

import {
  requireEventApiToken,
  readEventApiBody,
  eventApiSuccess,
  eventApiFailure,
} from '@/lib/event-admin-api';

import {
  BkashAdminReviewError,
} from '@/services/payments/bkash-admin-review.service';

import {
  EventInventoryReleaseError,
} from '@/services/event-inventory-release.service';

import {
  decideAdminBkashPayment,
} from '@/services/payments/bkash-admin-decision.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    submissionId: string;
  }>;
};

/**
 * Admin-only bKash payment decision.
 *
 * Authentication and authorization
 * are enforced by the service.
 *
 * No payment outcome is accepted
 * directly from the customer.
 */
export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const idToken =
      requireEventApiToken(request);

    const { submissionId } =
      await context.params;

    const input =
      await readEventApiBody(request);

    const result =
      await decideAdminBkashPayment(
        idToken,
        submissionId,
        input
      );

    return eventApiSuccess(result);
  } catch (error) {
    if (
      error instanceof BkashAdminReviewError ||
      error instanceof EventInventoryReleaseError
    ) {
      const status =
        error.code ===
          'PAYMENT_SUBMISSION_NOT_FOUND'
          ? 404
          : 409;

      return NextResponse.json(
        {
          success: false,

          error: error.code,
        },
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

    return eventApiFailure(error);
  }
}
