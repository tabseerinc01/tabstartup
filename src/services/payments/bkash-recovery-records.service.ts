import 'server-only';

import {
  validateBkashAccountSnapshot,
} from '@/services/payments/bkash-manual-provider.service';

import {
  Timestamp,
  type Transaction,
  type Firestore,
} from 'firebase-admin/firestore';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type PersistedEventOrder,
  type EventReservation,
  type EventTicketInventory,
} from '@/lib/event-types';

import {
  PAYMENT_COLLECTIONS,
  PAYMENT_SCHEMA_VERSION,
  type PaymentOrder,
  type PaymentRecord,
} from '@/lib/payment-types';

import {
  isValidEventDocumentId,
  isValidInventoryCounters,
  calculateTicketTotalMinor,
} from '@/lib/event-validation';

import {
  PaymentProviderError,
} from '@/lib/payment-provider';

import {

  requirePaymentProviderEnabled,
} from '@/services/payments/payment-provider.service';



function invalid(): never {
  throw new PaymentProviderError(
    'PAYMENT_RECORD_MISMATCH'
  );
}

function validId(
  value: unknown
): value is string {
  return (
    isValidEventDocumentId(value) &&
    !/^__.*__$/.test(value)
  );
}

function timestampMs(
  value: unknown
): number {
  if (!(value instanceof Timestamp)) {
    return invalid();
  }

  const ms = value.toMillis();

  if (
    !Number.isSafeInteger(ms) ||
    ms <= 0 ||
    ms > 253402300799999
  ) {
    return invalid();
  }

  return ms;
}

/**
 * Internal validation for an already authorized order.
 * Never call with an untrusted customer-supplied order.
 */
