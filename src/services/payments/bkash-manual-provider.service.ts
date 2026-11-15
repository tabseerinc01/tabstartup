import 'server-only';

import {
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  PAYMENT_COLLECTIONS,
  PAYMENT_SCHEMA_VERSION,
  type BkashAccountSnapshot,
  type BkashProviderSettings,
} from '@/lib/payment-types';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  normalizeBkashSenderNumber,
} from '@/lib/payment-lifecycle';

import {
  PaymentProviderError,
  type PaymentInitiationContext,
  type ManualPaymentInstructions,
} from '@/lib/payment-provider';

import {
  requirePaymentProviderEnabled,
} from '@/services/payments/payment-provider.service';

import {
  resolveEventOrderAccessUid,
} from '@/services/event-order-access.service';

import {
  readEventPaymentTransaction,
} from '@/services/payments/event-payment-transaction.service';

import type {
  RegistrationAccessContext,
} from '@/services/event-registration.service';

export interface BkashManualConfiguration {
  receivingNumber: string;

  accountType: 'merchant' | 'personal';

  configVersion: number;
}

/**
 * Server-side configuration only.
 *
 * Never accept a receiving account from
 * customer-provided request data.
 */
export function validateBkashProviderSettings(
  value: unknown
): BkashProviderSettings {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new PaymentProviderError(
      'PAYMENT_PROVIDER_UNAVAILABLE'
    );
  }

  const settings =
    value as BkashProviderSettings;

  if (
    settings.schemaVersion !==
      PAYMENT_SCHEMA_VERSION ||
    settings.provider !== 'bkash_manual' ||
    settings.currency !== 'BDT' ||
    typeof settings.enabled !== 'boolean' ||
    typeof settings.receivingNumber !== 'string' ||
    normalizeBkashSenderNumber(
      settings.receivingNumber
    ) !== settings.receivingNumber ||
    (
      settings.accountType !== 'personal' &&
      settings.accountType !== 'merchant'
    ) ||
    !Number.isSafeInteger(
      settings.configVersion
    ) ||
    settings.configVersion <= 0 ||
    !(settings.createdAt instanceof Timestamp) ||
    !(settings.updatedAt instanceof Timestamp) ||
    settings.createdAt.toMillis() <= 0 ||
    settings.updatedAt.toMillis() <
      settings.createdAt.toMillis() ||
    typeof settings.updatedByUid !== 'string' ||
    settings.updatedByUid.length === 0 ||
    settings.updatedByUid.length > 128
  ) {
    throw new PaymentProviderError(
      'PAYMENT_PROVIDER_UNAVAILABLE'
    );
  }

  return settings;
}

export async function getBkashManualConfiguration(
  tx: Transaction,
  db: Firestore
): Promise<BkashManualConfiguration> {
  requirePaymentProviderEnabled(
    'bkash_manual'
  );

  const ref = db
    .collection(
      PAYMENT_COLLECTIONS.providerSettings
    )
    .doc('bkash_manual');

  const snap = await tx.get(ref);

  if (!snap.exists) {
    throw new PaymentProviderError(
      'PAYMENT_PROVIDER_UNAVAILABLE'
    );
  }

  const settings =
    validateBkashProviderSettings(
      snap.data()
    );

  if (!settings.enabled) {
    throw new PaymentProviderError(
      'PAYMENT_PROVIDER_DISABLED'
    );
  }

  return {
    receivingNumber:
      settings.receivingNumber,

    accountType:
      settings.accountType,

    configVersion:
      settings.configVersion,
  };
}

/**
 * Capture immutable receiving account information.
 */
export function createBkashAccountSnapshot(
  config: BkashManualConfiguration,
  now: Timestamp
): BkashAccountSnapshot {
  const common = {
    receivingNumber: config.receivingNumber,

    configVersion: config.configVersion,

    capturedAt: now,
  };

  return config.accountType === 'personal'
    ? {
        ...common,

        accountType: 'personal',

        paymentMethod: 'send_money',
      }
    : {
        ...common,

        accountType: 'merchant',

        paymentMethod: 'payment',
      };
}

/**
 * Validate persisted account information.
 * Never replace malformed snapshots silently.
 */
