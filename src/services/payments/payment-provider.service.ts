import 'server-only';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  PAYMENT_SCHEMA_VERSION,
  isValidPaidAmount,
  getActivePaymentMethod,
  type PaymentOrder,
  type PaymentRecord,
} from '@/lib/payment-types';

import {
  isActivePaymentMethod,
} from '@/lib/payment-lifecycle';

import {
  PaymentProviderError,
  type PaymentInitiationContext,
} from '@/lib/payment-provider';

function validId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    value !== '.' &&
    value !== '..' &&
    !/^__.*__$/.test(value) &&
    !/[\/\u0000-\u001f\u007f]/.test(value)
  );
}

function validTimestamp(
  value: unknown
): value is Timestamp {
  return (
    value instanceof Timestamp &&
    Number.isSafeInteger(value.toMillis()) &&
    value.toMillis() > 0 &&
    value.toMillis() <= 253402300799999
  );
}

function validOwner(
  value: unknown
): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const owner =
    value as Record<string, unknown>;

  return (
    owner.ownerType === 'platform' &&
    owner.ownerId === 'tabstartup'
  );
}

const PURPOSES = new Set([
  'event_ticket',
  'subscription',
  'service',
  'startup_promotion',
  'event_promotion',
  'event_organizer_subscription',
]);

export function validatePendingPaymentIntegrity(
  order: PaymentOrder,
  payment: PaymentRecord
): PaymentInitiationContext {
  if (
    !order ||
    order.schemaVersion !==
      PAYMENT_SCHEMA_VERSION ||
    !validId(order.orderId) ||
    !validId(order.resourceId) ||
    !validId(order.productOrderId) ||
    !validId(order.activePaymentId) ||
    !PURPOSES.has(order.purpose) ||
    !validOwner(order.owner) ||
    !isValidPaidAmount(order.amountMinor) ||
    order.refundedAmountMinor !== 0 ||
    order.successfulPaymentId !== null ||
    order.paidAt !== null ||
    order.fulfilledAt !== null ||
    !validTimestamp(order.expiresAt) ||
    !validTimestamp(order.createdAt) ||
    !validTimestamp(order.updatedAt) ||
    (
      order.payerUid !== null &&
      !validId(order.payerUid)
    ) ||
    typeof order.payerEmail !== 'string' ||
    order.payerEmail.length === 0 ||
    order.payerEmail.length > 254
  ) {
    throw new PaymentProviderError(
      'INVALID_PAYMENT_ORDER'
    );
  }

  if (
    !payment ||
    payment.schemaVersion !==
      PAYMENT_SCHEMA_VERSION ||
    !validId(payment.paymentId) ||
    !validId(payment.orderId) ||
    !validId(payment.resourceId) ||
    !validOwner(payment.owner) ||
    !isValidPaidAmount(payment.amountMinor) ||
    payment.refundedAmountMinor !== 0 ||
    payment.verifiedAt !== null ||
    payment.verifiedByUid !== null ||
    !validTimestamp(payment.createdAt) ||
    !validTimestamp(payment.updatedAt)
  ) {
    throw new PaymentProviderError(
      'INVALID_PAYMENT_RECORD'
    );
  }

  if (
    payment.paymentId !==
      order.activePaymentId ||
    payment.orderId !== order.orderId ||
    payment.resourceId !== order.resourceId ||
    payment.purpose !== order.purpose ||
    payment.payerUid !== order.payerUid ||
    payment.amountMinor !== order.amountMinor ||
    payment.owner.ownerType !==
      order.owner.ownerType ||
    payment.owner.ownerId !==
      order.owner.ownerId
  ) {
    throw new PaymentProviderError(
      'PAYMENT_RECORD_MISMATCH'
    );
  }

  if (
    !isActivePaymentMethod(order) ||
    !isActivePaymentMethod(payment) ||
    payment.currency !== order.currency ||
    payment.provider !== order.provider ||
    payment.verificationMode !==
      order.verificationMode
  ) {
    throw new PaymentProviderError(
      'PAYMENT_METHOD_MISMATCH'
    );
  }

  if (
    order.status !== 'awaiting_payment' ||
    payment.status !== 'pending_payment'
  ) {
    throw new PaymentProviderError(
      'PAYMENT_NOT_PAYABLE'
    );
  }

  const expiresAtMs =
    order.expiresAt.toMillis();

  const method =
    getActivePaymentMethod(order.currency);

  return {
    ...method,

    paymentOrderId: order.orderId,
    paymentId: payment.paymentId,

    productOrderId: order.productOrderId,
    resourceId: order.resourceId,

    purpose: order.purpose,
    owner: order.owner,

    amountMinor: order.amountMinor,

    expiresAtMs,
  };
}

/**
 * New payment initiation must always
 * enforce the original payment deadline.
 */
export function validatePaymentInitiation(
  order: PaymentOrder,
  payment: PaymentRecord,
  nowMs = Date.now()
): PaymentInitiationContext {
  const context =
    validatePendingPaymentIntegrity(
      order,
      payment
    );

  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs <= 0 ||
    context.expiresAtMs <= nowMs
  ) {
    throw new PaymentProviderError(
      'PAYMENT_WINDOW_EXPIRED'
    );
  }

  return context;
}

export function isPaymentProviderEnabled(
  provider: 'tabedge' | 'bkash_manual'
): boolean {
  if (provider === 'tabedge') {
    return (
      process.env.TABEDGE_PAYMENTS_ENABLED ===
      'true'
    );
  }

  if (provider === 'bkash_manual') {
    return (
      process.env.BKASH_MANUAL_PAYMENTS_ENABLED ===
      'true'
    );
  }

  return false;
}

export function requirePaymentProviderEnabled(
  provider: 'tabedge' | 'bkash_manual'
): void {
  if (!isPaymentProviderEnabled(provider)) {
    throw new PaymentProviderError(
      'PAYMENT_PROVIDER_DISABLED'
    );
  }
}
