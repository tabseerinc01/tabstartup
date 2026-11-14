'use client';

import Link from 'next/link';

import { useRouter } from 'next/navigation';

import { ArrowLeft } from 'lucide-react';

import { useUser } from '@/firebase';

import {
  EventForm,
  type buildEventFormPayload,
} from '@/components/admin/events/event-form';

import {
  eventAdminRequest,
  type AdminEventSummary,
} from '@/lib/event-admin-client';

export default function CreateEventPage() {
  const { user } = useUser();

  const router = useRouter();

  async function createEvent(
    payload: ReturnType<typeof buildEventFormPayload>
  ) {
    if (!user) {
      throw new Error('Authentication required.');
    }

    const result = await eventAdminRequest<{
      event: AdminEventSummary;
    }>(
      user,
      '/api/control/events',
      {
        method: 'POST',
        body: payload,
      }
    );

    if (
      typeof result?.event?.eventId !== 'string' ||
      !result.event.eventId
    ) {
      throw new Error('Invalid event creation response.');
    }

    router.push(
      '/control/events/' +
      encodeURIComponent(result.event.eventId) +
      '/tickets'
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/control/events"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Events
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Create Event
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Create an official TabStartup event, then configure its tickets and publish it.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl border bg-white p-3 text-center text-xs font-semibold sm:text-sm">
        <div className="rounded-lg bg-slate-900 p-3 text-white">
          1. Event Details
        </div>

        <div className="rounded-lg bg-slate-100 p-3 text-slate-500">
          2. Configure Tickets
        </div>

        <div className="rounded-lg bg-slate-100 p-3 text-slate-500">
          3. Publish
        </div>
      </div>

      <EventForm onSubmit={createEvent} />
    </div>
  );
}
