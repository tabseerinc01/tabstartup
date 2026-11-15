import Link from 'next/link';

import {
  CreditCard,
  Settings,
  Clock,
  ShieldCheck,
} from 'lucide-react';

export default function ControlPaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Payment Management
        </h1>

        <p className="mt-2 text-muted-foreground">
          Manage platform payment providers and
          event payment verification.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-6">
          <Settings className="mb-4 h-6 w-6" />

          <h2 className="text-lg font-semibold">
            Payment Settings
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            Configure bKash receiving accounts
            and payment availability.
          </p>

          <Link
            href="/control/payments/settings"
            className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Manage Payment Settings
          </Link>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <Clock className="mb-4 h-6 w-6" />

          <h2 className="text-lg font-semibold">
            Payment Verification
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            Review customer-submitted bKash
            payment information.
          </p>

          <Link
            href="/control/payments/verification"
            className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Review Payments
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-5 text-lg font-semibold">
          Payment Providers
        </h2>

        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg border p-4">
            <CreditCard className="h-6 w-6" />

            <div>
              <p className="font-semibold">
                TabEdge
              </p>

              <p className="text-sm text-muted-foreground">
                USD · Hosted checkout
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-lg border p-4">
            <CreditCard className="h-6 w-6" />

            <div>
              <p className="font-semibold">
                bKash Manual
              </p>

              <p className="text-sm text-muted-foreground">
                BDT · Personal or Merchant account
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border p-4">
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0" />

        <p className="text-sm text-muted-foreground">
          Customer-submitted payment information
          must be verified before confirming payment.
          Receiving account changes do not modify
          existing payment snapshots.
        </p>
      </div>
    </div>
  );
}
