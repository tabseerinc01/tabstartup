'use client';

import {
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react';

import {
  CalendarDays,
  Globe,
  MapPin,
  Users,
  FileText,
  Loader2,
  AlertCircle,
  Save,
} from 'lucide-react';

import { eventLabel } from '@/lib/event-admin-client';

export interface EventFormValues {
  title: string;
  slug: string;
  category: string;
  shortDescription: string;
  description: string;
  bannerUrl: string;
  mode: 'online' | 'offline' | 'hybrid';
  visibility: 'public';
  registrationType: 'free' | 'paid' | 'mixed';

  registrationAccess:
    | 'public'
    | 'invite_only'
    | 'public_and_invitation';

  maxAcceptedInvitations: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  onlineCapacity: string;
  offlineCapacity: string;
  maxTicketsPerOrder: string;
  allowGuestRegistration: boolean;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  countryCode: string;
  mapUrl: string;
  meetingProvider: string;
  meetingUrl: string;
  meetingId: string;
  meetingPasscode: string;
  privateParticipantInstructions: string;
  terms: string;
  refundPolicy: string;
}

export const defaultEventFormValues: EventFormValues = {
  title: '',
  slug: '',
  category: 'conference',
  shortDescription: '',
  description: '',
  bannerUrl: '',
  mode: 'online',
  visibility: 'public',
  registrationType: 'paid',
  registrationAccess: 'public',
  maxAcceptedInvitations: '0',
  timezone: 'Asia/Dhaka',
  startsAt: '',
  endsAt: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
  onlineCapacity: '100',
  offlineCapacity: '100',
  maxTicketsPerOrder: '5',
  allowGuestRegistration: true,
  venueName: '',
  venueAddress: '',
  venueCity: '',
  countryCode: 'BD',
  mapUrl: '',
  meetingProvider: '',
  meetingUrl: '',
  meetingId: '',
  meetingPasscode: '',
  privateParticipantInstructions: '',
  terms: '',
  refundPolicy: '',
};

const categories = [
  'startup_pitch',
  'networking',
  'workshop',
  'webinar',
  'demo_day',
  'conference',
  'summit',
  'competition',
  'mentorship',
  'other',
];

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100';

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">
        {label}
      </span>

      {children}

      {hint && (
        <span className="block text-xs text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-slate-900">
        {icon}
        {title}
      </h2>

      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
}

function createSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}

/**
 * Convert a wall-clock time in the selected
 * event timezone into an absolute timestamp.
 *
 * Reject nonexistent and ambiguous local times.
 */
function zonedDateToMillis(
  value: string,
  timezone: string
): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('Please enter a valid date and time.');
  }

  const [year, month, day, hour, minute] =
    value.split(/[-T:]/).map(Number);

  const wallTime = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute
  );

  const formatter = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }
  );

  function localParts(timestamp: number) {
    const parts = Object.fromEntries(
      formatter.formatToParts(
        new Date(timestamp)
      ).map(part => [
        part.type,
        part.value,
      ])
    );

    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
  }

  const offsets = new Set<number>();

  for (let hours = -48; hours <= 48; hours += 6) {
    const sample =
      wallTime + hours * 3600000;

    offsets.add(
      localParts(sample) - sample
    );
  }

  const candidates = [...offsets]
    .map(offset => wallTime - offset)
    .filter(timestamp =>
      localParts(timestamp) === wallTime
    );

  if (candidates.length !== 1) {
    throw new Error(
      'The selected local time is ambiguous or unavailable in this timezone.'
    );
  }

  return candidates[0];
}

function optionalDate(
  value: string,
  timezone: string
): number | null {
  return value
    ? zonedDateToMillis(value, timezone)
    : null;
}

