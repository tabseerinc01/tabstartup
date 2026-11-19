'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { User } from 'firebase/auth';

import {
  fetchEmailVerificationStatus,
  sendEmailVerificationCode,
  verifyEmailVerificationCode,
  type EmailVerificationStatus,
  type EmailOtpActionResult,
} from '@/lib/email-verification-client';

type Operation =
  | 'status'
  | 'send'
  | 'verify';

function getErrorMessage(
  code: string,
  attemptsRemaining?: number
): string {
  switch (code) {
    case 'invalid_code':
      return attemptsRemaining !== undefined
        ? 'Incorrect code. Attempts remaining: ' +
          attemptsRemaining + '.'
        : 'Incorrect verification code.';

    case 'expired':
    case 'claim_expired':
      return 'This code has expired. Request a new code.';

    case 'locked':
      return 'Too many incorrect attempts. Request a new code when available.';

    case 'cooldown':
      return 'Please wait before requesting another code.';

    case 'rate_limited':
      return 'Too many requests. Please try again later.';

    case 'delivery_failed':
      return 'The verification email could not be sent. Please try again later.';

    case 'delivery_uncertain':
      return 'Email delivery could not be confirmed. Check your inbox before retrying.';

    case 'verification_in_progress':
    case 'delivery_pending':
      return 'A verification request is already in progress. Please wait.';

    case 'no_active_challenge':
    case 'superseded':
      return 'Request a new verification code.';

    case 'email_changed':
    case 'auth_refresh_required':
    case 'unauthenticated':
      return 'Your account session has changed. Please sign in again.';

    case 'disabled':
      return 'Email verification is temporarily unavailable.';

    case 'account_not_eligible':
      return 'This account is not eligible for verification.';

    default:
      return 'Verification is temporarily unavailable. Please try again later.';
  }
}

