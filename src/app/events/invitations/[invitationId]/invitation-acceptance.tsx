'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import Link from 'next/link';

import {
  useParams,
  useRouter,
} from 'next/navigation';

import type { User } from 'firebase/auth';

import {
  Mail,
  Ticket,
  CalendarDays,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

import { useUser } from '@/firebase';

import type {
  EventRegistrationInput,
} from '@/lib/event-registration-input';

interface InvitationDetails {
  invitationId: string;

  status:
    | 'pending'
    | 'accepted'
    | 'revoked'
    | 'expired';

  canAccept: boolean;
  expiresAtMs: number;
  guestName: string;
  guestEmail: string;
  category: string;

  event: {
    eventId: string;
    slug: string;
    title: string;
    mode: 'online' | 'offline' | 'hybrid';
    timezone: string;
    startsAtMs: number;
    endsAtMs: number;
    venue: {
      name?: string;
      address?: string;
      city?: string;
      countryCode?: string;
    } | null;
    terms: string;
    refundPolicy: string;
    termsHash: string;
    refundPolicyHash: string;
  };

  ticket: {
    ticketTypeId: string;
    name: string;
    attendanceMode: 'online' | 'offline';
    pricingType: 'complimentary';
    quantity: 1;
    amountMinor: 0;
  };

  orderId: string | null;
}

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2.5 text-sm';

const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50';

const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg border px-5 py-3 text-sm font-medium disabled:opacity-50';

function validOrderId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(value) &&
    !/^__.*__$/.test(value)
  );
}

function formatDate(
  value: number,
  timezone: string
): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return 'Date unavailable';
  }
}

function friendlyError(code: string): string {
  switch (code) {
    case 'INVITATION_ACCESS_DENIED':
      return (
        'This invitation could not be verified. ' +
        'Sign in with the verified email address ' +
        'that received the invitation.'
      );

    case 'INVITATION_SERVICE_DISABLED':
    case 'EVENT_REGISTRATION_DISABLED':
      return (
        'Invitation registration is temporarily unavailable. ' +
        'Please try again later.'
      );

    case 'EMAIL_VERIFICATION_REQUIRED':
      return 'Please verify your email address first.';

    case 'INVITATION_CAPACITY_EXHAUSTED':
      return 'No invitation places are currently available.';

    default:
      return (
        'Unable to complete the invitation request. ' +
        'Refresh the invitation status before trying again.'
      );
  }
}

async function invitationRequest<T>(
  invitationId: string,
  action: 'details' | 'accept',
  user: User,
  body: unknown,
  signal: AbortSignal
): Promise<T> {
  const idToken = await user.getIdToken(true);

  if (signal.aborted) {
    throw new Error('REQUEST_ABORTED');
  }

  const response = await fetch(
    '/api/events/invitations/' +
      encodeURIComponent(invitationId) +
      '/' +
      action,
    {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal,

      headers: {
        Authorization: 'Bearer ' + idToken,
        'Content-Type': 'application/json',
      },

      body: JSON.stringify(body),
    }
  );

  const result = await response
    .json()
    .catch(() => null);

  if (
    !response.ok ||
    result?.success !== true ||
    result.data == null
  ) {
    throw new Error(
      typeof result?.error === 'string'
        ? result.error
        : 'INVITATION_REQUEST_FAILED'
    );
  }

  return result.data as T;
}

