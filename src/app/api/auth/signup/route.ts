import { NextResponse } from 'next/server';
import { getTrustedClientIp } from '@/lib/trusted-client-ip';
import { readBoundedJson } from '@/lib/bounded-request-body';
import { consumeSignupAttempt } from '@/services/signup-rate-limit.service';

import { getFirebaseAdmin } from '@/firebase/admin';
import { validateSignup } from '@/lib/signup-validation';
import { createSignupProfile } from '@/services/signup.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function respond(
  body: Record<string, unknown>,
  status: number
) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function POST(request: Request) {
  try {
    const ip = getTrustedClientIp(request);
    const limit = await consumeSignupAttempt(ip);

    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'SIGNUP_RATE_LIMIT_EXCEEDED' },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(limit.retryAfterSeconds)
          }
        }
      );
    }
  } catch {
    console.error('[signup] Security verification unavailable');

    return respond(
      { error: 'SIGNUP_TEMPORARILY_UNAVAILABLE' },
      503
    );
  }

  let input: ReturnType<typeof validateSignup>;

  try {
    const raw = await readBoundedJson(request, 8192);
    input = validateSignup(raw);
  } catch (error: unknown) {
    const code = error instanceof Error
      ? error.message
      : '';

    if (code === 'REQUEST_TOO_LARGE') {
      return respond({ error: code }, 413);
    }

    if (code === 'INVALID_CONTENT_TYPE') {
      return respond({ error: code }, 415);
    }

    return respond({ error: 'INVALID_SIGNUP_INPUT' }, 400);
  }

  let createdUid: string | null = null;

  try {
    const { adminAuth } = getFirebaseAdmin();

    const account = await adminAuth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.fullName,
      emailVerified: false,
      disabled: false
    });

    createdUid = account.uid;

    const result = await createSignupProfile(account.uid, {
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      referralCode: input.referralCode
    });

    return respond({
      success: true,
      uid: result.uid,
      referralApplied: result.referralApplied
    }, 201);

  } catch (error: unknown) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? String(error.code)
        : '';

    if (!createdUid && code === 'auth/email-already-exists') {
      return respond({
        error: 'ACCOUNT_ALREADY_EXISTS'
      }, 409);
    }

    if (createdUid) {
      console.error(
        '[signup] Profile initialization incomplete',
        { uid: createdUid }
      );

      return respond({
        error: 'RECOVERY_VERIFICATION_REQUIRED'
      }, 503);
    }

    console.error('[signup] Account creation failed');

    return respond({
      error: 'SIGNUP_FAILED'
    }, 500);
  }
}
