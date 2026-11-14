/**
 * TabStartup Shared Payment Lifecycle Policy.
 *
 * Active payment methods:
 * USD - TabEdge automated verification.
 * BDT - bKash manual verification.
 *
 * Future: bKash Merchant API.
 *
 * These helpers do not perform authentication,
 * provider verification or financial writes.
 */

import type {
  PaymentStatus,
  PaymentOrderStatus,
  PaymentProvider,
  PaymentCurrency,
  PaymentMethod,
  PaymentRecord,
  ManualPaymentSubmission,
} from '@/lib/payment-types';

import {
  isValidMinorAmount,
  isValidPaidAmount,
} from '@/lib/payment-types';

export const PAYMENT_STATUS_TRANSITIONS:
  Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
    created: [
      'pending_payment',
      'failed',
      'cancelled',
    ],

    pending_payment: [
      'pending_verification',
      'processing',
      'requires_review',
      'succeeded',
      'failed',
      'expired',
      'cancelled',
    ],

    pending_verification: [
      'requires_review',
      'succeeded',
      'rejected',
      'expired',
      'cancelled',
    ],

    processing: [
      'requires_review',
      'succeeded',
      'failed',
      'expired',
    ],

    requires_review: [
      'succeeded',
      'rejected',
      'failed',
      'cancelled',
    ],

    succeeded: [
      'partially_refunded',
      'refunded',
      'disputed',
    ],

    failed: [
      'requires_review',
    ],

    rejected: [
      'requires_review',
    ],

    expired: [
      'requires_review',
    ],

    cancelled: [
      'requires_review',
    ],

    partially_refunded: [
      'refunded',
      'disputed',
    ],

    refunded: [],

    disputed: [
      'requires_review',
    ],
  };

export const PAYMENT_ORDER_STATUS_TRANSITIONS:
  Readonly<
    Record<
      PaymentOrderStatus,
      readonly PaymentOrderStatus[]
    >
  > = {
    created: [
      'awaiting_payment',
      'fulfilled',
      'cancelled',
    ],

    awaiting_payment: [
      'pending_verification',
      'paid',
      'requires_review',
      'expired',
      'cancelled',
    ],

    pending_verification: [
      'paid',
      'requires_review',
      'expired',
      'cancelled',
    ],

    paid: [
      'fulfilled',
      'requires_review',
      'partially_refunded',
      'refunded',
    ],

    fulfilled: [
      'requires_review',
      'partially_refunded',
      'refunded',
    ],

    requires_review: [
      'paid',
      'fulfilled',
      'cancelled',
      'partially_refunded',
      'refunded',
    ],

    expired: [
      'requires_review',
    ],

    cancelled: [
      'requires_review',
    ],

    partially_refunded: [
      'requires_review',
      'refunded',
    ],

    refunded: [],
  };

export type PaymentTransitionActor =
  | 'customer'
  | 'admin'
  | 'verified_provider'
  | 'system';

export function isSupportedPaymentMethod(
  value: unknown
): value is PaymentMethod {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const method =
    value as Record<string, unknown>;

  if (
    method.currency === 'USD' &&
    method.provider === 'tabedge' &&
    method.verificationMode === 'automatic'
  ) {
    return true;
  }

  if (
    method.currency === 'BDT' &&
    method.provider === 'bkash_manual' &&
    method.verificationMode === 'manual'
  ) {
    return true;
  }

  return (
    method.currency === 'BDT' &&
    method.provider === 'bkash_api' &&
    method.verificationMode === 'automatic'
  );
}

export function isActivePaymentMethod(
  value: unknown
): boolean {
  return (
    isSupportedPaymentMethod(value) &&
    value.provider !== 'bkash_api'
  );
}

