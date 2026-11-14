/**
 * TabStartup Shared Payment Architecture.
 *
 * USD payments: TabEdge.
 * BDT payments: bKash manual verification.
 * Future BDT integration: bKash Merchant API.
 *
 * All monetary amounts use integer minor units.
 * USD = cents; BDT = paisa.
 */

import type { Timestamp } from 'firebase-admin/firestore';

export const PAYMENT_SCHEMA_VERSION = 1 as const;

/**
 * Shared financial collections.
 *
 * All paid TabStartup products use this
 * financial namespace.
 *
 * Product-specific orders remain separate
 * from authoritative payment records.
 */
export const PAYMENT_COLLECTIONS = {
  orders: 'paymentOrders',
  payments: 'payments',
  manualSubmissions: 'paymentManualSubmissions',
  transactionClaims: 'paymentTransactionClaims',
  webhookEvents: 'paymentWebhookEvents',
  refunds: 'paymentRefunds',
  auditLogs: 'paymentAuditLogs',
} as const;

export const SUPPORTED_PAYMENT_CURRENCIES = [
  'USD',
  'BDT',
] as const;

export type PaymentCurrency =
  typeof SUPPORTED_PAYMENT_CURRENCIES[number];

export type PaymentProvider =
  | 'tabedge'
  | 'bkash_manual'
  | 'bkash_api';

export type ActivePaymentProvider =
  | 'tabedge'
  | 'bkash_manual';

export const ACTIVE_PAYMENT_PROVIDER_BY_CURRENCY = {
  USD: 'tabedge',
  BDT: 'bkash_manual',
} as const satisfies Record<
  PaymentCurrency,
  ActivePaymentProvider
>;

export type PaymentMethod =
  | {
      currency: 'USD';
      provider: 'tabedge';
      verificationMode: 'automatic';
    }
  | {
      currency: 'BDT';
      provider: 'bkash_manual';
      verificationMode: 'manual';
    }
  | {
      currency: 'BDT';
      provider: 'bkash_api';
      verificationMode: 'automatic';
    };

export type ActivePaymentMethod = Exclude<
  PaymentMethod,
  { provider: 'bkash_api' }
>;

export type PaymentPurpose =
  | 'event_ticket'
  | 'subscription'
  | 'service'
  | 'startup_promotion'
  | 'event_promotion'
  | 'event_organizer_subscription';

export interface Money {
  currency: PaymentCurrency;
  amountMinor: number;
}

/**
 * Independent prices.
 * No automatic currency conversion.
 */
export interface DualCurrencyPrice {
  usdAmountMinor: number;
  bdtAmountMinor: number;
}

export type PaymentStatus =
  | 'created'
  | 'pending_payment'
  | 'pending_verification'
  | 'processing'
  | 'requires_review'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded'
  | 'disputed';

export type PaymentOrderStatus =
  | 'created'
  | 'awaiting_payment'
  | 'pending_verification'
  | 'paid'
  | 'fulfilled'
  | 'requires_review'
  | 'expired'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded';

export type RefundStatus =
  | 'requested'
  | 'pending_review'
  | 'approved'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'cancelled';

export type PaymentOwner =
  | {
      ownerType: 'platform';
      ownerId: 'tabstartup';
    }
  | {
      ownerType: 'event_organizer';
      ownerId: string;
    };

export interface PaymentRecordBase {
  paymentId: string;
  orderId: string;

  purpose: PaymentPurpose;
  resourceId: string;

  payerUid: string | null;
  owner: PaymentOwner;

  amountMinor: number;
  refundedAmountMinor: number;

  status: PaymentStatus;

  providerPaymentId: string | null;
  providerReference: string | null;

  verifiedAt: Timestamp | null;
  verifiedByUid: string | null;

  schemaVersion: typeof PAYMENT_SCHEMA_VERSION;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PaymentRecord =
  PaymentRecordBase & PaymentMethod;

export interface ManualPaymentSubmission {
  submissionId: string;
  paymentId: string;
  orderId: string;

  provider: 'bkash_manual';
  currency: 'BDT';

  senderNumber: string;
  transactionId: string;

  claimedAmountMinor: number;

  status:
    | 'pending_verification'
    | 'approved'
    | 'rejected'
    | 'requires_review';

  submittedAt: Timestamp;

  reviewedByUid: string | null;
  reviewedAt: Timestamp | null;
  reviewReason: string | null;
}

export interface PaymentRefundRecord {
  refundId: string;
  paymentId: string;
  orderId: string;

  provider: PaymentProvider;
  currency: PaymentCurrency;

  amountMinor: number;
  reason: string;
  status: RefundStatus;

  providerRefundId: string | null;

  requestedByUid: string | null;
  approvedByUid: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
}

export function isPaymentCurrency(
  value: unknown
): value is PaymentCurrency {
  return value === 'USD' || value === 'BDT';
}

export function isValidMinorAmount(
  value: unknown
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function isValidPaidAmount(
  value: unknown
): value is number {
  return isValidMinorAmount(value) && value > 0;
}

export function isValidDualCurrencyPrice(
  value: unknown
): value is DualCurrencyPrice {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const price = value as Record<string, unknown>;

  return (
    isValidMinorAmount(price.usdAmountMinor) &&
    isValidMinorAmount(price.bdtAmountMinor)
  );
}

export function getActivePaymentMethod(
  currency: PaymentCurrency
): ActivePaymentMethod {
  switch (currency) {
    case 'USD':
      return {
        currency: 'USD',
        provider: 'tabedge',
        verificationMode: 'automatic',
      };

    case 'BDT':
      return {
        currency: 'BDT',
        provider: 'bkash_manual',
        verificationMode: 'manual',
      };

    default:
      throw new Error('UNSUPPORTED_PAYMENT_CURRENCY');
  }
}

export function getPriceForCurrency(
  price: DualCurrencyPrice,
  currency: PaymentCurrency
): Money {
  if (!isValidDualCurrencyPrice(price)) {
    throw new Error('INVALID_DUAL_CURRENCY_PRICE');
  }

  switch (currency) {
    case 'USD':
      return {
        currency,
        amountMinor: price.usdAmountMinor,
      };

    case 'BDT':
      return {
        currency,
        amountMinor: price.bdtAmountMinor,
      };

    default:
      throw new Error('UNSUPPORTED_PAYMENT_CURRENCY');
  }
}
