import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/firebase/admin';

import {
  resolveAccountAuthorization,
} from '@/services/account-authorization.service';
import { setUserProfessionalRole } from '@/services/public-profile.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { adminAuth } = getFirebaseAdmin();

    let decoded;

    try {
      decoded = await adminAuth.verifyIdToken(
        authorization.slice(7).trim(),
        true
      );
    } catch {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const account = await resolveAccountAuthorization(
      decoded.uid,
      {
        email: decoded.email,
        emailVerified: decoded.email_verified === true,
      }
    );

    if (!account.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const { uid, role, enabled } = body ?? {};

    if (
      typeof uid !== 'string' ||
      !uid ||
      uid.length > 128 ||
      uid.includes('/') ||
      !['founder', 'investor', 'mentor'].includes(role) ||
      typeof enabled !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'Invalid role request' },
        { status: 400 }
      );
    }

    if (
      uid === decoded.uid ||
      uid === 'T2JnkPYdsoZGO8krUqcP3T5bvg62'
    ) {
      return NextResponse.json(
        { error: 'Protected account' },
        { status: 403 }
      );
    }

    const target = await adminAuth.getUser(uid);

    if (
      target.emailVerified &&
      target.email === 'shahmubaruk05@gmail.com'
    ) {
      return NextResponse.json(
        { error: 'Protected account' },
        { status: 403 }
      );
    }

    const result = await setUserProfessionalRole(
      uid,
      role,
      enabled
    );

    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error) {
    const authErrorCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? error.code
        : undefined;

    if (authErrorCode === 'auth/user-not-found') {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (error instanceof Error) {
      if (error.message === 'ACCOUNT_NOT_ACTIVE') {
        return NextResponse.json(
          { error: 'ACCOUNT_NOT_ACTIVE' },
          { status: 403 }
        );
      }

      if (error.message === 'USER_NOT_FOUND') {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      if (error.message === 'LAST_PROFESSIONAL_ROLE') {
        return NextResponse.json(
          { error: 'Cannot remove the last professional role' },
          { status: 409 }
        );
      }
    }

    console.error('Admin professional role operation failed');

    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    );
  }
}
