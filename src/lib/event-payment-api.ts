import 'server-only';

import {
  PaymentProviderError,
} from '@/lib/payment-provider';

import {
  TabEdgeRequestError,
} from '@/services/payments/tabedge-provider.service';

import {
  registrationApiError,
  registrationApiFailure,
} from '@/lib/event-registration-api';

/**
 * Public-safe payment API error mapping.
 *
 * Never expose provider credentials,
 * response bodies or internal payment metadata.
 */
export function eventPaymentApiFailure(
  error: unknown
) {
  if (error instanceof PaymentProviderError) {
    switch (error.code) {
      case 'PAYMENT_WINDOW_EXPIRED':
      case 'PAYMENT_NOT_PAYABLE':
      case 'PAYMENT_METHOD_MISMATCH':
        return registrationApiError(
          409,
          error.code
        );

      case 'PAYMENT_PROVIDER_DISABLED':
      case 'PAYMENT_PROVIDER_UNAVAILABLE':
        return registrationApiError(
          503,
          'PAYMENT_PROVIDER_UNAVAILABLE'
        );

      case 'INVALID_PAYMENT_ORDER':
      case 'INVALID_PAYMENT_RECORD':
      case 'PAYMENT_RECORD_MISMATCH':
        return registrationApiError(
          409,
          'PAYMENT_UNAVAILABLE'
        );

      default:
        return registrationApiError(
          500,
          'PAYMENT_SERVICE_UNAVAILABLE'
        );
    }
  }

  if (error instanceof TabEdgeRequestError) {
    return registrationApiError(
      503,
      'PAYMENT_PROVIDER_UNAVAILABLE'
    );
  }

  return registrationApiFailure(error);
}