export default function InvitationAcceptance() {
  const params = useParams<{
    invitationId: string;
  }>();

  const { user, isUserLoading } = useUser();

  const invitationId = params.invitationId;

  const [token, setToken] =
    useState<string | null>(null);

  const [ready, setReady] =
    useState(false);

  useEffect(() => {
    const match =
      /^#token=([a-f0-9]{64})$/.exec(
        window.location.hash
      );

    setToken(match?.[1] ?? null);
    setReady(true);
  }, [invitationId]);

  if (isUserLoading || !ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" />
      </main>
    );
  }

  if (
    !/^inv_[a-f0-9]{48}$/.test(invitationId) ||
    !token
  ) {
    return (
      <InvitationShell>
        <h1 className="text-xl font-bold">
          Invalid Invitation Link
        </h1>

        <p className="text-sm text-muted-foreground">
          Open the complete personal invitation link
          that was sent to you.
        </p>

        <Link
          href="/events"
          className={secondaryButton}
        >
          Browse Events
        </Link>
      </InvitationShell>
    );
  }

  if (!user) {
    return (
      <InvitationShell>
        <h1 className="text-2xl font-bold">
          You're Invited!
        </h1>

        <p className="text-sm text-muted-foreground">
          Sign in with the email address that received
          your personal invitation.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href="/login"
            target="_blank"
            rel="noopener noreferrer"
            className={primaryButton}
          >
            Sign In
          </a>

          <a
            href="/signup"
            target="_blank"
            rel="noopener noreferrer"
            className={secondaryButton}
          >
            Create Account
          </a>
        </div>

        <div className="rounded-lg bg-muted p-4 text-sm">
          Sign in or create your account in the new tab.
          Verify your email if required, then return
          to this invitation tab and refresh the page.
        </div>

        <button
          className={secondaryButton}
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4" />
          Continue After Sign In
        </button>
      </InvitationShell>
    );
  }

  return (
    <AuthenticatedInvitation
      key={user.uid + ':' + invitationId}
      user={user}
      invitationId={invitationId}
      token={token}
    />
  );
}

function InvitationShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight"
          >
            TabStartup
          </Link>
        </div>

        <section className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4 text-primary">
              <Mail className="h-8 w-8" />
            </div>
          </div>

          {children}
        </section>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Secure TabStartup Event Invitation
        </div>
      </div>
    </main>
  );
}

