'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import Link from 'next/link';

import {
  CalendarDays,
  CalendarPlus,
  CalendarCheck,
  FileText,
  CalendarX,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  ArrowUpRight,
  Globe,
  MapPin,
  Users,
} from 'lucide-react';

import { useUser } from '@/firebase';

import {
  eventAdminRequest,
  eventLabel,
  formatEventDate,
  type AdminEventSummary,
} from '@/lib/event-admin-client';

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  published: 'bg-emerald-100 text-emerald-700',
  ongoing: 'bg-blue-100 text-blue-700',
  completed: 'bg-indigo-100 text-indigo-700',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-slate-100 text-slate-500',
};

const filters = [
  'all',
  'draft',
  'published',
  'ongoing',
  'completed',
  'cancelled',
  'archived',
];

export default function AdminEventsPage() {
  const { user } = useUser();

  const [events, setEvents] =
    useState<AdminEventSummary[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [search, setSearch] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState('all');

  const [refreshKey, setRefreshKey] =
    useState(0);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      return;
    }

    const controller = new AbortController();

    let active = true;

    setLoading(true);
    setError('');
    setEvents([]);

    eventAdminRequest<AdminEventSummary[]>(
      user,
      '/api/control/events',
      {
        signal: controller.signal,
      }
    )
      .then(result => {
        if (!active) return;

        if (!Array.isArray(result)) {
          throw new Error('INVALID_EVENT_LIST');
        }

        setEvents(result);
      })
      .catch(error => {
        if (
          !active ||
          controller.signal.aborted
        ) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : 'Unable to load events.'
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

  const filteredEvents = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    return events.filter(event => {
      const matchesStatus =
        statusFilter === 'all' ||
        event.status === statusFilter;

      const matchesSearch =
        !query ||
        [
          event.title,
          event.slug,
          event.category,
          event.mode,
        ].some(value =>
          value.toLowerCase().includes(query)
        );

      return matchesStatus && matchesSearch;
    });
  }, [events, search, statusFilter]);

  const stats = [
    {
      label: 'Loaded Events',
      value: events.length,
      icon: CalendarDays,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Published',
      value: events.filter(
        event => event.status === 'published'
      ).length,
      icon: CalendarCheck,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Drafts',
      value: events.filter(
        event => event.status === 'draft'
      ).length,
      icon: FileText,
      color: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Cancelled',
      value: events.filter(
        event => event.status === 'cancelled'
      ).length,
      icon: CalendarX,
      color: 'bg-red-50 text-red-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Event Management
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Create, manage and publish official TabStartup events.
          </p>
        </div>

        <Link
          href="/control/events/create"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          <CalendarPlus className="h-4 w-4" />
          Create Event
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-500">
                {stat.label}
              </p>

              <div className={'rounded-xl p-2 ' + stat.color}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>

            <p className="mt-3 text-3xl font-bold text-slate-900">
              {loading || error ? '—' : stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                All Events
              </h2>

              <p className="text-xs text-slate-500">
                Official TabStartup event directory
              </p>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => setRefreshKey(key => key + 1)}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
              Refresh
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />

              <input
                type="search"
                aria-label="Search events"
                placeholder="Search events..."
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
              />
            </div>

            <select
              aria-label="Filter by event status"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm"
            >
              {filters.map(status => (
                <option key={status} value={status}>
                  {status === 'all'
                    ? 'All statuses'
                    : eventLabel(status)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 p-16 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            Loading events...
          </div>
        ) : error ? (
          <div role="alert" className="m-5 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-5 w-5" />
              Unable to load events
            </div>

            <p className="mt-2 text-sm">{error}</p>

            <button
              type="button"
              onClick={() => setRefreshKey(key => key + 1)}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
            >
              Retry
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="rounded-2xl bg-slate-100 p-5">
              <CalendarDays className="h-10 w-10 text-slate-400" />
            </div>

            <h3 className="mt-5 text-lg font-semibold text-slate-900">
              {events.length === 0
                ? 'No events yet'
                : 'No matching events'}
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              {events.length === 0
                ? 'Create your first official TabStartup event.'
                : 'Try another search or status filter.'}
            </p>

            {events.length === 0 && (
              <Link
                href="/control/events/create"
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-destructive px-5 py-2.5 text-sm font-medium text-white"
              >
                <CalendarPlus className="h-4 w-4" />
                Create Event
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEvents.map(event => (
              <div
                key={event.eventId}
                className="flex flex-col gap-4 p-5 transition-colors hover:bg-slate-50 lg:flex-row lg:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <CalendarDays className="h-7 w-7" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900">
                      {event.title}
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      {formatEventDate(
                        event.startsAt,
                        event.timezone
                      )}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        {event.mode === 'online'
                          ? <Globe className="h-3.5 w-3.5" />
                          : <MapPin className="h-3.5 w-3.5" />}
                        {eventLabel(event.mode)}
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Capacity: {event.capacity.online + event.capacity.offline}
                      </span>

                      <span>
                        {eventLabel(event.registrationType)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className={'rounded-full px-3 py-1 text-xs font-medium ' + (statusColors[event.status] ?? 'bg-slate-100 text-slate-700')}>
                    {eventLabel(event.status)}
                  </span>

                  <Link
                    href={'/control/events/' + encodeURIComponent(event.eventId)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Manage
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Showing {filteredEvents.length} of {events.length} loaded events.
            {events.length === 100
              ? ' Listing is currently limited to 100 events.'
              : ''}
          </div>
        )}
      </div>
    </div>
  );
}
