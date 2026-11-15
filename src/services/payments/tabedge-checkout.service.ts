import 'server-only';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  PAYMENT_COLLECTIONS,
  PAYMENT_SCHEMA_VERSION,
  type PaymentRecord,
  type PaymentOrder,
  type TabEdgeCheckoutInitiation,
} from '@/lib/payment-types';

import {
  PaymentProviderError,
  type PaymentInitiationContext,
  type HostedCheckoutResult,
} from '@/lib/payment-provider';

import {
  claimTabEdgeCheckout,
} from '@/services/payments/tabedge-checkout-claim.service';

import {
  createTabEdgeCheckout,
  assertTabEdgeCheckoutConfigured,
  TabEdgeRequestError,
} from '@/services/payments/tabedge-provider.service';

import {
  readEventPaymentTransaction,
} from '@/services/payments/event-payment-transaction.service';

import {
  resolveEventOrderAccessUid,
} from '@/services/event-order-access.service';

import type {
  RegistrationAccessContext,
} from '@/services/event-registration.service';

type ReviewClaim = Extract<
  TabEdgeCheckoutInitiation,
  { status: 'requires_review' }
>;

type FailureCode =
  ReviewClaim['failureCode'];

export type EventCheckoutResult =
  | {
      status: 'ready';

      checkout: HostedCheckoutResult;

      replayed: boolean;
    }
  | {
      status: 'creating';
    }
  | {
      status: 'requires_review';
    };

function invalid(): never {
  throw new PaymentProviderError(
    'PAYMENT_RECORD_MISMATCH'
  );
}

function assertSameContext(
  current: PaymentInitiationContext,
  expected: PaymentInitiationContext
): void {
  if (
    current.paymentId !== expected.paymentId ||
    current.paymentOrderId !==
      expected.paymentOrderId ||
    current.productOrderId !==
      expected.productOrderId ||
    current.resourceId !== expected.resourceId ||
    current.purpose !== expected.purpose ||
    current.amountMinor !== expected.amountMinor ||
    current.currency !== expected.currency ||
    current.provider !== expected.provider ||
    current.verificationMode !==
      expected.verificationMode ||
    current.expiresAtMs !== expected.expiresAtMs ||
    current.owner.ownerType !==
      expected.owner.ownerType ||
    current.owner.ownerId !==
      expected.owner.ownerId
  ) {
    return invalid();
  }
}

function assertClaim(
  payment: PaymentRecord,
  context: PaymentInitiationContext,
  attemptId: string
) {
  const claim = payment.checkoutInitiation;

  if (
    payment.schemaVersion !==
      PAYMENT_SCHEMA_VERSION ||
    payment.paymentId !== context.paymentId ||
    payment.orderId !== context.paymentOrderId ||
    payment.resourceId !== context.resourceId ||
    payment.purpose !== context.purpose ||
    payment.provider !== 'tabedge' ||
    payment.currency !== 'USD' ||
    payment.amountMinor !== context.amountMinor ||
    payment.owner?.ownerType !==
      context.owner.ownerType ||
    payment.owner?.ownerId !==
      context.owner.ownerId ||
    !claim ||
    claim.provider !== 'tabedge' ||
    claim.currency !== 'USD' ||
    claim.attemptId !== attemptId ||
    claim.merchantReference !== context.paymentId ||
    claim.amountMinor !== context.amountMinor ||
    !(claim.claimedAt instanceof Timestamp) ||
    !(claim.updatedAt instanceof Timestamp)
  ) {
    return invalid();
  }

  return claim;
}

function assertCheckout(
  checkout: HostedCheckoutResult
): void {
  if (
    checkout.provider !== 'tabedge' ||
    checkout.currency !== 'USD' ||
    checkout.type !== 'hosted_checkout' ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(
      checkout.checkoutSessionId
    ) ||
    typeof checkout.checkoutUrl !== 'string' ||
    checkout.checkoutUrl.length > 2048
  ) {
    return invalid();
  }

  const url = new URL(checkout.checkoutUrl);

  if (
    url.origin !== 'https://www.tabedge.com' ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !==
      `/checkout/${checkout.checkoutSessionId}`
  ) {
    return invalid();
  }
}

/**
 * Persist a successful provider response.
 *
 * Revalidate the authorized order and reservation
 * before making the checkout available.
 */
async function persistReadyCheckout(
  orderId: string,
  access: RegistrationAccessContext,
  context: PaymentInitiationContext,
  attemptId: string,
  checkout: HostedCheckoutResult
): Promise<void> {
  assertCheckout(checkout);

  const { adminDb } = getFirebaseAdmin();

  const uid =
    await resolveEventOrderAccessUid(access);

  await adminDb.runTransaction(
    async tx => {
      const records =
        await readEventPaymentTransaction(
          tx,
          adminDb,
          orderId,
          access,
          uid,
          'tabedge'
        );

      assertSameContext(
        records.context,
        context
      );

      const claim = assertClaim(
        records.payment,
        context,
        attemptId
      );

      if (claim.status === 'ready') {
        if (
          claim.checkoutId !==
            checkout.checkoutSessionId ||
          claim.checkoutUrl !==
            checkout.checkoutUrl
        ) {
          return invalid();
        }

        return;
      }

      if (
        claim.status !== 'creating' ||
        records.payment.providerPaymentId !== null ||
        records.payment.providerReference !== null ||
        records.payment.verifiedAt !== null ||
        records.payment.verifiedByUid !== null
      ) {
        return invalid();
      }

      const now = Timestamp.now();

      if (
        now.toMillis() >= context.expiresAtMs
      ) {
        throw new PaymentProviderError(
          'PAYMENT_WINDOW_EXPIRED'
        );
      }

      const ready: TabEdgeCheckoutInitiation = {
        ...claim,

        status: 'ready',

        checkoutId: checkout.checkoutSessionId,

        checkoutUrl: checkout.checkoutUrl,

        completedAt: now,

        updatedAt: now,

        failureCode: null,
      };

      tx.update(records.refs.payment, {
        checkoutInitiation: ready,

        updatedAt: now,
      });
    }
  );
}