function AuthenticatedInvitation({
  user,
  invitationId,
  token,
}: {
  user: User;
  invitationId: string;
  token: string;
}) {
  const router = useRouter();

  const [details, setDetails] =
    useState<InvitationDetails | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const [verified, setVerified] =
    useState(user.emailVerified);

  const [fullName, setFullName] =
    useState('');

  const [phone, setPhone] =
    useState('');

  const [organization, setOrganization] =
    useState('');

  const [designation, setDesignation] =
    useState('');

  const [acceptedTerms, setAcceptedTerms] =
    useState(false);

  const [uncertain, setUncertain] =
    useState(false);

  const requestRef =
    useRef<AbortController | null>(null);

  const mountedRef = useRef(false);

  const lockRef = useRef(false);

  const registrationKeyRef =
    useRef<string | null>(null);

  async function loadDetails() {
    if (lockRef.current) return;

    requestRef.current?.abort();

    const controller = new AbortController();

    requestRef.current = controller;

    setLoading(true);
    setError('');
    setDetails(null);
    setAcceptedTerms(false);

    try {
      await user.reload();

      if (
        controller.signal.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      setVerified(user.emailVerified);

      if (!user.emailVerified || !user.email) {
        return;
      }

      const result =
        await invitationRequest<InvitationDetails>(
          invitationId,
          'details',
          user,
          { token },
          controller.signal
        );

      if (
        controller.signal.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      if (
        result.invitationId !== invitationId ||
        !result.event ||
        !result.ticket ||
        result.ticket.pricingType !== 'complimentary' ||
        result.ticket.quantity !== 1 ||
        result.ticket.amountMinor !== 0 ||
        result.guestEmail.toLowerCase() !==
          user.email.toLowerCase() ||
        ![
          'pending',
          'accepted',
          'expired',
          'revoked',
        ].includes(result.status) ||
        (
          result.status === 'accepted' &&
          !validOrderId(result.orderId)
        )
      ) {
        throw new Error(
          'INVITATION_ACCESS_DENIED'
        );
      }

      setDetails(result);
      setUncertain(false);

      setFullName(current =>
        current || result.guestName
      );
    } catch (err) {
      if (
        controller.signal.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      setError(
        friendlyError(
          err instanceof Error
            ? err.message
            : ''
        )
      );
    } finally {
      if (
        !controller.signal.aborted &&
        mountedRef.current
      ) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    void loadDetails();

    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, invitationId, token]);

  async function acceptInvitation(
    e: FormEvent
  ) {
    e.preventDefault();

    if (
      lockRef.current ||
      loading ||
      uncertain ||
      !details ||
      details.status !== 'pending' ||
      !details.canAccept ||
      !acceptedTerms ||
      !verified ||
      !user.email
    ) {
      return;
    }

    lockRef.current = true;

    setBusy(true);
    setError('');

    requestRef.current?.abort();

    const controller = new AbortController();

    requestRef.current = controller;

    try {
      registrationKeyRef.current ??=
        crypto.randomUUID();

      const registration: EventRegistrationInput = {
        eventSlug: details.event.slug,
        ticketTypeId: details.ticket.ticketTypeId,
        quantity: 1,
        currency: null,
        purchaserEmail: details.guestEmail,

        participants: [
          {
            fullName: fullName.trim(),
            email: details.guestEmail,
            phone: phone.trim(),
            organization: organization.trim(),
            designation: designation.trim(),
          },
        ],

        acceptedTerms: true,
        termsHash: details.event.termsHash,
        refundPolicyHash: details.event.refundPolicyHash,
        expectedUnitAmountMinor: 0,
        idempotencyKey: registrationKeyRef.current,
      };

      const result =
        await invitationRequest<{
          orderId: string;
        }>(
          invitationId,
          'accept',
          user,
          {
            token,
            registration,
          },
          controller.signal
        );

      if (
        controller.signal.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      if (!validOrderId(result.orderId)) {
        throw new Error(
          'INVALID_REGISTRATION_RESPONSE'
        );
      }

      router.replace(
        '/events/orders/' +
        encodeURIComponent(result.orderId)
      );
    } catch (err) {
      if (
        controller.signal.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      setUncertain(true);

      setError(
        friendlyError(
          err instanceof Error
            ? err.message
            : ''
        )
      );
    } finally {
      lockRef.current = false;

      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }

  return (
    <InvitationShell>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">
          You're Invited!
        </h1>

        <p className="text-sm text-muted-foreground">
          Personal Event Invitation
        </p>
      </div>

      <div className="rounded-lg bg-muted p-3 text-sm">
        Signed in as{' '}
        <span className="break-all font-medium">
          {user.email}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-5 text-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          Verifying invitation...
        </div>
      )}

      {!loading && !verified && (
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">
            Email Verification Required
          </h2>

          <p className="text-sm text-muted-foreground">
            Verify your account email before accepting
            this invitation. After verification,
            return here and refresh the invitation.
          </p>
        </div>
      )}

      {details && (
        <>
          <section className="space-y-4 rounded-xl border p-5">
            <h2 className="text-xl font-bold">
              {details.event.title}
            </h2>

            <div className="flex items-start gap-3 text-sm">
              <CalendarDays className="h-5 w-5 shrink-0 text-primary" />

              <div>
                {formatDate(
                  details.event.startsAtMs,
                  details.event.timezone
                )}

                <p className="text-xs text-muted-foreground">
                  {details.event.timezone}
                </p>
              </div>
            </div>

            {details.ticket.attendanceMode === 'offline' &&
              details.event.venue && (
                <p className="text-sm">
                  {[
                    details.event.venue.name,
                    details.event.venue.address,
                    details.event.venue.city,
                    details.event.venue.countryCode,
                  ].filter(Boolean).join(', ')}
                </p>
              )}

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <div className="flex items-center gap-3">
                <Ticket className="h-5 w-5 text-primary" />

                <div>
                  <p className="font-semibold">
                    {details.ticket.name}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Complimentary · 1 guest
                  </p>
                </div>
              </div>

              <span className="font-bold">
                Free
              </span>
            </div>
          </section>

          {details.status === 'accepted' &&
            validOrderId(details.orderId) && (
              <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />

                <h2 className="font-bold text-emerald-800">
                  Invitation Accepted
                </h2>

                <p className="text-sm text-emerald-700">
                  Your registration is already confirmed.
                  View your registration and event ticket.
                </p>

                <Link
                  className={primaryButton}
                  href={
                    '/events/orders/' +
                    encodeURIComponent(details.orderId)
                  }
                >
                  View Registration & Ticket
                </Link>
              </section>
            )}

          {details.status === 'expired' && (
            <div className="rounded-lg border p-4 text-sm">
              This invitation has expired.
              Contact the event organizer for assistance.
            </div>
          )}

          {details.status === 'revoked' && (
            <div className="rounded-lg border p-4 text-sm">
              This invitation is no longer valid.
            </div>
          )}

          {details.status === 'pending' &&
            !details.canAccept && (
              <div className="rounded-lg border p-4 text-sm">
                This invitation cannot currently be accepted.
                Registration may not be open or available.
              </div>
            )}

          {details.status === 'pending' &&
            details.canAccept && (
              <form
                onSubmit={acceptInvitation}
                className="space-y-5"
              >
                <h2 className="text-lg font-semibold">
                  Complete Your Registration
                </h2>

                <fieldset
                  disabled={busy || loading || uncertain}
                  className="space-y-4 disabled:opacity-60"
                >
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      Full Name
                    </span>

                    <input
                      required
                      maxLength={150}
                      value={fullName}
                      className={fieldClass}
                      onChange={e =>
                        setFullName(e.target.value)
                      }
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      Invitation Email
                    </span>

                    <input
                      readOnly
                      type="email"
                      value={details.guestEmail}
                      className={fieldClass}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      Phone Number
                    </span>

                    <input
                      type="tel"
                      maxLength={40}
                      value={phone}
                      className={fieldClass}
                      onChange={e =>
                        setPhone(e.target.value)
                      }
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      Organization
                    </span>

                    <input
                      maxLength={150}
                      value={organization}
                      className={fieldClass}
                      onChange={e =>
                        setOrganization(e.target.value)
                      }
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      Designation
                    </span>

                    <input
                      maxLength={150}
                      value={designation}
                      className={fieldClass}
                      onChange={e =>
                        setDesignation(e.target.value)
                      }
                    />
                  </label>

                  <div className="space-y-3 rounded-xl border p-4">
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold">
                        Event Terms
                      </summary>

                      <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                        {details.event.terms}
                      </p>
                    </details>

                    <details>
                      <summary className="cursor-pointer text-sm font-semibold">
                        Refund Policy
                      </summary>

                      <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                        {details.event.refundPolicy}
                      </p>
                    </details>

                    <label className="flex items-start gap-3 border-t pt-3 text-sm">
                      <input
                        required
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={e =>
                          setAcceptedTerms(
                            e.target.checked
                          )
                        }
                      />

                      <span>
                        I accept the event terms and
                        refund policy.
                      </span>
                    </label>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Invitation expires:{' '}
                    {formatDate(
                      details.expiresAtMs,
                      details.event.timezone
                    )}
                  </p>

                  <button
                    type="submit"
                    disabled={!acceptedTerms || busy}
                    className={primaryButton + ' w-full'}
                  >
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" />
                    )}

                    Accept Complimentary Invitation
                  </button>

                  <p className="text-center text-xs text-muted-foreground">
                    No payment required.
                  </p>
                </fieldset>
              </form>
            )}
        </>
      )}

      <button
        disabled={loading || busy}
        className={secondaryButton + ' w-full'}
        onClick={() => void loadDetails()}
      >
        <RefreshCw className="h-4 w-4" />
        Refresh Invitation Status
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Need help? Contact info@tabstartup.com
      </p>
    </InvitationShell>
  );
}
