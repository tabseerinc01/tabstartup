'use client';

import {
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

import { useAuth } from '@/firebase';

import {
  CheckCircle2,
  Clock3,
  AlertCircle,
  Ticket,
  CreditCard,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

type Currency = 'USD' | 'BDT';

type OrderStatus =
  | 'created'
  | 'awaiting_payment'
  | 'pending_verification'
  | 'paid'
  | 'fulfilled'
  | 'requires_review'
  | 'expired'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded';

type OrderItem = {
  ticketTypeId: string;
  ticketName: string;
  attendanceMode: 'online' | 'offline';
  quantity: number;
  unitAmountMinor: number;
  totalAmountMinor: number;
};

type EventOrder = {
  orderId: string;
  eventId: string;
  status: OrderStatus;
  paymentRequired: boolean;
  currency: Currency | null;
  provider: 'tabedge' | 'bkash_manual' | null;
  totalAmountMinor: number;
  items: OrderItem[];
  expiresAtMs: number | null;
  paidAtMs: number | null;
  fulfilledAtMs: number | null;
  paymentWindowElapsed: boolean;
};

const statusMessages: Record<
  OrderStatus,
  {
    title: string;
    description: string;
  }
> = {
  created: {
    title: 'Order created',
    description:
      'Your order is being prepared.',
  },

  awaiting_payment: {
    title: 'Awaiting payment',
    description:
      'Complete your payment before the reservation expires.',
  },

  pending_verification: {
    title: 'Payment verification pending',
    description:
      'Your payment is awaiting verification.',
  },

  paid: {
    title: 'Payment received',
    description:
      'Your payment has been verified. Ticket confirmation is being prepared.',
  },

  fulfilled: {
    title: 'Registration confirmed',
    description:
      'Your registration has been confirmed.',
  },

  requires_review: {
    title: 'Order under review',
    description:
      'Your order requires additional verification.',
  },

  expired: {
    title: 'Reservation expired',
    description:
      'The reservation payment window has ended.',
  },

  cancelled: {
    title: 'Order cancelled',
    description:
      'This order has been cancelled.',
  },

  partially_refunded: {
    title: 'Partially refunded',
    description:
      'Part of your payment has been refunded.',
  },

  refunded: {
    title: 'Payment refunded',
    description:
      'Your payment has been refunded.',
  },
};

function formatMoney(
  amountMinor: number,
  currency: Currency | null
): string {
  if (currency === null) {
    return 'Free';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountMinor / 100);
}

function formatCountdown(
  milliseconds: number
): string {
  const seconds = Math.max(
    0,
    Math.ceil(milliseconds / 1000)
  );

  const hours = Math.floor(seconds / 3600);

  const minutes = Math.floor(
    (seconds % 3600) / 60
  );

  const remainder = seconds % 60;

  return [
    hours,
    minutes,
    remainder,
  ].map(
    value => String(value).padStart(2, '0')
  ).join(':');
}

function readOrder(
  value: unknown,
  expectedOrderId: string
): EventOrder {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    throw new Error('INVALID_ORDER_RESPONSE');
  }

  const order = value as EventOrder;

  if (
    order.orderId !== expectedOrderId ||
    !Object.prototype.hasOwnProperty.call(
      statusMessages,
      order.status
    ) ||
    typeof order.paymentRequired !== 'boolean' ||
    !Array.isArray(order.items) ||
    order.items.length !== 1 ||
    !Number.isSafeInteger(order.totalAmountMinor) ||
    order.totalAmountMinor < 0 ||
    (
      order.expiresAtMs !== null &&
      (
        !Number.isSafeInteger(order.expiresAtMs) ||
        order.expiresAtMs <= 0
      )
    )
  ) {
    throw new Error('INVALID_ORDER_RESPONSE');
  }

  if (order.paymentRequired) {
    if (
      order.totalAmountMinor <= 0 ||
      !(
        (
          order.currency === 'USD' &&
          order.provider === 'tabedge'
        ) ||
        (
          order.currency === 'BDT' &&
          order.provider === 'bkash_manual'
        )
      )
    ) {
      throw new Error('INVALID_ORDER_RESPONSE');
    }
  } else if (
    order.currency !== null ||
    order.provider !== null ||
    order.totalAmountMinor !== 0
  ) {
    throw new Error('INVALID_ORDER_RESPONSE');
  }

  const item = order.items[0];

  if (
    !item ||
    typeof item.ticketTypeId !== 'string' ||
    typeof item.ticketName !== 'string' ||
    !['online', 'offline'].includes(
      item.attendanceMode
    ) ||
    !Number.isSafeInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 20 ||
    !Number.isSafeInteger(item.unitAmountMinor) ||
    item.unitAmountMinor < 0 ||
    item.totalAmountMinor !==
      item.unitAmountMinor * item.quantity ||
    item.totalAmountMinor !==
      order.totalAmountMinor
  ) {
    throw new Error('INVALID_ORDER_RESPONSE');
  }

  return order;
}

export function EventOrderStatus({
  orderId,
}: {
  orderId: string;
}) {
  const auth = useAuth();

  const [user, setUser] =
    useState<User | null>(null);

  const [authReady, setAuthReady] =
    useState(false);

  const [order, setOrder] =
    useState<EventOrder | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [refresh, setRefresh] =
    useState(0);

  const [now, setNow] =
    useState(Date.now());

  useEffect(() => {
    return onAuthStateChanged(
      auth,
      current => {
        setOrder(null);
        setError('');
        setLoading(true);
        setUser(current);
        setAuthReady(true);
      }
    );
  }, [auth]);

  useEffect(() => {
    if (!authReady) return;

    const controller =
      new AbortController();

    async function loadOrder() {
      setLoading(true);
      setError('');
      setOrder(null);

      try {
        const headers: Record<string, string> = {};

        if (auth.currentUser !== user) {
          throw new Error('UNAUTHENTICATED');
        }

        if (user) {
          headers.Authorization =
            `Bearer ${await user.getIdToken()}`;
        }

        const response = await fetch(
          `/api/events/orders/${encodeURIComponent(orderId)}`,
          {
            method: 'GET',
            headers,
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
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
              : 'ORDER_SERVICE_UNAVAILABLE'
          );
        }

        const result = readOrder(
          body.data,
          orderId
        );

        if (
          !controller.signal.aborted &&
          auth.currentUser === user
        ) {
          setOrder(result);
          setNow(Date.now());
        }
      } catch (failure) {
        if (controller.signal.aborted) {
          return;
        }

        const code =
          failure instanceof Error
            ? failure.message
            : '';

        if (
          code === 'EVENT_ORDER_NOT_FOUND' ||
          code === 'UNAUTHENTICATED'
        ) {
          setError(
            'This order is unavailable in your current session. Use the account or browser used to register.'
          );
        } else if (
          code === 'REGISTRATION_RATE_LIMIT_EXCEEDED'
        ) {
          setError(
            'Too many requests. Please try again later.'
          );
        } else {
          setError(
            'Unable to load your order. Please try again.'
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadOrder();

    return () => controller.abort();
  }, [
    auth,
    authReady,
    user,
    orderId,
    refresh,
  ]);

  useEffect(() => {
    if (
      !order ||
      order.status !== 'awaiting_payment' ||
      order.expiresAtMs === null
    ) {
      return;
    }

    const timer = window.setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () =>
      window.clearInterval(timer);
  }, [order]);

  if (loading || !authReady) {
    return (
      <section className="rounded-2xl border bg-card p-8">
        <p className="text-muted-foreground">
          Loading your order...
        </p>
      </section>
    );
  }

  if (!order || error) {
    return (
      <section className="space-y-5 rounded-2xl border bg-card p-8">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />

        <h2 className="text-xl font-semibold">
          Unable to display order
        </h2>

        <p role="alert" className="text-sm text-muted-foreground">
          {error || 'Order unavailable.'}
        </p>

        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() =>
              setRefresh(value => value + 1)
            }
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>

          {!user && (
            <Link
              href="/login"
              className="rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Sign in
            </Link>
          )}
        </div>
      </section>
    );
  }

  const message =
    statusMessages[order.status];

  const elapsed =
    order.status === 'awaiting_payment' &&
    (
      order.paymentWindowElapsed ||
      (
        order.expiresAtMs !== null &&
        order.expiresAtMs <= now
      )
    );

  const confirmed =
    order.status === 'fulfilled';

  const paymentPending =
    order.paymentRequired &&
    order.status === 'awaiting_payment' &&
    !elapsed;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          {confirmed ? (
            <CheckCircle2 className="h-10 w-10 shrink-0 text-green-600" />
          ) : elapsed ? (
            <AlertCircle className="h-10 w-10 shrink-0 text-amber-600" />
          ) : (
            <Clock3 className="h-10 w-10 shrink-0 text-primary" />
          )}

          <div>
            <h2 className="text-2xl font-bold">
              {elapsed
                ? 'Payment window ended'
                : message.title}
            </h2>

            <p className="mt-2 text-muted-foreground">
              {elapsed
                ? 'The payment deadline has passed. Refresh to check the latest order status.'
                : message.description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5">
          <div>
            <p className="text-xs text-muted-foreground">
              Order reference
            </p>

            <p className="break-all font-mono text-sm">
              {order.orderId}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setRefresh(value => value + 1)
            }
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh status
          </button>
        </div>
      </section>

      {paymentPending &&
        order.expiresAtMs !== null && (
          <section className="rounded-2xl border bg-card p-6">
            <p className="text-sm font-medium">
              Reservation time remaining
            </p>

            <p className="mt-2 font-mono text-3xl font-bold tabular-nums">
              {formatCountdown(
                order.expiresAtMs - now
              )}
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              Payment availability is determined by the server.
            </p>
          </section>
        )}

      <section className="space-y-5 rounded-2xl border bg-card p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Ticket className="h-5 w-5" />
          Ticket summary
        </h2>

        {order.items.map(item => (
          <div
            key={item.ticketTypeId}
            className="flex flex-wrap justify-between gap-4 border-b pb-4"
          >
            <div>
              <p className="font-medium">
                {item.ticketName}
              </p>

              <p className="mt-1 text-sm capitalize text-muted-foreground">
                {item.attendanceMode} attendance
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Quantity: {item.quantity}
              </p>
            </div>

            <p className="font-medium">
              {formatMoney(
                item.totalAmountMinor,
                order.currency
              )}
            </p>
          </div>
        ))}

        <div className="flex justify-between text-lg font-semibold">
          <span>Total</span>

          <span>
            {formatMoney(
              order.totalAmountMinor,
              order.currency
            )}
          </span>
        </div>
      </section>

      {paymentPending && (
        <section className="space-y-5 rounded-2xl border bg-card p-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <CreditCard className="h-5 w-5" />
            Payment method
          </h2>

          {order.provider === 'tabedge' ? (
            <div className="rounded-xl border p-5">
              <p className="font-semibold">
                TabEdge — USD Payment
              </p>

              <p className="mt-2 text-sm text-muted-foreground">
                Secure online payment through TabEdge.
              </p>

              <button
                type="button"
                disabled
                className="mt-5 w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground opacity-50"
              >
                Online payment unavailable
              </button>
            </div>
          ) : (
            <div className="rounded-xl border p-5">
              <p className="font-semibold">
                bKash — BDT Payment
              </p>

              <p className="mt-2 text-sm text-muted-foreground">
                Manual payment verification.
                Payment instructions are not available yet.
              </p>

              <button
                type="button"
                disabled
                className="mt-5 w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground opacity-50"
              >
                bKash payment unavailable
              </button>
            </div>
          )}

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Payment confirmation requires server-side verification.
          </p>
        </section>
      )}

      {confirmed && (
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="text-xl font-semibold">
            Event tickets
          </h2>

          <p className="mt-3 text-sm text-muted-foreground">
            Ticket availability and delivery details
            will appear here when ready.
          </p>
        </section>
      )}

      <Link
        href="/events"
        className="inline-flex rounded-lg border px-5 py-3 text-sm font-medium"
      >
        Explore more events
      </Link>
    </div>
  );
}
