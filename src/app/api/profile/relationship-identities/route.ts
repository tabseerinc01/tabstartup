import { NextResponse } from 'next/server';

import {
  getRelationshipIdentities,
} from '@/services/relationship-identity.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Authorization',
};

function respond(
  body: unknown,
  status: number
) {
  return NextResponse.json(body, {
    status,
    headers,
  });
}

export async function POST(request: Request) {
  const authorization =
    request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return respond({ error: 'UNAUTHENTICATED' }, 401);
  }

  const token = authorization.slice(7).trim();

  if (!token || token.length > 16384) {
    return respond({ error: 'UNAUTHENTICATED' }, 401);
  }

  const contentLength =
    request.headers.get('content-length');

  if (contentLength !== null) {
    const declaredSize = Number(contentLength);

    if (
      !Number.isSafeInteger(declaredSize) ||
      declaredSize < 0
    ) {
      return respond({ error: 'INVALID_REQUEST' }, 400);
    }

    if (declaredSize > 8192) {
      return respond({ error: 'PAYLOAD_TOO_LARGE' }, 413);
    }
  }

  let body: unknown;

  try {
    const reader = request.body?.getReader();

    if (!reader) {
      return respond({ error: 'INVALID_REQUEST' }, 400);
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        totalBytes += value.byteLength;

        if (totalBytes > 8192) {
          await reader.cancel().catch(() => undefined);
          return respond({ error: 'PAYLOAD_TOO_LARGE' }, 413);
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    try {
      body = JSON.parse(
        Buffer.concat(chunks).toString('utf8')
      );
    } catch {
      return respond({ error: 'INVALID_REQUEST' }, 400);
    }
  } catch {
    return respond({
      error: 'REQUEST_BODY_UNAVAILABLE',
    }, 503);
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Reflect.ownKeys(body).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(body, 'contexts')
  ) {
    return respond({ error: 'INVALID_REQUEST' }, 400);
  }

  const contexts = (body as { contexts: unknown }).contexts;

  try {
    const results = await getRelationshipIdentities(
      token,
      contexts
    );

    return respond({
      success: true,
      results,
    }, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '';

    if (message === 'UNAUTHENTICATED') {
      return respond({ error: message }, 401);
    }

    if (message === 'INVALID_RELATIONSHIP_CONTEXT') {
      return respond({ error: message }, 400);
    }

    if (message === 'PORTAL_ACCESS_DENIED') {
      return respond({ error: message }, 403);
    }

    console.error('Relationship identity resolution failed');

    return respond({
      error: 'RELATIONSHIP_IDENTITY_UNAVAILABLE',
    }, 503);
  }
}
