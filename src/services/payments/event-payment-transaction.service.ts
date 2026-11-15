import 'server-only';

import {
  Timestamp,
  type Transaction,
  type Firestore,
} from 'firebase-admin/firestore';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventReservation,
  type EventTicketInventory,
} from '@/lib/event-types';

import {
  PAYMENT_COLLECTIONS,
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
  validatePaymentInitiation,
  requirePaymentProviderEnabled,
} from '@/services/payments/payment-provider.service';

import {
  readAuthorizedEventOrder,
} from '@/services/event-order-access.service';

import type {
  RegistrationAccessContext,
} from '@/services/event-registration.service';

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
 * Internal transactional payment preflight.
 *
 * The caller must resolve uid from verified
 * authentication before entering this transaction.
 *
 * No writes or external provider calls occur here.
 * All returned records remain server-side.
 */
export async function readEventPaymentTransaction(
  tx: Transaction,
  db: Firestore,
  orderId: string,
  access: RegistrationAccessContext,
  uid: string | null,
  expectedProvider: 'tabedge' | 'bkash_manual'
) {
  const order = await readAuthorizedEventOrder(
    tx,
    db,
    orderId,
    access,
    uid
  );

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

  if (order.status !== 'awaiting_payment') {
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
    reservation.status !== 'active' ||
    reservation.consumedAt !== null ||
    reservation.releasedAt !== null ||
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
    !isValidInventoryCounters(inventory) ||
    inventory.reservedQuantity < item.quantity
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

  const context = validatePaymentInitiation(
    paymentOrder,
    payment,
    Date.now()
  );

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
