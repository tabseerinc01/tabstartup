'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import Link from 'next/link';

import {
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

import { useUser } from '@/firebase';

import {
  paymentAdminRequest,
} from '@/lib/payment-admin-client';

import type {
  BkashPendingPaymentSummary,
} from '@/services/payments/bkash-admin-review.service';

import type {
  BkashAdminPaymentDetails,
} from '@/services/payments/bkash-admin-details.service';

import type {
  BkashAdminDecisionInput,
  BkashAdminDecisionResult,
} from '@/services/payments/bkash-admin-decision.service';

type PendingList = {
  items: BkashPendingPaymentSummary[];
  limit: number;
  hasMore: boolean;
};

const endpoint =
  '/api/control/payments/bkash';

const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

const inputClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm';

function money(amountMinor: number) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
  }).format(amountMinor / 100);
}

function dateTime(value: number | null) {
  if (
    value === null ||
    !Number.isSafeInteger(value)
  ) {
    return 'Unavailable';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'PAYMENT_REQUEST_FAILED';
}

function validId(value: string) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value) &&
    !/^__.*__$/.test(value)
  );
}

export default function PaymentVerificationPage() {
  const { user } = useUser();

  if (!user) {
    return (
      <p className="text-muted-foreground">
        Administrative sign-in required.
      </p>
    );
  }

  return (
    <VerificationDashboard
      key={user.uid}
      user={user}
    />
  );
}

