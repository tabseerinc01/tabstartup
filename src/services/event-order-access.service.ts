import 'server-only';

import {
  readConfirmedEventTickets,
} from '@/services/event-confirmed-ticket-reader.service';

import {
  readAuthorizedBkashRecoveryRecords,
} from '@/services/payments/bkash-recovery-records.service';

import {
  validateBkashAccountSnapshot,
} from '@/services/payments/bkash-manual-provider.service';

import {
  PaymentProviderError,
} from '@/lib/payment-provider';

import {
  PAYMENT_COLLECTIONS,
} from '@/lib/payment-types';

import {
  createHash,
  timingSafeEqual,
} from 'node:crypto';

import {
  Timestamp,
  type Transaction,
  type Firestore,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  assertGlobalAccountNotSuspended,
} from '@/services/account-suspension-guard.service';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type PersistedEventOrder,
} from '@/lib/event-types';

import {
  isValidEventDocumentId,
  calculateTicketTotalMinor,
} from '@/lib/event-validation';

import {
  EventRegistrationError,
} from '@/lib/event-registration-policy';

import {
  RegistrationApiError,
} from '@/lib/event-registration-api';

import type {
  RegistrationAccessContext,
} from '@/services/event-registration.service';

const ORDER_STATUSES = new Set([
  'created',
  'awaiting_payment',
  'pending_verification',
  'paid',
  'fulfilled',
  'requires_review',
  'expired',
  'cancelled',
  'partially_refunded',
  'refunded',
]);

function notFound(): never {
  throw new RegistrationApiError(
    404,
    'EVENT_ORDER_NOT_FOUND'
  );
}

function invalidOrder(): never {
  throw new EventRegistrationError(
    'REGISTRATION_DATA_INVALID'
  );
}

