'use client';

import {
  useEffect,
  useState,
  useRef,
} from 'react';

import Link from 'next/link';

import { useParams } from 'next/navigation';

import {
  ArrowLeft,
  Users,
  RefreshCw,
  Download,
  Search,
  Loader2,
  AlertCircle,
  ChevronDown,
  Mail,
} from 'lucide-react';

import { useUser } from '@/firebase';

import type {
  AdminEventParticipant,
  AdminEventParticipantList,
} from '@/services/event-admin-participants.service';

const statuses = [
  ['all', 'All participants'],
  ['confirmed', 'Confirmed'],
  ['pending_payment', 'Pending payment'],
  ['pending_verification', 'Pending verification'],
  ['requires_review', 'Requires review'],
  ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'],
] as const;

const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';

const inputClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm';

function label(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase());
}

function dateTime(value: number | null) {
  if (
    value === null ||
    !Number.isSafeInteger(value)
  ) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

function money(
  amount: number,
  currency: 'BDT' | 'USD' | null
) {
  if (currency === null) {
    return 'Free';
  }

  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

function statusClass(status: string) {
  if (status === 'confirmed') {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (
    status === 'pending_payment' ||
    status === 'pending_verification' ||
    status === 'requires_review'
  ) {
    return 'bg-amber-50 text-amber-700';
  }

  return 'bg-slate-100 text-slate-700';
}

function csvCell(value: unknown) {
  let text = String(value ?? '');

  // Prevent spreadsheet formula injection.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) ||
      /^[\t\r\n]/.test(text)) {
    text = "'" + text;
  }

  return '"' +
    text.replace(/"/g, '""') +
    '"';
}

function exportParticipants(
  eventId: string,
  participants: AdminEventParticipant[]
) {
  const rows: unknown[][] = [
    [
      'Registration ID',
      'Order ID',
      'Full name',
      'Email',
      'Phone',
      'Organization',
      'Designation',
      'Attendance mode',
      'Registration status',
      'Ticket type',
      'Payment required',
      'Currency',
      'Individual ticket price',
      'Order status',
      'Ticket number',
      'Ticket status',
      'Registered at (Dhaka)',
    ],
    ...participants.map(item => [
      item.registrationId,
      item.orderId,
      item.fullName,
      item.email,
      item.phone,
      item.organization,
      item.designation,
      item.attendanceMode,
      item.registrationStatus,
      item.ticketName,
      item.paymentRequired ? 'Yes' : 'No',
      item.currency,
      (item.unitAmountMinor / 100).toFixed(2),
      item.orderStatus,
      item.ticket?.ticketNumber,
      item.ticket?.status,
      dateTime(item.registeredAtMs),
    ]),
  ];

  const csv = rows
    .map(row => row.map(csvCell).join(','))
    .join('\r\n');

  const blob = new Blob(
    ['\uFEFF', csv],
    { type: 'text/csv;charset=utf-8' }
  );

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');

  anchor.href = url;

  anchor.download =
    'tabstartup-participants-' +
    eventId +
    '.csv';

  document.body.appendChild(anchor);

  anchor.click();

  anchor.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    30000
  );
}

export default function ParticipantsPage() {
  const params = useParams<{
    eventId: string;
  }>();

  const { user, isUserLoading } = useUser();

  if (isUserLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        Sign in to manage event participants.
      </div>
    );
  }

  return (
    <ParticipantDashboard
      key={user.uid + ':' + params.eventId}
      eventId={params.eventId}
      user={user}
    />
  );
}

function ParticipantDashboard({
  eventId,
  user,
}: {
  eventId: string;
  user: {
    uid: string;
    getIdToken: () => Promise<string>;
  };
}) {
  const [items, setItems] = useState<
    AdminEventParticipant[]
  >([]);

  const [eventTitle, setEventTitle] =
    useState('');

  const [status, setStatus] =
    useState('all');

  const [search, setSearch] =
    useState('');

  const [nextCursor, setNextCursor] =
    useState<string | null>(null);

  const [hasMore, setHasMore] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [expanded, setExpanded] =
    useState<string | null>(null);

  const [revision, setRevision] =
    useState(0);

  const requestRef =
    useRef<AbortController | null>(null);

  const busyRef = useRef(false);

  const reminderLock = useRef(false);

  const reminderRequest =
    useRef<AbortController | null>(null);

  const [remindingOrder, setRemindingOrder] =
    useState<string | null>(null);

  const [reminderNotice, setReminderNotice] =
    useState<string | null>(null);

  const [reminderError, setReminderError] =
    useState<string | null>(null);

  const [requestedOrders, setRequestedOrders] =
    useState<Set<string>>(() => new Set());

  useEffect(() => {
    return () => {
      reminderRequest.current?.abort();
    };
  }, []);

  const pagePath =
    '/control/events/' +
    encodeURIComponent(eventId);

  const endpoint =
    '/api/control/events/' +
    encodeURIComponent(eventId) +
    '/participants';

  async function loadPage(
    filter: string,
    cursor: string | null,
    append: boolean
  ) {
    requestRef.current?.abort();

    const controller =
      new AbortController();

    requestRef.current = controller;

    busyRef.current = true;

    setLoading(true);
    setError(null);

    if (!append) {
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      setExpanded(null);
    }

    try {
      const token =
        await user.getIdToken();

      if (controller.signal.aborted) {
        return;
      }

      const query = new URLSearchParams({
        limit: '100',
      });

      if (filter !== 'all') {
        query.set('status', filter);
      }

      if (cursor) {
        query.set('cursor', cursor);
      }

      const response = await fetch(
        endpoint + '?' + query.toString(),
        {
          headers: {
            Authorization: 'Bearer ' + token,
          },
          cache: 'no-store',
          signal: controller.signal,
        }
      );

      const result = await response.json();

      if (
        !response.ok ||
        result.success !== true
      ) {
        throw new Error(
          typeof result.error === 'string'
            ? result.error
            : result.error?.code ??
                'PARTICIPANT_REQUEST_FAILED'
        );
      }

      const data =
        result.data as AdminEventParticipantList;

      if (
        !data ||
        data.eventId !== eventId ||
        !Array.isArray(data.items) ||
        typeof data.eventTitle !== 'string' ||
        typeof data.hasMore !== 'boolean' ||
        (
          data.hasMore &&
          (
            typeof data.nextCursor !== 'string' ||
            data.nextCursor === cursor
          )
        )
      ) {
        throw new Error(
          'INVALID_PARTICIPANT_RESPONSE'
        );
      }

      if (controller.signal.aborted) {
        return;
      }

      setEventTitle(data.eventTitle);

      setItems(previous => {
        if (!append) {
          return data.items;
        }

        const merged = new Map(
          previous.map(item => [
            item.registrationId,
            item,
          ])
        );

        for (const item of data.items) {
          merged.set(
            item.registrationId,
            item
          );
        }

        return [...merged.values()];
      });

      setNextCursor(data.nextCursor);

      setHasMore(data.hasMore);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error
            ? err.message
            : 'PARTICIPANT_REQUEST_FAILED'
        );
      }
    } finally {
      if (
        requestRef.current === controller &&
        !controller.signal.aborted
      ) {
        busyRef.current = false;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadPage(status, null, false);

    return () => {
      requestRef.current?.abort();
    };
    // The dashboard is keyed by user UID and event ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, revision]);

  async function sendReminder(
    item: AdminEventParticipant
  ) {
    if (
      reminderLock.current ||
      requestedOrders.has(item.orderId) ||
      item.registrationStatus !== 'pending_payment' ||
      item.orderStatus !== 'awaiting_payment' ||
      !item.paymentRequired ||
      item.paymentDeadlineMs === null ||
      item.paymentDeadlineMs <= Date.now()
    ) {
      return;
    }

    if (!window.confirm(
      'Queue a payment reminder for this order? ' +
      'The reminder will be sent to the purchaser.'
    )) {
      return;
    }

    reminderLock.current = true;

    const controller =
      new AbortController();

    reminderRequest.current = controller;

    setRemindingOrder(item.orderId);
    setReminderNotice(null);
    setReminderError(null);

    try {
      const token = await user.getIdToken();

      if (controller.signal.aborted) {
        return;
      }

      const response = await fetch(
        endpoint + '/reminder',
        {
          method: 'POST',

          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            orderId: item.orderId,
          }),

          cache: 'no-store',

          signal: controller.signal,
        }
      );

      const result = await response.json();

      if (
        !response.ok ||
        result.success !== true
      ) {
        throw new Error(
          typeof result.error === 'string'
            ? result.error
            : result.error?.code ??
                'REMINDER_REQUEST_FAILED'
        );
      }

      const data = result.data;

      if (
        !data ||
        data.eventId !== eventId ||
        data.orderId !== item.orderId ||
        (
          data.status !== 'queued' &&
          data.status !== 'already_requested'
        )
      ) {
        throw new Error(
          'INVALID_REMINDER_RESPONSE'
        );
      }

      if (controller.signal.aborted) {
        return;
      }

      setRequestedOrders(previous => {
        const next = new Set(previous);
        next.add(item.orderId);
        return next;
      });

      setReminderNotice(
        data.status === 'queued'
          ? 'Payment reminder queued for delivery.'
          : 'A manual reminder was already requested for this order.'
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setReminderError(
          error instanceof Error
            ? error.message
            : 'REMINDER_REQUEST_FAILED'
        );
      }
    } finally {
      if (
        reminderRequest.current === controller
      ) {
        reminderLock.current = false;

        if (!controller.signal.aborted) {
          setRemindingOrder(null);
        }
      }
    }
  }

  const normalizedSearch =
    search.trim().toLowerCase();

  const visibleItems = items.filter(item =>
    [
      item.fullName,
      item.email,
      item.phone,
      item.organization,
      item.designation,
      item.registrationId,
      item.orderId,
      item.ticket?.ticketNumber,
    ].some(value =>
      String(value ?? '')
        .toLowerCase()
        .includes(normalizedSearch)
    )
  );

  const confirmed = items.filter(
    item =>
      item.registrationStatus === 'confirmed'
  ).length;

  const unpaid = items.filter(
    item =>
      item.registrationStatus === 'pending_payment'
  ).length;

  const verification = items.filter(
    item =>
      item.registrationStatus === 'pending_verification'
  ).length;

  return (
    <div className="space-y-6 p-4 md:p-6">

      <Link
        href={pagePath}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to event
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Users className="h-6 w-6" />
            Participants
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            {eventTitle || 'Event participant management'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">

          <button
            type="button"
            className={buttonClass}
            disabled={loading}
            onClick={() =>
              setRevision(value => value + 1)
            }
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <button
            type="button"
            className={buttonClass}
            disabled={
              loading ||
              !!error ||
              visibleItems.length === 0
            }
            onClick={() =>
              exportParticipants(
                eventId,
                visibleItems
              )
            }
          >
            <Download className="h-4 w-4" />
            Export displayed CSV
          </button>

        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Counts, search and CSV export apply to loaded
        records only. Load more pages when available.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Loaded participants', items.length],
          ['Confirmed', confirmed],
          ['Pending payment', unpaid],
          ['Pending verification', verification],
        ].map(([title, count]) => (
          <div
            key={title}
            className="rounded-xl border bg-card p-4"
          >
            <p className="text-sm text-muted-foreground">
              {title}
            </p>

            <p className="mt-2 text-2xl font-semibold">
              {count}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

          <input
            className={inputClass + ' pl-9'}
            value={search}
            maxLength={200}
            placeholder="Search loaded participants..."
            aria-label="Search participants"
            onChange={event =>
              setSearch(event.target.value)
            }
          />
        </div>

        <select
          className={inputClass}
          value={status}
          aria-label="Registration status"
          onChange={event =>
            setStatus(event.target.value)
          }
        >
          {statuses.map(([value, title]) => (
            <option key={value} value={value}>
              {title}
            </option>
          ))}
        </select>
      </div>

      {reminderNotice && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          {reminderNotice}
        </div>
      )}

      {reminderError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {reminderError}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!loading &&
        !error &&
        visibleItems.length === 0 && (
          <div className="rounded-xl border p-10 text-center text-muted-foreground">
            No matching participants.
          </div>
        )}

      <div className="space-y-3">
        {visibleItems.map(item => (
          <div
            key={item.registrationId}
            className="rounded-xl border bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 p-4">

              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">
                  {item.fullName}
                </p>

                <p className="break-all text-sm text-muted-foreground">
                  {item.email}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {item.ticketName} · {label(item.attendanceMode)}
                </p>
              </div>

              <div className="space-y-1">
                <span className={
                  'inline-block rounded-full px-3 py-1 text-xs font-medium ' +
                  statusClass(item.registrationStatus)
                }>
                  {label(item.registrationStatus)}
                </span>

                <p className="text-sm">
                  {money(
                    item.unitAmountMinor,
                    item.currency
                  )}
                </p>

                <p className="text-xs text-muted-foreground">
                  Order: {label(item.orderStatus)}
                </p>
              </div>

              <button
                type="button"
                className={buttonClass}
                aria-expanded={
                  expanded === item.registrationId
                }
                onClick={() =>
                  setExpanded(previous =>
                    previous === item.registrationId
                      ? null
                      : item.registrationId
                  )
                }
              >
                Details
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {expanded === item.registrationId && (
              <div className="space-y-4 border-t p-4">

                <dl className="grid gap-4 text-sm md:grid-cols-2">
                  {[
                    ['Registration ID', item.registrationId],
                    ['Order ID', item.orderId],
                    ['Phone', item.phone ?? '—'],
                    ['Organization', item.organization ?? '—'],
                    ['Designation', item.designation ?? '—'],
                    ['Purchaser email', item.purchaserEmail],
                    ['Payment provider', item.provider ?? 'Free'],
                    ['Order status', label(item.orderStatus)],
                    ['Order quantity', item.orderQuantity],
                    ['Order total', money(
                      item.orderTotalAmountMinor,
                      item.currency
                    )],
                    ['Registered at', dateTime(item.registeredAtMs)],
                    ['Confirmed at', dateTime(item.confirmedAtMs)],
                    ['Paid at', dateTime(item.paidAtMs)],
                    ['Payment deadline', dateTime(item.paymentDeadlineMs)],
                    ['Ticket number', item.ticket?.ticketNumber ?? 'Not issued'],
                    ['Ticket status', item.ticket ? label(item.ticket.status) : '—'],
                    ['Ticket issued at', dateTime(item.ticket?.issuedAtMs ?? null)],
                  ].map(([title, value]) => (
                    <div key={title} className="min-w-0">
                      <dt className="text-muted-foreground">
                        {title}
                      </dt>

                      <dd className="mt-1 break-all font-medium">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {item.registrationStatus === 'confirmed' &&
                  !item.ticket && (
                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      Confirmed registration has no issued ticket.
                      Review required.
                    </p>
                  )}

                {item.registrationStatus === 'pending_payment' &&
                  item.orderStatus === 'awaiting_payment' &&
                  item.paymentRequired &&
                  item.paymentDeadlineMs !== null &&
                  item.paymentDeadlineMs > Date.now() && (
                    <div className="space-y-2 rounded-lg border p-3">
                      <p className="text-sm font-medium">
                        Payment reminder
                      </p>

                      <p className="break-all text-xs text-muted-foreground">
                        Recipient: {item.purchaserEmail}
                      </p>

                      <button
                        type="button"
                        className={buttonClass}
                        disabled={
                          remindingOrder !== null ||
                          requestedOrders.has(item.orderId)
                        }
                        onClick={() => {
                          void sendReminder(item);
                        }}
                      >
                        {remindingOrder === item.orderId
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Mail className="h-4 w-4" />
                        }

                        {requestedOrders.has(item.orderId)
                          ? 'Reminder requested'
                          : remindingOrder === item.orderId
                            ? 'Queueing reminder...'
                            : 'Send Payment Reminder'}
                      </button>

                      <p className="text-xs text-muted-foreground">
                        One manual reminder per order.
                        Queued does not mean delivered.
                      </p>
                    </div>
                  )}

                {item.provider === 'bkash_manual' &&
                  item.registrationStatus === 'pending_verification' && (
                    <Link
                      href="/control/payments/verification"
                      className={buttonClass}
                    >
                      Open payment verification
                    </Link>
                  )}

              </div>
            )}
          </div>
        ))}
      </div>

      {hasMore && nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            className={buttonClass}
            disabled={loading}
            onClick={() => {
              if (!busyRef.current) {
                void loadPage(
                  status,
                  nextCursor,
                  true
                );
              }
            }}
          >
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}

            Load more participants
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {visibleItems.length} of {items.length}
        {' '}loaded participants. Times shown in Asia/Dhaka.
        Exported participant data must be handled securely.
      </p>

    </div>
  );
}
