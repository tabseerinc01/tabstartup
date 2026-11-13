'use client';

import type { User } from 'firebase/auth';

import {
  usePortalAccess,
} from '@/hooks/use-portal-access';

export function useAdminAccess(
  user: User | null | undefined,
  isUserLoading: boolean
) {
  const access = usePortalAccess(
    user,
    isUserLoading,
    'startup'
  );

  const status =
    access.status === 'loading'
      ? 'loading'
      : access.status === 'error'
        ? 'error'
        : access.account?.isAdmin === true &&
            access.account.status !== 'suspended'
          ? 'allowed'
          : 'denied';

  return {
    status,
    account: access.account,
    retry: access.retry,
  };
}
