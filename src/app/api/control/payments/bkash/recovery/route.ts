import {
  requireEventApiToken,
  eventApiSuccess,
  eventApiFailure,
} from '@/lib/event-admin-api';

import {
  listAdminRecoveryBkashPayments,
} from '@/services/payments/bkash-recovery-admin-review.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * Administrative recovery payment queue.
 */
export async function GET(
  request: Request
) {
  try {
    const token =
      requireEventApiToken(request);

    const result =
      await listAdminRecoveryBkashPayments(
        token
      );

    return eventApiSuccess(result);
  } catch (error) {
    return eventApiFailure(error);
  }
}