export function useEmailVerification(
  user: User
) {
  const [status, setStatus] =
    useState<EmailVerificationStatus | null>(null);

  const [busy, setBusy] =
    useState<Operation | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [notice, setNotice] =
    useState<string | null>(null);

  const [code, setCode] =
    useState('');

  const [showCode, setShowCode] =
    useState(false);

  const [expiresAtMs, setExpiresAtMs] =
    useState(0);

  const [resendAtMs, setResendAtMs] =
    useState(0);

  const [verifyRetryAtMs, setVerifyRetryAtMs] =
    useState(0);

  const [nowMs, setNowMs] =
    useState(() => Date.now());

  const requestRef =
    useRef<AbortController | null>(null);

  const identityKey =
    JSON.stringify([user.uid, user.email]);

  const identityRef =
    useRef(identityKey);

  identityRef.current = identityKey;

  const mountedRef =
    useRef(false);

  const run = useCallback(
    async (
      operation: Operation,
      submittedCode?: string
    ) => {
      if (
        !mountedRef.current ||
        requestRef.current
      ) {
        return;
      }

      const controller =
        new AbortController();

      const requestIdentity =
        identityKey;

      requestRef.current = controller;

      const isCurrent = () =>
        mountedRef.current &&
        requestRef.current === controller &&
        identityRef.current === requestIdentity &&
        !controller.signal.aborted;

      setBusy(operation);
      setError(null);
      setNotice(null);

      const timeout = setTimeout(
        () => controller.abort(),
        30000
      );

      try {
        if (operation === 'status') {
          const next =
            await fetchEmailVerificationStatus(
              user,
              controller.signal
            );

          if (!isCurrent()) return;

          setStatus(next);

          if (next.emailVerified) {
            setShowCode(false);
            setCode('');
            setExpiresAtMs(0);
          }

          return;
        }

        let result: EmailOtpActionResult;

        if (operation === 'send') {
          result =
            await sendEmailVerificationCode(
              user,
              controller.signal
            );
        } else {
          result =
            await verifyEmailVerificationCode(
              user,
              submittedCode || '',
              controller.signal
            );
        }

        if (!isCurrent()) return;

        setNowMs(Date.now());

        if (result.status === 'sent') {
          setCode('');
          setShowCode(true);

          setExpiresAtMs(
            result.expiresAtMs
          );

          setResendAtMs(
            result.resendAvailableAtMs
          );

          setVerifyRetryAtMs(0);

          setNotice(
            'A verification code has been sent. Check your email inbox and spam folder.'
          );

          return;
        }

        if (result.status === 'failed') {
          setError(
            getErrorMessage(
              result.errorCode,
              result.attemptsRemaining
            )
          );

          if (result.retryAfterSeconds) {
            const retryAt =
              Date.now() +
              result.retryAfterSeconds * 1000;

            if (operation === 'send') {
              setResendAtMs(
                previous =>
                  Math.max(previous, retryAt)
              );
            } else {
              setVerifyRetryAtMs(retryAt);
            }
          }

          if (
            result.errorCode === 'cooldown' ||
            result.errorCode === 'delivery_uncertain' ||
            result.errorCode === 'delivery_pending'
          ) {
            setShowCode(true);
          }

          if (
            result.errorCode === 'locked' ||
            result.errorCode === 'expired' ||
            result.errorCode === 'no_active_challenge' ||
            result.errorCode === 'superseded' ||
            result.errorCode === 'email_changed' ||
            result.errorCode === 'claim_expired'
          ) {
            setCode('');
            setShowCode(false);
            setExpiresAtMs(0);
          }

          if (
            result.errorCode === 'disabled' ||
            result.errorCode === 'unauthenticated' ||
            result.errorCode === 'account_not_eligible' ||
            result.errorCode === 'auth_refresh_required' ||
            result.errorCode === 'email_changed'
          ) {
            setStatus(null);
          }

          return;
        }

        // Never mark an account verified solely
        // from a successful action response.
        const confirmed =
          await fetchEmailVerificationStatus(
            user,
            controller.signal
          );

        if (!isCurrent()) return;

        setStatus(confirmed);

        if (!confirmed.emailVerified) {
          setError(
            'Verification could not be confirmed. Refresh your verification status.'
          );

          return;
        }

        setCode('');
        setShowCode(false);
        setExpiresAtMs(0);
        setResendAtMs(0);
        setVerifyRetryAtMs(0);

        setNotice(
          'Your email address is verified.'
        );

      } catch {
        if (
          mountedRef.current &&
          requestRef.current === controller &&
          identityRef.current === requestIdentity
        ) {
          setStatus(null);

          setError(
            'Unable to confirm verification status. Refresh status and try again.'
          );
        }

      } finally {
        clearTimeout(timeout);

        if (
          requestRef.current === controller
        ) {
          requestRef.current = null;

          if (mountedRef.current) {
            setBusy(null);
          }
        }
      }
    },
    [user, identityKey]
  );

  useEffect(() => {
    mountedRef.current = true;

    setStatus(null);
    setBusy(null);
    setError(null);
    setNotice(null);
    setCode('');
    setShowCode(false);
    setExpiresAtMs(0);
    setResendAtMs(0);
    setVerifyRetryAtMs(0);

    void run('status');

    return () => {
      mountedRef.current = false;

      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [run]);

  useEffect(() => {
    const timer = setInterval(
      () => setNowMs(Date.now()),
      1000
    );

    return () => clearInterval(timer);
  }, []);

  const resendSeconds = Math.max(
    0,
    Math.ceil((resendAtMs - nowMs) / 1000)
  );

  const verifyRetrySeconds = Math.max(
    0,
    Math.ceil((verifyRetryAtMs - nowMs) / 1000)
  );

  const expiresSeconds = Math.max(
    0,
    Math.ceil((expiresAtMs - nowMs) / 1000)
  );

  const expired =
    expiresAtMs > 0 &&
    expiresSeconds === 0;

  const canSend =
    status?.otpEnabled === true &&
    status.emailVerified === false &&
    busy === null &&
    resendSeconds === 0;

  const canVerify =
    status?.otpEnabled === true &&
    status.emailVerified === false &&
    busy === null &&
    showCode &&
    !expired &&
    verifyRetrySeconds === 0 &&
    /^[0-9]{6}$/.test(code);

  return {
    status,
    busy,
    error,
    notice,
    code,
    showCode,
    expiresAtMs,
    expiresSeconds,
    resendSeconds,
    verifyRetrySeconds,
    expired,
    canSend,
    canVerify,

    updateCode: (value: string) => {
      setCode(
        value.replace(/[^0-9]/g, '').slice(0, 6)
      );
    },

    openCodeEntry: () => {
      if (
        status?.otpEnabled &&
        !status.emailVerified &&
        !busy
      ) {
        setShowCode(true);
      }
    },

    refreshStatus: () => {
      void run('status');
    },

    sendCode: () => {
      if (canSend) {
        void run('send');
      }
    },

    verifyCode: () => {
      if (canVerify) {
        void run('verify', code);
      }
    },
  };
}
