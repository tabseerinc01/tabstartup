import {
  requireEventApiToken,
  eventApiSuccess,
  eventApiFailure,
} from '@/lib/event-admin-api';

import {
  listAdminPendingBkashPayments,
} from '@/services/payments/bkash-admin-review.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * Administrative pending payment queue.
 */
export async function GET(
  request: Request
) {
  try {
    const token =
      requireEventApiToken(request);

    const result =
      await listAdminPendingBkashPayments(
        token
      );

    return eventApiSuccess(result);
  } catch (error) {
    return eventApiFailure(error);
  }
}
