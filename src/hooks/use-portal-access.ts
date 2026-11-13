'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

import type {
  AccountPortal,
} from '@/lib/account-identity';

import {
  fetchAccountAccess,
  type AccountAccessResponse,
} from '@/lib/account-access-client';

type PortalAccessState = {
  user: User | null;
  portal: AccountPortal;
  status:
    | 'loading'
    | 'allowed'
    | 'denied'
    | 'error';
  account: AccountAccessResponse | null;
};

export function usePortalAccess(
  user: User | null | undefined,
  isUserLoading: boolean,
  portal: AccountPortal
) {
  const [state, setState] =
    useState<PortalAccessState | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isUserLoading || !user) {
      setState(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setState({
      user,
      portal,
      status: 'loading',
      account: null,
    });

    fetchAccountAccess(user, controller.signal)
      .then(account => {
        if (cancelled) return;

        setState({
          user,
          portal,
          status: account.portals[portal].allowed
            ? 'allowed'
            : 'denied',
          account,
        });
      })
      .catch(() => {
        if (cancelled) return;

        setState({
          user,
          portal,
          status: 'error',
          account: null,
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user, isUserLoading, portal, attempt]);

  const current =
    !isUserLoading &&
    user &&
    state?.user === user &&
    state.portal === portal
      ? state
      : null;

  return {
    status: current?.status ?? 'loading',
    account: current?.account ?? null,
    retry: () => {
      setState(null);
      setAttempt(value => value + 1);
    },
  };
}