function matchesGuestSession(
  storedHash: unknown,
  secret: string | null
): boolean {
  if (
    typeof storedHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(storedHash) ||
    typeof secret !== 'string' ||
    !/^[a-f0-9]{64}$/.test(secret)
  ) {
    return false;
  }

  const expected = createHash('sha256')
    .update('event-order-guest-v1:' + secret)
    .digest('hex');

  return timingSafeEqual(
    Buffer.from(storedHash, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

function optionalMillis(
  value: unknown
): number | null {
  if (value === null) {
    return null;
  }

  if (!(value instanceof Timestamp)) {
    return invalidOrder();
  }

  const millis = value.toMillis();

  if (
    !Number.isSafeInteger(millis) ||
    millis <= 0 ||
    millis > 253402300799999
  ) {
    return invalidOrder();
  }

  return millis;
}


/**
 * Resolve the authenticated purchaser before
 * entering a Firestore transaction.
 */
export async function resolveEventOrderAccessUid(
  access: RegistrationAccessContext
): Promise<string | null> {
  if (access.idToken === null) {
    return null;
  }

  const { adminAuth } = getFirebaseAdmin();

  const decoded = await adminAuth
    .verifyIdToken(access.idToken, true)
    .catch(() => {
      throw new EventRegistrationError(
        'UNAUTHENTICATED'
      );
    });

  return decoded.uid;
}

/**
 * Internal server-side authorization helper.
 *
 * The caller must resolve uid using the verified
 * access context, never from customer input.
 *
 * All ownership and suspension reads occur in
 * the caller's Firestore transaction.
 */
export async function readAuthorizedEventOrder(
  tx: Transaction,
  adminDb: Firestore,
  orderId: string,
  access: RegistrationAccessContext,
  uid: string | null
): Promise<PersistedEventOrder> {
  if (
    !isValidEventDocumentId(orderId) ||
    /^__.*__$/.test(orderId)
  ) {
    return notFound();
  }

  if (
    (access.idToken === null) !== (uid === null)
  ) {
    throw new EventRegistrationError(
      'UNAUTHENTICATED'
    );
  }

  const orderRef = adminDb
    .collection(EVENT_COLLECTIONS.orders)
    .doc(orderId);

  if (uid !== null) {
    const [identitySnap, userSnap] =
      await tx.getAll(
        adminDb
          .collection(ACCOUNT_IDENTITIES_COLLECTION)
          .doc(uid),

        adminDb
          .collection('users')
          .doc(uid)
      );

    try {
      assertGlobalAccountNotSuspended(
        uid,
        identitySnap
      );
    } catch {
      throw new EventRegistrationError(
        'ACCOUNT_ACCESS_DENIED'
      );
    }

    const user = userSnap.data();

    if (
      (!identitySnap.exists &&
        !userSnap.exists) ||
      (
        userSnap.exists &&
        (
          !user ||
          (
            user.uid !== undefined &&
            user.uid !== uid
          ) ||
          (
            user.status !== undefined &&
            user.status !== 'active'
          )
        )
      )
    ) {
      throw new EventRegistrationError(
        'ACCOUNT_ACCESS_DENIED'
      );
    }
  }

  const snapshot = await tx.get(orderRef);

  if (!snapshot.exists) {
    return notFound();
  }

  const order =
    snapshot.data() as PersistedEventOrder;

  // Unauthorized and missing orders return
  // the same response to prevent enumeration.

  if (uid !== null) {
    if (
      order.purchaserUid !== uid ||
      order.guestSessionHash !== null
    ) {
      return notFound();
    }
  } else {
    if (
      order.purchaserUid !== null ||
      !matchesGuestSession(
        order.guestSessionHash,
        access.guestSessionSecret
      )
    ) {
      return notFound();
    }
  }


  return order;
}

export async function getAuthorizedEventOrder(
  orderId: string,
  access: RegistrationAccessContext,
  options: { includeTicketEvent?: boolean } = {}
) {
  if (
    !isValidEventDocumentId(orderId) ||
    /^__.*__$/.test(orderId)
  ) {
    return notFound();
  }

  const { adminDb } = getFirebaseAdmin();

  const uid =
    await resolveEventOrderAccessUid(access);

  return adminDb.runTransaction(
    async tx => {
      const order =
        await readAuthorizedEventOrder(
          tx,
          adminDb,
          orderId,
          access,
          uid
        );

      if (
        order.schemaVersion !== EVENT_SCHEMA_VERSION ||
        order.orderId !== orderId ||
        !isValidEventDocumentId(order.eventId) ||
        order.organizerType !== 'platform' ||
        order.organizerId !==
          PLATFORM_EVENT_ORGANIZER_ID ||
        !ORDER_STATUSES.has(order.status) ||
        !Array.isArray(order.items) ||
        order.items.length !== 1 ||
        !Number.isSafeInteger(order.totalAmountMinor) ||
        order.totalAmountMinor < 0
      ) {
        return invalidOrder();
      }

      if (order.paymentRequired === true) {
        if (
          order.totalAmountMinor <= 0 ||
          !isValidEventDocumentId(
            order.paymentOrderId
          ) ||
          !(
            (
              order.currency === 'USD' &&
              order.provider === 'tabedge' &&
              order.verificationMode === 'automatic'
            ) ||
            (
              order.currency === 'BDT' &&
              order.provider === 'bkash_manual' &&
              order.verificationMode === 'manual'
            )
          )
        ) {
          return invalidOrder();
        }
      } else if (
        order.paymentRequired !== false ||
        order.paymentOrderId !== null ||
        order.currency !== null ||
        order.provider !== null ||
        order.verificationMode !== null ||
        order.totalAmountMinor !== 0
      ) {
        return invalidOrder();
      }

      const item = order.items[0];

      if (
        !item ||
        !isValidEventDocumentId(
          item.ticketTypeId
        ) ||
        typeof item.ticketName !== 'string' ||
        !item.ticketName.trim() ||
        (
          item.attendanceMode !== 'online' &&
          item.attendanceMode !== 'offline'
        ) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 20 ||
        !Number.isSafeInteger(item.unitAmountMinor) ||
        item.unitAmountMinor < 0 ||
        calculateTicketTotalMinor(
          item.unitAmountMinor,
          item.quantity
        ) !== item.totalAmountMinor ||
        item.totalAmountMinor !==
          order.totalAmountMinor
      ) {
        return invalidOrder();
      }

      const expiresAtMs =
        optionalMillis(order.expiresAt);

      const paidAtMs =
        optionalMillis(order.paidAt);

      const fulfilledAtMs =
        optionalMillis(order.fulfilledAt);

      const confirmedTicketData =
        order.status === 'fulfilled'
          ? await readConfirmedEventTickets(
              tx,
              adminDb,
              order,
              options
            )
          : null;

      const tickets =
        confirmedTicketData?.tickets ?? [];

      const ticketEvent =
        confirmedTicketData?.ticketEvent ?? null;

      let canRecoverPayment = false;

      if (
        order.status === 'requires_review' &&
        order.paymentRequired === true &&
        order.provider === 'bkash_manual' &&
        order.currency === 'BDT'
      ) {
        try {
          const records =
            await readAuthorizedBkashRecoveryRecords(
              tx,
              adminDb,
              orderId,
              order,
              'bkash_manual'
            );

          validateBkashAccountSnapshot(
            records.payment.bkashAccountSnapshot
          );

          const submission = await tx.get(
            adminDb
              .collection(PAYMENT_COLLECTIONS.manualSubmissions)
              .doc(records.payment.paymentId)
          );

          canRecoverPayment = !submission.exists;
        } catch (error) {
          if (!(error instanceof PaymentProviderError)) {
            throw error;
          }

          canRecoverPayment = false;
        }
      }

      // Explicit response allowlist.
      // Never serialize the full private order.

      return {
        orderId: order.orderId,

        eventId: order.eventId,

        status: order.status,

        paymentRequired:
          order.paymentRequired,

        currency: order.currency,

        provider: order.provider,

        totalAmountMinor:
          order.totalAmountMinor,

        items: [{
          ticketTypeId: item.ticketTypeId,

          ticketName: item.ticketName,

          attendanceMode: item.attendanceMode,

          quantity: item.quantity,

          unitAmountMinor: item.unitAmountMinor,

          totalAmountMinor: item.totalAmountMinor,
        }],

        expiresAtMs,

        paidAtMs,

        fulfilledAtMs,

        tickets,

        ...(options.includeTicketEvent === true
          ? { ticketEvent }
          : {}),

        canRecoverPayment,

        paymentWindowElapsed:
          expiresAtMs !== null &&
          expiresAtMs <= Date.now() &&
          order.status === 'awaiting_payment',
      };
    },
    { readOnly: true }
  );
}