export function buildEventFormPayload(
  values: EventFormValues
) {
  const hasOnline =
    values.mode !== 'offline';

  const hasOffline =
    values.mode !== 'online';

  const nullable = (value: string) =>
    value.trim() || null;

  const invitationsEnabled =
    values.registrationAccess !== 'public';

  const totalCapacity =
    (hasOnline ? Number(values.onlineCapacity) : 0) +
    (hasOffline ? Number(values.offlineCapacity) : 0);

  const invitationLimit = invitationsEnabled
    ? Number(values.maxAcceptedInvitations)
    : 0;

  if (
    invitationsEnabled &&
    (
      !Number.isSafeInteger(invitationLimit) ||
      invitationLimit < 1 ||
      invitationLimit > totalCapacity
    )
  ) {
    throw new Error(
      'Invitation limit must be between 1 and total event capacity.'
    );
  }

  if (
    (
      values.registrationAccess === 'invite_only' &&
      values.registrationType !== 'free'
    ) ||
    (
      invitationsEnabled &&
      values.registrationType === 'paid'
    )
  ) {
    throw new Error(
      'Complimentary invitations require a free or mixed event.'
    );
  }

  return {
    title: values.title,
    slug: values.slug,
    category: values.category,
    shortDescription: values.shortDescription,
    description: values.description,
    bannerUrl: nullable(values.bannerUrl),
    mode: values.mode,
    visibility: values.visibility,
    registrationType: values.registrationType,

    registrationAccess:
      values.registrationAccess,

    invitationSettings: {
      enabled: invitationsEnabled,
      allowComplimentary: invitationsEnabled,
      maxAcceptedInvitations: invitationLimit,
    },
    timezone: values.timezone,

    startsAtMs: zonedDateToMillis(
      values.startsAt,
      values.timezone
    ),

    endsAtMs: zonedDateToMillis(
      values.endsAt,
      values.timezone
    ),

    registrationOpensAtMs: optionalDate(
      values.registrationOpensAt,
      values.timezone
    ),

    registrationClosesAtMs: optionalDate(
      values.registrationClosesAt,
      values.timezone
    ),

    capacity: {
      online: hasOnline
        ? Number(values.onlineCapacity)
        : 0,

      offline: hasOffline
        ? Number(values.offlineCapacity)
        : 0,
    },

    maxTicketsPerOrder:
      Number(values.maxTicketsPerOrder),

    allowGuestRegistration:
      values.registrationAccess === 'invite_only'
        ? false
        : values.allowGuestRegistration,

    venue: hasOffline
      ? {
          name: values.venueName,
          address: values.venueAddress,
          city: values.venueCity,
          countryCode: values.countryCode
            .trim()
            .toUpperCase(),
          mapUrl: nullable(values.mapUrl),
        }
      : null,

    privateDetails: {
      meetingProvider: hasOnline
        ? nullable(values.meetingProvider)
        : null,

      meetingUrl: hasOnline
        ? nullable(values.meetingUrl)
        : null,

      meetingId: hasOnline
        ? nullable(values.meetingId)
        : null,

      meetingPasscode: hasOnline
        ? nullable(values.meetingPasscode)
        : null,

      privateParticipantInstructions:
        values.privateParticipantInstructions,
    },

    terms: values.terms,
    refundPolicy: values.refundPolicy,
  };
}

interface EventFormProps {
  initialValues?: EventFormValues;
  editing?: boolean;
  onSubmit: (
    payload: ReturnType<typeof buildEventFormPayload>
  ) => Promise<void>;
}

