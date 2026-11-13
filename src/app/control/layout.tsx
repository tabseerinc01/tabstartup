'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Loader2, ShieldAlert } from 'lucide-react';

import {
  AdminSidebar,
} from '@/components/admin/admin-sidebar';

import {
  AdminHeader,
} from '@/components/admin/admin-header';

import {
  useAdminAccess,
} from '@/hooks/use-admin-access';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const access = useAdminAccess(
    user,
    isUserLoading
  );

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login?returnTo=%2Fcontrol');
    }
  }, [user, isUserLoading, router]);

  if (
    isUserLoading ||
    (user && access.status === 'loading')
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-destructive" />
          <p className="text-sm font-medium text-slate-400">
            Verifying Administrative Access...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (access.status !== 'allowed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-white">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-destructive" />

          <h1 className="mb-3 text-xl font-semibold">
            {access.status === 'error'
              ? 'Administrative Access Unavailable'
              : 'Administrative Access Denied'}
          </h1>

          <p className="mb-6 text-sm text-slate-400">
            {access.status === 'error'
              ? 'We could not verify your administrative permissions.'
              : 'You do not have permission to access this control panel.'}
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
              onClick={() => router.replace('/login')}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm"
            >
              Return to Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      <AdminSidebar />

      <div className="flex flex-col flex-1 overflow-hidden">
        <AdminHeader />

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
