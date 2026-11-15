import Link from 'next/link';

import { notFound } from 'next/navigation';

import * as publicEvents
  from '@/services/public-event.service';

import {
  isEventRegistrationEnabled,
} from '@/lib/event-registration-access';

import {
  EventRegistrationForm,
} from '@/components/public/events/event-registration-form';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Event Registration | TabStartup',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RegisterEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    ticket?: string;
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const details =
    await publicEvents.getPublicEventBySlug(slug);

  if (!details) {
    notFound();
  }

  const { event, tickets } = details;

  const availableTickets = tickets.filter(
    ticket => ticket.availability === 'available'
  );

  const invitationOnly =
    event.registrationAccess === 'invite_only';

  const enabled =
    !invitationOnly &&
    isEventRegistrationEnabled() &&
    event.registrationStatus === 'open' &&
    availableTickets.length > 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <Link
        href={`/events/${event.slug}`}
        className="text-sm text-primary hover:underline"
      >
        &larr; Back to event
      </Link>

      <header className="mb-8 mt-6">
        <p className="text-sm font-medium text-primary">
          TabStartup Events
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Register for {event.title}
        </h1>

        <p className="mt-3 text-muted-foreground">
          {invitationOnly
            ? 'This event requires a personal invitation.'
            : 'Choose your ticket and provide participant details.'}
        </p>
      </header>

      {enabled ? (
        <EventRegistrationForm
          event={event}
          tickets={availableTickets}
          initialTicketId={
            typeof query.ticket === 'string'
              ? query.ticket
              : null
          }
        />
      ) : (
        <section className="rounded-2xl border bg-card p-8">
          <h2 className="text-xl font-semibold">
            {invitationOnly
              ? 'Registration by Invitation Only'
              : 'Registration is not available'}
          </h2>

          <p className="mt-3 text-muted-foreground">
            {invitationOnly
              ? 'Please use your personal invitation link and sign in with your verified invitation email.'
              : 'Please check the event page for registration availability and updates.'}
          </p>

          <Link
            href={`/events/${event.slug}`}
            className="mt-6 inline-block text-primary hover:underline"
          >
            View event details
          </Link>
        </section>
      )}
    </main>
  );
}
