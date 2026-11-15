import type {
  ActivePaymentMethod,
  PaymentPurpose,
  PaymentOwner,
} from '@/lib/payment-types';

export type PaymentProviderErrorCode =
  | 'INVALID_PAYMENT_ORDER'
  | 'INVALID_PAYMENT_RECORD'
  | 'PAYMENT_RECORD_MISMATCH'
  | 'PAYMENT_METHOD_MISMATCH'
  | 'PAYMENT_NOT_PAYABLE'
  | 'PAYMENT_WINDOW_EXPIRED'
  | 'PAYMENT_PROVIDER_DISABLED'
  | 'PAYMENT_PROVIDER_UNAVAILABLE';

export class PaymentProviderError extends Error {
  constructor(
    public readonly code: PaymentProviderErrorCode
  ) {
    super(code);
    this.name = 'PaymentProviderError';
  }
}

export type PaymentInitiationContext = {
  paymentOrderId: string;
  paymentId: string;

  productOrderId: string;
  resourceId: string;

  purpose: PaymentPurpose;
  owner: PaymentOwner;

  amountMinor: number;

  expiresAtMs: number;
} & ActivePaymentMethod;

export interface HostedCheckoutResult {
  provider: 'tabedge';
  currency: 'USD';

  type: 'hosted_checkout';

  checkoutSessionId: string;
  checkoutUrl: string;
}

export interface ManualPaymentInstructions {
  provider: 'bkash_manual';
  currency: 'BDT';

  type: 'manual_payment';

  receivingNumber: string;

  accountType: 'merchant' | 'personal';

  amountMinor: number;
  reference: string;
}

export type PaymentInitiationResult =
  | HostedCheckoutResult
  | ManualPaymentInstructions;
