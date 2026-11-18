import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/firebase/admin';
import { activateOwnProfessionalRole } from '@/services/profile-mutation.service';

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

    const decoded = await adminAuth.verifyIdToken(
      authorization.slice(7).trim(),
      true
    );

    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  let role: unknown;

  try {
    const raw = await request.text();

    if (Buffer.byteLength(raw, 'utf8') > 1024) {
      return NextResponse.json(
        { error: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      );
    }

    const body = JSON.parse(raw);

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(body, 'role')
    ) {
      throw new Error('INVALID_REQUEST');
    }

    role = body.role;
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  try {
    const result = await activateOwnProfessionalRole(uid, role);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    const statuses: Record<string, number> = {
      INVALID_ROLE: 400,
      USER_NOT_FOUND: 404,
      ACCOUNT_NOT_ACTIVE: 403,
      USER_SUSPENDED: 403,
      INVALID_STARTUP_PROFILE: 403,
      INVALID_ACCOUNT_IDENTITY: 403,
    };

    if (Object.prototype.hasOwnProperty.call(statuses, message)) {
      return NextResponse.json(
        { error: message },
        { status: statuses[message] }
      );
    }

    console.error('Professional role activation failed');

    return NextResponse.json(
      { error: 'ROLE_ACTIVATION_FAILED' },
      { status: 500 }
    );
  }
}
