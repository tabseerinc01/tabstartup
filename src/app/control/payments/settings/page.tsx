'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import Link from 'next/link';

import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

import { useUser } from '@/firebase';

import {
  paymentAdminRequest,
} from '@/lib/payment-admin-client';

interface SettingsView {
  configured: boolean;
  enabled: boolean;
  masterEnabled: boolean;
  effectiveEnabled: boolean;
  receivingNumber: string | null;
  accountType: 'personal' | 'merchant' | null;
  configVersion: number;
  updatedAtMs: number | null;
}

const endpoint =
  '/api/control/payments/settings/bkash';

function validateView(
  value: SettingsView
): SettingsView {
  if (
    !value ||
    typeof value.configured !== 'boolean' ||
    typeof value.enabled !== 'boolean' ||
    typeof value.masterEnabled !== 'boolean' ||
    typeof value.effectiveEnabled !== 'boolean' ||
    value.effectiveEnabled !==
      (value.enabled && value.masterEnabled) ||
    !Number.isSafeInteger(value.configVersion) ||
    value.configVersion < 0 ||
    (
      value.configured &&
      (
        value.configVersion < 1 ||
        typeof value.receivingNumber !== 'string' ||
        !/^01[3-9][0-9]{8}$/.test(
          value.receivingNumber
        ) ||
        (
          value.accountType !== 'personal' &&
          value.accountType !== 'merchant'
        )
      )
    ) ||
    (
      !value.configured &&
      (
        value.configVersion !== 0 ||
        value.enabled ||
        value.receivingNumber !== null ||
        value.accountType !== null
      )
    )
  ) {
    throw new Error(
      'Invalid payment settings response'
    );
  }

  return value;
}

export default function PaymentSettingsPage() {
  const { user } = useUser();

  if (!user) {
    return (
      <p className="text-muted-foreground">
        Administrative sign-in required.
      </p>
    );
  }

  return (
    <BkashSettingsForm
      key={user.uid}
      user={user}
    />
  );
}

