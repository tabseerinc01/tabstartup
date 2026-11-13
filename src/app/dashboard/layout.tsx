'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';
import { useUser } from '@/firebase';
import { Loader2, ShieldAlert } from 'lucide-react';

import {
  usePortalAccess,
} from '@/hooks/use-portal-access';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const access = usePortalAccess(
    user,
    isUserLoading,
    'startup'
  );

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (access.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Verifying account access...
          </p>
        </div>
      </div>
    );
  }

  if (access.status !== 'allowed') {
    const suspended =
      access.account?.status === 'suspended';

    const unavailable =
      access.status === 'error';

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />

          <h1 className="mb-3 text-xl font-semibold">
            {suspended
              ? 'Account Suspended'
              : unavailable
                ? 'Account Access Unavailable'
                : 'Startup Profile Required'}
          </h1>

          <p className="mb-6 text-sm text-muted-foreground">
            {suspended
              ? 'Your account is currently suspended. Please contact support.'
              : unavailable
                ? 'We could not verify your account access. Please try again.'
                : 'A valid Startup profile is required to access this dashboard.'}
          </p>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={access.retry}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Retry Access
            </button>

            <button
              type="button"
              onClick={() => router.replace('/')}
              className="rounded-md border px-4 py-2 text-sm font-medium"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[240px_1fr] lg:grid-cols-[280px_1fr]">
      <aside className="hidden md:block border-r bg-background h-screen sticky top-0">
        <DashboardSidebar />
      </aside>

      <div className="flex flex-col">
        <DashboardHeader />

        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-muted/40">
          {children}
        </main>
      </div>
    </div>
  );
}
