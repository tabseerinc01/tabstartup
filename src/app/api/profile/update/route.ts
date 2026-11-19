import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/firebase/admin';
import { updateOwnProfile } from '@/services/profile-mutation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  let uid: string;

  try {
    const { adminAuth } = getFirebaseAdmin();
    const token = authorization.slice(7).trim();

    const decoded = await adminAuth.verifyIdToken(token, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (Buffer.byteLength(raw, 'utf8') > 131072) {
      return NextResponse.json(
        { error: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      );
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  try {
    const result = await updateOwnProfile(uid, body);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (
      message === 'INVALID_PROFILE_UPDATE' ||
      message === 'INVALID_PROFILE_IMAGE'
    ) {
      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }

    if (message === 'USER_NOT_FOUND') {
      return NextResponse.json(
        { error: message },
        { status: 404 }
      );
    }

    if (
      message === 'ACCOUNT_NOT_ACTIVE' ||
      message === 'USER_SUSPENDED' ||
      message === 'INVALID_STARTUP_PROFILE' ||
      message === 'INVALID_ACCOUNT_IDENTITY'
    ) {
      return NextResponse.json(
        { error: message },
        { status: 403 }
      );
    }

    if (
      message === 'PROFILE_IMAGE_VERIFICATION_UNAVAILABLE' ||
      message === 'PROFILE_IMAGE_STORAGE_TEST_ADAPTER_REQUIRED'
    ) {
      return NextResponse.json(
        { error: 'PROFILE_IMAGE_VERIFICATION_UNAVAILABLE' },
        {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    console.error('Profile update failed');

    return NextResponse.json(
      { error: 'PROFILE_UPDATE_FAILED' },
      { status: 500 }
    );
  }
}