export function EventForm({
  initialValues = defaultEventFormValues,
  editing = false,
  onSubmit,
}: EventFormProps) {
  const [values, setValues] =
    useState<EventFormValues>(initialValues);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const savingRef = useRef(false);

  function set<K extends keyof EventFormValues>(
    key: K,
    value: EventFormValues[K]
  ) {
    setValues(current => ({
      ...current,
      [key]: value,
    }));
  }

  function input(
    key: keyof EventFormValues,
    label: string,
    options: {
      type?: string;
      required?: boolean;
      maxLength?: number;
      min?: number;
      max?: number;
      hint?: string;
      disabled?: boolean;
    } = {}
  ) {
    return (
      <Field label={label} hint={options.hint}>
        <input
          className={fieldClass}
          type={options.type ?? 'text'}
          value={String(values[key])}
          required={options.required}
          maxLength={options.maxLength}
          min={options.min}
          max={options.max}
          disabled={options.disabled}
          onChange={event =>
            setValues(current => ({
              ...current,
              [key]: event.target.value,
            }))
          }
        />
      </Field>
    );
  }

  function textarea(
    key: keyof EventFormValues,
    label: string,
    maxLength: number,
    required = false
  ) {
    return (
      <Field label={label}>
        <textarea
          className={fieldClass}
          rows={4}
          value={String(values[key])}
          maxLength={maxLength}
          required={required}
          onChange={event =>
            setValues(current => ({
              ...current,
              [key]: event.target.value,
            }))
          }
        />
      </Field>
    );
  }

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setError('');

    try {
      const payload =
        buildEventFormPayload(values);

      await onSubmit(payload);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to save event.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
    >
      <fieldset
        disabled={saving}
        className="min-w-0 space-y-6"
      >
        <Section
          title="Basic Information"
          icon={<FileText className="h-5 w-5" />}
        >
          <Field label="Event Title">
            <input
              className={fieldClass}
              value={values.title}
              required
              maxLength={160}
              onChange={event => {
                const title = event.target.value;

                setValues(current => ({
                  ...current,
                  title,
                  slug: editing
                    ? current.slug
                    : createSlug(title),
                }));
              }}
            />
          </Field>

          {input('slug', 'Event URL Slug', {
            required: true,
            maxLength: 120,
            disabled: editing,
            hint: 'Public URL: /events/' + (values.slug || 'your-event'),
          })}

          <Field label="Category">
            <select
              className={fieldClass}
              value={values.category}
              onChange={event =>
                set('category', event.target.value)
              }
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {eventLabel(category)}
                </option>
              ))}
            </select>
          </Field>

          {textarea(
            'shortDescription',
            'Short Description',
            500,
            true
          )}

          {textarea(
            'description',
            'Full Event Description',
            30000,
            true
          )}

          {input('bannerUrl', 'Event Banner URL', {
            type: 'url',
            maxLength: 2048,
            hint: 'Use an HTTPS image URL. Direct image upload will be added separately.',
          })}
        </Section>

        <Section
          title="Event Schedule"
          icon={<CalendarDays className="h-5 w-5" />}
        >
          {input('timezone', 'Event Timezone', {
            required: true,
            maxLength: 100,
            hint: 'IANA timezone, for example Asia/Dhaka or America/New_York.',
          })}

          <div className="grid gap-4 sm:grid-cols-2">
            {input('startsAt', 'Start Date & Time', {
              type: 'datetime-local',
              required: true,
            })}

            {input('endsAt', 'End Date & Time', {
              type: 'datetime-local',
              required: true,
            })}
          </div>

          <p className="text-xs text-slate-500">
            All dates and times use the selected event timezone.
          </p>
        </Section>

        <Section
          title="Event Mode & Capacity"
          icon={<Globe className="h-5 w-5" />}
        >
          <Field label="Event Mode">
            <select
              className={fieldClass}
              value={values.mode}
              onChange={event =>
                set(
                  'mode',
                  event.target.value as EventFormValues['mode']
                )
              }
            >
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            {values.mode !== 'offline' &&
              input('onlineCapacity', 'Online Capacity', {
                type: 'number',
                min: 1,
                max: 100000,
                required: true,
              })}

            {values.mode !== 'online' &&
              input('offlineCapacity', 'Offline Capacity', {
                type: 'number',
                min: 1,
                max: 100000,
                required: true,
              })}
          </div>
        </Section>

        {values.mode !== 'online' && (
          <Section
            title="Physical Venue"
            icon={<MapPin className="h-5 w-5" />}
          >
            {input('venueName', 'Venue Name', {
              required: true,
              maxLength: 200,
            })}

            {textarea(
              'venueAddress',
              'Venue Address',
              1000,
              true
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {input('venueCity', 'City', {
                required: true,
                maxLength: 120,
              })}

              {input('countryCode', 'Country Code', {
                required: true,
                maxLength: 2,
                hint: 'BD, US, GB, etc.',
              })}
            </div>

            {input('mapUrl', 'Map URL', {
              type: 'url',
              maxLength: 2048,
            })}
          </Section>
        )}

        {values.mode !== 'offline' && (
          <Section
            title="Private Online Meeting"
            icon={<Globe className="h-5 w-5" />}
          >
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Meeting credentials are private and will not be included in public event listings.
            </div>

            <Field label="Meeting Provider">
              <select
                className={fieldClass}
                value={values.meetingProvider}
                onChange={event =>
                  set(
                    'meetingProvider',
                    event.target.value
                  )
                }
              >
                <option value="">Not configured</option>
                <option value="zoom">Zoom</option>
                <option value="google_meet">Google Meet</option>
                <option value="microsoft_teams">Microsoft Teams</option>
                <option value="other">Other</option>
              </select>
            </Field>

            {input('meetingUrl', 'Private Meeting URL', {
              type: 'url',
              maxLength: 2048,
            })}

            <div className="grid gap-4 sm:grid-cols-2">
              {input('meetingId', 'Meeting ID', {
                maxLength: 300,
              })}

              {input('meetingPasscode', 'Meeting Passcode', {
                type: 'password',
                maxLength: 300,
              })}
            </div>
          </Section>
        )}

        <Section
          title="Registration Settings"
          icon={<Users className="h-5 w-5" />}
        >
          <Field
            label="Registration Access"
            hint="Controls who can register. Event visibility is configured separately."
          >
            <select
              className={fieldClass}
              value={values.registrationAccess}
              onChange={event => {
                const access = event.target.value as
                  EventFormValues['registrationAccess'];

                setValues(current => ({
                  ...current,
                  registrationAccess: access,

                  registrationType:
                    access === 'invite_only'
                      ? 'free'
                      : access === 'public_and_invitation' &&
                          current.registrationType === 'paid'
                        ? 'mixed'
                        : current.registrationType,

                  maxAcceptedInvitations:
                    access === 'public'
                      ? '0'
                      : Number(current.maxAcceptedInvitations) > 0
                        ? current.maxAcceptedInvitations
                        : '1',

                  allowGuestRegistration:
                    access === 'invite_only'
                      ? false
                      : current.allowGuestRegistration,
                }));
              }}
            >
              <option value="public">
                Public Registration
              </option>

              <option value="invite_only">
                Invitation Only
              </option>

              <option value="public_and_invitation">
                Public &amp; Invitation
              </option>
            </select>
          </Field>

          {values.registrationAccess !== 'public' && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Complimentary Invitations
              </p>

              <p className="text-xs text-slate-600">
                Invited guests must sign in using their
                verified invitation email. Private tickets
                are not available through public registration.
              </p>

              {input(
                'maxAcceptedInvitations',
                'Maximum Accepted Invitations',
                {
                  type: 'number',
                  min: 1,
                  required: true,
                  hint: 'Must not exceed total event capacity.',
                }
              )}
            </div>
          )}

          <Field label="Registration Type">
            <select
              className={fieldClass}
              value={values.registrationType}
              onChange={event =>
                set(
                  'registrationType',
                  event.target.value as EventFormValues['registrationType']
                )
              }
            >
              <option value="free">Free Event</option>
              {values.registrationAccess === 'public' && (
                <option value="paid">Paid Event</option>
              )}

              {values.registrationAccess !== 'invite_only' && (
                <option value="mixed">
                  Free &amp; Paid Tickets
                </option>
              )}
            </select>
          </Field>

          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            {values.registrationType === 'free'
              ? 'Participants can register without payment.'
              : 'Paid ticket prices will be configured in USD and BDT after saving this event.'}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {input(
              'registrationOpensAt',
              'Registration Opens',
              { type: 'datetime-local' }
            )}

            {input(
              'registrationClosesAt',
              'Registration Closes',
              { type: 'datetime-local' }
            )}
          </div>

          {input(
            'maxTicketsPerOrder',
            'Maximum Tickets Per Order',
            {
              type: 'number',
              min: 1,
              max: 20,
              required: true,
            }
          )}

          <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              disabled={
                values.registrationAccess === 'invite_only'
              }
              checked={
                values.registrationAccess !== 'invite_only' &&
                values.allowGuestRegistration
              }
              onChange={event =>
                set(
                  'allowGuestRegistration',
                  event.target.checked
                )
              }
            />

            Allow registration without a TabStartup account
          </label>

          {textarea(
            'privateParticipantInstructions',
            'Private Participant Instructions',
            10000
          )}
        </Section>

        <Section
          title="Event Policies"
          icon={<FileText className="h-5 w-5" />}
        >
          {textarea(
            'terms',
            'Terms & Conditions',
            30000
          )}

          {textarea(
            'refundPolicy',
            'Refund & Cancellation Policy',
            30000
          )}
        </Section>
      </fieldset>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Saving a draft does not publish the event or accept payments.
        </p>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}

          {saving
            ? 'Saving...'
            : editing
              ? 'Save Changes'
              : 'Save Draft & Continue'}
        </button>
      </div>
    </form>
  );
}
