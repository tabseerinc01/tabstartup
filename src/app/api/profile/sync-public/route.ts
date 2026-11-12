import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/firebase/admin';
import { syncPublicProfile } from '@/services/public-profile.service';

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

  const token = authorization.slice(7).trim();

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { adminAuth } = getFirebaseAdmin();

    let uid: string;

    try {
      const decoded = await adminAuth.verifyIdToken(token, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json(
        { error: 'Invalid or expired authentication' },
        { status: 401 }
      );
    }

    const result = await syncPublicProfile(uid);

    return NextResponse.json({
      success: true,
      status: result.status,
    });
  } catch {
    console.error('Public profile synchronization failed');

    return NextResponse.json(
      { error: 'Profile synchronization failed' },
      { status: 500 }
    );
  }
}
