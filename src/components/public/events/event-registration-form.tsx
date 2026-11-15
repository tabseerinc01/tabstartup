'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

import { useAuth } from '@/firebase';

import type {
  PublicEventDetails,
  PublicEventTicket,
} from '@/services/public-event.service';

type Currency = 'USD' | 'BDT';

type Participant = {
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  designation: string;
};

type RegistrationResponse = {
  orderId: string;
  eventId: string;
  status: string;
  paymentRequired: boolean;
  replayed: boolean;
};

type Attempt = {
  fingerprint: string;
  key: string;
};

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm';

const errorMessages: Record<string, string> = {
  EVENT_POLICIES_CHANGED:
    'Event policies have changed. Reload the page and review them.',

  TICKET_PRICE_CHANGED:
    'Ticket pricing has changed. Reload the page before continuing.',

  INSUFFICIENT_TICKET_INVENTORY:
    'There are not enough tickets available.',

  REGISTRATION_NOT_OPEN:
    'Registration is currently closed.',

  TICKET_UNAVAILABLE:
    'This ticket is no longer available.',

  REGISTRATION_RATE_LIMIT_EXCEEDED:
    'Too many requests. Please try again later.',

  REGISTRATION_REQUEST_CONFLICT:
    'Your previous request could not be safely retried.',

  ACCOUNT_ACCESS_DENIED:
    'Your account cannot complete this registration.',

  GUEST_REGISTRATION_DISABLED:
    'Please sign in to register for this event.',

  UNAUTHENTICATED:
    'Your session has expired. Please sign in or reload the page.',

  INVALID_REGISTRATION_INPUT:
    'Please review your registration information.',

  REGISTRATION_TEMPORARILY_UNAVAILABLE:
    'Registration is temporarily unavailable.',

  PAYMENT_PROVIDER_UNAVAILABLE:
    'bKash payment is temporarily unavailable. Please try again later. No payment is required until your order is created.',

  PAYMENT_UNAVAILABLE:
    'Payment is unavailable for this registration.',

  PAYMENT_SERVICE_UNAVAILABLE:
    'The payment service is temporarily unavailable. Please try again later.',
};

function emptyParticipant(): Participant {
  return {
    fullName: '',
    email: '',
    phone: '',
    organization: '',
    designation: '',
  };
}

function formatMoney(
  amountMinor: number,
  currency: Currency
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountMinor / 100);
}

async function readApiResponse<T>(
  response: Response
): Promise<T> {
  const body = await response.json();

  if (
    !response.ok ||
    body?.success !== true
  ) {
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : 'REGISTRATION_SERVICE_UNAVAILABLE'
    );
  }

  return body.data as T;
}

