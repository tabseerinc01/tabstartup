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
  getEventBkashPaymentInstructions,
} from '@/services/payments/bkash-manual-provider.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * Return canonical manual payment instructions.
 *
 * Persist the receiving account snapshot before
 * exposing the instructions to the customer.
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
      'bkash_instructions'
    );

    const access =
      readRegistrationAccess(request);

    const { orderId } =
      await context.params;

    if (request.body !== null) {
      return registrationApiError(
        400,
        'UNEXPECTED_REQUEST_BODY'
      );
    }

    const instructions =
      await getEventBkashPaymentInstructions(
        orderId,
        access
      );

    return registrationApiSuccess({
      provider: instructions.provider,

      currency: instructions.currency,

      type: instructions.type,

      receivingNumber:
        instructions.receivingNumber,

      accountType:
        instructions.accountType,

      paymentMethod:
        instructions.accountType === 'personal'
          ? 'send_money'
          : 'payment',

      amountMinor:
        instructions.amountMinor,

      reference:
        instructions.reference,
    });
  } catch (error) {
    return eventPaymentApiFailure(error);
  }
}
