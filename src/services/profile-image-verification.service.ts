import 'server-only';

import {
  validateProfileImageContent,
} from '@/services/profile-image-content-validation.service';

import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdmin } from '@/firebase/admin';

import {
  parseTrustedProfileImageReference,
  PROFILE_IMAGE_MAX_BYTES,
} from '@/lib/profile-image-validation';

const METADATA_TIMEOUT_MS = 10000;

async function withMetadataTimeout<T>(
  operation: Promise<T>
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error('PROFILE_IMAGE_METADATA_TIMEOUT')
          );
        }, METADATA_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export type ProfileImageVerificationResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'invalid_reference'
        | 'object_not_found'
        | 'invalid_metadata'
        | 'invalid_size'
        | 'invalid_content_type'
        | 'invalid_download_token'
        | 'invalid_image_content';
    };

/**
 * Verify an owner-scoped profile image against
 * trusted Firebase Storage metadata.
 *
 * Read-only metadata and image content verification.
 * Never creates objects or modifies metadata.
 */
export async function verifyTrustedProfileImage(
  value: unknown,
  uid: string
): Promise<ProfileImageVerificationResult> {
  const reference =
    parseTrustedProfileImageReference(value, uid);

  if (!reference) {
    return {
      valid: false,
      reason: 'invalid_reference',
    };
  }

  // Prevent accidental production Storage access
  // from Firestore/Auth emulator test environments.
  if (
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
    process.env.STORAGE_EMULATOR_HOST
  ) {
    throw new Error(
      'PROFILE_IMAGE_STORAGE_TEST_ADAPTER_REQUIRED'
    );
  }

  const { adminApp } = getFirebaseAdmin();

  const object = getStorage(adminApp)
    .bucket(reference.bucket)
    .file(reference.objectPath);

  let metadata;

  try {
    [metadata] = await withMetadataTimeout(
      object.getMetadata()
    );
  } catch (error: unknown) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? error.code
        : undefined;

    if (code === 404 || code === '404') {
      return {
        valid: false,
        reason: 'object_not_found',
      };
    }

    // Infrastructure failures must not be treated
    // as a confirmed invalid user image.
    throw new Error(
      'PROFILE_IMAGE_VERIFICATION_UNAVAILABLE'
    );
  }

  if (
    metadata.bucket !== reference.bucket ||
    metadata.name !== reference.objectPath
  ) {
    return {
      valid: false,
      reason: 'invalid_metadata',
    };
  }

  const size = Number(metadata.size);

  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > PROFILE_IMAGE_MAX_BYTES
  ) {
    return {
      valid: false,
      reason: 'invalid_size',
    };
  }

  const extension = reference.objectPath
    .split('.')
    .pop()
    ?.toLowerCase();

  const contentType = metadata.contentType;

  const validMime =
    (
      (extension === 'jpg' || extension === 'jpeg') &&
      (
        contentType === 'image/jpeg' ||
        contentType === 'image/jpg'
      )
    ) ||
    (
      extension === 'png' &&
      contentType === 'image/png'
    ) ||
    (
      extension === 'webp' &&
      contentType === 'image/webp'
    );

  if (!validMime) {
    return {
      valid: false,
      reason: 'invalid_content_type',
    };
  }

  const tokens =
    metadata.metadata?.firebaseStorageDownloadTokens;

  if (
    typeof tokens !== 'string' ||
    !tokens.split(',')
      .map(token => token.trim())
      .includes(reference.downloadToken)
  ) {
    return {
      valid: false,
      reason: 'invalid_download_token',
    };
  }

  if (
    metadata.contentEncoding &&
    metadata.contentEncoding !== 'identity'
  ) {
    return {
      valid: false,
      reason: 'invalid_metadata',
    };
  }

  const generation = metadata.generation;

  if (
    typeof generation !== 'string' ||
    !/^[0-9]+$/.test(generation)
  ) {
    return {
      valid: false,
      reason: 'invalid_metadata',
    };
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  const stream = object.bucket.file(
    reference.objectPath,
    { generation }
  ).createReadStream({
    decompress: false,
  });

  const timeout = setTimeout(() => {
    stream.destroy(
      new Error('PROFILE_IMAGE_DOWNLOAD_TIMEOUT')
    );
  }, 10000);

  try {
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.length;

      if (
        totalBytes > PROFILE_IMAGE_MAX_BYTES ||
        totalBytes > size
      ) {
        stream.destroy();

        return {
          valid: false,
          reason: 'invalid_size',
        };
      }

      chunks.push(buffer);
    }
  } catch {
    throw new Error(
      'PROFILE_IMAGE_VERIFICATION_UNAVAILABLE'
    );
  } finally {
    clearTimeout(timeout);
    stream.destroy();
  }

  if (totalBytes !== size) {
    return {
      valid: false,
      reason: 'invalid_size',
    };
  }

  const expectedFormat =
    extension === 'png' ? 'png' :
    extension === 'webp' ? 'webp' : 'jpeg';

  const validContent =
    await validateProfileImageContent(
      Buffer.concat(chunks, totalBytes),
      expectedFormat
    );

  if (!validContent) {
    return {
      valid: false,
      reason: 'invalid_image_content',
    };
  }

  return { valid: true };
}
