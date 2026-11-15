import { NextRequest } from 'next/server';

import {
  assertRegistrationOrigin,
  readRegistrationAccess,
} from '@/lib/event-registration-access';

import {
  requireRegistrationEnabled,
  registrationApiSuccess,
  registrationApiError,
} from '@/lib/event-registration-api';

import {
  eventPaymentApiFailure,
} from '@/lib/event-payment-api';

import {
  consumeEventRegistrationAttempt,
} from '@/services/event-registration-rate-limit.service';

import {
  initiateEventTabEdgeCheckout,
} from '@/services/payments/tabedge-checkout.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export const maxDuration = 60;

/**
 * Initiate or reuse an authorized
 * event order's TabEdge hosted checkout.
 *
 * No client-provided financial fields.
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
      'payment_checkout'
    );

    const access =
      readRegistrationAccess(request);

    const { orderId } =
      await context.params;

    // This endpoint accepts no request body.
    if (
      request.body !== null
    ) {
      return registrationApiError(
        400,
        'UNEXPECTED_REQUEST_BODY'
      );
    }

    const result =
      await initiateEventTabEdgeCheckout(
        orderId,
        access
      );

    switch (result.status) {
      case 'ready':
        return registrationApiSuccess({
          status: 'ready',

          provider: 'tabedge',

          currency: 'USD',

          checkoutUrl:
            result.checkout.checkoutUrl,

          replayed: result.replayed,
        });

      case 'creating':
        return registrationApiSuccess(
          {
            status: 'creating',
          },
          202
        );

      case 'requires_review':
        return registrationApiError(
          409,
          'CHECKOUT_REQUIRES_REVIEW'
        );

      default:
        return registrationApiError(
          500,
          'PAYMENT_SERVICE_UNAVAILABLE'
        );
    }
  } catch (error) {
    return eventPaymentApiFailure(error);
  }
}
