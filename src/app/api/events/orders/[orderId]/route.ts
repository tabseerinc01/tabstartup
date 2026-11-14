import { NextRequest } from 'next/server';

import {
  readRegistrationAccess,
} from '@/lib/event-registration-access';

import {
  requireRegistrationEnabled,
  registrationApiSuccess,
  registrationApiFailure,
} from '@/lib/event-registration-api';

import {
  getAuthorizedEventOrder,
} from '@/services/event-order-access.service';

import {
  consumeEventRegistrationAttempt,
} from '@/services/event-registration-rate-limit.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      orderId: string;
    }>;
  }
) {
  try {
    requireRegistrationEnabled();

    await consumeEventRegistrationAttempt(
      request,
      'order_status'
    );

    const access =
      readRegistrationAccess(request);

    const { orderId } =
      await context.params;

    const order =
      await getAuthorizedEventOrder(
        orderId,
        access
      );

    return registrationApiSuccess(order);
  } catch (error) {
    return registrationApiFailure(error);
  }
}
