'use client';

import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { User } from 'firebase/auth';

import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Copy,
  Mail,
  Plus,
} from 'lucide-react';

import { useUser } from '@/firebase';

import {
  eventAdminRequest,
  formatEventDate,
  eventLabel,
  type AdminEventSummary,
} from '@/lib/event-admin-client';

import {
  EVENT_INVITATION_CATEGORIES,
  type AdminEventInvitation,
  type EventInvitationCategory,
} from '@/lib/event-invitation-types';

import {
  listEventInvitations,
  createEventInvitation,
  revokeEventInvitation,
  renewEventInvitation,
} from '@/lib/event-invitation-admin-client';

interface ManagedTicket {
  ticketType: {
    ticketTypeId: string;
    name: string;
    attendanceMode: 'online' | 'offline';
    pricingType: 'free' | 'paid';
    access?: 'public' | 'invite_only';
    status: string;
    price: {
      usdAmountMinor: number;
      bdtAmountMinor: number;
    };
    maxPerOrder: number;
    salesStartAt: number | null;
    salesEndAt: number | null;
  };

  inventory: {
    capacity: number;
    reservedQuantity: number;
    issuedQuantity: number;
  };
}

interface ManagedEvent extends AdminEventSummary {
  registrationOpensAt: number | null;
  registrationClosesAt: number | null;
}

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2.5 text-sm';

const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

