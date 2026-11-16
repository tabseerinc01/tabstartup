'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  Auth,
  User,
} from 'firebase/auth';

type Instructions = {
  provider: 'bkash_manual';
  currency: 'BDT';
  receivingNumber: string;
  accountType: 'personal' | 'merchant';
  paymentMethod: 'send_money' | 'payment';
  amountMinor: number;
  reference: string;
};

type Props = {
  auth: Auth;
  user: User | null;
  orderId: string;
  amountMinor: number;
  expiresAtMs: number | null;
  recoveryMode?: boolean;
  paymentWindowElapsed?: boolean;
  onSubmitted: () => void;
};

function formatAmount(amountMinor: number) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
  }).format(amountMinor / 100);
}

function readInstructions(
  value: unknown,
  expectedAmount: number
): Instructions {
  if (!value || typeof value !== 'object') {
    throw new Error('INVALID_INSTRUCTIONS');
  }

  const data = value as Instructions;

  if (
    data.provider !== 'bkash_manual' ||
    data.currency !== 'BDT' ||
    data.amountMinor !== expectedAmount ||
    !Number.isSafeInteger(data.amountMinor) ||
    data.amountMinor <= 0 ||
    typeof data.receivingNumber !== 'string' ||
    !/^01[3-9][0-9]{8}$/.test(
      data.receivingNumber
    ) ||
    !(
      (
        data.accountType === 'personal' &&
        data.paymentMethod === 'send_money'
      ) ||
      (
        data.accountType === 'merchant' &&
        data.paymentMethod === 'payment'
      )
    ) ||
    typeof data.reference !== 'string' ||
    data.reference.length < 1 ||
    data.reference.length > 200
  ) {
    throw new Error('INVALID_INSTRUCTIONS');
  }

  return data;
}