export function EventRegistrationForm({
  event,
  tickets,
  initialTicketId,
}: {
  event: PublicEventDetails;
  tickets: PublicEventTicket[];
  initialTicketId: string | null;
}) {
  const router = useRouter();

  const auth = useAuth();

  const initialTicket =
    tickets.find(
      ticket => ticket.ticketTypeId === initialTicketId
    ) ?? tickets[0];

  const [ticketId, setTicketId] = useState(
    initialTicket.ticketTypeId
  );

  const [currency, setCurrency] =
    useState<Currency>('BDT');

  const [quantity, setQuantity] =
    useState(1);

  const [participants, setParticipants] =
    useState<Participant[]>([
      emptyParticipant(),
    ]);

  const [purchaserEmail, setPurchaserEmail] =
    useState('');

  const [acceptedTerms, setAcceptedTerms] =
    useState(false);

  const [user, setUser] =
    useState<User | null>(null);

  const [authReady, setAuthReady] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const submitLock = useRef(false);

  const attempt = useRef<Attempt | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, current => {
      setUser(current);

      if (current?.email) {
        setPurchaserEmail(current.email);
      }

      setAuthReady(true);
    });
  }, [auth]);

  const ticket =
    tickets.find(
      item => item.ticketTypeId === ticketId
    ) ?? initialTicket;

  const isFree =
    ticket.pricingType === 'free';

  const maxQuantity = Math.min(
    event.maxTicketsPerOrder,
    ticket.maxPerOrder,
    20
  );

  const unitAmountMinor = isFree
    ? 0
    : currency === 'USD'
      ? ticket.price.usdAmountMinor
      : ticket.price.bdtAmountMinor;

  const totalAmountMinor =
    unitAmountMinor * quantity;

  function changeQuantity(value: number) {
    const next = Math.max(
      1,
      Math.min(value, maxQuantity)
    );

    setQuantity(next);

    setParticipants(previous =>
      Array.from(
        { length: next },
        (_, index) =>
          previous[index] ?? emptyParticipant()
      )
    );
  }

  function changeTicket(value: string) {
    const next = tickets.find(
      item => item.ticketTypeId === value
    );

    if (!next) return;

    setTicketId(value);

    const nextQuantity = Math.min(
      quantity,
      next.maxPerOrder,
      event.maxTicketsPerOrder
    );

    setQuantity(nextQuantity);

    setParticipants(previous =>
      previous.slice(0, nextQuantity)
    );
  }

  function updateParticipant(
    index: number,
    field: keyof Participant,
    value: string
  ) {
    setParticipants(previous =>
      previous.map((participant, i) =>
        i === index
          ? { ...participant, [field]: value }
          : participant
      )
    );
  }

  async function submit(
    submitEvent: FormEvent<HTMLFormElement>
  ) {
    submitEvent.preventDefault();

    if (
      submitLock.current ||
      !authReady ||
      !acceptedTerms
    ) {
      return;
    }

    if (!user && !event.allowGuestRegistration) {
      setError(errorMessages.GUEST_REGISTRATION_DISABLED);
      return;
    }

    if (
      !Number.isSafeInteger(totalAmountMinor) ||
      totalAmountMinor < 0
    ) {
      setError('Invalid ticket amount.');
      return;
    }

    submitLock.current = true;

    setBusy(true);
    setError('');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const currentUser =
        auth.currentUser;

      if (currentUser !== user) {
        throw new Error('UNAUTHENTICATED');
      }

      if (user) {
        if (!user.emailVerified || !user.email) {
          throw new Error('EMAIL_VERIFICATION_REQUIRED');
        }

        headers.Authorization =
          `Bearer ${await user.getIdToken()}`;
      } else {
        const guestResponse = await fetch(
          '/api/events/guest-session',
          {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
          }
        );

        await readApiResponse(guestResponse);
      }

      const payload = {
        eventSlug: event.slug,
        ticketTypeId: ticket.ticketTypeId,
        quantity,
        currency: isFree ? null : currency,

        purchaserEmail:
          user?.email ?? purchaserEmail.trim(),

        participants: participants.map(item => ({
          fullName: item.fullName.trim(),
          email: item.email.trim(),
          phone: item.phone.trim() || null,
          organization:
            item.organization.trim() || null,
          designation:
            item.designation.trim() || null,
        })),

        acceptedTerms: true,

        termsHash: event.termsHash,

        refundPolicyHash:
          event.refundPolicyHash,

        expectedUnitAmountMinor:
          unitAmountMinor,
      };

      const fingerprint = JSON.stringify({
        actor: user?.uid ?? 'guest',
        payload,
      });

      if (
        !attempt.current ||
        attempt.current.fingerprint !== fingerprint
      ) {
        attempt.current = {
          fingerprint,
          key: crypto.randomUUID(),
        };
      }

      const response = await fetch(
        '/api/events/registrations',
        {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          cache: 'no-store',

          body: JSON.stringify({
            ...payload,
            idempotencyKey: attempt.current.key,
          }),
        }
      );

      const result =
        await readApiResponse<RegistrationResponse>(
          response
        );

      if (
        typeof result.orderId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(result.orderId) ||
        result.eventId !== event.eventId
      ) {
        throw new Error(
          'REGISTRATION_SERVICE_UNAVAILABLE'
        );
      }

      router.replace(
        `/events/orders/${encodeURIComponent(result.orderId)}`
      );
    } catch (failure) {
      const code =
        failure instanceof Error
          ? failure.message
          : '';

      setError(
        code === 'EMAIL_VERIFICATION_REQUIRED'
          ? 'Please verify your account email before registering.'
          : errorMessages[code] ??
            'Registration could not be completed. Please retry without changing your details.'
      );

      submitLock.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <fieldset
        disabled={busy || !authReady}
        className="grid gap-6 lg:grid-cols-[1fr_340px]"
      >
        <div className="space-y-6">
          <section className="space-y-4 rounded-2xl border bg-card p-6">
            <h2 className="text-xl font-semibold">
              Select tickets
            </h2>

            <label className="block space-y-2">
              <span className="text-sm font-medium">
                Ticket category
              </span>

              <select
                className={fieldClass}
                value={ticketId}
                onChange={e =>
                  changeTicket(e.target.value)
                }
              >
                {tickets.map(item => (
                  <option
                    key={item.ticketTypeId}
                    value={item.ticketTypeId}
                  >
                    {item.name} — {item.attendanceMode}
                  </option>
                ))}
              </select>
            </label>

            {ticket.description && (
              <p className="text-sm text-muted-foreground">
                {ticket.description}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  Quantity
                </span>

                <select
                  className={fieldClass}
                  value={quantity}
                  onChange={e =>
                    changeQuantity(Number(e.target.value))
                  }
                >
                  {Array.from(
                    { length: maxQuantity },
                    (_, index) => index + 1
                  ).map(value => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              {!isFree && (
                <label className="block space-y-2">
                  <span className="text-sm font-medium">
                    Currency
                  </span>

                  <select
                    className={fieldClass}
                    value={currency}
                    onChange={e =>
                      setCurrency(
                        e.target.value as Currency
                      )
                    }
                  >
                    {/* USD disabled for bKash-first launch. */}
                    <option value="BDT">BDT</option>
                  </select>
                </label>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border bg-card p-6">
            <h2 className="text-xl font-semibold">
              Purchaser information
            </h2>

            {!authReady ? (
              <p className="text-sm">Loading account...</p>
            ) : user ? (
              <p className="text-sm text-muted-foreground">
                Signed in as {user.email}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {event.allowGuestRegistration
                  ? 'Continue as a guest or sign in.'
                  : 'You must sign in to register.'}

                {' '}

                <Link
                  href="/login"
                  className="text-primary hover:underline"
                >
                  Sign in
                </Link>
              </p>
            )}

            <label className="block space-y-2">
              <span className="text-sm font-medium">
                Purchaser email
              </span>

              <input
                type="email"
                required
                maxLength={254}
                className={fieldClass}
                value={purchaserEmail}
                readOnly={Boolean(user)}
                onChange={e =>
                  setPurchaserEmail(e.target.value)
                }
              />
            </label>
          </section>

          {participants.map((participant, index) => (
            <section
              key={index}
              className="space-y-4 rounded-2xl border bg-card p-6"
            >
              <h2 className="text-lg font-semibold">
                Participant {index + 1}
              </h2>

              {([
                ['fullName', 'Full name', 'text', 150, true],
                ['email', 'Email address', 'email', 254, true],
                ['phone', 'Phone number (optional)', 'tel', 40, false],
                ['organization', 'Organization (optional)', 'text', 200, false],
                ['designation', 'Designation (optional)', 'text', 150, false],
              ] as const).map(
                ([field, label, type, maxLength, required]) => (
                  <label
                    key={field}
                    className="block space-y-2"
                  >
                    <span className="text-sm font-medium">
                      {label}
                    </span>

                    <input
                      className={fieldClass}
                      type={type}
                      required={required}
                      maxLength={maxLength}
                      value={participant[field]}
                      onChange={e =>
                        updateParticipant(
                          index,
                          field,
                          e.target.value
                        )
                      }
                    />
                  </label>
                )
              )}
            </section>
          ))}

          <section className="space-y-4 rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">
              Event policies
            </h2>

            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">
                Terms & Conditions
              </summary>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                {event.terms || 'No additional event terms.'}
              </p>
            </details>

            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">
                Refund Policy
              </summary>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                {event.refundPolicy || 'No additional refund policy.'}
              </p>
            </details>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={e =>
                  setAcceptedTerms(e.target.checked)
                }
                className="mt-1"
              />

              <span>
                I accept the event Terms & Conditions
                and Refund Policy.
              </span>
            </label>
          </section>
        </div>

        <aside>
          <section className="space-y-5 rounded-2xl border bg-card p-6 lg:sticky lg:top-24">
            <h2 className="text-xl font-semibold">
              Order summary
            </h2>

            <div>
              <p className="font-medium">{ticket.name}</p>

              <p className="text-sm text-muted-foreground">
                {quantity} ticket(s)
              </p>
            </div>

            <div className="flex justify-between text-sm">
              <span>Unit price</span>

              <span>
                {isFree
                  ? 'Free'
                  : formatMoney(unitAmountMinor, currency)}
              </span>
            </div>

            {!isFree && (
              <div className="flex justify-between text-sm">
                <span>Payment method</span>

                <span className="font-medium">
                  {currency === 'USD' ? 'TabEdge' : 'bKash'}
                </span>
              </div>
            )}

            <div className="flex justify-between border-t pt-4 font-semibold">
              <span>Total</span>

              <span>
                {isFree
                  ? 'Free'
                  : formatMoney(totalAmountMinor, currency)}
              </span>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                busy ||
                !authReady ||
                !acceptedTerms ||
                (!user && !event.allowGuestRegistration)
              }
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy
                ? 'Processing...'
                : isFree
                  ? 'Confirm registration'
                  : 'Continue to payment'}
            </button>

            <p className="text-xs text-muted-foreground">
              Ticket availability and pricing are verified
              securely before your order is created.
            </p>
          </section>
        </aside>
      </fieldset>
    </form>
  );
}