function VerificationDashboard({
  user,
}: {
  user: NonNullable<
    ReturnType<typeof useUser>['user']
  >;
}) {
  const [list, setList] =
    useState<PendingList | null>(null);

  const [details, setDetails] =
    useState<BkashAdminPaymentDetails | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [notice, setNotice] =
    useState('');

  const [decision, setDecision] =
    useState<'approve' | 'reject'>('approve');

  const [amount, setAmount] =
    useState('');

  const [transactionId, setTransactionId] =
    useState('');

  const [sender, setSender] =
    useState('');

  const [receiver, setReceiver] =
    useState('');

  const [reason, setReason] =
    useState('');

  const [confirmed, setConfirmed] =
    useState(false);

  const requestRef =
    useRef<AbortController | null>(null);

  const decisionRequestRef =
    useRef<AbortController | null>(null);

  const decisionLock =
    useRef(false);

  const mounted =
    useRef(false);

  function resetForm() {
    setDecision('approve');
    setAmount('');
    setTransactionId('');
    setSender('');
    setReceiver('');
    setReason('');
    setConfirmed(false);
  }

  function startRead() {
    requestRef.current?.abort();

    const controller =
      new AbortController();

    requestRef.current = controller;

    setLoading(true);
    setError('');

    return controller;
  }

  async function loadPending() {
    const controller = startRead();

    setList(null);
    setDetails(null);
    resetForm();

    try {
      const result =
        await paymentAdminRequest<PendingList>(
          user,
          endpoint + '/pending',
          {
            signal: controller.signal,
          }
        );

      if (
        !result ||
        !Array.isArray(result.items) ||
        result.items.length > 100 ||
        typeof result.hasMore !== 'boolean' ||
        result.items.some(item =>
          !item ||
          !validId(item.submissionId) ||
          item.status !== 'pending_verification' ||
          item.currency !== 'BDT' ||
          item.provider !== 'bkash_manual' ||
          !Number.isSafeInteger(item.amountMinor) ||
          item.amountMinor <= 0
        )
      ) {
        throw new Error(
          'INVALID_PENDING_PAYMENT_RESPONSE'
        );
      }

      if (
        mounted.current &&
        !controller.signal.aborted
      ) {
        setList(result);
      }
    } catch (err) {
      if (
        mounted.current &&
        !controller.signal.aborted
      ) {
        setError(errorMessage(err));
      }
    } finally {
      if (
        mounted.current &&
        requestRef.current === controller &&
        !controller.signal.aborted
      ) {
        setLoading(false);
      }
    }
  }

  async function loadDetails(
    submissionId: string
  ) {
    if (
      decisionLock.current ||
      !validId(submissionId)
    ) {
      return;
    }

    const controller = startRead();

    setDetails(null);
    setNotice('');
    resetForm();

    try {
      const result =
        await paymentAdminRequest<BkashAdminPaymentDetails>(
          user,
          endpoint + '/' + submissionId,
          {
            signal: controller.signal,
          }
        );

      if (
        !result ||
        result.submissionId !== submissionId ||
        result.status !== 'pending_verification' ||
        result.currency !== 'BDT' ||
        result.provider !== 'bkash_manual' ||
        !Number.isSafeInteger(result.amountMinor) ||
        result.amountMinor <= 0 ||
        !Array.isArray(result.participants) ||
        !Array.isArray(result.approvalBlockers) ||
        typeof result.canApprove !== 'boolean'
      ) {
        throw new Error(
          'INVALID_PAYMENT_DETAILS_RESPONSE'
        );
      }

      if (
        mounted.current &&
        !controller.signal.aborted
      ) {
        setDetails(result);
      }
    } catch (err) {
      if (
        mounted.current &&
        !controller.signal.aborted
      ) {
        setError(errorMessage(err));
      }
    } finally {
      if (
        mounted.current &&
        requestRef.current === controller &&
        !controller.signal.aborted
      ) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;

    void loadPending();

    return () => {
      mounted.current = false;

      requestRef.current?.abort();

      decisionRequestRef.current?.abort();
    };
  }, [user]);

  const amountValid =
    /^\d{1,12}(\.\d{1,2})?$/.test(
      amount.trim()
    );

  const amountParts =
    amount.trim().split('.');

  const verifiedAmountMinor =
    amountValid
      ? Number(amountParts[0]) * 100 +
        Number(
          (amountParts[1] ?? '')
            .padEnd(2, '0')
        )
      : 0;

  const normalizedTransactionId =
    transactionId.trim().toUpperCase();

  const evidenceMatches =
    details !== null &&
    Number.isSafeInteger(verifiedAmountMinor) &&
    verifiedAmountMinor === details.amountMinor &&
    normalizedTransactionId === details.transactionId &&
    sender.trim() === details.senderNumber &&
    receiver.trim() === details.receivingNumber;

  const approvalAllowed =
    details !== null &&
    details.canApprove &&
    details.approvalBlockers.length === 0 &&
    details.reviewDeadlineAtMs !== null &&
    details.reviewDeadlineAtMs > Date.now();

  const canSubmit =
    details !== null &&
    !loading &&
    !saving &&
    confirmed &&
    reason.trim().length >= 3 &&
    reason.length <= 500 &&
    !/[\u0000-\u001f\u007f]/.test(reason) &&
    (
      decision === 'reject' ||
      (
        approvalAllowed &&
        evidenceMatches
      )
    );

  async function submitDecision() {
    if (
      !details ||
      !canSubmit ||
      decisionLock.current
    ) {
      return;
    }

    if (
      decision === 'approve' &&
      (
        details.reviewDeadlineAtMs === null ||
        details.reviewDeadlineAtMs <= Date.now()
      )
    ) {
      setError(
        'Review deadline elapsed. Refresh payment details.'
      );

      setConfirmed(false);
      return;
    }

    const accepted = window.confirm(
      decision === 'approve'
        ? 'Approve this verified payment and confirm the registrations?'
        : 'Reject this payment and release its reserved tickets? Confirm that no funds were received.'
    );

    if (!accepted) {
      return;
    }

    const input: BkashAdminDecisionInput =
      decision === 'approve'
        ? {
            decision: 'approve',

            confirmedFundsReceived: true,

            verifiedAmountMinor,

            verifiedTransactionId:
              normalizedTransactionId,

            verifiedSenderNumber:
              sender.trim(),

            verifiedReceivingNumber:
              receiver.trim(),

            reason: reason.trim(),
          }
        : {
            decision: 'reject',

            confirmedNoFundsReceived: true,

            reason: reason.trim(),
          };

    decisionLock.current = true;

    setSaving(true);
    setError('');
    setNotice('');

    const controller =
      new AbortController();

    decisionRequestRef.current =
      controller;

    try {
      const result =
        await paymentAdminRequest<BkashAdminDecisionResult>(
          user,
          endpoint +
            '/' +
            details.submissionId +
            '/decision',
          {
            method: 'POST',
            body: input,
            signal: controller.signal,
          }
        );

      if (
        !result ||
        result.submissionId !== details.submissionId ||
        result.status !==
          (
            decision === 'approve'
              ? 'approved'
              : 'rejected'
          )
      ) {
        throw new Error(
          'INVALID_PAYMENT_DECISION_RESPONSE'
        );
      }

      if (
        mounted.current &&
        !controller.signal.aborted
      ) {
        setNotice(
          'Payment successfully ' +
          result.status +
          '.'
        );

        await loadPending();
      }
    } catch (err) {
      if (
        mounted.current &&
        !controller.signal.aborted
      ) {
        setDetails(null);
        setList(null);
        resetForm();

        setError(
          errorMessage(err) +
          '. Payment outcome must be checked. Refresh before taking another action.'
        );
      }
    } finally {
      decisionLock.current = false;

      if (
        decisionRequestRef.current ===
        controller
      ) {
        decisionRequestRef.current = null;
      }

      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/control/payments"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Payment Management
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Payment Verification
          </h1>

          <p className="mt-2 text-muted-foreground">
            Review and verify manual bKash payments.
          </p>
        </div>

        <button
          type="button"
          className={buttonClass}
          disabled={loading || saving}
          onClick={() => {
            setNotice('');
            void loadPending();
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border p-4">
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0" />

        <p className="text-sm">
          Customer-submitted information is not proof
          of payment. Verify actual received funds
          in the correct bKash account before approval.
          Never reject a payment if funds were received.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-destructive p-4 text-sm text-destructive"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-lg border p-4 text-sm font-medium"
        >
          {notice}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading payment information...
        </div>
      )}

      {list && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Pending payments shown
              </p>

              <p className="mt-2 text-2xl font-bold">
                {list.items.length}
                {list.hasMore ? '+' : ''}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Amount in displayed payments
              </p>

              <p className="mt-2 text-2xl font-bold">
                {money(
                  list.items.reduce(
                    (total, item) =>
                      total + item.amountMinor,
                    0
                  )
                )}
              </p>
            </div>
          </div>

          {list.hasMore && (
            <p className="text-sm text-muted-foreground">
              Showing a limited batch of pending payments.
              Refresh after processing this batch.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3">Transaction ID</th>
                  <th className="p-3">Sender</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Submitted</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>

              <tbody>
                {list.items.map(item => (
                  <tr
                    key={item.submissionId}
                    className="border-b last:border-b-0"
                  >
                    <td className="p-3 font-mono">
                      {item.transactionId}
                    </td>

                    <td className="p-3">
                      {item.senderNumber}
                    </td>

                    <td className="p-3">
                      {money(item.amountMinor)}
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      {dateTime(item.submittedAtMs)}
                    </td>

                    <td className="p-3">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={loading || saving}
                        onClick={() => {
                          void loadDetails(
                            item.submissionId
                          );
                        }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}

                {list.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No pending bKash payments.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {details && (
        <section className="space-y-6 rounded-xl border bg-card p-6">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                {details.eventTitle}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {details.ticketTypeId} · {details.quantity} ticket(s)
              </p>

              <p className="mt-2 text-2xl font-bold">
                {money(details.amountMinor)}
              </p>
            </div>

            <button
              type="button"
              className={buttonClass}
              disabled={saving || loading}
              onClick={() => {
                setDetails(null);
                resetForm();
              }}
            >
              Close
            </button>
          </div>

          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              ['Event order', details.eventOrderId],
              ['Purchaser', details.purchaserEmail],
              ['Ticket', details.ticketName],
              ['Attendance', details.attendanceMode],
              ['Transaction ID', details.transactionId],
              ['Sender number', details.senderNumber],
              ['Receiving number', details.receivingNumber],
              ['Account type', details.accountType],
              ['Payment method', details.paymentMethod],
              ['Configuration version', String(details.configVersion)],
              ['Submitted', dateTime(details.submittedAtMs)],
              ['Payment expiry', dateTime(details.paymentWindowExpiresAtMs)],
              ['Review deadline', dateTime(details.reviewDeadlineAtMs)],
              ['Event status', details.eventStatus],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">
                  {label}
                </dt>

                <dd className="mt-1 break-all font-medium">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="space-y-3">
            <h3 className="font-semibold">
              Participants
            </h3>

            {details.participants.map(participant => (
              <div
                key={participant.registrationId}
                className="rounded-lg border p-3 text-sm"
              >
                <p className="font-medium">
                  {participant.fullName}
                </p>

                <p className="break-all text-muted-foreground">
                  {participant.email}
                </p>
              </div>
            ))}
          </div>

          {!approvalAllowed && (
            <div className="rounded-lg border border-destructive p-4 text-sm">
              <p className="font-semibold text-destructive">
                Approval is currently blocked.
              </p>

              {details.approvalBlockers.map(blocker => (
                <p key={blocker} className="mt-1">
                  {blocker}
                </p>
              ))}

              <p className="mt-2">
                If funds were received, do not reject.
                Escalate for manual recovery.
              </p>
            </div>
          )}

          <fieldset
            disabled={saving || loading}
            className="space-y-4 border-t pt-5 disabled:opacity-60"
          >
            <legend className="pr-3 font-semibold">
              Payment decision
            </legend>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="decision"
                  checked={decision === 'approve'}
                  onChange={() => {
                    setDecision('approve');
                    setConfirmed(false);
                    setReason('');
                  }}
                />
                Approve verified payment
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="decision"
                  checked={decision === 'reject'}
                  onChange={() => {
                    setDecision('reject');
                    setConfirmed(false);
                    setReason('');
                  }}
                />
                Reject payment
              </label>
            </div>

            {decision === 'approve' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>Actual received amount (BDT)</span>

                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={amount}
                    maxLength={15}
                    placeholder="0.00"
                    onChange={event => {
                      setAmount(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span>Verified Transaction ID</span>

                  <input
                    className={inputClass}
                    value={transactionId}
                    maxLength={32}
                    autoComplete="off"
                    onChange={event => {
                      setTransactionId(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span>Verified sender number</span>

                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={sender}
                    maxLength={11}
                    autoComplete="off"
                    onChange={event => {
                      setSender(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span>Verified receiving number</span>

                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={receiver}
                    maxLength={11}
                    autoComplete="off"
                    onChange={event => {
                      setReceiver(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>

                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Enter details from the actual bKash
                  transaction record.
                  {evidenceMatches
                    ? ' Entered values match the submission.'
                    : ' All verified values must match.'}
                </p>
              </div>
            )}

            <label className="block space-y-1 text-sm">
              <span>Review reason (required)</span>

              <textarea
                className={inputClass}
                rows={3}
                maxLength={500}
                value={reason}
                onChange={event => {
                  setReason(event.target.value);
                  setConfirmed(false);
                }}
              />
            </label>

            <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={event =>
                  setConfirmed(event.target.checked)
                }
              />

              <span>
                {decision === 'approve'
                  ? 'I checked the actual bKash account and confirm that the stated funds were received.'
                  : 'I checked the relevant bKash account and confirm that no funds were received for this payment.'}
              </span>
            </label>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                void submitDecision();
              }}
              className={
                buttonClass +
                (
                  decision === 'approve'
                    ? ' bg-primary text-primary-foreground'
                    : ' bg-destructive text-destructive-foreground'
                )
              }
            >
              {saving && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}

              {saving
                ? 'Processing...'
                : decision === 'approve'
                  ? 'Approve Payment'
                  : 'Reject Payment'}
            </button>
          </fieldset>
        </section>
      )}
    </div>
  );
}
