import 'server-only';

import {
  randomBytes,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  EventRegistrationError,
} from '@/lib/event-registration-policy';

import type {
  RegistrationAccessContext,
} from '@/services/event-registration.service';

/**
 * Registration remains disabled by default.
 *
 * Enable only after payment, reservation expiry,
 * ticket fulfillment and security verification.
 */
export function isEventRegistrationEnabled(): boolean {
  return (
    process.env.EVENT_REGISTRATION_ENABLED === 'true'
  );
}

export const EVENT_GUEST_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Host-tabstartup_event_guest'
    : 'tabstartup_event_guest';

export const EVENT_GUEST_SESSION_MAX_AGE =
  30 * 24 * 60 * 60;

export function isValidGuestSessionSecret(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{64}$/.test(value)
  );
}

export function createGuestSessionSecret(): string {
  return randomBytes(32).toString('hex');
}

function signGuestSession(
  payload: string
): string {
  const secret =
    process.env.EVENT_REGISTRATION_SECRET;

  if (
    typeof secret !== 'string' ||
    secret.length < 32
  ) {
    throw new Error(
      'EVENT_REGISTRATION_SECRET_NOT_CONFIGURED'
    );
  }

  return createHmac('sha256', secret)
    .update('event-guest-session-v1:' + payload)
    .digest('hex');
}

export function readGuestSessionSecret(
  request: NextRequest
): string | null {
  const value = request.cookies.get(
    EVENT_GUEST_COOKIE_NAME
  )?.value;

  if (
    typeof value !== 'string' ||
    value.length > 200
  ) {
    return null;
  }

  const parts = value.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [session, expiry, signature] = parts;

  if (
    !isValidGuestSessionSecret(session) ||
    !/^[0-9]{10,13}$/.test(expiry) ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    return null;
  }

  const expiresAt = Number(expiry);
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt >
      now + EVENT_GUEST_SESSION_MAX_AGE
  ) {
    return null;
  }

  const expected = signGuestSession(
    session + '.' + expiry
  );

  if (!timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  )) {
    return null;
  }

  return session;
}

export function setGuestSessionCookie(
  response: NextResponse,
  secret: string
): void {
  if (!isValidGuestSessionSecret(secret)) {
    throw new EventRegistrationError(
      'REGISTRATION_DATA_INVALID'
    );
  }

  const expiresAt =
    Math.floor(Date.now() / 1000) +
    EVENT_GUEST_SESSION_MAX_AGE;

  const payload =
    secret + '.' + expiresAt;

  const signedValue =
    payload + '.' + signGuestSession(payload);

  response.cookies.set(
    EVENT_GUEST_COOKIE_NAME,
    signedValue,
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV === 'production',

      sameSite: 'strict',

      path: '/',

      maxAge: EVENT_GUEST_SESSION_MAX_AGE,
    }
  );
}

export function readRegistrationAccess(
  request: NextRequest
): RegistrationAccessContext {
  const authorization =
    request.headers.get('authorization');

  // Invalid authentication must never silently
  // fall back to guest registration.

  if (authorization !== null) {
    if (
      authorization.length > 16384 ||
      !authorization.startsWith('Bearer ')
    ) {
      throw new EventRegistrationError(
        'UNAUTHENTICATED'
      );
    }

    const token = authorization
      .slice(7)
      .trim();

    if (
      !token ||
      /\s/.test(token)
    ) {
      throw new EventRegistrationError(
        'UNAUTHENTICATED'
      );
    }

    return {
      idToken: token,
      guestSessionSecret: null,
    };
  }

  const guestSessionSecret =
    readGuestSessionSecret(request);

  if (guestSessionSecret === null) {
    throw new EventRegistrationError(
      'UNAUTHENTICATED'
    );
  }

  return {
    idToken: null,
    guestSessionSecret,
  };
}

/**
 * Reject cross-origin browser mutations.
 *
 * Production origins are explicit rather than
 * derived from untrusted forwarded headers.
 */
export function assertRegistrationOrigin(
  request: NextRequest
): void {
  const origin =
    request.headers.get('origin');

  const allowedOrigins = new Set([
    'https://tabstartup.com',
    'https://www.tabstartup.com',
    'https://tabstartup-blue.vercel.app',
  ]);

  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.VERCEL !== '1'
  ) {
    allowedOrigins.add(
      'http://localhost:3000'
    );

    allowedOrigins.add(
      'http://127.0.0.1:3000'
    );
  }

  if (
    origin === null ||
    !allowedOrigins.has(origin) ||
    origin !== request.nextUrl.origin
  ) {
    throw new EventRegistrationError(
      'ACCOUNT_ACCESS_DENIED'
    );
  }

  const fetchSite =
    request.headers.get('sec-fetch-site');

  if (
    fetchSite !== null &&
    fetchSite !== 'same-origin'
  ) {
    throw new EventRegistrationError(
      'ACCOUNT_ACCESS_DENIED'
    );
  }
}
