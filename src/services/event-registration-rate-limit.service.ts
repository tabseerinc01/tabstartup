import 'server-only';

import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Timestamp } from 'firebase-admin/firestore';

import { getFirebaseAdmin } from '@/firebase/admin';

import {
  RegistrationApiError,
} from '@/lib/event-registration-api';

export const EVENT_REGISTRATION_RATE_LIMIT_COLLECTION =
  'eventRegistrationRateLimits';

const WINDOW_MS = 15 * 60 * 1000;

const LIMITS = {
  guest_session: 30,
  registration: 20,
  order_status: 120,
} as const;

type RateLimitAction = keyof typeof LIMITS;

export function getEventRegistrationSecret(): string {
  const secret =
    process.env.EVENT_REGISTRATION_SECRET;

  if (
    typeof secret !== 'string' ||
    secret.length < 32
  ) {
    throw new RegistrationApiError(
      503,
      'REGISTRATION_TEMPORARILY_UNAVAILABLE'
    );
  }

  return secret;
}

function resolveClientIp(
  request: Request
): string {
  // Vercel-managed header only in production.

  if (process.env.VERCEL === '1') {
    const ip = request.headers
      .get('x-vercel-forwarded-for')
      ?.trim();

    if (!ip || !isIP(ip)) {
      throw new RegistrationApiError(
        503,
        'REGISTRATION_TEMPORARILY_UNAVAILABLE'
      );
    }

    return ip;
  }

  // Local emulator/development only.

  if (
    process.env.NODE_ENV !== 'production'
  ) {
    return '127.0.0.1';
  }

  throw new RegistrationApiError(
    503,
    'REGISTRATION_TEMPORARILY_UNAVAILABLE'
  );
}

export async function consumeEventRegistrationAttempt(
  request: Request,
  action: RateLimitAction
): Promise<void> {
  const secret =
    getEventRegistrationSecret();

  const ip =
    resolveClientIp(request);

  const key = createHmac('sha256', secret)
    .update(
      JSON.stringify([
        'event-rate-limit-v1',
        action,
        ip,
      ])
    )
    .digest('hex');

  const { adminDb } =
    getFirebaseAdmin();

  const ref = adminDb
    .collection(
      EVENT_REGISTRATION_RATE_LIMIT_COLLECTION
    )
    .doc(key);

  const allowed =
    await adminDb.runTransaction(async tx => {
      const snapshot = await tx.get(ref);

      const now = Date.now();

      const data = snapshot.data();

      if (
        snapshot.exists &&
        (
          !data ||
          !(data.expiresAt instanceof Timestamp) ||
          !Number.isSafeInteger(data.count) ||
          data.count < 0
        )
      ) {
        throw new Error(
          'INVALID_EVENT_RATE_LIMIT_STATE'
        );
      }

      const existingExpiry =
        data?.expiresAt instanceof Timestamp
          ? data.expiresAt.toMillis()
          : 0;

      const activeWindow =
        existingExpiry > now;

      const count =
        activeWindow ? data!.count : 0;

      if (count >= LIMITS[action]) {
        return false;
      }

      tx.set(ref, {
        count: count + 1,

        expiresAt: Timestamp.fromMillis(
          activeWindow
            ? existingExpiry
            : now + WINDOW_MS
        ),

        updatedAt: Timestamp.fromMillis(now),
      });

      return true;
    });

  if (!allowed) {
    throw new RegistrationApiError(
      429,
      'REGISTRATION_RATE_LIMIT_EXCEEDED'
    );
  }
}
