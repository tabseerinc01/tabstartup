import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/firebase/admin';
import { setUserSuspension } from '@/services/public-profile.service';

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
    const { adminAuth, adminDb } = getFirebaseAdmin();

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

    const adminSnap = await adminDb
      .collection('users')
      .doc(decoded.uid)
      .get();

    const profile = adminSnap.data();

    const roles = Array.isArray(profile?.roles)
      ? profile.roles
      : [];

    const isAdmin =
      decoded.uid === 'T2JnkPYdsoZGO8krUqcP3T5bvg62' ||
      (
        decoded.email_verified === true &&
        decoded.email === 'shahmubaruk05@gmail.com'
      ) ||
      ['admin', 'super_admin'].includes(profile?.role) ||
      roles.some(role =>
        ['admin', 'super_admin'].includes(role)
      );

    if (!isAdmin || profile?.status === 'suspended') {
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

    const uid = body?.uid;
    const suspended = body?.suspended;

    if (
      typeof uid !== 'string' ||
      !uid ||
      uid.length > 128 ||
      uid.includes('/') ||
      typeof suspended !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'Invalid suspension request' },
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

    const result = await setUserSuspension(uid, suspended);

    return NextResponse.json({
      success: true,
      status: result.status,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'USER_NOT_FOUND'
    ) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    console.error('Admin suspension operation failed');

    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    );
  }
}