export function canTransitionPaymentStatus(
  payment: Pick<
    PaymentRecord,
    'provider' |
    'currency' |
    'verificationMode' |
    'status'
  >,
  nextStatus: PaymentStatus,
  actor: PaymentTransitionActor
): boolean {
  if (!isActivePaymentMethod(payment)) {
    return false;
  }

  const transitions =
    PAYMENT_STATUS_TRANSITIONS[payment.status];

  if (
    !Array.isArray(transitions) ||
    !transitions.includes(nextStatus)
  ) {
    return false;
  }

  if (actor === 'customer') {
    return (
      payment.provider === 'bkash_manual' &&
      payment.status === 'pending_payment' &&
      nextStatus === 'pending_verification'
    );
  }

  if (nextStatus === 'succeeded') {
    if (payment.provider === 'bkash_manual') {
      return (
        actor === 'admin' &&
        (
          payment.status ===
            'pending_verification' ||
          payment.status === 'requires_review'
        )
      );
    }

    return (
      payment.provider === 'tabedge' &&
      actor === 'verified_provider'
    );
  }

  if (
    nextStatus === 'partially_refunded' ||
    nextStatus === 'refunded'
  ) {
    return (
      (
        payment.provider === 'tabedge' &&
        actor === 'verified_provider'
      ) ||
      (
        payment.provider === 'bkash_manual' &&
        actor === 'admin'
      )
    );
  }

  if (nextStatus === 'disputed') {
    return (
      payment.provider === 'tabedge' &&
      actor === 'verified_provider'
    );
  }

  if (nextStatus === 'pending_verification') {
    return (
      payment.provider === 'bkash_manual' &&
      actor === 'system'
    );
  }

  if (nextStatus === 'processing') {
    return (
      payment.provider === 'tabedge' &&
      (
        actor === 'system' ||
        actor === 'verified_provider'
      )
    );
  }

  if (nextStatus === 'rejected') {
    return (
      payment.provider === 'bkash_manual' &&
      actor === 'admin'
    );
  }

  if (actor === 'verified_provider') {
    return (
      payment.provider === 'tabedge' &&
      (
        nextStatus === 'failed' ||
        nextStatus === 'requires_review'
      )
    );
  }

  if (actor === 'admin') {
    return (
      nextStatus === 'requires_review' ||
      nextStatus === 'cancelled'
    );
  }

  if (actor === 'system') {
    return (
      nextStatus === 'pending_payment' ||
      nextStatus === 'expired' ||
      nextStatus === 'failed' ||
      nextStatus === 'requires_review'
    );
  }

  return false;
}

/**
 * Structural order transition only.
 *
 * Paid and fulfilled transitions additionally require
 * transactional payment and fulfillment verification.
 */
export function canTransitionPaymentOrderStatus(
  currentStatus: PaymentOrderStatus,
  nextStatus: PaymentOrderStatus
): boolean {
  const transitions =
    PAYMENT_ORDER_STATUS_TRANSITIONS[currentStatus];

  return (
    Array.isArray(transitions) &&
    transitions.includes(nextStatus)
  );
}

export function normalizeBkashSenderNumber(
  value: unknown
): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 32
  ) {
    return null;
  }

  let number = value.trim();

  if (number.startsWith('+880')) {
    number = '0' + number.slice(4);
  } else if (number.startsWith('880')) {
    number = '0' + number.slice(3);
  }

  return /^01[3-9][0-9]{8}$/.test(number)
    ? number
    : null;
}

/**
 * Normalize the customer-supplied reference.
 *
 * Format validation is not proof of payment.
 * Provider-specific restrictions may be refined
 * after reviewing actual bKash transaction records.
 */
export function normalizeBkashTransactionId(
  value: unknown
): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 64
  ) {
    return null;
  }

  const transactionId =
    value.trim().toUpperCase();

  return /^[A-Z0-9]{6,32}$/.test(transactionId)
    ? transactionId
    : null;
}

export interface ValidatedBkashSubmission {
  senderNumber: string;
  transactionId: string;
}

export function validateBkashSubmission(
  value: unknown
): ValidatedBkashSubmission {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('INVALID_BKASH_SUBMISSION');
  }

  const input =
    value as Record<string, unknown>;

  const allowedFields = new Set([
    'senderNumber',
    'transactionId',
  ]);

  if (
    Object.keys(input).some(
      key => !allowedFields.has(key)
    )
  ) {
    throw new Error(
      'UNEXPECTED_BKASH_SUBMISSION_FIELD'
    );
  }

  const senderNumber =
    normalizeBkashSenderNumber(
      input.senderNumber
    );

  const transactionId =
    normalizeBkashTransactionId(
      input.transactionId
    );

  if (!senderNumber) {
    throw new Error(
      'INVALID_BKASH_SENDER_NUMBER'
    );
  }

  if (!transactionId) {
    throw new Error(
      'INVALID_BKASH_TRANSACTION_ID'
    );
  }

  return {
    senderNumber,
    transactionId,
  };
}

