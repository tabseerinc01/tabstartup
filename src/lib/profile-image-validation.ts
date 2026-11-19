import {
  isValidProfessionalProfileUid,
} from '@/lib/professional-profile-validation';

export const PROFILE_IMAGE_BUCKET =
  'studio-3911951123-2080a.firebasestorage.app';

export const PROFILE_IMAGE_MAX_BYTES =
  5 * 1024 * 1024;

export const PROFILE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export interface TrustedProfileImageReference {
  bucket: string;
  objectPath: string;
  downloadToken: string;
}

/**
 * Validate the reference format and owner namespace.
 *
 * This does not prove that the object exists,
 * that its token is valid, or that its bytes
 * contain a safe image.
 */
export function parseTrustedProfileImageReference(
  value: unknown,
  uid: string
): TrustedProfileImageReference | null {
  if (
    !isValidProfessionalProfileUid(uid) ||
    typeof value !== 'string' ||
    value.length > 2048 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.origin !==
        'https://firebasestorage.googleapis.com' ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return null;
    }

    const prefix =
      '/v0/b/' + PROFILE_IMAGE_BUCKET + '/o/';

    if (!url.pathname.startsWith(prefix)) {
      return null;
    }

    const encodedPath =
      url.pathname.slice(prefix.length);

    if (!encodedPath || encodedPath.includes('/')) {
      return null;
    }

    const objectPath = decodeURIComponent(encodedPath);

    const ownerPrefix =
      'profile-images/' + uid + '/';

    if (!objectPath.startsWith(ownerPrefix)) {
      return null;
    }

    const fileName =
      objectPath.slice(ownerPrefix.length);

    if (
      !/^[0-9]{13}\.(jpg|jpeg|png|webp)$/i.test(fileName)
    ) {
      return null;
    }

    const keys = Array.from(url.searchParams.keys());

    if (
      keys.length !== 2 ||
      url.searchParams.getAll('alt').length !== 1 ||
      url.searchParams.getAll('token').length !== 1 ||
      url.searchParams.get('alt') !== 'media'
    ) {
      return null;
    }

    const downloadToken =
      url.searchParams.get('token');

    if (
      !downloadToken ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(downloadToken)
    ) {
      return null;
    }

    return {
      bucket: PROFILE_IMAGE_BUCKET,
      objectPath,
      downloadToken,
    };
  } catch {
    return null;
  }
}

export function isTrustedProfileImageReference(
  value: unknown,
  uid: string
): boolean {
  return parseTrustedProfileImageReference(
    value,
    uid
  ) !== null;
}
