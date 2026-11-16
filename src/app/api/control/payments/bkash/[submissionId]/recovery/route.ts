import { NextResponse } from 'next/server';

import {
  requireEventApiToken,
  eventApiSuccess,
  eventApiFailure,
} from '@/lib/event-admin-api';

import {
  BkashAdminReviewError,
} from '@/services/payments/bkash-admin-review.service';

import {
  getAdminBkashRecoveryDetails,
} from '@/services/payments/bkash-recovery-admin-details.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      submissionId: string;
    }>;
  }
) {
  try {
    const token =
      requireEventApiToken(request);

    const { submissionId } =
      await context.params;

    const result =
      await getAdminBkashRecoveryDetails(
        token,
        submissionId
      );

    return eventApiSuccess(result);
  } catch (error) {
    if (
      error instanceof BkashAdminReviewError
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
              'private, no-store',

            Vary: 'Authorization',
          },
        }
      );
    }

    return eventApiFailure(error);
  }
}
