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
  CalendarDays,
  Globe,
  Users,
  Ticket,
  Pencil,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Lock,
  Info,
} from 'lucide-react';

import { useUser } from '@/firebase';

import {
  EventForm,
  defaultEventFormValues,
  type EventFormValues,
  type buildEventFormPayload,
} from '@/components/admin/events/event-form';

import {
  eventAdminRequest,
  eventLabel,
  formatEventDate,
  type AdminEventSummary,
} from '@/lib/event-admin-client';

interface EventDetails extends AdminEventSummary {
  description: string;
  registrationOpensAt: number | null;
  registrationClosesAt: number | null;
  maxTicketsPerOrder: number;
  allowGuestRegistration: boolean;
  terms: string;
  refundPolicy: string;

  venue: {
    name: string;
    address: string;
    city: string;
    countryCode: string;
    mapUrl: string | null;
  } | null;
}

interface PrivateDetails {
  meetingProvider: string | null;
  meetingUrl: string | null;
  meetingId: string | null;
  meetingPasscode: string | null;
  privateParticipantInstructions: string;
}

interface ManagedEvent {
  event: EventDetails;
  privateDetails: PrivateDetails;
}

interface ManagedTicket {
  ticketType: {
    ticketTypeId: string;
    name: string;
    description: string;
    attendanceMode: 'online' | 'offline';
    pricingType: 'free' | 'paid';
    status: string;
    price: {
      usdAmountMinor: number;
      bdtAmountMinor: number;
    };
    maxPerOrder: number;
  };

  inventory: {
    capacity: number;
    reservedQuantity: number;
    issuedQuantity: number;
  };
}

function localDate(
  value: number | null,
  timezone: string
): string {
  if (value === null) {
    return '';
  }

  const formatter = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }
  );

  const parts = Object.fromEntries(
    formatter.formatToParts(
      new Date(value)
    ).map(part => [
      part.type,
      part.value,
    ])
  );

  return (
    parts.year + '-' +
    parts.month + '-' +
    parts.day + 'T' +
    parts.hour + ':' +
    parts.minute
  );
}

function restoreEventForm(
  result: ManagedEvent
): EventFormValues {
  const { event, privateDetails } = result;

  return {
    ...defaultEventFormValues,

    title: event.title,
    slug: event.slug,
    category: event.category,
    shortDescription: event.shortDescription,
    description: event.description,
    bannerUrl: event.bannerUrl ?? '',
    mode: event.mode,
    visibility: 'public',
    registrationType: event.registrationType,
    timezone: event.timezone,

    startsAt: localDate(
      event.startsAt,
      event.timezone
    ),

    endsAt: localDate(
      event.endsAt,
      event.timezone
    ),

    registrationOpensAt: localDate(
      event.registrationOpensAt,
      event.timezone
    ),

    registrationClosesAt: localDate(
      event.registrationClosesAt,
      event.timezone
    ),

    onlineCapacity:
      String(event.capacity.online),

    offlineCapacity:
      String(event.capacity.offline),

    maxTicketsPerOrder:
      String(event.maxTicketsPerOrder),

    allowGuestRegistration:
      event.allowGuestRegistration,

    venueName: event.venue?.name ?? '',
    venueAddress: event.venue?.address ?? '',
    venueCity: event.venue?.city ?? '',
    countryCode: event.venue?.countryCode ?? 'BD',
    mapUrl: event.venue?.mapUrl ?? '',

    meetingProvider:
      privateDetails.meetingProvider ?? '',

    meetingUrl:
      privateDetails.meetingUrl ?? '',

    meetingId:
      privateDetails.meetingId ?? '',

    meetingPasscode:
      privateDetails.meetingPasscode ?? '',

    privateParticipantInstructions:
      privateDetails.privateParticipantInstructions,

    terms: event.terms,
    refundPolicy: event.refundPolicy,
  };
}

function formatMoney(
  amountMinor: number,
  currency: 'USD' | 'BDT'
): string {
  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency,
    }
  ).format(amountMinor / 100);
}

