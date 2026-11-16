import { NextRequest } from 'next/server';

import {
  assertRegistrationOrigin,
  readRegistrationAccess,
} from '@/lib/event-registration-access';

import {
  requireRegistrationEnabled,
  readRegistrationApiBody,
  registrationApiSuccess,
} from '@/lib/event-registration-api';

import {
  eventPaymentApiFailure,
} from '@/lib/event-payment-api';

import {
  consumeEventRegistrationAttempt,
} from '@/services/event-registration-rate-limit.service';

import {
  submitLateEventBkashPayment,
} from '@/services/payments/bkash-late-submission.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * Accept customer-reported bKash payment details.
 *
 * Submission does not confirm payment.
 * Administrative verification is required.
 */
export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      orderId: string;
    }>;
  }
) {
  try {
    requireRegistrationEnabled();

    assertRegistrationOrigin(request);

    await consumeEventRegistrationAttempt(
      request,
      'bkash_submission'
    );

    const access =
      readRegistrationAccess(request);

    const { orderId } =
      await context.params;

    const input =
      await readRegistrationApiBody(
        request
      );

    const result =
      await submitLateEventBkashPayment(
        orderId,
        access,
        input
      );

    return registrationApiSuccess(
      {
        status: result.status,

        replayed: result.replayed,
      },
      result.replayed ? 200 : 201
    );
  } catch (error) {
    return eventPaymentApiFailure(error);
  }
}
