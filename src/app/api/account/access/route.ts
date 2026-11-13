import { NextResponse } from 'next/server';

import {
  authenticateAccount,
} from '@/services/account-authorization.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Authorization',
};

export async function GET(request: Request) {
  const authorization =
    request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED' },
      { status: 401, headers }
    );
  }

  const idToken = authorization.slice(7).trim();

  if (!idToken || idToken.length > 16384) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED' },
      { status: 401, headers }
    );
  }

  try {
    const account = await authenticateAccount(idToken);

    return NextResponse.json(
      {
        uid: account.uid,
        status: account.identity.status,
        emailVerified: account.emailVerified,
        profiles: account.identity.profiles,
        startupRoles: account.startupRoles,
        isAdmin: account.isAdmin,
        eventOrganizerVerificationStatus:
          account.eventOrganizerVerificationStatus,
        portals: account.portals,
      },
      { status: 200, headers }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'UNAUTHENTICATED'
    ) {
      return NextResponse.json(
        { error: 'UNAUTHENTICATED' },
        { status: 401, headers }
      );
    }

    console.error('Account access resolution failed');

    return NextResponse.json(
      { error: 'ACCOUNT_ACCESS_UNAVAILABLE' },
      { status: 503, headers }
    );
  }
}
