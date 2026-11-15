'use client';

import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from 'react';

import Link from 'next/link';

import {
  useParams,
  useRouter,
} from 'next/navigation';

import {
  ArrowLeft,
  Ticket,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Save,
  Users,
} from 'lucide-react';

import { useUser } from '@/firebase';

import {
  eventAdminRequest,
  eventLabel,
  type AdminEventSummary,
} from '@/lib/event-admin-client';

type AttendanceMode = 'online' | 'offline';
type PricingType = 'free' | 'paid';
type TicketAccess = 'public' | 'invite_only';

interface TicketForm {
  key: string;
  name: string;
  description: string;
  benefits: string;
  attendanceMode: AttendanceMode;
  pricingType: PricingType;
  access: TicketAccess;
  usdPrice: string;
  bdtPrice: string;
  capacity: string;
  maxPerOrder: string;
  status: 'active' | 'draft';
  salesStartAtMs: number | null;
  salesEndAtMs: number | null;
}

interface SavedTicket {
  ticketType: {
    ticketTypeId: string;
    name: string;
    description: string;
    benefits: string[];
    attendanceMode: AttendanceMode;
    pricingType: PricingType;
    access?: TicketAccess;
    price: {
      usdAmountMinor: number;
      bdtAmountMinor: number;
    };
    maxPerOrder: number;
    status: string;
    salesStartAt: number | null;
    salesEndAt: number | null;
  };
  inventory: {
    capacity: number;
    reservedQuantity: number;
    issuedQuantity: number;
  };
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500';

function minorToPrice(value: number): string {
  return (value / 100).toFixed(2);
}

function priceToMinor(
  value: string,
  currency: string
): number {
  const normalized = value.trim();

  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(
      'Invalid ' + currency + ' price.'
    );
  }

  const [whole, fraction = ''] =
    normalized.split('.');

  const amount =
    Number(whole) * 100 +
    Number(fraction.padEnd(2, '0'));

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      currency + ' price must be greater than zero.'
    );
  }

  return amount;
}

function newTicket(
  event: AdminEventSummary,
  mode?: AttendanceMode
): TicketForm {
  return {
    key: crypto.randomUUID(),
    name: '',
    description: '',
    benefits: '',
    attendanceMode:
      mode ??
      (event.mode === 'offline'
        ? 'offline'
        : 'online'),
    access:
      event.registrationAccess === 'invite_only'
        ? 'invite_only'
        : 'public',

    pricingType:
      event.registrationAccess === 'invite_only' ||
      event.registrationType === 'free'
        ? 'free'
        : 'paid',
    usdPrice: '',
    bdtPrice: '',
    capacity: '1',
    maxPerOrder: '1',
    status: 'active',
    salesStartAtMs: null,
    salesEndAtMs: null,
  };
}

function restoreTicket(
  saved: SavedTicket
): TicketForm {
  const ticket = saved.ticketType;

  return {
    key: ticket.ticketTypeId,
    name: ticket.name,
    description: ticket.description,
    benefits: ticket.benefits.join('\n'),
    attendanceMode: ticket.attendanceMode,
    pricingType: ticket.pricingType,
    access: ticket.access ?? 'public',
    usdPrice: minorToPrice(
      ticket.price.usdAmountMinor
    ),
    bdtPrice: minorToPrice(
      ticket.price.bdtAmountMinor
    ),
    capacity: String(
      saved.inventory.capacity
    ),
    maxPerOrder: String(
      ticket.maxPerOrder
    ),
    status:
      ticket.status === 'draft'
        ? 'draft'
        : 'active',
    salesStartAtMs: ticket.salesStartAt,
    salesEndAtMs: ticket.salesEndAt,
  };
}

