'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { User } from 'firebase/auth';

import type {
  ProfessionalProfileRole,
} from '@/lib/profile-readiness';

import {
  fetchProfessionalPublicationStatus,
  changeProfessionalPublication,
  type ProfessionalPublicationStatus,
  type PublicationActionResult,
} from '@/lib/professional-publication-client';

const REQUEST_TIMEOUT_MS = 60000;

type PublicationState = {
  key: string;
  status: ProfessionalPublicationStatus | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
};

type ActiveRequest = {
  key: string;
  kind: 'refresh' | 'action';
  controller: AbortController;
};

function initialState(
  key: string,
  loading = false
): PublicationState {
  return {
    key,
    status: null,
    loading,
    busy: false,
    error: null,
  };
}

export function useProfessionalPublication(
  user: User | null
) {
  const key = JSON.stringify([
    user?.uid ?? null,
    user?.email ?? null,
  ]);

  const [state, setState] =
    useState<PublicationState>(
      () => initialState(key, !!user)
    );

  const activeRef =
    useRef<ActiveRequest | null>(null);

  const currentKeyRef = useRef(key);

  const mountedRef = useRef(false);

  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const isCurrent = useCallback(
    (request: ActiveRequest) =>
      mountedRef.current &&
      currentKeyRef.current === request.key &&
      activeRef.current === request,
    []
  );

  const refresh = useCallback(async () => {
    const account = userRef.current;

    if (
      !account ||
      !mountedRef.current ||
      currentKeyRef.current !== key ||
      JSON.stringify([
        account.uid,
        account.email,
      ]) !== key
    ) {
      return;
    }

    if (activeRef.current?.kind === 'action') {
      // The active action always reloads authoritative
      // status after its request finishes.
      return;
    }

    activeRef.current?.controller.abort();

    const request: ActiveRequest = {
      key,
      kind: 'refresh',
      controller: new AbortController(),
    };

    activeRef.current = request;

    setState({
      ...initialState(key, true),
    });

    const timer = setTimeout(
      () => request.controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const status =
        await fetchProfessionalPublicationStatus(
          account,
          request.controller.signal
        );

      if (!isCurrent(request)) return;

      if (request.controller.signal.aborted) {
        throw new Error('REQUEST_TIMEOUT');
      }

      setState({
        ...initialState(key),
        status,
      });
    } catch {
      if (!isCurrent(request)) return;

      setState({
        ...initialState(key),
        error:
          'Unable to check publication status. Please refresh.',
      });
    } finally {
      clearTimeout(timer);

      if (activeRef.current === request) {
        activeRef.current = null;
      }
    }
  }, [key, isCurrent]);

  useEffect(() => {
    mountedRef.current = true;
    currentKeyRef.current = key;

    setState(
      initialState(key, !!userRef.current)
    );

    void refresh();

    function onVisibilityChange() {
      if (
        document.visibilityState === 'visible' &&
        !activeRef.current
      ) {
        void refresh();
      }
    }

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange
    );

    window.addEventListener(
      'focus',
      onVisibilityChange
    );

    return () => {
      mountedRef.current = false;

      activeRef.current?.controller.abort();
      activeRef.current = null;

      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange
      );

      window.removeEventListener(
        'focus',
        onVisibilityChange
      );
    };
  }, [key, refresh]);

  const changePublication = useCallback(
    async (
      role: ProfessionalProfileRole,
      action: 'publish' | 'unpublish'
    ): Promise<PublicationActionResult | null> => {
      const account = userRef.current;

      if (
        !account ||
        !mountedRef.current ||
        currentKeyRef.current !== key ||
        JSON.stringify([
          account.uid,
          account.email,
        ]) !== key ||
        activeRef.current
      ) {
        return null;
      }

      const request: ActiveRequest = {
        key,
        kind: 'action',
        controller: new AbortController(),
      };

      activeRef.current = request;

      setState({
        ...initialState(key),
        busy: true,
      });

      const timer = setTimeout(
        () => request.controller.abort(),
        REQUEST_TIMEOUT_MS
      );

      let result: PublicationActionResult | null = null;

      let actionError: string | null = null;

      try {
        const response =
          await changeProfessionalPublication(
            account,
            role,
            action,
            request.controller.signal
          );

        if (!isCurrent(request)) return null;

        if (request.controller.signal.aborted) {
          throw new Error('REQUEST_TIMEOUT');
        }

        result = response;

        if (response.status === 'not_ready') {
          actionError =
            'Publication requirements are not satisfied. Review your profile.';
        }
      } catch {
        if (!isCurrent(request)) return null;

        actionError =
          'Publication outcome could not be confirmed. Check the refreshed status before retrying.';
      } finally {
        clearTimeout(timer);

        if (activeRef.current === request) {
          activeRef.current = null;
        }
      }

      if (
        !mountedRef.current ||
        currentKeyRef.current !== key
      ) {
        return null;
      }

      // Always reload authoritative state.
      // Never assume a failed request made no changes.
      await refresh();

      if (
        mountedRef.current &&
        currentKeyRef.current === key &&
        !activeRef.current &&
        actionError
      ) {
        setState(previous =>
          previous.key === key
            ? {
                ...previous,
                error: previous.error
                  ? previous.error + ' ' + actionError
                  : actionError,
              }
            : previous
        );
      }

      return result;
    },
    [key, isCurrent, refresh]
  );

  const visibleState =
    state.key === key
      ? state
      : initialState(key, !!user);

  return {
    status: visibleState.status,
    loading: visibleState.loading,
    busy: visibleState.busy,
    error: visibleState.error,
    refresh,
    changePublication,
  };
}