/**
 * Evidence must be constructed by trusted
 * provider or administrative verification services.
 *
 * Never deserialize customer input directly
 * into this interface.
 */
export interface VerifiedPaymentEvidence {
  provider: PaymentProvider;
  currency: PaymentCurrency;

  orderId: string;
  paymentId: string;

  providerPaymentId: string;

  amountMinor: number;

  verificationSource:
    | 'verified_provider'
    | 'admin';
}

export function matchesVerifiedPaymentEvidence(
  payment: PaymentRecord,
  evidence: VerifiedPaymentEvidence
): boolean {
  if (!isActivePaymentMethod(payment)) {
    return false;
  }

  if (
    !isValidPaidAmount(payment.amountMinor) ||
    !isValidPaidAmount(evidence.amountMinor)
  ) {
    return false;
  }

  if (
    payment.provider !== evidence.provider ||
    payment.currency !== evidence.currency ||
    payment.orderId !== evidence.orderId ||
    payment.paymentId !== evidence.paymentId ||
    payment.amountMinor !== evidence.amountMinor
  ) {
    return false;
  }

  if (
    typeof evidence.providerPaymentId !==
      'string' ||
    evidence.providerPaymentId.trim().length === 0 ||
    evidence.providerPaymentId.length > 256
  ) {
    return false;
  }

  if (
    payment.providerPaymentId !== null &&
    payment.providerPaymentId !==
      evidence.providerPaymentId
  ) {
    return false;
  }

  if (payment.provider === 'tabedge') {
    return (
      evidence.verificationSource ===
        'verified_provider'
    );
  }

  if (payment.provider === 'bkash_manual') {
    return (
      evidence.verificationSource === 'admin' &&
      normalizeBkashTransactionId(
        evidence.providerPaymentId
      ) === evidence.providerPaymentId
    );
  }

  return false;
}

export function matchesBkashSubmission(
  payment: PaymentRecord,
  submission: ManualPaymentSubmission,
  evidence: VerifiedPaymentEvidence
): boolean {
  if (
    payment.provider !== 'bkash_manual' ||
    submission.provider !== 'bkash_manual' ||
    submission.currency !== 'BDT'
  ) {
    return false;
  }

  if (
    submission.status !==
      'pending_verification' &&
    submission.status !== 'requires_review'
  ) {
    return false;
  }

  return (
    matchesVerifiedPaymentEvidence(
      payment,
      evidence
    ) &&
    submission.paymentId === payment.paymentId &&
    submission.orderId === payment.orderId &&
    submission.claimedAmountMinor ===
      payment.amountMinor &&
    normalizeBkashTransactionId(
      submission.transactionId
    ) === submission.transactionId &&
    submission.transactionId ===
      evidence.providerPaymentId &&
    normalizeBkashSenderNumber(
      submission.senderNumber
    ) === submission.senderNumber
  );
}

export function getRemainingRefundableAmount(
  payment: Pick<
    PaymentRecord,
    'status' |
    'amountMinor' |
    'refundedAmountMinor'
  >
): number {
  if (
    !isValidPaidAmount(payment.amountMinor) ||
    !isValidMinorAmount(
      payment.refundedAmountMinor
    ) ||
    payment.refundedAmountMinor >
      payment.amountMinor
  ) {
    throw new Error(
      'INVALID_PAYMENT_REFUND_BALANCE'
    );
  }

  if (
    payment.status !== 'succeeded' &&
    payment.status !== 'partially_refunded'
  ) {
    return 0;
  }

  return (
    payment.amountMinor -
    payment.refundedAmountMinor
  );
}

export function isValidRefundAmount(
  payment: Pick<
    PaymentRecord,
    'status' |
    'amountMinor' |
    'refundedAmountMinor'
  >,
  amountMinor: unknown
): boolean {
  return (
    isValidPaidAmount(amountMinor) &&
    amountMinor <=
      getRemainingRefundableAmount(payment)
  );
}