export default function AdminEventTicketsPage() {
  const { user } = useUser();

  const params = useParams<{
    eventId: string;
  }>();

  const router = useRouter();

  const eventId = params.eventId;

  const endpoint =
    '/api/control/events/' +
    encodeURIComponent(eventId);

  const [event, setEvent] =
    useState<AdminEventSummary | null>(null);

  const [tickets, setTickets] =
    useState<TicketForm[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [loadError, setLoadError] =
    useState('');

  const savingRef = useRef(false);

  useEffect(() => {
    setEvent(null);
    setTickets([]);
    setLoading(true);
    setLoadError('');

    if (!user) return;

    const controller = new AbortController();

    let active = true;

    Promise.all([
      eventAdminRequest<{
        event: AdminEventSummary;
      }>(
        user,
        endpoint,
        { signal: controller.signal }
      ),

      eventAdminRequest<SavedTicket[]>(
        user,
        endpoint + '/tickets',
        { signal: controller.signal }
      ),
    ])
      .then(async ([result, saved]) => {

        const latest =
          await eventAdminRequest<{ event: AdminEventSummary }>(
            user,
            endpoint,
            {
              signal: controller.signal,
            }
          );

        if (!active) return;

        if (
          latest?.event?.eventId !== eventId ||
          latest.event.updatedAt !==
            result?.event?.updatedAt
        ) {
          throw new Error(
            'Event configuration changed while loading. Reload the page to review the latest version.'
          );
        }

        if (!active) return;

        if (
          result?.event?.eventId !== eventId ||
          !Array.isArray(saved)
        ) {
          throw new Error(
            'Invalid event response.'
          );
        }

        setEvent(result.event);

        setTickets(
          saved.length > 0
            ? saved.map(restoreTicket)
            : result.event.status === 'draft'
              ? [newTicket(result.event)]
              : []
        );
      })
      .catch(error => {
        if (
          !active ||
          controller.signal.aborted
        ) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : 'Unable to load tickets.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [user, endpoint, eventId]);

  function updateTicket<
    K extends keyof TicketForm
  >(
    key: string,
    field: K,
    value: TicketForm[K]
  ) {
    setTickets(current =>
      current.map(ticket =>
        ticket.key === key
          ? {
              ...ticket,
              [field]: value,
            }
          : ticket
      )
    );
  }

  function updateTicketAccess(
    key: string,
    access: TicketAccess
  ) {
    setTickets(current =>
      current.map(ticket =>
        ticket.key !== key
          ? ticket
          : {
              ...ticket,
              access,

              ...(access === 'invite_only'
                ? {
                    pricingType: 'free' as const,
                    usdPrice: '0.00',
                    bdtPrice: '0.00',
                    maxPerOrder: '1',
                  }
                : {}),
            }
      )
    );
  }

  const totals = tickets.reduce(
    (result, ticket) => {
      const quantity =
        Number(ticket.capacity);

      if (
        Number.isSafeInteger(quantity) &&
        quantity > 0
      ) {
        result[ticket.attendanceMode] +=
          quantity;
      }

      return result;
    },
    {
      online: 0,
      offline: 0,
    }
  );

  const capacityExceeded =
    event !== null &&
    (
      totals.online > event.capacity.online ||
      totals.offline > event.capacity.offline
    );

  async function saveTickets(
    submitEvent: FormEvent<HTMLFormElement>
  ) {
    submitEvent.preventDefault();

    if (
      !user ||
      !event ||
      event.status !== 'draft' ||
      savingRef.current
    ) {
      return;
    }

    savingRef.current = true;

    setSaving(true);
    setError('');

    try {
      if (
        tickets.length === 0 ||
        tickets.length > 50
      ) {
        throw new Error(
          'Configure between 1 and 50 ticket categories.'
        );
      }

      if (capacityExceeded) {
        throw new Error(
          'Ticket allocations exceed event capacity.'
        );
      }

      const registrationAccess =
        event.registrationAccess ?? 'public';

      const invitationCapacity = tickets.reduce(
        (total, ticket) =>
          total + (
            ticket.access === 'invite_only'
              ? Number(ticket.capacity)
              : 0
          ),
        0
      );

      if (
        invitationCapacity >
        (event.invitationSettings?.maxAcceptedInvitations ?? 0)
      ) {
        throw new Error(
          'Invitation ticket capacity exceeds the event invitation limit.'
        );
      }

      const payload = tickets.map(
        (ticket, index) => {
          const capacity =
            Number(ticket.capacity);

          const maxPerOrder =
            Number(ticket.maxPerOrder);

          if (
            !Number.isSafeInteger(capacity) ||
            capacity < 1 ||
            !Number.isSafeInteger(maxPerOrder) ||
            maxPerOrder < 1 ||
            maxPerOrder > capacity ||
            maxPerOrder > event.maxTicketsPerOrder
          ) {
            throw new Error(
              'Invalid capacity or order limit for ' +
              ticket.name
            );
          }

          if (
            ticket.access !== 'public' &&
            ticket.access !== 'invite_only'
          ) {
            throw new Error('Invalid ticket access.');
          }

          if (
            ticket.access === 'invite_only' &&
            (
              registrationAccess === 'public' ||
              !event.invitationSettings?.enabled ||
              !event.invitationSettings?.allowComplimentary ||
              ticket.pricingType !== 'free' ||
              maxPerOrder !== 1
            )
          ) {
            throw new Error(
              'Invitation tickets must be complimentary with a maximum of one per order.'
            );
          }

          if (
            ticket.access === 'public' &&
            registrationAccess === 'invite_only'
          ) {
            throw new Error(
              'Public tickets are not allowed for invitation-only events.'
            );
          }

          return {
            access: ticket.access,
            name: ticket.name.trim(),
            description: ticket.description,
            benefits: ticket.benefits
              .split('\n')
              .map(value => value.trim())
              .filter(Boolean),

            attendanceMode:
              ticket.attendanceMode,

            pricingType:
              ticket.pricingType,

            price: {
              usdAmountMinor:
                ticket.pricingType === 'free'
                  ? 0
                  : priceToMinor(
                      ticket.usdPrice,
                      'USD'
                    ),

              bdtAmountMinor:
                ticket.pricingType === 'free'
                  ? 0
                  : priceToMinor(
                      ticket.bdtPrice,
                      'BDT'
                    ),
            },

            capacity,
            maxPerOrder,
            status: ticket.status,
            sortOrder: index,

            salesStartAtMs:
              ticket.salesStartAtMs,

            salesEndAtMs:
              ticket.salesEndAtMs,
          };
        }
      );

      await eventAdminRequest<SavedTicket[]>(
        user,
        endpoint + '/tickets',
        {
          method: 'PUT',
          body: payload,
          expectedUpdatedAtMs:
            event.updatedAt,
        }
      );

      router.push(
        '/control/events/' +
        encodeURIComponent(eventId)
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to save tickets.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-16 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        Loading ticket configuration...
      </div>
    );
  }

  if (loadError || !event) {
    return (
      <div className="space-y-4">
        <Link
          href="/control/events"
          className="text-sm font-medium text-slate-600"
        >
          Back to Events
        </Link>

        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700"
        >
          {loadError || 'Event not found.'}
        </div>
      </div>
    );
  }

  const editable =
    event.status === 'draft';

  const attendanceModes: AttendanceMode[] =
    event.mode === 'hybrid'
      ? ['online', 'offline']
      : [event.mode];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={
          '/control/events/' +
          encodeURIComponent(eventId)
        }
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Event
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Configure Tickets
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          {event.title}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl border bg-white p-3 text-center text-xs font-semibold sm:text-sm">
        <div className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
          1. Event Details
        </div>

        <div className="rounded-lg bg-slate-900 p-3 text-white">
          2. Configure Tickets
        </div>

        <div className="rounded-lg bg-slate-100 p-3 text-slate-500">
          3. Review & Publish
        </div>
      </div>

      {!editable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This event is {eventLabel(event.status)}.
          Ticket configuration is read-only.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {attendanceModes.map(mode => {
          const total = totals[mode];

          const capacity =
            event.capacity[mode];

          const percentage =
            capacity > 0
              ? Math.min(
                  100,
                  total / capacity * 100
                )
              : 0;

          return (
            <div
              key={mode}
              className="rounded-2xl border bg-white p-5"
            >
              <div className="flex items-center justify-between text-sm text-slate-500">
                {eventLabel(mode)} Capacity

                <Users className="h-4 w-4" />
              </div>

              <div className="mt-3 text-2xl font-bold text-slate-900">
                {total} / {capacity}
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={
                    'h-full rounded-full ' +
                    (total > capacity
                      ? 'bg-red-500'
                      : 'bg-blue-600')
                  }
                  style={{
                    width: percentage + '%',
                  }}
                />
              </div>

              <p className="mt-2 text-xs text-slate-500">
                {Math.max(0, capacity - total)}
                {' '}unallocated seats
              </p>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={saveTickets}
        className="space-y-5"
      >
        <fieldset
          disabled={!editable || saving}
          className="min-w-0 space-y-5"
        >
          {tickets.map((ticket, index) => (
            <section
              key={ticket.key}
              className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <Ticket className="h-5 w-5" />
                  Ticket Category {index + 1}
                </h2>

                {editable && (
                  <button
                    type="button"
                    aria-label="Remove ticket category"
                    onClick={() =>
                      setTickets(current =>
                        current.filter(
                          item => item.key !== ticket.key
                        )
                      )
                    }
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Ticket Name
                </span>

                <input
                  className={fieldClass}
                  value={ticket.name}
                  required
                  maxLength={120}
                  placeholder="General Admission"
                  onChange={e =>
                    updateTicket(
                      ticket.key,
                      'name',
                      e.target.value
                    )
                  }
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Description
                </span>

                <textarea
                  className={fieldClass}
                  value={ticket.description}
                  maxLength={3000}
                  rows={3}
                  onChange={e =>
                    updateTicket(
                      ticket.key,
                      'description',
                      e.target.value
                    )
                  }
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">
                    Attendance Mode
                  </span>

                  <select
                    className={fieldClass}
                    value={ticket.attendanceMode}
                    onChange={e =>
                      updateTicket(
                        ticket.key,
                        'attendanceMode',
                        e.target.value as AttendanceMode
                      )
                    }
                  >
                    {attendanceModes.map(mode => (
                      <option key={mode} value={mode}>
                        {eventLabel(mode)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-sm font-medium">
                    Pricing Type
                  </span>

                  <select
                    className={fieldClass}
                    value={ticket.pricingType}
                    disabled={ticket.access === 'invite_only'}
                    onChange={e =>
                      updateTicket(
                        ticket.key,
                        'pricingType',
                        e.target.value as PricingType
                      )
                    }
                  >
                    {event.registrationType !== 'paid' && (
                      <option value="free">Free</option>
                    )}

                    {event.registrationType !== 'free' &&
                      ticket.access !== 'invite_only' && (
                        <option value="paid">Paid</option>
                      )}
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Ticket Access
                </span>

                <select
                  className={fieldClass}
                  value={ticket.access}
                  onChange={e =>
                    updateTicketAccess(
                      ticket.key,
                      e.target.value as TicketAccess
                    )
                  }
                >
                  <option
                    value="public"
                    disabled={
                      event.registrationAccess === 'invite_only'
                    }
                  >
                    Public Ticket
                  </option>

                  <option
                    value="invite_only"
                    disabled={
                      (event.registrationAccess ?? 'public') === 'public' ||
                      !event.invitationSettings?.enabled ||
                      !event.invitationSettings?.allowComplimentary
                    }
                  >
                    Invitation Only
                  </option>
                </select>
              </label>

              {ticket.access === 'invite_only' && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <p className="font-semibold">
                    Complimentary Invitation Ticket
                  </p>

                  <p className="mt-1">
                    Hidden from public registration.
                    Available only to authorized invited guests.
                    No payment is required.
                  </p>
                </div>
              )}

              {ticket.pricingType === 'paid' && (

                <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium">
                      USD Price ($)
                    </span>

                    <input
                      className={fieldClass}
                      type="text"
                      inputMode="decimal"
                      required
                      placeholder="10.00"
                      value={ticket.usdPrice}
                      onChange={e =>
                        updateTicket(
                          ticket.key,
                          'usdPrice',
                          e.target.value
                        )
                      }
                    />

                    <span className="text-xs text-slate-500">
                      TabEdge payment
                    </span>
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium">
                      BDT Price (৳)
                    </span>

                    <input
                      className={fieldClass}
                      type="text"
                      inputMode="decimal"
                      required
                      placeholder="1200.00"
                      value={ticket.bdtPrice}
                      onChange={e =>
                        updateTicket(
                          ticket.key,
                          'bdtPrice',
                          e.target.value
                        )
                      }
                    />

                    <span className="text-xs text-slate-500">
                      bKash payment
                    </span>
                  </label>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">
                    Ticket Capacity
                  </span>

                  <input
                    className={fieldClass}
                    type="number"
                    min={1}
                    max={
                      event.capacity[
                        ticket.attendanceMode
                      ]
                    }
                    required
                    value={ticket.capacity}
                    onChange={e =>
                      updateTicket(
                        ticket.key,
                        'capacity',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm font-medium">
                    Maximum Per Order
                  </span>

                  <input
                    className={fieldClass}
                    type="number"
                    min={1}
                    max={
                      ticket.access === 'invite_only'
                        ? 1
                        : event.maxTicketsPerOrder
                    }
                    disabled={ticket.access === 'invite_only'}
                    required
                    value={ticket.maxPerOrder}
                    onChange={e =>
                      updateTicket(
                        ticket.key,
                        'maxPerOrder',
                        e.target.value
                      )
                    }
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Ticket Benefits
                </span>

                <textarea
                  className={fieldClass}
                  rows={3}
                  placeholder={'Event access\nNetworking session\nCertificate'}
                  value={ticket.benefits}
                  onChange={e =>
                    updateTicket(
                      ticket.key,
                      'benefits',
                      e.target.value
                    )
                  }
                />

                <span className="text-xs text-slate-500">
                  Enter one benefit per line.
                </span>
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Ticket Status
                </span>

                <select
                  className={fieldClass}
                  value={ticket.status}
                  onChange={e =>
                    updateTicket(
                      ticket.key,
                      'status',
                      e.target.value as 'active' | 'draft'
                    )
                  }
                >
                  <option value="active">
                    Active on publication
                  </option>

                  <option value="draft">
                    Draft / Hidden
                  </option>
                </select>
              </label>
            </section>
          ))}

          {editable && (
            <button
              type="button"
              disabled={tickets.length >= 50}
              onClick={() =>
                setTickets(current => [
                  ...current,
                  newTicket(event),
                ])
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Plus className="h-5 w-5" />
              Add Ticket Category
            </button>
          )}
        </fieldset>

        {(error || capacityExceeded) && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <AlertCircle className="h-5 w-5 shrink-0" />

            {error ||
              'Ticket allocations exceed event capacity.'}
          </div>
        )}

        {editable && (
          <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Saving tickets does not publish the event or accept payments.
            </p>

            <button
              type="submit"
              disabled={
                saving ||
                capacityExceeded ||
                tickets.length === 0
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}

              {saving
                ? 'Saving...'
                : 'Save Tickets & Continue'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
