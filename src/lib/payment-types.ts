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
  providerSettings: 'paymentProviderSettings',
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

/**
 * Authoritative financial order.
 * Product-specific orders link to this record.
 */
export interface PaymentOrderBase {
  orderId: string;

  purpose: PaymentPurpose;
  resourceId: string;
  productOrderId: string;

  payerUid: string | null;
  payerEmail: string;

  owner: PaymentOwner;

  amountMinor: number;
  refundedAmountMinor: number;

  status: PaymentOrderStatus;

  activePaymentId: string | null;
  successfulPaymentId: string | null;

  expiresAt: Timestamp | null;
  paidAt: Timestamp | null;
  fulfilledAt: Timestamp | null;

  schemaVersion: typeof PAYMENT_SCHEMA_VERSION;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PaymentOrder =
  PaymentOrderBase & ActivePaymentMethod;

/**
 * Persistent hosted checkout creation claim.
 *
 * A creation claim must never be automatically
 * reclaimed after a timeout or server crash.
 */
export interface TabEdgeCheckoutClaimBase {
  provider: 'tabedge';

  attemptId: string;

  merchantReference: string;

  amountMinor: number;

  currency: 'USD';

  claimedAt: Timestamp;

  updatedAt: Timestamp;
}

export type TabEdgeCheckoutInitiation =
  TabEdgeCheckoutClaimBase &
    (
      | {
          status: 'creating';

          checkoutId: null;

          checkoutUrl: null;

          completedAt: null;

          failureCode: null;
        }
      | {
          status: 'ready';

          checkoutId: string;

          checkoutUrl: string;

          completedAt: Timestamp;

          failureCode: null;
        }
      | {
          status: 'requires_review';

          checkoutId: string | null;

          checkoutUrl: string | null;

          completedAt: Timestamp;

          failureCode:
            | 'configuration'
            | 'provider_rejected'
            | 'outcome_unknown'
            | 'invalid_response'
            | 'persistence_failed'
            | 'payment_window_expired'
            | 'unexpected_error';
        }
    );

/**
 * Immutable receiving account information
 * for an individual manual payment.
 */
export type BkashAccountSnapshot = {
  receivingNumber: string;

  configVersion: number;

  capturedAt: Timestamp;
} & (
  | {
      accountType: 'personal';

      paymentMethod: 'send_money';
    }
  | {
      accountType: 'merchant';

      paymentMethod: 'payment';
    }
);

/**
 * Persistent uniqueness claim for a
 * normalized bKash transaction ID.
 *
 * Rejected submissions must not
 * automatically release this claim.
 */
export interface BkashTransactionClaim {
  claimId: string;

  provider: 'bkash_manual';

  currency: 'BDT';

  transactionId: string;

  paymentId: string;

  paymentOrderId: string;

  productOrderId: string;

  resourceId: string;

  submissionId: string;

  amountMinor: number;

  schemaVersion: typeof PAYMENT_SCHEMA_VERSION;

  createdAt: Timestamp;
}

/**
 * Server-only platform bKash configuration.
 *
 * Existing payment snapshots are never
 * modified by configuration changes.
 */
export interface BkashProviderSettings {
  provider: 'bkash_manual';

  currency: 'BDT';

  enabled: boolean;

  receivingNumber: string;

  accountType: 'personal' | 'merchant';

  configVersion: number;

  schemaVersion: typeof PAYMENT_SCHEMA_VERSION;

  createdAt: Timestamp;

  updatedAt: Timestamp;

  updatedByUid: string;
}

/**
 * Configuration change audit record.
 *
 * Stored in the private payment audit collection.
 */
export interface BkashSettingsAuditRecord {
  auditId: string;

  action: 'bkash_settings_updated';

  provider: 'bkash_manual';

  actorType: 'admin';

  actorUid: string;

  previous: BkashProviderSettings | null;

  current: BkashProviderSettings;

  schemaVersion: typeof PAYMENT_SCHEMA_VERSION;

  createdAt: Timestamp;
}

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

  /**
   * Optional for backward compatibility.
   * Only used by the TabEdge hosted checkout flow.
   */
  checkoutInitiation?: TabEdgeCheckoutInitiation;

  /**
   * Immutable once payment instructions
   * have been issued to the customer.
   */
  bkashAccountSnapshot?: BkashAccountSnapshot;

  /**
   * Canonical manual payment submission.
   */
  manualSubmissionId?: string;

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

  /**
   * Receiving account used for verification.
   */
  bkashAccountSnapshot?: BkashAccountSnapshot;

  transactionClaimId?: string;

  status:
    | 'pending_verification'
    | 'approved'
    | 'rejected'
    | 'requires_review';

  submittedAt: Timestamp;

  reviewDeadlineAt?: Timestamp;

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