export function validateBkashAccountSnapshot(
  value: unknown
): BkashAccountSnapshot {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new PaymentProviderError(
      'PAYMENT_RECORD_MISMATCH'
    );
  }

  const snapshot =
    value as BkashAccountSnapshot;

  if (
    typeof snapshot.receivingNumber !== 'string' ||
    normalizeBkashSenderNumber(
      snapshot.receivingNumber
    ) !== snapshot.receivingNumber ||
    !Number.isSafeInteger(
      snapshot.configVersion
    ) ||
    snapshot.configVersion <= 0 ||
    !(snapshot.capturedAt instanceof Timestamp) ||
    !Number.isSafeInteger(
      snapshot.capturedAt.toMillis()
    ) ||
    snapshot.capturedAt.toMillis() <= 0 ||
    !(
      (
        snapshot.accountType === 'personal' &&
        snapshot.paymentMethod === 'send_money'
      ) ||
      (
        snapshot.accountType === 'merchant' &&
        snapshot.paymentMethod === 'payment'
      )
    )
  ) {
    throw new PaymentProviderError(
      'PAYMENT_RECORD_MISMATCH'
    );
  }

  return snapshot;
}

/**
 * Construct instructions using the
 * canonical payment amount and identity.
 */
export function buildBkashPaymentInstructions(
  context: PaymentInitiationContext,
  config: BkashManualConfiguration
): ManualPaymentInstructions {
  if (
    context.provider !== 'bkash_manual' ||
    context.currency !== 'BDT' ||
    context.verificationMode !== 'manual' ||
    context.purpose !== 'event_ticket' ||
    !Number.isSafeInteger(
      context.amountMinor
    ) ||
    context.amountMinor <= 0 ||
    typeof context.paymentId !== 'string' ||
    !context.paymentId ||
    !Number.isSafeInteger(
      context.expiresAtMs
    )
  ) {
    throw new PaymentProviderError(
      'PAYMENT_METHOD_MISMATCH'
    );
  }

  if (
    context.expiresAtMs <= Date.now()
  ) {
    throw new PaymentProviderError(
      'PAYMENT_WINDOW_EXPIRED'
    );
  }

  if (
    normalizeBkashSenderNumber(
      config.receivingNumber
    ) !== config.receivingNumber ||
    (
      config.accountType !== 'merchant' &&
      config.accountType !== 'personal'
    )
  ) {
    throw new PaymentProviderError(
      'PAYMENT_PROVIDER_UNAVAILABLE'
    );
  }

  return {
    provider: 'bkash_manual',

    currency: 'BDT',

    type: 'manual_payment',

    receivingNumber:
      config.receivingNumber,

    accountType:
      config.accountType,

    amountMinor:
      context.amountMinor,

    reference:
      context.paymentId,
  };
}

/**
 * Return payment instructions only for
 * an authorized and payable event order.
 *
 * Persist the receiving account snapshot before
 * exposing payment instructions to the customer.
 *
 * No payment confirmation or balance changes.
 */
export async function getEventBkashPaymentInstructions(
  orderId: string,
  access: RegistrationAccessContext
): Promise<ManualPaymentInstructions> {
  const { adminDb } =
    getFirebaseAdmin();

  const uid =
    await resolveEventOrderAccessUid(
      access
    );

  return adminDb.runTransaction(
    async tx => {
      const records =
        await readEventPaymentTransaction(
          tx,
          adminDb,
          orderId,
          access,
          uid,
          'bkash_manual'
        );

      const { context, payment } =
        records;

      if (
        payment.providerPaymentId !== null ||
        payment.providerReference !== null ||
        payment.verifiedAt !== null ||
        payment.verifiedByUid !== null ||
        payment.checkoutInitiation !== undefined ||
        payment.manualSubmissionId !== undefined
      ) {
        throw new PaymentProviderError(
          'PAYMENT_RECORD_MISMATCH'
        );
      }

      const now = Timestamp.now();

      if (
        now.toMillis() >= context.expiresAtMs
      ) {
        throw new PaymentProviderError(
          'PAYMENT_WINDOW_EXPIRED'
        );
      }

      let snapshot: BkashAccountSnapshot;

      if (
        payment.bkashAccountSnapshot !== undefined
      ) {
        snapshot = validateBkashAccountSnapshot(
          payment.bkashAccountSnapshot
        );
      } else {
        const config =
          await getBkashManualConfiguration(
            tx,
            adminDb
          );

        snapshot = validateBkashAccountSnapshot(
          createBkashAccountSnapshot(
            config,
            now
          )
        );
      }

      if (
        snapshot.capturedAt.toMillis() >=
          context.expiresAtMs ||
        snapshot.capturedAt.toMillis() >
          now.toMillis() ||
        snapshot.capturedAt.toMillis() <
          payment.createdAt.toMillis()
      ) {
        throw new PaymentProviderError(
          'PAYMENT_RECORD_MISMATCH'
        );
      }

      const instructions =
        buildBkashPaymentInstructions(
          context,
          snapshot
        );

      if (
        payment.bkashAccountSnapshot === undefined
      ) {
        tx.update(records.refs.payment, {
          bkashAccountSnapshot: snapshot,

          updatedAt: now,
        });
      }

      return instructions;
    }
  );
}
