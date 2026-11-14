import type { Metadata } from 'next';

import {
  CalendarDays,
  Globe,
  Users,
} from 'lucide-react';

import {
  PublicHeader,
} from '@/components/public/header';

import {
  PublicFooter,
} from '@/components/public/footer';

import {
  EventDirectory,
} from '@/components/public/events/event-directory';

import {
  listPublicEvents,
} from '@/services/public-event.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Events | TabStartup',

  description:
    'Discover startup conferences, workshops, pitch competitions, networking events and mentorship opportunities on TabStartup.',

  alternates: {
    canonical: 'https://tabstartup.com/events',
  },

  openGraph: {
    title: 'TabStartup Events',
    description:
      'Discover opportunities. Build connections. Grow together.',
    url: 'https://tabstartup.com/events',
    type: 'website',
    siteName: 'TabStartup',
  },
};

export default async function EventsPage() {
  const events = await listPublicEvents();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl"
          />

          <div className="container relative mx-auto px-4 py-16 text-center md:py-24">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-blue-100">
              <CalendarDays className="h-4 w-4" />
              The Startup Ecosystem, Connected
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
              TabStartup Events
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300 md:text-xl">
              Discover opportunities. Build connections.
              Grow together.
            </p>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-400 md:text-base">
              Explore startup conferences, networking
              events, workshops, pitch competitions
              and more.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm text-slate-300">
              <span className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-300" />
                Online & In-person
              </span>

              <span className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-300" />
                Founders, Investors & Mentors
              </span>
            </div>
          </div>
        </section>

        <EventDirectory events={events} />
      </main>

      <PublicFooter />
    </div>
  );
}
