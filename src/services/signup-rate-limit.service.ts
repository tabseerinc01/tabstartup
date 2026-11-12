import 'server-only';

import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/firebase/admin';

function getMaxAttempts(): number {
  const raw = process.env.SIGNUP_RATE_LIMIT_MAX_ATTEMPTS ?? '5';

  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error('INVALID_RATE_LIMIT_CONFIGURATION');
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new Error('INVALID_RATE_LIMIT_CONFIGURATION');
  }

  return value;
}
const WINDOW_MS = 15 * 60 * 1000;

export async function consumeSignupAttempt(ip: string) {
  const maxAttempts = getMaxAttempts();
  if (!isIP(ip)) {
    throw new Error('INVALID_CLIENT_IP');
  }

  const secret = process.env.SIGNUP_RATE_LIMIT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('RATE_LIMIT_NOT_CONFIGURED');
  }

  const key = createHmac('sha256', secret)
    .update('signup:' + ip)
    .digest('hex');

  const { adminDb } = getFirebaseAdmin();

  const ref = adminDb.collection('signupRateLimits').doc(key);

  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const now = Date.now();

    const data = snapshot.data();

    const existingExpiry =
      data?.expiresAt instanceof Timestamp
        ? data.expiresAt.toMillis()
        : 0;

    const activeWindow = existingExpiry > now;

    const count = activeWindow
      ? Number(data?.count)
      : 0;

    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('INVALID_RATE_LIMIT_STATE');
    }

    const expiresAt = activeWindow
      ? existingExpiry
      : now + WINDOW_MS;

    if (count >= maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((expiresAt - now) / 1000)
        )
      };
    }

    transaction.set(ref, {
      count: count + 1,
      expiresAt: Timestamp.fromMillis(expiresAt),
      updatedAt: Timestamp.fromMillis(now)
    });

    return {
      allowed: true,
      remaining: maxAttempts - count - 1,
      retryAfterSeconds: 0
    };
  });
}