export function EventBkashPayment({
  auth,
  user,
  orderId,
  amountMinor,
  expiresAtMs,
  recoveryMode = false,
  paymentWindowElapsed = false,
  onSubmitted,
}: Props) {
  const [instructions, setInstructions] =
    useState<Instructions | null>(null);

  const [senderNumber, setSenderNumber] =
    useState('');

  const [transactionId, setTransactionId] =
    useState('');

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState('');

  const [copied, setCopied] = useState(false);

  const [confirmed, setConfirmed] =
    useState(false);

  const [submissionUncertain, setSubmissionUncertain] =
    useState(false);

  const lock = useRef(false);

  const mounted = useRef(false);

  const activeRequest =
    useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, []);

  function assertSessionAndDeadline() {
    if (auth.currentUser !== user) {
      throw new Error('SESSION_CHANGED');
    }

    if (
      expiresAtMs === null ||
      (
        recoveryMode
          ? Date.now() < expiresAtMs
          : Date.now() >= expiresAtMs
      )
    ) {
      throw new Error('PAYMENT_WINDOW_EXPIRED');
    }
  }

  async function request(
    action: 'instructions' | 'submit' | 'recover',
    signal: AbortSignal,
    input?: {
      senderNumber: string;
      transactionId: string;
    }
  ): Promise<unknown> {
    assertSessionAndDeadline();

    const headers: Record<string, string> = {};

    if (user) {
      headers.Authorization =
        `Bearer ${await user.getIdToken()}`;
    }

    if (input) {
      headers['Content-Type'] =
        'application/json';
    }

    assertSessionAndDeadline();

    const response = await fetch(
      `/api/events/orders/${encodeURIComponent(orderId)}/bkash/${action}`,
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        signal,
        ...(input
          ? { body: JSON.stringify(input) }
          : {}),
      }
    );

    const body = await response.json();

    if (
      !response.ok ||
      body?.success !== true
    ) {
      throw new Error(
        typeof body?.error === 'string'
          ? body.error
          : 'PAYMENT_SERVICE_UNAVAILABLE'
      );
    }

    if (auth.currentUser !== user) {
      throw new Error('SESSION_CHANGED');
    }

    return body.data;
  }

  async function loadInstructions() {
    if (recoveryMode || lock.current) return;

    lock.current = true;

    setBusy(true);
    setError('');
    setInstructions(null);

    const controller = new AbortController();

    activeRequest.current = controller;

    try {
      const result = await request(
        'instructions',
        controller.signal
      );

      const data = readInstructions(
        result,
        amountMinor
      );

      assertSessionAndDeadline();

      if (mounted.current) {
        setInstructions(data);
      }
    } catch {
      if (mounted.current) {
        setError(
          'Payment instructions are unavailable. Refresh your order and try again. Do not send money without valid instructions.'
        );
      }
    } finally {
      lock.current = false;

      activeRequest.current = null;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  async function copyNumber() {
    if (!instructions) return;

    try {
      await navigator.clipboard.writeText(
        instructions.receivingNumber
      );

      if (mounted.current) {
        setCopied(true);
      }
    } catch {
      if (mounted.current) {
        setCopied(false);
      }
    }
  }

  async function submitPayment() {
    if (
      lock.current ||
      (!recoveryMode && !instructions) ||
      !confirmed ||
      submissionUncertain
    ) {
      return;
    }

    const sender = senderNumber.trim();

    const transaction =
      transactionId.trim().toUpperCase();

    if (!/^01[3-9][0-9]{8}$/.test(sender)) {
      setError(
        'Enter a valid 11-digit bKash number.'
      );

      return;
    }

    if (!/^[A-Z0-9]{6,32}$/.test(transaction)) {
      setError(
        'Enter a valid bKash Transaction ID.'
      );

      return;
    }

    try {
      assertSessionAndDeadline();
    } catch {
      setError(
        'The payment window or session has ended. If you already sent money, contact support with your order reference. Do not pay again.'
      );

      return;
    }

    lock.current = true;

    setBusy(true);
    setError('');

    const controller = new AbortController();

    activeRequest.current = controller;

    try {
      const result = await request(
        recoveryMode ? 'recover' : 'submit',
        controller.signal,
        {
          senderNumber: sender,
          transactionId: transaction,
        }
      );

      if (
        !result ||
        typeof result !== 'object' ||
        !('status' in result) ||
        result.status !== (
          recoveryMode
            ? 'requires_review'
            : 'pending_verification'
        ) ||
        !('replayed' in result) ||
        typeof result.replayed !== 'boolean'
      ) {
        throw new Error(
          'INVALID_SUBMISSION_RESPONSE'
        );
      }

      if (mounted.current) {
        setSubmissionUncertain(true);

        onSubmitted();
      }
    } catch {
      if (mounted.current) {
        setSubmissionUncertain(true);

        setError(
          'We could not confirm your submission. Refresh your order to check its status. Do not send money again. If necessary, contact support with your order reference and Transaction ID.'
        );
      }
    } finally {
      lock.current = false;

      activeRequest.current = null;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  return (
    <div className="space-y-5 rounded-xl border p-5">
      <div>
        <p className="text-lg font-semibold text-pink-600">
          {recoveryMode
            ? 'Recover bKash payment'
            : 'Pay with bKash'}
        </p>

        <p className="mt-1 text-sm text-muted-foreground">
          Manual payment verification
        </p>
      </div>

      {!paymentWindowElapsed && !recoveryMode && !instructions && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadInstructions()}
          className="w-full rounded-lg bg-pink-600 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy
            ? 'Loading instructions...'
            : 'Get bKash payment instructions'}
        </button>
      )}

      {!paymentWindowElapsed && (recoveryMode || instructions) && (
        <>
          {!recoveryMode && instructions && (
            <>
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Total payable
              </p>

              <p className="text-2xl font-bold">
                {formatAmount(
                  instructions.amountMinor
                )}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                bKash receiving number
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="font-mono text-lg font-semibold">
                  {instructions.receivingNumber}
                </span>

                <button
                  type="button"
                  onClick={() => void copyNumber()}
                  className="rounded-md border px-3 py-1 text-xs"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Payment method
              </p>

              <p className="font-semibold">
                {instructions.paymentMethod ===
                'send_money'
                  ? 'Send Money — Personal'
                  : 'Payment — Merchant'}
              </p>
            </div>
          </div>

          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Open your bKash app.</li>

            <li>
              Select{' '}
              {instructions.paymentMethod ===
              'send_money'
                ? 'Send Money'
                : 'Payment'}.
            </li>

            <li>
              Enter the receiving number and exact
              amount shown above.
            </li>

            <li>
              Verify the receiving account and
              complete the payment in bKash.
            </li>

            <li>
              Enter your sender number and
              Transaction ID below.
            </li>
          </ol>

          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Complete payment and submit the
            Transaction ID before the reservation
            deadline. Never send money twice for
            the same order. Never share your
            bKash PIN or OTP.
          </p>

            </>
          )}

          {recoveryMode && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Submit details only if you have already
              sent the payment. Do not send money again.
              Your payment and ticket availability require
              manual review. Never share your PIN or OTP.
            </p>
          )}

          <div className="space-y-2">
            <label
              htmlFor="bkash-sender-number"
              className="text-sm font-medium"
            >
              Your bKash number
            </label>

            <input
              id="bkash-sender-number"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={senderNumber}
              disabled={busy || submissionUncertain}
              onChange={event => {
                setSenderNumber(event.target.value);
                setConfirmed(false);
              }}
              placeholder="01XXXXXXXXX"
              className="w-full rounded-lg border bg-background px-4 py-3"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="bkash-transaction-id"
              className="text-sm font-medium"
            >
              Transaction ID
            </label>

            <input
              id="bkash-transaction-id"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={32}
              value={transactionId}
              disabled={busy || submissionUncertain}
              onChange={event => {
                setTransactionId(
                  event.target.value.toUpperCase()
                );
                setConfirmed(false);
              }}
              placeholder="Enter Transaction ID"
              className="w-full rounded-lg border bg-background px-4 py-3"
            />
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || submissionUncertain}
              onChange={event =>
                setConfirmed(event.target.checked)
              }
              className="mt-1"
            />

            <span>
              {recoveryMode
                ? 'I have already sent the payment for this order.'
                : 'I have sent the exact amount to the receiving account shown above.'}
            </span>
          </label>

          <button
            type="button"
            disabled={
              busy ||
              !confirmed ||
              !senderNumber.trim() ||
              !transactionId.trim() ||
              submissionUncertain
            }
            onClick={() => void submitPayment()}
            className="w-full rounded-lg bg-pink-600 px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {busy
              ? 'Submitting...'
              : recoveryMode
                ? 'Submit payment for review'
                : 'Submit payment for verification'}
          </button>

          <p className="text-xs text-muted-foreground">
            {recoveryMode
              ? 'Submitting payment details does not guarantee a ticket. Our team will verify your payment and ticket availability.'
              : 'Your registration will be confirmed only after the payment has been verified.'}
          </p>
        </>
      )}

      {paymentWindowElapsed && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {busy
            ? 'Your request is still processing. Please wait and do not send money again.'
            : 'The payment window has ended. Do not send money. If you already paid, refresh your order to check payment recovery.'}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 p-3 text-sm text-red-600"
        >
          {error}
        </p>
      )}

      {submissionUncertain && (
        <button
          type="button"
          disabled={busy}
          onClick={onSubmitted}
          className="w-full rounded-lg border px-4 py-3 text-sm font-medium"
        >
          Refresh order status
        </button>
      )}
    </div>
  );
}