export default function AdminEventDetailsPage() {
  const { user } = useUser();

  const params = useParams<{
    eventId: string;
  }>();

  const eventId = params.eventId;

  const pagePath =
    '/control/events/' +
    encodeURIComponent(eventId);

  const endpoint =
    '/api/control/events/' +
    encodeURIComponent(eventId);

  const [managed, setManaged] =
    useState<ManagedEvent | null>(null);

  const [tickets, setTickets] =
    useState<ManagedTicket[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState('');

  const [actionError, setActionError] =
    useState('');

  const [notice, setNotice] =
    useState('');

  const [editing, setEditing] =
    useState(false);

  const [publishing, setPublishing] =
    useState(false);

  const [confirmPublish, setConfirmPublish] =
    useState(false);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const publishLock = useRef(false);

  const registrationLock = useRef(false);

  const [
    registrationTarget,
    setRegistrationTarget,
  ] = useState<
    'open' | 'paused' | 'closed' | null
  >(null);

  const [
    registrationBusy,
    setRegistrationBusy,
  ] = useState(false);

  const [
    registrationError,
    setRegistrationError,
  ] = useState('');

  useEffect(() => {
    setManaged(null);
    setTickets([]);
    setLoading(true);
    setLoadError('');
    setActionError('');
    setEditing(false);
    setConfirmPublish(false);
    setRegistrationTarget(null);
    setRegistrationError('');

    if (!user) return;

    const controller = new AbortController();

    let active = true;

    Promise.all([
      eventAdminRequest<ManagedEvent>(
        user,
        endpoint,
        {
          signal: controller.signal,
        }
      ),

      eventAdminRequest<ManagedTicket[]>(
        user,
        endpoint + '/tickets',
        {
          signal: controller.signal,
        }
      ),
    ])
      .then(async ([result, savedTickets]) => {

        const latest =
          await eventAdminRequest<ManagedEvent>(
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
          !result.privateDetails ||
          !Array.isArray(savedTickets)
        ) {
          throw new Error(
            'Invalid event details response.'
          );
        }

        setManaged(result);
        setTickets(savedTickets);
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
            : 'Unable to load event.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    user,
    endpoint,
    eventId,
    refreshKey,
  ]);

  async function saveEvent(
    payload: ReturnType<typeof buildEventFormPayload>
  ) {
    if (
      !user ||
      !managed ||
      managed.event.status !== 'draft'
    ) {
      throw new Error(
        'This event cannot be edited.'
      );
    }

    const result =
      await eventAdminRequest<ManagedEvent>(
        user,
        endpoint,
        {
          method: 'PUT',
          body: payload,
          expectedUpdatedAtMs:
            managed.event.updatedAt,
        }
      );

    if (
      result?.event?.eventId !== eventId ||
      !result.privateDetails
    ) {
      throw new Error(
        'Invalid event update response.'
      );
    }

    setManaged(result);
    setEditing(false);
    setNotice('Event details saved.');
    setRefreshKey(key => key + 1);
  }

  async function updateRegistrationStatus() {
    if (
      !user ||
      !managed ||
      !registrationTarget ||
      registrationLock.current ||
      (
        managed.event.status !== 'published' &&
        managed.event.status !== 'ongoing'
      )
    ) {
      return;
    }

    const target = registrationTarget;

    registrationLock.current = true;

    setRegistrationBusy(true);
    setRegistrationError('');
    setActionError('');
    setNotice('');

    try {
      const result =
        await eventAdminRequest<EventDetails>(
          user,
          endpoint + '/registration',
          {
            method: 'POST',

            body: {
              registrationStatus: target,
            },

            expectedUpdatedAtMs:
              managed.event.updatedAt,
          }
        );

      if (
        result?.eventId !== eventId ||
        result.registrationStatus !== target
      ) {
        throw new Error(
          'Invalid registration update response.'
        );
      }

      setManaged(current =>
        current?.event.eventId === eventId
          ? {
              ...current,
              event: result,
            }
          : current
      );

      setRegistrationTarget(null);

      setNotice(
        'Registration status updated successfully.'
      );

      setRefreshKey(key => key + 1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to update registration.';

      if (
        message.includes(
          'REGISTRATION_CONTROL_DISABLED'
        )
      ) {
        setRegistrationError(
          'Registration cannot be opened until the registration and payment system is enabled.'
        );
      } else if (
        message.includes(
          'REGISTRATION_WINDOW_UNAVAILABLE'
        )
      ) {
        setRegistrationError(
          'The registration window has ended or is invalid.'
        );
      } else {
        setRegistrationError(message);
      }
    } finally {
      registrationLock.current = false;

      setRegistrationBusy(false);
    }
  }

  async function publishEvent() {
    if (
      !user ||
      !managed ||
      managed.event.status !== 'draft' ||
      !confirmPublish ||
      publishLock.current
    ) {
      return;
    }

    publishLock.current = true;

    setPublishing(true);
    setActionError('');
    setNotice('');

    try {
      const result =
        await eventAdminRequest<EventDetails>(
          user,
          endpoint + '/publish',
          {
            method: 'POST',
            expectedUpdatedAtMs:
              managed.event.updatedAt,
          }
        );

      if (
        result?.eventId !== eventId ||
        result.status !== 'published'
      ) {
        throw new Error(
          'Invalid event publication response.'
        );
      }

      setManaged(current =>
        current
          ? {
              ...current,
              event: result,
            }
          : null
      );

      setConfirmPublish(false);

      setNotice(
        'Event published successfully. Registration is not yet open.'
      );

      setRefreshKey(key => key + 1);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Unable to publish event.'
      );
    } finally {
      publishLock.current = false;
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-16 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        Loading event...
      </div>
    );
  }

  if (loadError || !managed) {
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

        <button
          type="button"
          onClick={() =>
            setRefreshKey(key => key + 1)
          }
          className="rounded-lg border bg-white px-4 py-2 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const event = managed.event;

  const editable =
    event.status === 'draft';

  const activeTickets = tickets.filter(
    item => item.ticketType.status === 'active'
  );

  const requiredModes =
    event.mode === 'hybrid'
      ? ['online', 'offline']
      : [event.mode];

  const issues: string[] = [];

  if (event.visibility !== 'public') {
    issues.push(
      'Only public events can be published.'
    );
  }

  if (event.endsAt <= Date.now()) {
    issues.push(
      'The event end time has passed.'
    );
  }

  for (const mode of requiredModes) {
    if (
      !activeTickets.some(
        item =>
          item.ticketType.attendanceMode === mode
      )
    ) {
      issues.push(
        'Configure an active ' +
        mode +
        ' ticket category.'
      );
    }
  }

  if (event.registrationType === 'mixed') {
    if (
      !activeTickets.some(
        item => item.ticketType.pricingType === 'free'
      ) ||
      !activeTickets.some(
        item => item.ticketType.pricingType === 'paid'
      )
    ) {
      issues.push(
        'Mixed events require active free and paid tickets.'
      );
    }
  }

  const canPublish =
    editable &&
    activeTickets.length > 0 &&
    issues.length === 0;

  const stats = [
    {
      label: 'Event Mode',
      value: eventLabel(event.mode),
      icon: Globe,
    },
    {
      label: 'Registration',
      value: eventLabel(event.registrationType),
      icon: Ticket,
    },
    {
      label: 'Total Capacity',
      value:
        event.capacity.online +
        event.capacity.offline,
      icon: Users,
    },
    {
      label: 'Ticket Categories',
      value: tickets.length,
      icon: Ticket,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/control/events"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Events
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {event.title}
            </h1>

            <span className={
              'rounded-full px-3 py-1 text-xs font-semibold ' +
              (editable
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-700')
            }>
              {eventLabel(event.status)}
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-500">
            {event.shortDescription}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <button
              type="button"
              disabled={publishing}
              onClick={() => {
                setEditing(value => !value);
                setConfirmPublish(false);
                setActionError('');
              }}
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium"
            >
              <Pencil className="h-4 w-4" />
              {editing ? 'Cancel Edit' : 'Edit Event'}
            </button>
          )}

          {!editing && (
            <Link
              href={pagePath + '/tickets'}
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium"
            >
              <Ticket className="h-4 w-4" />
              {editable
                ? 'Manage Tickets'
                : 'View Tickets'}
            </Link>
          )}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {notice}
        </div>
      )}

      {editing && editable ? (
        <EventForm
          key={event.eventId + ':' + event.updatedAt}
          editing
          initialValues={restoreEventForm(managed)}
          onSubmit={saveEvent}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map(stat => (
              <div
                key={stat.label}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 text-sm text-slate-500">
                  {stat.label}
                  <stat.icon className="h-4 w-4" />
                </div>

                <p className="mt-3 text-xl font-bold text-slate-900">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <section className="space-y-4 rounded-2xl border bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold">
              Event Overview
            </h2>

            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="flex items-center gap-2 text-slate-500">
                  <CalendarDays className="h-4 w-4" />
                  Starts
                </p>

                <p className="mt-1 font-medium">
                  {formatEventDate(
                    event.startsAt,
                    event.timezone
                  )}
                </p>
              </div>

              <div>
                <p className="text-slate-500">
                  Ends
                </p>

                <p className="mt-1 font-medium">
                  {formatEventDate(
                    event.endsAt,
                    event.timezone
                  )}
                </p>
              </div>

              <div>
                <p className="text-slate-500">
                  Timezone
                </p>

                <p className="mt-1 font-medium">
                  {event.timezone}
                </p>
              </div>

              <div>
                <p className="text-slate-500">
                  Registration Status
                </p>

                <p className="mt-1 font-medium">
                  {eventLabel(event.registrationStatus)}
                </p>
              </div>
            </div>

            {event.venue && (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4" />
                  {event.venue.name}
                </p>

                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                  {event.venue.address}
                  {', '}
                  {event.venue.city}
                  {', '}
                  {event.venue.countryCode}
                </p>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
                {event.description}
              </p>
            </div>

            {event.mode !== 'offline' && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <Lock className="h-4 w-4 shrink-0" />

                {managed.privateDetails.meetingUrl
                  ? 'Private meeting URL configured.'
                  : 'Private meeting URL not configured.'}
              </div>
            )}
          </section>

          {(
            event.status === 'published' ||
            event.status === 'ongoing'
          ) && (
            <section className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6">
              <div>
                <h2 className="text-lg font-semibold">
                  Registration Management
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Manage registration without changing
                  the published event configuration.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
                <span className="text-sm font-medium text-slate-600">
                  Current registration status
                </span>

                <span className={
                  'rounded-full px-3 py-1 text-xs font-semibold ' +
                  (
                    event.registrationStatus === 'open'
                      ? 'bg-green-100 text-green-800'
                      : event.registrationStatus === 'paused'
                        ? 'bg-amber-100 text-amber-800'
                        : event.registrationStatus === 'closed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-200 text-slate-700'
                  )
                }>
                  {eventLabel(event.registrationStatus)}
                </span>
              </div>

              {event.registrationStatus === 'closed' ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Registration has been permanently
                  closed for this event. Existing orders
                  and confirmed participants remain
                  unchanged.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    {(
                      event.registrationStatus === 'not_open' ||
                      event.registrationStatus === 'paused'
                    ) && (
                      <button
                        type="button"
                        disabled={
                          registrationBusy ||
                          loading
                        }
                        onClick={() => {
                          setRegistrationTarget('open');
                          setRegistrationError('');
                        }}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {event.registrationStatus === 'paused'
                          ? 'Resume registration'
                          : 'Open registration'}
                      </button>
                    )}

                    {event.registrationStatus === 'open' && (
                      <button
                        type="button"
                        disabled={
                          registrationBusy ||
                          loading
                        }
                        onClick={() => {
                          setRegistrationTarget('paused');
                          setRegistrationError('');
                        }}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 disabled:opacity-50"
                      >
                        Pause registration
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={
                        registrationBusy ||
                        loading
                      }
                      onClick={() => {
                        setRegistrationTarget('closed');
                        setRegistrationError('');
                      }}
                      className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Close registration
                    </button>
                  </div>

                  {registrationTarget && (
                    <div
                      className={
                        'space-y-4 rounded-xl border p-4 ' +
                        (
                          registrationTarget === 'closed'
                            ? 'border-red-200 bg-red-50'
                            : 'border-blue-200 bg-blue-50'
                        )
                      }
                    >
                      <h3 className="text-sm font-semibold">
                        Confirm registration update
                      </h3>

                      <p className="text-sm text-slate-700">
                        {registrationTarget === 'closed'
                          ? 'Closing registration is permanent. Use Pause if you may need to reopen registration later.'
                          : registrationTarget === 'paused'
                            ? 'New registrations will be paused until you resume registration.'
                            : 'Registration will become available subject to the configured schedule, ticket availability and system readiness.'}
                      </p>

                      <p className="text-xs text-slate-600">
                        Existing orders, reservations,
                        payments and confirmed registrations
                        will not be cancelled by this action.
                      </p>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={registrationBusy}
                          onClick={() =>
                            void updateRegistrationStatus()
                          }
                          className={
                            'rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ' +
                            (
                              registrationTarget === 'closed'
                                ? 'bg-red-600'
                                : 'bg-blue-600'
                            )
                          }
                        >
                          {registrationBusy
                            ? 'Updating...'
                            : registrationTarget === 'closed'
                              ? 'Confirm permanent closure'
                              : registrationTarget === 'paused'
                                ? 'Confirm pause'
                                : 'Confirm opening'}
                        </button>

                        <button
                          type="button"
                          disabled={registrationBusy}
                          onClick={() => {
                            setRegistrationTarget(null);
                            setRegistrationError('');
                          }}
                          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {registrationError && (
                    <div
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                    >
                      {registrationError}
                    </div>
                  )}
                </>
              )}

              <p className="text-xs text-slate-500">
                Registration opening is subject to
                platform readiness and server-side
                authorization.
              </p>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex items-center justify-between border-b p-5">
              <h2 className="text-lg font-semibold">
                Ticket Categories
              </h2>

              <Link
                href={pagePath + '/tickets'}
                className="text-sm font-medium text-blue-600"
              >
                {editable ? 'Configure' : 'View All'}
              </Link>
            </div>

            {tickets.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No ticket categories configured.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      {[
                        'Ticket',
                        'Mode',
                        'USD',
                        'BDT',
                        'Capacity',
                        'Status',
                      ].map(label => (
                        <th
                          key={label}
                          className="whitespace-nowrap px-4 py-3 font-medium"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {tickets.map(item => {
                      const ticket = item.ticketType;

                      return (
                        <tr key={ticket.ticketTypeId}>
                          <td className="px-4 py-4 font-medium">
                            {ticket.name}
                          </td>

                          <td className="px-4 py-4">
                            {eventLabel(ticket.attendanceMode)}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4">
                            {formatMoney(
                              ticket.price.usdAmountMinor,
                              'USD'
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4">
                            {formatMoney(
                              ticket.price.bdtAmountMinor,
                              'BDT'
                            )}
                          </td>

                          <td className="px-4 py-4">
                            {item.inventory.capacity}
                          </td>

                          <td className="px-4 py-4">
                            {eventLabel(ticket.status)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {editable && (
            <section className="space-y-4 rounded-2xl border bg-white p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Globe className="h-5 w-5" />
                Review & Publish
              </h2>

              {issues.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-semibold">
                    Complete the following before publishing:
                  </p>

                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {issues.map(issue => (
                      <li key={issue}>
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  Basic publication checklist passed.
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
                <Info className="h-5 w-5 shrink-0" />

                Publishing creates the public event record.
                Registration and payments remain disabled
                until the registration engine is ready.
                Published event details and tickets
                cannot currently be edited.
              </div>

              {actionError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-700"
                >
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  {actionError}
                </div>
              )}

              {canPublish && (
                <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmPublish}
                    disabled={publishing}
                    onChange={e =>
                      setConfirmPublish(
                        e.target.checked
                      )
                    }
                  />

                  I have reviewed the event details,
                  ticket prices, capacity and policies.
                </label>
              )}

              <button
                type="button"
                disabled={
                  !canPublish ||
                  !confirmPublish ||
                  publishing
                }
                onClick={publishEvent}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
              >
                {publishing
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Globe className="h-4 w-4" />}

                {publishing
                  ? 'Publishing...'
                  : 'Publish Event'}
              </button>
            </section>
          )}

          {event.status === 'published' && (
            <section className="space-y-3 rounded-2xl border bg-white p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Event Published
              </h2>

              <p className="text-sm text-slate-500">
                Public event URL (available after the public marketplace is implemented):
              </p>

              <div className="flex items-center gap-2 break-all rounded-lg bg-slate-50 p-3 text-sm font-medium">
                <ExternalLink className="h-4 w-4 shrink-0" />
                /events/{event.slug}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
