import 'server-only';

export async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('INVALID_BODY_LIMIT');
  }

  const contentType = request.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase();

  if (contentType !== 'application/json') {
    throw new Error('INVALID_CONTENT_TYPE');
  }

  const contentLength = request.headers.get('content-length');

  if (contentLength !== null) {
    const declaredSize = Number(contentLength);

    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) {
      throw new Error('INVALID_CONTENT_LENGTH');
    }

    if (declaredSize > maxBytes) {
      throw new Error('REQUEST_TOO_LARGE');
    }
  }

  if (!request.body) {
    throw new Error('EMPTY_REQUEST_BODY');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('REQUEST_TOO_LARGE');
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new Error('EMPTY_REQUEST_BODY');
  }

  const raw = Buffer.concat(chunks, totalBytes);

  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(raw)
    );
  } catch {
    throw new Error('INVALID_JSON');
  }
}