/**
 * Preserve uncertain provider outcomes.
 *
 * This path must work even if the original
 * reservation has expired or access was revoked.
 *
 * Never overwrite a successful or newer claim.
 */
async function persistCheckoutReview(
  context: PaymentInitiationContext,
  attemptId: string,
  failureCode: FailureCode,
  checkout: HostedCheckoutResult | null
): Promise<void> {
  if (checkout !== null) {
    assertCheckout(checkout);
  }

  const { adminDb } = getFirebaseAdmin();

  const paymentRef = adminDb
    .collection(PAYMENT_COLLECTIONS.payments)
    .doc(context.paymentId);

  const paymentOrderRef = adminDb
    .collection(PAYMENT_COLLECTIONS.orders)
    .doc(context.paymentOrderId);

  await adminDb.runTransaction(
    async tx => {
      const [paymentSnap, orderSnap] =
        await tx.getAll(
          paymentRef,
          paymentOrderRef
        );

      if (
        !paymentSnap.exists ||
        !orderSnap.exists
      ) {
        return invalid();
      }

      const payment =
        paymentSnap.data() as PaymentRecord;

      const paymentOrder =
        orderSnap.data() as PaymentOrder;

      if (
        paymentOrder.schemaVersion !==
          PAYMENT_SCHEMA_VERSION ||
        paymentOrder.orderId !==
          context.paymentOrderId ||
        paymentOrder.productOrderId !==
          context.productOrderId ||
        paymentOrder.resourceId !==
          context.resourceId ||
        paymentOrder.purpose !==
          context.purpose ||
        paymentOrder.amountMinor !==
          context.amountMinor ||
        paymentOrder.currency !== 'USD' ||
        paymentOrder.provider !== 'tabedge' ||
        paymentOrder.owner?.ownerType !==
          context.owner.ownerType ||
        paymentOrder.owner?.ownerId !==
          context.owner.ownerId
      ) {
        return invalid();
      }

      const claim = assertClaim(
        payment,
        context,
        attemptId
      );

      if (claim.status !== 'creating') {
        return;
      }

      const now = Timestamp.now();

      const review: ReviewClaim = {
        ...claim,

        status: 'requires_review',

        checkoutId:
          checkout?.checkoutSessionId ?? null,

        checkoutUrl:
          checkout?.checkoutUrl ?? null,

        completedAt: now,

        updatedAt: now,

        failureCode,
      };

      tx.update(paymentRef, {
        checkoutInitiation: review,

        updatedAt: now,
      });
    }
  );
}

function classifyFailure(
  error: unknown,
  checkoutCreated: boolean
): FailureCode {
  if (
    error instanceof PaymentProviderError &&
    error.code === 'PAYMENT_WINDOW_EXPIRED'
  ) {
    return 'payment_window_expired';
  }

  if (checkoutCreated) {
    return 'persistence_failed';
  }

  if (error instanceof TabEdgeRequestError) {
    return error.kind;
  }

  return 'unexpected_error';
}

/**
 * Public-facing server service for hosted checkout.
 *
 * A committed claim is required before any
 * external provider request is attempted.
 */
export async function initiateEventTabEdgeCheckout(
  orderId: string,
  access: RegistrationAccessContext
): Promise<EventCheckoutResult> {
  assertTabEdgeCheckoutConfigured();

  const result = await claimTabEdgeCheckout(
    orderId,
    access
  );

  if (result.type === 'ready') {
    return {
      status: 'ready',

      checkout: result.checkout,

      replayed: true,
    };
  }

  if (result.type === 'creating') {
    return {
      status: 'creating',
    };
  }

  if (result.type === 'requires_review') {
    return {
      status: 'requires_review',
    };
  }

  const { context, attemptId } = result;

  let checkout: HostedCheckoutResult | null =
    null;

  try {
    checkout = await createTabEdgeCheckout(
      context
    );

    await persistReadyCheckout(
      orderId,
      access,
      context,
      attemptId,
      checkout
    );

    return {
      status: 'ready',

      checkout,

      replayed: false,
    };
  } catch (error) {
    const failureCode = classifyFailure(
      error,
      checkout !== null
    );

    try {
      await persistCheckoutReview(
        context,
        attemptId,
        failureCode,
        checkout
      );
    } catch {
      // The original persistent creation claim
      // remains the duplicate-prevention barrier.
      // Never retry provider creation here.
      console.error(
        '[TabEdge] Checkout review persistence failed',
        {
          paymentId: context.paymentId,
          attemptId,
        }
      );
    }

    return {
      status: 'requires_review',
    };
  }
}