function BkashSettingsForm({
  user,
}: {
  user: NonNullable<
    ReturnType<typeof useUser>['user']
  >;
}) {
  const [settings, setSettings] =
    useState<SettingsView | null>(null);

  const [enabled, setEnabled] =
    useState(false);

  const [accountType, setAccountType] =
    useState<'personal' | 'merchant'>(
      'personal'
    );

  const [receivingNumber, setReceivingNumber] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [notice, setNotice] =
    useState('');

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [confirmed, setConfirmed] =
    useState(false);

  const saveLock = useRef(false);

  const mounted = useRef(false);

  const saveController =
    useRef<AbortController | null>(null);

  function applySettings(
    value: SettingsView
  ) {
    const next = validateView(value);

    setSettings(next);
    setEnabled(next.enabled);

    setAccountType(
      next.accountType ?? 'personal'
    );

    setReceivingNumber(
      next.receivingNumber ?? ''
    );

    setConfirmed(false);
  }

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      saveController.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller =
      new AbortController();

    let active = true;

    setLoading(true);
    setError('');
    setNotice('');
    setSettings(null);
    setConfirmed(false);

    paymentAdminRequest<SettingsView>(
      user,
      endpoint,
      {
        signal: controller.signal,
      }
    )
      .then(result => {
        if (!active) return;

        applySettings(result);
      })
      .catch(() => {
        if (!active) return;

        setError(
          'Unable to load payment settings.'
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [user, refreshKey]);

  const validNumber =
    /^01[3-9][0-9]{8}$/.test(
      receivingNumber.trim()
    );

  const changed =
    settings !== null &&
    (
      !settings.configured ||
      settings.enabled !== enabled ||
      settings.accountType !== accountType ||
      settings.receivingNumber !==
        receivingNumber.trim()
    );

  async function saveSettings() {
    if (
      !settings ||
      !validNumber ||
      !changed ||
      !confirmed ||
      loading ||
      saving ||
      saveLock.current
    ) {
      return;
    }

    saveLock.current = true;
    setSaving(true);
    setError('');
    setNotice('');

    const controller =
      new AbortController();

    saveController.current = controller;

    try {
      const result =
        await paymentAdminRequest<SettingsView>(
          user,
          endpoint,
          {
            method: 'PUT',

            body: {
              enabled,

              accountType,

              receivingNumber:
                receivingNumber.trim(),

              expectedConfigVersion:
                settings.configVersion,
            },

            signal: controller.signal,
          }
        );

      if (!mounted.current) return;

      applySettings(result);

      setNotice(
        'Payment settings saved successfully.'
      );
    } catch {
      if (!mounted.current) return;

      setConfirmed(false);
      setSettings(null);

      setError(
        'Save could not be confirmed. Reload settings before trying again.'
      );
    } finally {
      saveLock.current = false;
      saveController.current = null;

      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/control/payments"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Payment Management
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            Payment Settings
          </h1>

          <p className="mt-2 text-muted-foreground">
            Manage platform bKash receiving accounts.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || saving}
          onClick={() => {
            setRefreshKey(key => key + 1);
          }}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          Reload
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800"
        >
          {notice}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 p-6">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading settings...
        </div>
      )}

      {!loading && settings && (
        <div className="space-y-6 rounded-xl border bg-card p-6">
          <div>
            <h2 className="text-xl font-semibold">
              bKash Manual Payments
            </h2>

            <p className="text-sm text-muted-foreground">
              BDT · Manual verification
            </p>
          </div>

          <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">
                Effective status
              </p>

              <p className="font-semibold">
                {settings.effectiveEnabled
                  ? 'Enabled'
                  : 'Disabled'}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">
                Configuration version
              </p>

              <p className="font-semibold">
                {settings.configVersion}
              </p>
            </div>
          </div>

          {!settings.masterEnabled && (
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />

              <p>
                The environment master switch is off.
                Saving settings will not activate
                new bKash payment instructions.
              </p>
            </div>
          )}

          <fieldset
            disabled={saving}
            className="space-y-5"
          >
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={event => {
                  setEnabled(event.target.checked);
                  setConfirmed(false);
                }}
                className="h-4 w-4"
              />

              <span className="font-medium">
                Enable bKash payments
              </span>
            </label>

            <div className="space-y-2">
              <label
                htmlFor="bkash-account-type"
                className="text-sm font-medium"
              >
                Account type
              </label>

              <select
                id="bkash-account-type"
                value={accountType}
                onChange={event => {
                  setAccountType(
                    event.target.value === 'merchant'
                      ? 'merchant'
                      : 'personal'
                  );

                  setConfirmed(false);
                }}
                className="w-full rounded-lg border bg-background p-3"
              >
                <option value="personal">
                  Personal Account
                </option>

                <option value="merchant">
                  Merchant Account
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="bkash-number"
                className="text-sm font-medium"
              >
                Receiving number
              </label>

              <input
                id="bkash-number"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                maxLength={11}
                placeholder="01XXXXXXXXX"
                value={receivingNumber}
                onChange={event => {
                  setReceivingNumber(
                    event.target.value
                  );

                  setConfirmed(false);
                }}
                className="w-full rounded-lg border bg-background p-3"
              />

              {receivingNumber && !validNumber && (
                <p className="text-sm text-red-600">
                  Enter a valid 11-digit bKash number.
                </p>
              )}
            </div>

            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                Customer payment method
              </p>

              <p className="font-semibold">
                {accountType === 'personal'
                  ? 'Send Money'
                  : 'Payment'}
              </p>
            </div>

            {accountType === 'personal' && (
              <p className="text-sm text-muted-foreground">
                Confirm that the receiving account
                is authorized for this collection
                activity before enabling payments.
              </p>
            )}

            <div className="flex items-start gap-3 rounded-lg border p-4">
              <ShieldCheck className="h-5 w-5 shrink-0" />

              <p className="text-sm text-muted-foreground">
                Existing payment snapshots will retain
                their original receiving account.
                Changes are recorded in the payment
                audit log.
              </p>
            </div>

            {changed && validNumber && (
              <label className="flex items-start gap-3 rounded-lg border p-4">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={event => {
                    setConfirmed(
                      event.target.checked
                    );
                  }}
                  className="mt-1 h-4 w-4 shrink-0"
                />

                <span className="text-sm">
                  I have verified the receiving
                  number, account type and authority
                  to collect payments. I confirm
                  these configuration changes.
                </span>
              </label>
            )}

            <button
              type="button"
              disabled={
                saving ||
                loading ||
                !validNumber ||
                !changed ||
                !confirmed
              }
              onClick={saveSettings}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}

              {saving
                ? 'Saving...'
                : 'Save Payment Settings'}
            </button>
          </fieldset>
        </div>
      )}
    </div>
  );
}