export async function readAuthorizedBkashRecoveryRecords(
  tx: Transaction,
  db: Firestore,
  orderId: string,
  order: PersistedEventOrder,
  expectedProvider: 'bkash_manual'
) {

  if (
    order.schemaVersion !== EVENT_SCHEMA_VERSION ||
    order.orderId !== orderId ||
    order.organizerType !== 'platform' ||
    order.organizerId !==
      PLATFORM_EVENT_ORGANIZER_ID ||
    !validId(order.eventId) ||
    !validId(order.reservationId) ||
    order.paymentRequired !== true ||
    !validId(order.paymentOrderId) ||
    !Array.isArray(order.items) ||
    order.items.length !== 1
  ) {
    return invalid();
  }

  if (order.status !== 'requires_review') {
    throw new PaymentProviderError(
      'PAYMENT_NOT_PAYABLE'
    );
  }

  if (
    order.provider !== expectedProvider
  ) {
    throw new PaymentProviderError(
      'PAYMENT_METHOD_MISMATCH'
    );
  }

  const item = order.items[0];

  if (
    !item ||
    !validId(item.ticketTypeId) ||
    !Number.isSafeInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 20 ||
    !Number.isSafeInteger(item.unitAmountMinor) ||
    item.unitAmountMinor <= 0 ||
    !Number.isSafeInteger(order.totalAmountMinor) ||
    order.totalAmountMinor <= 0 ||
    item.totalAmountMinor !==
      order.totalAmountMinor ||
    calculateTicketTotalMinor(
      item.unitAmountMinor,
      item.quantity
    ) !== order.totalAmountMinor
  ) {
    return invalid();
  }

  const orderRef = db
    .collection(EVENT_COLLECTIONS.orders)
    .doc(orderId);

  const paymentOrderRef = db
    .collection(PAYMENT_COLLECTIONS.orders)
    .doc(order.paymentOrderId);

  const reservationRef = db
    .collection(EVENT_COLLECTIONS.reservations)
    .doc(order.reservationId);

  const inventoryRef = db
    .collection(EVENT_COLLECTIONS.inventory)
    .doc(item.ticketTypeId);

  const [
    paymentOrderSnap,
    reservationSnap,
    inventorySnap,
  ] = await tx.getAll(
    paymentOrderRef,
    reservationRef,
    inventoryRef
  );

  if (
    !paymentOrderSnap.exists ||
    !reservationSnap.exists ||
    !inventorySnap.exists
  ) {
    return invalid();
  }

  const paymentOrder =
    paymentOrderSnap.data() as PaymentOrder;

  const reservation =
    reservationSnap.data() as EventReservation;

  const inventory =
    inventorySnap.data() as EventTicketInventory;

  if (
    !paymentOrder ||
    paymentOrder.orderId !== paymentOrderRef.id ||
    !validId(paymentOrder.activePaymentId) ||
    paymentOrder.productOrderId !== orderId ||
    paymentOrder.resourceId !== order.eventId ||
    paymentOrder.purpose !== 'event_ticket' ||
    paymentOrder.payerUid !== order.purchaserUid ||
    paymentOrder.payerEmail !== order.purchaserEmail ||
    paymentOrder.amountMinor !==
      order.totalAmountMinor ||
    paymentOrder.currency !== order.currency ||
    paymentOrder.provider !== order.provider ||
    paymentOrder.verificationMode !==
      order.verificationMode ||
    paymentOrder.successfulPaymentId !== null ||
    order.successfulPaymentId !== null ||
    order.paidAt !== null ||
    order.fulfilledAt !== null
  ) {
    return invalid();
  }

  if (
    !reservation ||
    reservation.reservationId !==
      reservationRef.id ||
    reservation.eventId !== order.eventId ||
    reservation.orderId !== orderId ||
    reservation.status !== 'expired' ||
    reservation.consumedAt !== null ||
    !(reservation.releasedAt instanceof Timestamp) ||
    !Array.isArray(reservation.items) ||
    reservation.items.length !== 1 ||
    !reservation.items[0] ||
    reservation.items[0].ticketTypeId !==
      item.ticketTypeId ||
    reservation.items[0].quantity !==
      item.quantity
  ) {
    return invalid();
  }

  if (
    !inventory ||
    inventory.eventId !== order.eventId ||
    inventory.ticketTypeId !== item.ticketTypeId ||
    !isValidInventoryCounters(inventory)
  ) {
    return invalid();
  }

  const expiresAtMs =
    timestampMs(order.expiresAt);

  if (
    timestampMs(paymentOrder.expiresAt) !==
      expiresAtMs ||
    timestampMs(reservation.expiresAt) !==
      expiresAtMs
  ) {
    return invalid();
  }

  const paymentRef = db
    .collection(PAYMENT_COLLECTIONS.payments)
    .doc(paymentOrder.activePaymentId);

  const paymentSnap = await tx.get(paymentRef);

  if (!paymentSnap.exists) {
    return invalid();
  }

  const payment =
    paymentSnap.data() as PaymentRecord;

  if (
    !payment ||
    payment.paymentId !== paymentRef.id
  ) {
    return invalid();
  }

  if (
    paymentOrder.schemaVersion !== PAYMENT_SCHEMA_VERSION ||
    payment.schemaVersion !== PAYMENT_SCHEMA_VERSION ||
    paymentOrder.status !== 'requires_review' ||
    payment.status !== 'requires_review' ||
    payment.orderId !== paymentOrderRef.id ||
    payment.resourceId !== order.eventId ||
    payment.purpose !== 'event_ticket' ||
    payment.payerUid !== order.purchaserUid ||
    payment.verificationMode !== 'manual' ||
    paymentOrder.verificationMode !== 'manual' ||
    order.verificationMode !== 'manual' ||
    payment.provider !== 'bkash_manual' ||
    paymentOrder.provider !== 'bkash_manual' ||
    payment.currency !== 'BDT' ||
    paymentOrder.currency !== 'BDT' ||
    order.currency !== 'BDT' ||
    payment.amountMinor !== order.totalAmountMinor ||
    payment.verifiedAt !== null ||
    payment.verifiedByUid !== null ||
    payment.providerPaymentId !== null ||
    payment.providerReference !== null ||
    payment.checkoutInitiation !== undefined ||
    payment.manualSubmissionId !== undefined ||
    expiresAtMs > Date.now() ||
    reservation.releasedAt.toMillis() < expiresAtMs ||
    reservation.releasedAt.toMillis() > Date.now()
  ) {
    return invalid();
  }

  const snapshot = validateBkashAccountSnapshot(
    payment.bkashAccountSnapshot
  );

  const paymentCreatedAtMs =
    timestampMs(payment.createdAt);

  const snapshotCapturedAtMs =
    timestampMs(snapshot.capturedAt);

  if (
    paymentCreatedAtMs >= expiresAtMs ||
    snapshotCapturedAtMs < paymentCreatedAtMs ||
    snapshotCapturedAtMs >= expiresAtMs ||
    snapshotCapturedAtMs > Date.now()
  ) {
    return invalid();
  }

  const context = {
    provider: 'bkash_manual' as const,
    paymentId: payment.paymentId,
    paymentOrderId: paymentOrder.orderId,
    resourceId: order.eventId,
    amountMinor: order.totalAmountMinor,
    expiresAtMs,
  };

  if (
    context.provider !== expectedProvider ||
    context.amountMinor !== order.totalAmountMinor ||
    context.expiresAtMs !== expiresAtMs
  ) {
    return invalid();
  }

  requirePaymentProviderEnabled(
    context.provider
  );

  return {
    context,

    order,
    paymentOrder,
    payment,
    reservation,
    inventory,

    refs: {
      order: orderRef,
      paymentOrder: paymentOrderRef,
      payment: paymentRef,
      reservation: reservationRef,
      inventory: inventoryRef,
    },
  };
}
