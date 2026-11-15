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
  type BkashProviderSettings,
  type BkashSettingsAuditRecord,
} from '@/lib/payment-types';

import {
  normalizeBkashSenderNumber,
} from '@/lib/payment-lifecycle';

import {
  requireEventAdmin,
} from '@/services/event-authorization.service';

import {
  assertCurrentEventAdmin,
} from '@/services/event-management.service';

import {
  validateBkashProviderSettings,
} from '@/services/payments/bkash-manual-provider.service';

import {
  isPaymentProviderEnabled,
} from '@/services/payments/payment-provider.service';

export type BkashSettingsErrorCode =
  | 'INVALID_BKASH_SETTINGS'
  | 'BKASH_SETTINGS_VERSION_CONFLICT'
  | 'BKASH_SETTINGS_VERSION_EXHAUSTED';

export class BkashSettingsError extends Error {
  constructor(
    public readonly code: BkashSettingsErrorCode
  ) {
    super(code);

    this.name = 'BkashSettingsError';
  }
}

export interface BkashSettingsInput {
  enabled: boolean;

  receivingNumber: string;

  accountType: 'personal' | 'merchant';

  expectedConfigVersion: number;
}

export interface BkashSettingsView {
  configured: boolean;

  enabled: boolean;

  masterEnabled: boolean;

  effectiveEnabled: boolean;

  receivingNumber: string | null;

  accountType: 'personal' | 'merchant' | null;

  configVersion: number;

  updatedAtMs: number | null;
}

function invalid(): never {
  throw new BkashSettingsError(
    'INVALID_BKASH_SETTINGS'
  );
}

export function validateBkashSettingsInput(
  value: unknown
): BkashSettingsInput {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return invalid();
  }

  const input =
    value as Record<string, unknown>;

  const allowedKeys = new Set([
    'enabled',
    'receivingNumber',
    'accountType',
    'expectedConfigVersion',
  ]);

  if (
    Object.keys(input).length !== 4 ||
    Object.keys(input).some(
      key => !allowedKeys.has(key)
    )
  ) {
    return invalid();
  }

  if (
    typeof input.enabled !== 'boolean' ||
    typeof input.receivingNumber !== 'string' ||
    (
      input.accountType !== 'personal' &&
      input.accountType !== 'merchant'
    ) ||
    typeof input.expectedConfigVersion !== 'number' ||
    !Number.isSafeInteger(
      input.expectedConfigVersion
    ) ||
    input.expectedConfigVersion < 0
  ) {
    return invalid();
  }

  const receivingNumber =
    normalizeBkashSenderNumber(
      input.receivingNumber
    );

  if (!receivingNumber) {
    return invalid();
  }

  return {
    enabled: input.enabled,

    receivingNumber,

    accountType: input.accountType,

    expectedConfigVersion:
      input.expectedConfigVersion,
  };
}

function projectSettings(
  settings: BkashProviderSettings | null
): BkashSettingsView {
  const masterEnabled =
    isPaymentProviderEnabled(
      'bkash_manual'
    );

  return {
    configured: settings !== null,

    enabled: settings?.enabled ?? false,

    masterEnabled,

    effectiveEnabled:
      masterEnabled &&
      settings?.enabled === true,

    receivingNumber:
      settings?.receivingNumber ?? null,

    accountType:
      settings?.accountType ?? null,

    configVersion:
      settings?.configVersion ?? 0,

    updatedAtMs:
      settings?.updatedAt.toMillis() ?? null,
  };
}

/**
 * Read platform bKash settings.
 * Administrative access only.
 */
export async function getAdminBkashSettings(
  idToken: string
): Promise<BkashSettingsView> {
  const context =
    await requireEventAdmin(
      idToken,
      'event:manage_payments'
    );

  const { adminDb } =
    getFirebaseAdmin();

  const ref = adminDb
    .collection(
      PAYMENT_COLLECTIONS.providerSettings
    )
    .doc('bkash_manual');

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const snap = await tx.get(ref);

      if (!snap.exists) {
        return projectSettings(null);
      }

      return projectSettings(
        validateBkashProviderSettings(
          snap.data()
        )
      );
    },
    {
      readOnly: true,
    }
  );
}

/**
 * Update the platform receiving account.
 *
 * Existing payment snapshots are immutable.
 * Settings and audit records commit atomically.
 */
export async function updateAdminBkashSettings(
  idToken: string,
  rawInput: unknown
): Promise<BkashSettingsView> {
  const context =
    await requireEventAdmin(
      idToken,
      'event:manage_payments'
    );

  const input =
    validateBkashSettingsInput(
      rawInput
    );

  const { adminDb } =
    getFirebaseAdmin();

  const settingsRef = adminDb
    .collection(
      PAYMENT_COLLECTIONS.providerSettings
    )
    .doc('bkash_manual');

  const auditRef = adminDb
    .collection(
      PAYMENT_COLLECTIONS.auditLogs
    )
    .doc();

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const snap =
        await tx.get(settingsRef);

      const previous =
        snap.exists
          ? validateBkashProviderSettings(
              snap.data()
            )
          : null;

      const currentVersion =
        previous?.configVersion ?? 0;

      if (
        input.expectedConfigVersion !==
          currentVersion
      ) {
        throw new BkashSettingsError(
          'BKASH_SETTINGS_VERSION_CONFLICT'
        );
      }

      // Identical settings do not create
      // unnecessary versions or audit records.

      if (
        previous &&
        previous.enabled === input.enabled &&
        previous.receivingNumber ===
          input.receivingNumber &&
        previous.accountType ===
          input.accountType
      ) {
        return projectSettings(previous);
      }

      if (
        currentVersion >=
          Number.MAX_SAFE_INTEGER
      ) {
        throw new BkashSettingsError(
          'BKASH_SETTINGS_VERSION_EXHAUSTED'
        );
      }

      const now = Timestamp.fromMillis(
        Math.max(
          Date.now(),
          previous
            ? previous.updatedAt.toMillis() + 1
            : 0
        )
      );

      const current: BkashProviderSettings = {
        provider: 'bkash_manual',

        currency: 'BDT',

        enabled: input.enabled,

        receivingNumber:
          input.receivingNumber,

        accountType:
          input.accountType,

        configVersion:
          currentVersion + 1,

        schemaVersion:
          PAYMENT_SCHEMA_VERSION,

        createdAt:
          previous?.createdAt ?? now,

        updatedAt: now,

        updatedByUid:
          context.uid,
      };

      validateBkashProviderSettings(
        current
      );

      const audit: BkashSettingsAuditRecord = {
        auditId: auditRef.id,

        action: 'bkash_settings_updated',

        provider: 'bkash_manual',

        actorType: 'admin',

        actorUid: context.uid,

        previous,

        current,

        schemaVersion:
          PAYMENT_SCHEMA_VERSION,

        createdAt: now,
      };

      if (previous) {
        tx.set(
          settingsRef,
          current
        );
      } else {
        tx.create(
          settingsRef,
          current
        );
      }

      tx.create(
        auditRef,
        audit
      );

      return projectSettings(current);
    }
  );
}
