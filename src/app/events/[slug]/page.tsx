import {
  isEventRegistrationEnabled,
} from '@/lib/event-registration-access';

import type { Metadata } from 'next';

import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  Globe,
  MapPin,
  Ticket,
  Users,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

import {
  PublicHeader,
} from '@/components/public/header';

import {
  PublicFooter,
} from '@/components/public/footer';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import {
  getPublicEventBySlug,
  type PublicEventDetails,
  type PublicEventTicket,
} from '@/services/public-event.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EventPageProps {
  params: Promise<{
    slug: string;
  }>;
}

const loadEvent = cache(getPublicEventBySlug);

function label(value: string): string {
  if (value === 'offline') {
    return 'In-person';
  }

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
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

function formatMoney(
  minor: number,
  currency: 'USD' | 'BDT'
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function registrationLabel(
  status: PublicEventDetails['registrationStatus']
): string {
  switch (status) {
    case 'open':
      return 'Registration open';

    case 'closed':
      return 'Registration closed';

    case 'paused':
      return 'Registration paused';

    default:
      return 'Registration coming soon';
  }
}

function ticketAvailabilityLabel(
  availability: PublicEventTicket['availability']
): string {
  switch (availability) {
    case 'sold_out':
      return 'Sold out';

    case 'closed':
      return 'Ticket sales closed';

    case 'available':
      return 'Available';

    default:
      return 'Coming soon';
  }
}

export async function generateMetadata({
  params,
}: EventPageProps): Promise<Metadata> {
  const { slug } = await params;

  const result = await loadEvent(slug);

  if (!result) {
    return {
      title: 'Event Not Found | TabStartup',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const { event } = result;

  const url =
    'https://tabstartup.com/events/' +
    encodeURIComponent(event.slug);

  return {
    title: event.title + ' | TabStartup Events',

    description: event.shortDescription,

    alternates: {
      canonical: url,
    },

    openGraph: {
      title: event.title,
      description: event.shortDescription,
      url,
      type: 'website',
      siteName: 'TabStartup',

      ...(event.bannerUrl
        ? {
            images: [
              {
                url: event.bannerUrl,
                alt: event.title,
              },
            ],
          }
        : {}),
    },

    twitter: {
      card: event.bannerUrl
        ? 'summary_large_image'
        : 'summary',

      title: event.title,
      description: event.shortDescription,

      ...(event.bannerUrl
        ? { images: [event.bannerUrl] }
        : {}),
    },
  };
}

function TicketCard({
  ticket,
  event,
}: {
  ticket: PublicEventTicket;
  event: PublicEventDetails;
}) {
  const isFree =
    ticket.pricingType === 'free';

  const registrationEnabled =
    isEventRegistrationEnabled() &&
    event.registrationStatus === 'open';

  const canRegister =
    event.registrationAccess !== 'invite_only' &&
    registrationEnabled &&
    ticket.availability === 'available';

  const availability =
    ticket.availability === 'available' &&
    !registrationEnabled
      ? 'not_open'
      : ticket.availability;

  return (
    <article className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {label(ticket.attendanceMode)}
        </Badge>

        <Badge variant="outline">
          {isFree ? 'Free' : 'Paid'}
        </Badge>
      </div>

      <h3 className="text-xl font-bold">
        {ticket.name}
      </h3>

      {ticket.description && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {ticket.description}
        </p>
      )}

      <div className="my-6">
        {isFree ? (
          <p className="text-3xl font-extrabold">
            Free
          </p>
        ) : (
          <>
            <p className="text-3xl font-extrabold">
              {formatMoney(
                ticket.price.bdtAmountMinor,
                'BDT'
              )}
            </p>

            <p className="mt-2 text-xs text-muted-foreground">
              Pay with bKash
            </p>
          </>
        )}
      </div>

      {ticket.benefits.length > 0 && (
        <ul className="mb-6 space-y-3 border-t pt-5">
          {ticket.benefits.map((benefit, index) => (
            <li
              key={index}
              className="flex items-start gap-2 text-sm"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />

              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-5 space-y-2 text-xs text-muted-foreground">
        <p>
          Maximum {ticket.maxPerOrder}{' '}
          {ticket.maxPerOrder === 1
            ? 'ticket'
            : 'tickets'}{' '}
          per order
        </p>

        {ticket.salesStartAtMs !== null && (
          <p>
            Sales start:{' '}
            {formatDate(
              ticket.salesStartAtMs,
              event.timezone
            )}
          </p>
        )}

        {ticket.salesEndAtMs !== null && (
          <p>
            Sales end:{' '}
            {formatDate(
              ticket.salesEndAtMs,
              event.timezone
            )}
          </p>
        )}
      </div>

      <div className="mt-auto">
        {canRegister ? (
          <Button
            asChild
            className="w-full"
          >
            <Link
              href={
                '/events/' +
                encodeURIComponent(event.slug) +
                '/register?ticket=' +
                encodeURIComponent(ticket.ticketTypeId)
              }
            >
              <Ticket className="mr-2 h-4 w-4" />

              {isFree
                ? 'Register for free'
                : 'Register now'}
            </Link>
          </Button>
        ) : (
          <Button
            disabled
            className="w-full"
          >
            <Ticket className="mr-2 h-4 w-4" />

            {ticketAvailabilityLabel(
              availability
            )}
          </Button>
        )}
      </div>
    </article>
  );
}

export default async function EventDetailsPage({
  params,
}: EventPageProps) {
  const { slug } = await params;

  const result = await loadEvent(slug);

  if (!result) {
    notFound();
  }

  const { event, tickets } = result;

  const displayRegistrationStatus =
    event.registrationStatus === 'open' &&
    !isEventRegistrationEnabled()
      ? 'not_open'
      : event.registrationStatus;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-5">
          <Link
            href="/events"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Events
          </Link>
        </div>

        <section className="container mx-auto px-4">
          <div className="relative aspect-[16/7] min-h-[220px] max-h-[520px] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-800 to-blue-900">
            {event.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.bannerUrl}
                alt={event.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <CalendarDays className="h-24 w-24 text-white/30" />
              </div>
            )}
          </div>
        </section>

        <div className="container mx-auto grid gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-14">
          <div className="min-w-0 space-y-10">
            <section>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge>
                  {label(event.category)}
                </Badge>

                <Badge variant="secondary">
                  {label(event.mode)}
                </Badge>

                <Badge variant="outline">
                  {event.registrationType === 'mixed'
                    ? 'Free & Paid'
                    : label(event.registrationType)}
                </Badge>
              </div>

              {event.registrationAccess === 'invite_only' && (
                <div className="mb-4">
                  <Badge variant="secondary">
                    Invitation Only
                  </Badge>
                </div>
              )}

              <h1 className="break-words text-3xl font-extrabold tracking-tight md:text-5xl">
                {event.title}
              </h1>

              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                {event.shortDescription}
              </p>

              <div className="mt-6 flex items-center gap-3">
                {event.organizerLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.organizerLogoUrl}
                    alt={event.organizerName}
                    referrerPolicy="no-referrer"
                    className="h-11 w-11 rounded-full border object-contain"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground">
                    Organized by
                  </p>

                  <p className="font-semibold">
                    {event.organizerName}
                  </p>
                </div>
              </div>
            </section>

            <section className="border-t pt-8">
              <h2 className="mb-5 text-2xl font-bold">
                About This Event
              </h2>

              <div className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                {event.description}
              </div>
            </section>

            {event.mode !== 'online' &&
              event.venue && (
                <section className="border-t pt-8">
                  <h2 className="mb-5 text-2xl font-bold">
                    Event Venue
                  </h2>

                  <div className="rounded-2xl border bg-card p-6">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-1 h-6 w-6 shrink-0 text-primary" />

                      <div>
                        <h3 className="font-bold">
                          {event.venue.name}
                        </h3>

                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {event.venue.address}
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {event.venue.city},{' '}
                          {event.venue.countryCode}
                        </p>

                        {event.venue.mapUrl && (
                          <a
                            href={event.venue.mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                          >
                            View on Map
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}

            {event.mode !== 'offline' && (
              <section className="rounded-2xl border bg-muted/30 p-6">
                <div className="flex items-start gap-3">
                  <Globe className="mt-1 h-6 w-6 shrink-0 text-primary" />

                  <div>
                    <h2 className="font-bold">
                      Online Participation
                    </h2>

                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Online access information will be
                      provided to eligible confirmed
                      participants when registration
                      becomes available.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section
              id="tickets"
              className="scroll-mt-24 border-t pt-8"
            >
              <h2 className="text-2xl font-bold">
                Event Tickets
              </h2>

              <p className="mb-6 mt-2 text-sm text-muted-foreground">
                {event.registrationAccess === 'invite_only'
                  ? 'Attendance is available to invited guests only.'
                  : 'Explore available ticket categories and attendance options.'}

                {event.registrationAccess === 'public_and_invitation' && (
                  <span className="mt-2 block">
                    Invited guests should register using their
                    personal invitation link.
                  </span>
                )}
              </p>

              {event.registrationAccess === 'invite_only' ? (
                <div className="rounded-2xl border bg-card p-8 text-center">
                  <Ticket className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />

                  <h3 className="text-lg font-semibold">
                    Registration by Invitation Only
                  </h3>

                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    This event requires a personal invitation.
                    If you have been invited, please use your
                    invitation link and sign in with your
                    verified invitation email.
                  </p>
                </div>
              ) : tickets.length > 0 ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  {tickets.map(ticket => (
                    <TicketCard
                      key={ticket.ticketTypeId}
                      ticket={ticket}
                      event={event}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed p-10 text-center">
                  <Ticket className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />

                  <p className="font-semibold">
                    Ticket information coming soon
                  </p>
                </div>
              )}
            </section>

            {(event.terms || event.refundPolicy) && (
              <section className="space-y-6 border-t pt-8">
                <h2 className="text-2xl font-bold">
                  Event Policies
                </h2>

                {event.terms && (
                  <div className="rounded-xl border p-5">
                    <h3 className="mb-3 font-semibold">
                      Terms & Conditions
                    </h3>

                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                      {event.terms}
                    </p>
                  </div>
                )}

                {event.refundPolicy && (
                  <div className="rounded-xl border p-5">
                    <h3 className="mb-3 font-semibold">
                      Refund Policy
                    </h3>

                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                      {event.refundPolicy}
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside>
            <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm lg:sticky lg:top-24">
              <h2 className="text-xl font-bold">
                Event Information
              </h2>

              <div className="flex items-start gap-3">
                <CalendarDays className="mt-1 h-5 w-5 shrink-0 text-primary" />

                <div>
                  <p className="text-xs text-muted-foreground">
                    Starts
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {formatDate(
                      event.startsAtMs,
                      event.timezone
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="mt-1 h-5 w-5 shrink-0 text-primary" />

                <div>
                  <p className="text-xs text-muted-foreground">
                    Ends
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {formatDate(
                      event.endsAtMs,
                      event.timezone
                    )}
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Timezone: {event.timezone}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                {event.mode === 'online' ? (
                  <Globe className="mt-1 h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" />
                )}

                <div>
                  <p className="text-xs text-muted-foreground">
                    Attendance
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {label(event.mode)}
                  </p>

                  {event.venue && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {event.venue.city},{' '}
                      {event.venue.countryCode}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3 border-t pt-5">
                <Badge variant="secondary">
                  {event.registrationAccess === 'invite_only' &&
                    displayRegistrationStatus !== 'closed' &&
                    displayRegistrationStatus !== 'paused'
                    ? 'Invitation Only'
                    : registrationLabel(displayRegistrationStatus)}
                </Badge>

                {event.registrationOpensAtMs !== null && (
                  <p className="text-xs text-muted-foreground">
                    Scheduled opening:{' '}
                    {formatDate(
                      event.registrationOpensAtMs,
                      event.timezone
                    )}
                  </p>
                )}

                {event.registrationClosesAtMs !== null && (
                  <p className="text-xs text-muted-foreground">
                    Scheduled closing:{' '}
                    {formatDate(
                      event.registrationClosesAtMs,
                      event.timezone
                    )}
                  </p>
                )}

                {event.registrationAccess === 'invite_only' ? (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <p className="text-sm font-semibold">
                      Registration by Invitation Only
                    </p>

                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Invited guests must use their personal
                      invitation link.
                    </p>
                  </div>
                ) : (
                  <>
                    <Button
                      asChild
                      className="w-full"
                    >
                      <a href="#tickets">
                        <Ticket className="mr-2 h-4 w-4" />
                        View Tickets
                      </a>
                    </Button>

                    {displayRegistrationStatus === 'open' &&
                    tickets.some(ticket =>
                      ticket.availability === 'available'
                    ) ? (
                      <Button
                        asChild
                        variant="outline"
                        className="w-full"
                      >
                        <Link
                          href={
                            '/events/' +
                            encodeURIComponent(event.slug) +
                            '/register'
                          }
                        >
                          Register Now
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        disabled
                        variant="outline"
                        className="w-full"
                      >
                        {displayRegistrationStatus === 'closed'
                          ? 'Registration Closed'
                          : displayRegistrationStatus === 'paused'
                            ? 'Registration Paused'
                            : displayRegistrationStatus === 'open'
                              ? 'No Tickets Available'
                              : 'Registration Coming Soon'}
                      </Button>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                Published on TabStartup
              </div>
            </div>
          </aside>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
