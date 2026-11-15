'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import {
  ArrowRight,
  CalendarDays,
  Clock,
  Globe,
  MapPin,
  Search,
  Ticket,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import type {
  PublicEventSummary,
} from '@/services/public-event.service';

const categories = [
  ['all', 'All categories'],
  ['startup_pitch', 'Startup Pitch'],
  ['networking', 'Networking'],
  ['workshop', 'Workshop'],
  ['webinar', 'Webinar'],
  ['demo_day', 'Demo Day'],
  ['conference', 'Conference'],
  ['summit', 'Summit'],
  ['competition', 'Competition'],
  ['mentorship', 'Mentorship'],
  ['other', 'Other'],
];

function label(value: string): string {
  return value
    .split('_')
    .map(
      word =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(' ');
}

function formatDate(
  value: number,
  timezone: string
): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

function EventCard({
  event,
}: {
  event: PublicEventSummary;
}) {
  const eventUrl =
    '/events/' + encodeURIComponent(event.slug);

  const registrationLabel =
    event.registrationStatus === 'closed'
      ? 'Registration closed'
      : event.registrationStatus === 'paused'
        ? 'Registration paused'
        : event.registrationAccess === 'invite_only'
          ? 'Invitation Only'
          : event.registrationStatus === 'open'
            ? 'View Registration Details'
            : 'Registration coming soon';

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-lg">
      <Link
        href={eventUrl}
        className="relative block aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-950 via-slate-800 to-blue-900"
        aria-label={'View ' + event.title}
      >
        {event.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.bannerUrl}
            alt={event.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CalendarDays className="h-16 w-16 text-white/40" />
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge className="bg-white text-slate-900 hover:bg-white">
            {label(event.category)}
          </Badge>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {label(event.mode)}
          </Badge>

          <Badge variant="outline">
            {event.registrationType === 'free'
              ? 'Free'
              : event.registrationType === 'paid'
                ? 'Paid'
                : 'Free & Paid'}
          </Badge>
        </div>

        <Link href={eventUrl}>
          <h2 className="line-clamp-2 text-xl font-bold transition-colors hover:text-primary">
            {event.title}
          </h2>
        </Link>

        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {event.shortDescription}
        </p>

        <div className="my-5 space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              {formatDate(
                event.startsAtMs,
                event.timezone
              )}
              <span className="mt-1 block text-xs">
                {event.timezone}
              </span>
            </span>
          </div>

          <div className="flex items-start gap-2">
            {event.mode === 'online' ? (
              <Globe className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
            )}

            <span>
              {event.mode === 'online'
                ? 'Online event'
                : [
                    event.venue?.city,
                    event.venue?.countryCode,
                  ]
                    .filter(Boolean)
                    .join(', ')}
              {event.mode === 'hybrid'
                ? ' + Online'
                : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-primary" />
            <span>{event.organizerName}</span>
          </div>
        </div>

        <div className="mt-auto border-t pt-4">
          <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Clock className="h-4 w-4" />
            {registrationLabel}
          </div>

          <Button asChild className="w-full">
            <Link href={eventUrl}>
              View Event
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function EventDirectory({
  events,
}: {
  events: PublicEventSummary[];
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [mode, setMode] = useState('all');
  const [pricing, setPricing] = useState('all');

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return events.filter(event => {
      const searchable = [
        event.title,
        event.shortDescription,
        event.organizerName,
        event.venue?.city ?? '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !keyword || searchable.includes(keyword);

      const matchesCategory =
        category === 'all' ||
        event.category === category;

      const matchesMode =
        mode === 'all' ||
        event.mode === mode;

      const matchesPricing =
        pricing === 'all' ||
        event.registrationType === pricing ||
        (
          event.registrationType === 'mixed' &&
          (pricing === 'free' || pricing === 'paid')
        );

      return (
        matchesSearch &&
        matchesCategory &&
        matchesMode &&
        matchesPricing
      );
    });
  }, [events, search, category, mode, pricing]);

  const selectClass =
    'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

  function resetFilters() {
    setSearch('');
    setCategory('all');
    setMode('all');
    setPricing('all');
  }

  return (
    <section className="container mx-auto px-4 py-12 md:py-16">
      <div className="mb-8 rounded-2xl border bg-card p-4 shadow-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

            <Input
              aria-label="Search events"
              placeholder="Search events..."
              value={search}
              maxLength={200}
              onChange={event =>
                setSearch(event.target.value)
              }
              className="pl-9"
            />
          </div>

          <select
            aria-label="Event category"
            className={selectClass}
            value={category}
            onChange={event =>
              setCategory(event.target.value)
            }
          >
            {categories.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>

          <select
            aria-label="Attendance mode"
            className={selectClass}
            value={mode}
            onChange={event =>
              setMode(event.target.value)
            }
          >
            <option value="all">All formats</option>
            <option value="online">Online</option>
            <option value="offline">In-person</option>
            <option value="hybrid">Hybrid</option>
          </select>

          <select
            aria-label="Ticket pricing"
            className={selectClass}
            value={pricing}
            onChange={event =>
              setPricing(event.target.value)
            }
          >
            <option value="all">All ticket types</option>
            <option value="free">Free events</option>
            <option value="paid">Paid events</option>
          </select>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold md:text-3xl">
            Upcoming Events
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length}{' '}
            {filtered.length === 1 ? 'event' : 'events'} found
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
        >
          Reset filters
        </Button>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(event => (
            <EventCard
              key={event.eventId}
              event={event}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed px-6 py-16 text-center">
          <Ticket className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />

          <h3 className="text-xl font-bold">
            {events.length === 0
              ? 'New events are coming soon'
              : 'No matching events'}
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {events.length === 0
              ? 'Check back for upcoming startup events, workshops and networking opportunities.'
              : 'Try another search or change your event filters.'}
          </p>

          {events.length > 0 && (
            <Button
              variant="outline"
              className="mt-5"
              onClick={resetFilters}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
