import Link from 'next/link';

import { notFound } from 'next/navigation';

import {
  isEventRegistrationEnabled,
} from '@/lib/event-registration-access';

import {
  isValidEventDocumentId,
} from '@/lib/event-validation';

import {
  EventOrderStatus,
} from '@/components/public/events/event-order-status';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Event Order | TabStartup',
  robots: {
    index: false,
    follow: false,
  },
  referrer: 'no-referrer',
};

export default async function EventOrderPage({
  params,
}: {
  params: Promise<{
    orderId: string;
  }>;
}) {
  const { orderId } = await params;

  if (
    !isValidEventDocumentId(orderId) ||
    /^__.*__$/.test(orderId)
  ) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link
        href="/events"
        className="text-sm text-primary hover:underline"
      >
        &larr; Browse events
      </Link>

      <header className="mb-8 mt-6">
        <p className="text-sm font-medium text-primary">
          TabStartup Events
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Your event order
        </h1>

        <p className="mt-3 text-muted-foreground">
          Review your registration and payment status.
        </p>
      </header>

      {isEventRegistrationEnabled() ? (
        <EventOrderStatus orderId={orderId} />
      ) : (
        <section className="rounded-2xl border bg-card p-8">
          <h2 className="text-xl font-semibold">
            Order service unavailable
          </h2>

          <p className="mt-3 text-muted-foreground">
            Please check back later.
          </p>
        </section>
      )}
    </main>
  );
}
