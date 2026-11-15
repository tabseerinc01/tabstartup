import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import type {
  TabEdgeCheckoutInitiation,
} from '@/lib/payment-types';

import {
  PaymentProviderError,
  type PaymentInitiationContext,
  type HostedCheckoutResult,
} from '@/lib/payment-provider';

import {
  resolveEventOrderAccessUid,
} from '@/services/event-order-access.service';

import {
  readEventPaymentTransaction,
} from '@/services/payments/event-payment-transaction.service';

import type {
  RegistrationAccessContext,
} from '@/services/event-registration.service';

export type TabEdgeCheckoutClaimResult =
  | {
      type: 'claimed';

      attemptId: string;

      context: PaymentInitiationContext;
    }
  | {
      type: 'ready';

      checkout: HostedCheckoutResult;
    }
  | {
      type: 'creating';
    }
  | {
      type: 'requires_review';
    };

function invalidClaim(): never {
  throw new PaymentProviderError(
    'PAYMENT_RECORD_MISMATCH'
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

function validCheckoutId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(value)
  );
}

function validCheckoutUrl(
  value: unknown,
  checkoutId: string
): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048
  ) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.origin === 'https://www.tabedge.com' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname === `/checkout/${checkoutId}`
    );
  } catch {
    return false;
  }
}

const FAILURE_CODES = new Set([
  'configuration',
  'provider_rejected',
  'outcome_unknown',
  'invalid_response',
  'persistence_failed',
  'payment_window_expired',
  'unexpected_error',
]);

function validateExistingClaim(
  claim: TabEdgeCheckoutInitiation,
  context: PaymentInitiationContext
): void {
  if (
    !claim ||
    typeof claim !== 'object' ||
    claim.provider !== 'tabedge' ||
    claim.currency !== 'USD' ||
    claim.merchantReference !== context.paymentId ||
    claim.amountMinor !== context.amountMinor ||
    typeof claim.attemptId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(claim.attemptId) ||
    !validTimestamp(claim.claimedAt) ||
    !validTimestamp(claim.updatedAt) ||
    claim.updatedAt.toMillis() <
      claim.claimedAt.toMillis() ||
    claim.claimedAt.toMillis() >=
      context.expiresAtMs
  ) {
    return invalidClaim();
  }

  switch (claim.status) {
    case 'creating':
      if (
        claim.checkoutId !== null ||
        claim.checkoutUrl !== null ||
        claim.completedAt !== null ||
        claim.failureCode !== null
      ) {
        return invalidClaim();
      }

      return;

    case 'ready':
      if (
        !validCheckoutId(claim.checkoutId) ||
        !validCheckoutUrl(
          claim.checkoutUrl,
          claim.checkoutId
        ) ||
        !validTimestamp(claim.completedAt) ||
        claim.completedAt.toMillis() <
          claim.claimedAt.toMillis() ||
        claim.completedAt.toMillis() >
          claim.updatedAt.toMillis() ||
        claim.failureCode !== null
      ) {
        return invalidClaim();
      }

      return;

    case 'requires_review':
      if (
        !validTimestamp(claim.completedAt) ||
        claim.completedAt.toMillis() <
          claim.claimedAt.toMillis() ||
        claim.completedAt.toMillis() >
          claim.updatedAt.toMillis() ||
        !FAILURE_CODES.has(claim.failureCode)
      ) {
        return invalidClaim();
      }

      if (
        claim.checkoutId === null
          ? claim.checkoutUrl !== null
          : (
              !validCheckoutId(claim.checkoutId) ||
              (
                claim.checkoutUrl !== null &&
                !validCheckoutUrl(
                  claim.checkoutUrl,
                  claim.checkoutId
                )
              )
            )
      ) {
        return invalidClaim();
      }

      return;

    default:
      return invalidClaim();
  }
}

/**
 * Acquire exactly one persistent checkout
 * creation claim for the canonical payment.
 *
 * External provider requests must never run
 * inside the Firestore transaction callback.
 */
export async function claimTabEdgeCheckout(
  orderId: string,
  access: RegistrationAccessContext
): Promise<TabEdgeCheckoutClaimResult> {
  const { adminDb } = getFirebaseAdmin();

  const uid =
    await resolveEventOrderAccessUid(access);

  // Stable across Firestore transaction retries.
  const attemptId = randomUUID();

  return adminDb.runTransaction(
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

      const { context, payment, refs } =
        records;

      if (
        payment.providerPaymentId !== null ||
        payment.providerReference !== null ||
        payment.verifiedAt !== null ||
        payment.verifiedByUid !== null
      ) {
        return invalidClaim();
      }

      const existing =
        payment.checkoutInitiation;

      if (existing !== undefined) {
        validateExistingClaim(
          existing,
          context
        );

        switch (existing.status) {
          case 'ready':
            return {
              type: 'ready',

              checkout: {
                provider: 'tabedge',

                currency: 'USD',

                type: 'hosted_checkout',

                checkoutSessionId:
                  existing.checkoutId,

                checkoutUrl:
                  existing.checkoutUrl,
              },
            };

          case 'creating':
            return {
              type: 'creating',
            };

          case 'requires_review':
            return {
              type: 'requires_review',
            };
        }

        return invalidClaim();
      }

      const now = Timestamp.now();

      if (
        now.toMillis() >=
          context.expiresAtMs
      ) {
        throw new PaymentProviderError(
          'PAYMENT_WINDOW_EXPIRED'
        );
      }

      const claim: TabEdgeCheckoutInitiation = {
        provider: 'tabedge',

        attemptId,

        merchantReference: context.paymentId,

        amountMinor: context.amountMinor,

        currency: 'USD',

        status: 'creating',

        checkoutId: null,

        checkoutUrl: null,

        claimedAt: now,

        updatedAt: now,

        completedAt: null,

        failureCode: null,
      };

      tx.update(refs.payment, {
        checkoutInitiation: claim,

        updatedAt: now,
      });

      return {
        type: 'claimed',

        attemptId,

        context,
      };
    }
  );
}
