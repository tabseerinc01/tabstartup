import 'server-only';

import { isIP } from 'node:net';

export function getTrustedClientIp(request: Request): string {
  if (process.env.VERCEL === '1') {
    const ip = request.headers
      .get('x-vercel-forwarded-for')
      ?.trim();

    if (!ip || !isIP(ip)) {
      throw new Error('TRUSTED_CLIENT_IP_UNAVAILABLE');
    }

    return ip;
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080' &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST === '127.0.0.1:9099'
  ) {
    return '127.0.0.1';
  }

  throw new Error('UNTRUSTED_RUNTIME');
}