function localDateTime(ms: number): string {
  const date = new Date(ms);

  const local = new Date(
    ms - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

function expiryBounds(
  event: ManagedEvent,
  ticket: ManagedTicket
) {
  return {
    min: Math.max(
      Date.now(),
      event.registrationOpensAt ?? 0,
      ticket.ticketType.salesStartAt ?? 0
    ),

    max: Math.min(
      event.endsAt,
      event.registrationClosesAt ??
        event.endsAt,
      ticket.ticketType.salesEndAt ??
        event.endsAt
    ),
  };
}

function statusClass(status: string) {
  if (status === 'accepted') {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (status === 'pending') {
    return 'bg-amber-50 text-amber-700';
  }

  return 'bg-slate-100 text-slate-700';
}

export default function InvitationsPage() {
  const params = useParams<{
    eventId: string;
  }>();

  const { user, isUserLoading } = useUser();

  if (isUserLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        Sign in to manage event invitations.
      </div>
    );
  }

  return (
    <InvitationDashboard
      key={user.uid + ':' + params.eventId}
      eventId={params.eventId}
      user={user}
    />
  );
}

function InvitationDashboard({
  eventId,
  user,
}: {
  eventId: string;
  user: User;
}) {
  const [event, setEvent] =
    useState<ManagedEvent | null>(null);

  const [tickets, setTickets] =
    useState<ManagedTicket[]>([]);

  const [items, setItems] =
    useState<AdminEventInvitation[]>([]);

  const [cursor, setCursor] =
    useState<string | null>(null);

  const [hasMore, setHasMore] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const [notice, setNotice] =
    useState('');

  const [guestName, setGuestName] =
    useState('');

  const [guestEmail, setGuestEmail] =
    useState('');

  const [category, setCategory] =
    useState<EventInvitationCategory>('general');

  const [ticketTypeId, setTicketTypeId] =
    useState('');

  const [expiry, setExpiry] =
    useState('');

  const [search, setSearch] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState('all');

  const [secureLink, setSecureLink] =
    useState<{
      invitationId: string;
      guestName: string;
      url: string;
    } | null>(null);

  const [renewing, setRenewing] =
    useState<AdminEventInvitation | null>(null);

  const [renewExpiry, setRenewExpiry] =
    useState('');

  const [revoking, setRevoking] =
    useState<AdminEventInvitation | null>(null);

  const [reason, setReason] =
    useState('');

  const requestRef =
    useRef<AbortController | null>(null);

  const lockRef = useRef(false);

  const mountedRef = useRef(false);

  const pagePath =
    '/control/events/' +
    encodeURIComponent(eventId);

  const endpoint =
    '/api/control/events/' +
    encodeURIComponent(eventId);

  const eligibleTickets = tickets.filter(
    ({ ticketType }) =>
      ticketType.access === 'invite_only' &&
      ticketType.status === 'active' &&
      ticketType.pricingType === 'free' &&
      ticketType.maxPerOrder === 1 &&
      ticketType.price.usdAmountMinor === 0 &&
      ticketType.price.bdtAmountMinor === 0
  );

  const selectedTicket = eligibleTickets.find(
    item =>
      item.ticketType.ticketTypeId ===
      ticketTypeId
  );

  const renewalTicket = eligibleTickets.find(
    item =>
      item.ticketType.ticketTypeId ===
      renewing?.ticketTypeId
  );

  const settings = event?.invitationSettings;

  const invitationsEnabled =
    settings?.enabled === true &&
    settings.allowComplimentary === true &&
    (
      event?.registrationAccess === 'invite_only' ||
      event?.registrationAccess === 'public_and_invitation'
    );

  const remainingInvitations = settings
    ? Math.max(
        0,
        settings.maxAcceptedInvitations -
          settings.acceptedInvitationCount
      )
    : 0;

  const canCreate =
    invitationsEnabled &&
    (
      event?.status === 'published' ||
      event?.status === 'ongoing'
    ) &&
    event.endsAt > Date.now() &&
    remainingInvitations > 0 &&
    eligibleTickets.length > 0;

  const selectedBounds =
    event && selectedTicket
      ? expiryBounds(event, selectedTicket)
      : null;

  const renewalBounds =
    event && renewalTicket
      ? expiryBounds(event, renewalTicket)
      : null;

  async function loadPage(
    append = false,
    nextCursor: string | null = null
  ) {
    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError('');

    if (!append) {
      setEvent(null);
      setTickets([]);
      setItems([]);
      setCursor(null);
      setHasMore(false);
    }

    try {
      const token = await user.getIdToken();

      const [managed, saved, list] =
        await Promise.all([
          eventAdminRequest<{
            event: ManagedEvent;
          }>(
            user,
            endpoint,
            { signal: controller.signal }
          ),

          eventAdminRequest<ManagedTicket[]>(
            user,
            endpoint + '/tickets',
            { signal: controller.signal }
          ),

          listEventInvitations(
            token,
            eventId,
            nextCursor,
            controller.signal
          ),
        ]);

      if (
        controller.signal.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      if (
        managed?.event?.eventId !== eventId ||
        !Array.isArray(saved)
      ) {
        throw new Error(
          'Invalid managed event response.'
        );
      }

      setEvent(managed.event);
      setTickets(saved);

      setItems(current => {
        const merged = new Map(
          (append ? current : []).map(
            item => [item.invitationId, item]
          )
        );

        for (const item of list.items) {
          merged.set(item.invitationId, item);
        }

        return Array.from(merged.values());
      });

      setCursor(list.nextCursor);
      setHasMore(list.hasMore);

      const firstEligible = saved.find(
        ({ ticketType }) =>
          ticketType.access === 'invite_only' &&
          ticketType.status === 'active' &&
          ticketType.pricingType === 'free' &&
          ticketType.maxPerOrder === 1 &&
          ticketType.price.usdAmountMinor === 0 &&
          ticketType.price.bdtAmountMinor === 0
      );

      setTicketTypeId(current =>
        current ||
        firstEligible?.ticketType.ticketTypeId ||
        ''
      );
    } catch (err) {
      if (
        controller.signal.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      setEvent(null);
      setTickets([]);
      setItems([]);
      setCursor(null);
      setHasMore(false);
      setSecureLink(null);
      setRenewing(null);
      setRevoking(null);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load invitations.'
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

    void loadPage();

    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
    // Dashboard is keyed by authenticated UID and event ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, user.uid]);

  function validateExpiry(
    value: string,
    bounds: {
      min: number;
      max: number;
    } | null
  ): number {
    const ms = new Date(value).getTime();

    if (
      !bounds ||
      !Number.isSafeInteger(ms) ||
      ms <= Math.max(bounds.min, Date.now()) ||
      ms > bounds.max
    ) {
      throw new Error(
        'Select an expiry within the allowed event and ticket registration window.'
      );
    }

    return ms;
  }

  async function runMutation(
    action: (
      token: string,
      signal: AbortSignal
    ) => Promise<void>
  ) {
    if (lockRef.current || loading) return;

    lockRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');

    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const token = await user.getIdToken();

      if (controller.signal.aborted) return;

      await action(token, controller.signal);

      if (
        controller.signal.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      await loadPage();
    } catch (err) {
      if (
        controller.signal.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Invitation action failed.'
      );
    } finally {
      lockRef.current = false;

      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }

  function createInvitation(e: FormEvent) {
    e.preventDefault();

    if (!canCreate || !selectedTicket) return;

    void runMutation(async (token, signal) => {
      const expiresAtMs = validateExpiry(
        expiry,
        selectedBounds
      );

      const result = await createEventInvitation(
        token,
        eventId,
        {
          ticketTypeId,
          category,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          expiresAtMs,
        },
        signal
      );

      if (signal.aborted || !mountedRef.current) {
        return;
      }

      setSecureLink({
        invitationId:
          result.invitation.invitationId,
        guestName:
          result.invitation.guestName,
        url: result.invitationUrl,
      });

      setGuestName('');
      setGuestEmail('');
      setNotice('Invitation created successfully.');
    });
  }

  function revokeInvitation(e: FormEvent) {
    e.preventDefault();

    if (!revoking) return;

    const target = revoking;

    if (
      !window.confirm(
        'Revoke the invitation for ' +
        target.guestName +
        '? The current invitation link will no longer work.'
      )
    ) {
      return;
    }

    void runMutation(async (token, signal) => {
      await revokeEventInvitation(
        token,
        eventId,
        target.invitationId,
        reason.trim(),
        signal
      );

      if (signal.aborted || !mountedRef.current) {
        return;
      }

      setSecureLink(current =>
        current?.invitationId === target.invitationId
          ? null
          : current
      );

      setRevoking(null);
      setReason('');
      setNotice('Invitation revoked.');
    });
  }

  function renewInvitation(e: FormEvent) {
    e.preventDefault();

    if (!renewing || !canCreate) return;

    const target = renewing;

    void runMutation(async (token, signal) => {
      const expiresAtMs = validateExpiry(
        renewExpiry,
        renewalBounds
      );

      const result = await renewEventInvitation(
        token,
        eventId,
        target.invitationId,
        expiresAtMs,
        signal
      );

      if (signal.aborted || !mountedRef.current) {
        return;
      }

      setSecureLink({
        invitationId:
          result.invitation.invitationId,
        guestName:
          result.invitation.guestName,
        url: result.invitationUrl,
      });

      setRenewing(null);
      setRenewExpiry('');
      setNotice('Invitation renewed successfully.');
    });
  }

  async function copyLink() {
    if (!secureLink) return;

    try {
      await navigator.clipboard.writeText(
        secureLink.url
      );

      if (mountedRef.current) {
        setNotice('Secure invitation link copied.');
      }
    } catch {
      setError(
        'Clipboard unavailable. Select and copy the invitation link manually.'
      );
    }
  }

  const visibleItems = items.filter(item => {
    const matchesStatus =
      statusFilter === 'all' ||
      item.status === statusFilter;

    const query = search.trim().toLowerCase();

    const matchesSearch =
      !query ||
      item.guestName.toLowerCase().includes(query) ||
      item.guestEmail.toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Link
        href={pagePath}
        className="inline-flex items-center gap-2 text-sm font-medium"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Event
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Manage Invitations
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            {event?.title ?? 'Event invitations'}
          </p>
        </div>

        <button
          className={buttonClass}
          disabled={loading || busy}
          onClick={() => {
            setSecureLink(null);
            setNotice('');
            void loadPage();
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          {notice}
        </div>
      )}

      {secureLink && (
        <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="font-semibold">
            Secure Invitation Link
          </h2>

          <p className="text-sm">
            Invitation for {secureLink.guestName}.
            Share this link privately with the invited guest.
          </p>

          <input
            readOnly
            aria-label="Secure invitation link"
            value={secureLink.url}
            className={fieldClass}
            onFocus={e => e.target.select()}
          />

          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              onClick={() => void copyLink()}
            >
              <Copy className="h-4 w-4" />
              Copy Link
            </button>

            <button
              className={buttonClass}
              onClick={() => setSecureLink(null)}
            >
              Hide Link
            </button>
          </div>

          <p className="text-xs text-slate-600">
            Copy this link before leaving or refreshing
            the page. It is not stored in browser storage.
            No invitation email has been sent yet.
          </p>
        </section>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading invitations...
        </div>
      )}

      {event && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [
                'Invitation capacity',
                settings?.maxAcceptedInvitations ?? 0,
              ],
              [
                'Accepted invitations',
                settings?.acceptedInvitationCount ?? 0,
              ],
              [
                'Remaining acceptance limit',
                remainingInvitations,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border bg-card p-5"
              >
                <p className="text-sm text-muted-foreground">
                  {label}
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <section className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Plus className="h-5 w-5" />
              Create Invitation
            </h2>

            {!canCreate && (
              <p className="rounded-lg bg-muted p-3 text-sm">
                Invitations require a published or ongoing
                invitation-enabled event, an active
                complimentary ticket and remaining
                invitation capacity.
              </p>
            )}

            <form onSubmit={createInvitation}>
              <fieldset
                disabled={!canCreate || busy || loading}
                className="space-y-4 disabled:opacity-60"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium">
                      Guest Name
                    </span>

                    <input
                      required
                      maxLength={150}
                      className={fieldClass}
                      value={guestName}
                      onChange={e =>
                        setGuestName(e.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium">
                      Guest Email
                    </span>

                    <input
                      required
                      type="email"
                      maxLength={254}
                      className={fieldClass}
                      value={guestEmail}
                      onChange={e =>
                        setGuestEmail(e.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium">
                      Guest Category
                    </span>

                    <select
                      className={fieldClass}
                      value={category}
                      onChange={e =>
                        setCategory(
                          e.target.value as EventInvitationCategory
                        )
                      }
                    >
                      {EVENT_INVITATION_CATEGORIES.map(
                        value => (
                          <option key={value} value={value}>
                            {eventLabel(value)}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium">
                      Complimentary Ticket
                    </span>

                    <select
                      required
                      className={fieldClass}
                      value={ticketTypeId}
                      onChange={e => {
                        setTicketTypeId(e.target.value);
                        setExpiry('');
                      }}
                    >
                      <option value="">
                        Select invitation ticket
                      </option>

                      {eligibleTickets.map(
                        ({ ticketType, inventory }) => (
                          <option
                            key={ticketType.ticketTypeId}
                            value={ticketType.ticketTypeId}
                          >
                            {ticketType.name}
                            {' — '}
                            {Math.max(
                              0,
                              inventory.capacity -
                              inventory.reservedQuantity -
                              inventory.issuedQuantity
                            )}
                            {' available'}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    Invitation Expiry
                  </span>

                  <input
                    required
                    type="datetime-local"
                    className={fieldClass}
                    value={expiry}
                    min={
                      selectedBounds
                        ? localDateTime(
                            selectedBounds.min
                          )
                        : undefined
                    }
                    max={
                      selectedBounds
                        ? localDateTime(
                            selectedBounds.max
                          )
                        : undefined
                    }
                    onChange={e =>
                      setExpiry(e.target.value)
                    }
                  />

                  <p className="text-xs text-muted-foreground">
                    Enter date and time in your device timezone.
                    Event timezone: {event.timezone}.
                  </p>
                </label>

                <p className="text-xs text-muted-foreground">
                  Pending invitations do not reserve seats.
                  Availability is checked when guests accept.
                  Guests must sign in with their verified
                  invitation email.
                </p>

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}

                  Create Invitation
                </button>
              </fieldset>
            </form>
          </section>

          {revoking && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">
                Revoke invitation: {revoking.guestName}
              </h2>

              <form
                className="mt-4 space-y-3"
                onSubmit={revokeInvitation}
              >
                <label className="block space-y-1">
                  <span className="text-sm">
                    Revocation reason
                  </span>

                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    rows={3}
                    className={fieldClass}
                    value={reason}
                    onChange={e =>
                      setReason(e.target.value)
                    }
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy || loading}
                    className={buttonClass + ' text-red-700'}
                  >
                    Confirm Revoke
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    className={buttonClass}
                    onClick={() => setRevoking(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

          {renewing && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">
                Renew invitation: {renewing.guestName}
              </h2>

              <form
                className="mt-4 space-y-3"
                onSubmit={renewInvitation}
              >
                <label className="block space-y-1">
                  <span className="text-sm">
                    New expiry — device timezone
                  </span>

                  <input
                    required
                    type="datetime-local"
                    className={fieldClass}
                    value={renewExpiry}
                    min={
                      renewalBounds
                        ? localDateTime(renewalBounds.min)
                        : undefined
                    }
                    max={
                      renewalBounds
                        ? localDateTime(renewalBounds.max)
                        : undefined
                    }
                    onChange={e =>
                      setRenewExpiry(e.target.value)
                    }
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={
                      busy ||
                      loading ||
                      !canCreate ||
                      !renewalTicket
                    }
                    className={buttonClass}
                  >
                    Renew Invitation
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    className={buttonClass}
                    onClick={() => setRenewing(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="text-lg font-semibold">
              Invitation List
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={fieldClass}
                placeholder="Search loaded guests"
                aria-label="Search invitations"
                value={search}
                onChange={e =>
                  setSearch(e.target.value)
                }
              />

              <select
                className={fieldClass}
                aria-label="Filter invitation status"
                value={statusFilter}
                onChange={e =>
                  setStatusFilter(e.target.value)
                }
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>

            <p className="text-xs text-muted-foreground">
              Showing {visibleItems.length} of {items.length}
              {' loaded invitations. Search and filters apply to loaded records only.'}
            </p>

            {visibleItems.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No matching invitations.
              </p>
            )}

            <div className="divide-y">
              {visibleItems.map(item => (
                <article
                  key={item.invitationId}
                  className="space-y-3 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">
                        {item.guestName}
                      </h3>

                      <p className="break-all text-sm text-muted-foreground">
                        {item.guestEmail}
                      </p>
                    </div>

                    <span
                      className={
                        'rounded-full px-3 py-1 text-xs font-medium ' +
                        statusClass(item.status)
                      }
                    >
                      {eventLabel(item.status)}

                      <span
                        className="ml-2 text-xs font-normal"
                        title="Email provider acceptance does not guarantee inbox delivery."
                      >
                        {item.emailDeliveryStatus === 'pending'
                          ? 'Email Queued'
                          : item.emailDeliveryStatus === 'processing'
                            ? 'Email Sending'
                            : item.emailDeliveryStatus === 'accepted'
                              ? 'Email Provider Accepted'
                              : item.emailDeliveryStatus === 'retry_pending'
                                ? 'Email Retry Scheduled'
                                : item.emailDeliveryStatus === 'failed'
                                  ? 'Email Failed'
                                  : item.emailDeliveryStatus === 'skipped'
                                    ? 'Email Skipped'
                                    : item.emailDeliveryStatus === 'requires_review'
                                      ? 'Email Requires Review'
                                      : item.emailDeliveryStatus === 'not_queued'
                                        ? 'Email Not Queued'
                                        : 'Email Status Unknown'}
                      </span>
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p>
                      Category: {eventLabel(item.category)}
                    </p>

                    <p>
                      Attendance: {eventLabel(item.attendanceMode)}
                    </p>

                    <p>
                      Pricing: Complimentary
                    </p>

                    <p>
                      Expires: {formatEventDate(
                        item.expiresAtMs,
                        event.timezone
                      )}
                    </p>

                    {item.acceptedAtMs !== null && (
                      <p>
                        Accepted: {formatEventDate(
                          item.acceptedAtMs,
                          event.timezone
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(
                      item.status === 'pending' ||
                      item.status === 'expired'
                    ) && (
                      <button
                        disabled={busy || loading}
                        className={buttonClass + ' text-red-700'}
                        onClick={() => {
                          setRenewing(null);
                          setRevoking(item);
                          setReason('');
                        }}
                      >
                        Revoke
                      </button>
                    )}

                    {(
                      item.status === 'expired' ||
                      item.status === 'revoked'
                    ) && (
                      <button
                        disabled={busy || loading || !canCreate}
                        className={buttonClass}
                        onClick={() => {
                          setRevoking(null);
                          setRenewing(item);
                          setRenewExpiry('');
                        }}
                      >
                        Renew
                      </button>
                    )}

                    {item.status === 'accepted' && (
                      <Link
                        className={buttonClass}
                        href={pagePath + '/participants'}
                      >
                        View Participants
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {hasMore && cursor && (
              <button
                disabled={busy || loading}
                className={buttonClass}
                onClick={() =>
                  void loadPage(true, cursor)
                }
              >
                Load More Invitations
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
