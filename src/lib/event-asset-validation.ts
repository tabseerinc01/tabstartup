/**
 * TabStartup Event Asset Security Foundation.
 *
 * Release A: Admin-managed official events.
 *
 * This module validates asset categories,
 * identifiers, size and image signatures.
 *
 * Signature checks are preliminary.
 * Full image decoding and safe re-encoding
 * are required before production uploads.
 */

import 'server-only';

import { randomUUID } from 'node:crypto';

export const EVENT_ASSET_ROOT =
  'event-assets' as const;

export const EVENT_ASSET_CATEGORIES = [
  'banners',
  'speakers',
  'sponsors',
] as const;

export type EventAssetCategory =
  typeof EVENT_ASSET_CATEGORIES[number];

export type EventAssetVisibility =
  | 'private'
  | 'public';

export type EventAssetMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

export type EventAssetExtension =
  | 'jpg'
  | 'png'
  | 'webp';

export const EVENT_ASSET_SIZE_LIMITS = {
  banners: 5 * 1024 * 1024,
  speakers: 2 * 1024 * 1024,
  sponsors: 2 * 1024 * 1024,
} as const satisfies Record<
  EventAssetCategory,
  number
>;

export const EVENT_ASSET_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const satisfies Record<
  EventAssetMimeType,
  EventAssetExtension
>;

/**
 * Proposed decoder limits.
 *
 * These limits must be enforced by the
 * actual image processing service.
 */
export const EVENT_ASSET_IMAGE_LIMITS = {
  maxWidth: 6000,
  maxHeight: 6000,
  maxPixels: 24_000_000,
} as const;

export interface ValidatedEventAsset {
  category: EventAssetCategory;
  mimeType: EventAssetMimeType;
  extension: EventAssetExtension;
  sizeBytes: number;
}

export interface EventAssetPaths {
  assetId: string;
  eventId: string;
  category: EventAssetCategory;
  fileName: string;
  privatePath: string;
  publicPath: string;
}

export type EventAssetValidationErrorCode =
  | 'INVALID_EVENT_ASSET_CATEGORY'
  | 'INVALID_EVENT_ASSET_ID'
  | 'INVALID_EVENT_ASSET_VISIBILITY'
  | 'INVALID_EVENT_ASSET_MIME_TYPE'
  | 'INVALID_EVENT_ASSET_BYTES'
  | 'EVENT_ASSET_TOO_LARGE'
  | 'UNSUPPORTED_EVENT_IMAGE_FORMAT'
  | 'EVENT_ASSET_MIME_MISMATCH'
  | 'INVALID_EVENT_IMAGE_DIMENSIONS'
  | 'INVALID_EVENT_ASSET_EXTENSION';

export class EventAssetValidationError
  extends Error {

  readonly code:
    EventAssetValidationErrorCode;

  constructor(
    code: EventAssetValidationErrorCode
  ) {
    super(code);

    this.name =
      'EventAssetValidationError';

    this.code = code;
  }
}

export function isEventAssetCategory(
  value: unknown
): value is EventAssetCategory {
  return (
    value === 'banners' ||
    value === 'speakers' ||
    value === 'sponsors'
  );
}

export function isEventAssetVisibility(
  value: unknown
): value is EventAssetVisibility {
  return (
    value === 'private' ||
    value === 'public'
  );
}

export function isEventAssetMimeType(
  value: unknown
): value is EventAssetMimeType {
  return (
    value === 'image/jpeg' ||
    value === 'image/png' ||
    value === 'image/webp'
  );
}

export function isValidEventAssetId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    !/[^A-Za-z0-9_-]/.test(value)
  );
}

function isEventAssetExtension(
  value: unknown
): value is EventAssetExtension {
  return (
    value === 'jpg' ||
    value === 'png' ||
    value === 'webp'
  );
}

function hasBytesAt(
  bytes: Uint8Array,
  offset: number,
  signature: readonly number[]
): boolean {
  if (
    bytes.length <
      offset + signature.length
  ) {
    return false;
  }

  return signature.every(
    (byte, index) =>
      bytes[offset + index] === byte
  );
}

/**
 * Preliminary image signature detection.
 *
 * This does not prove the file is a
 * complete, valid or safe image.
 */
export function detectEventImageMimeType(
  bytes: Uint8Array
): EventAssetMimeType | null {
  if (!(bytes instanceof Uint8Array)) {
    return null;
  }

  // JPEG start-of-image marker.
  if (
    bytes.length >= 4 &&
    hasBytesAt(
      bytes,
      0,
      [0xff, 0xd8, 0xff]
    )
  ) {
    return 'image/jpeg';
  }

  // PNG signature.
  if (
    bytes.length >= 24 &&
    hasBytesAt(
      bytes,
      0,
      [
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
      ]
    ) &&
    hasBytesAt(
      bytes,
      12,
      [0x49, 0x48, 0x44, 0x52]
    )
  ) {
    return 'image/png';
  }

  // WebP RIFF container.
  if (
    bytes.length >= 20 &&
    hasBytesAt(
      bytes,
      0,
      [0x52, 0x49, 0x46, 0x46]
    ) &&
    hasBytesAt(
      bytes,
      8,
      [0x57, 0x45, 0x42, 0x50]
    )
  ) {
    const validChunk =
      hasBytesAt(
        bytes,
        12,
        [0x56, 0x50, 0x38, 0x20]
      ) ||
      hasBytesAt(
        bytes,
        12,
        [0x56, 0x50, 0x38, 0x4c]
      ) ||
      hasBytesAt(
        bytes,
        12,
        [0x56, 0x50, 0x38, 0x58]
      );

    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    );

    const declaredSize =
      view.getUint32(4, true) + 8;

    if (
      validChunk &&
      declaredSize === bytes.length
    ) {
      return 'image/webp';
    }
  }

  return null;
}

/**
 * Preliminary validation of bounded
 * server-received image bytes.
 *
 * Do not upload these bytes directly.
 * A trusted image decoder must verify
 * and safely re-encode the image first.
 */
export function validateEventAssetBytes(
  category: unknown,
  declaredMimeType: unknown,
  bytes: Uint8Array
): ValidatedEventAsset {
  if (!isEventAssetCategory(category)) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_ASSET_CATEGORY'
    );
  }

  if (
    !isEventAssetMimeType(
      declaredMimeType
    )
  ) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_ASSET_MIME_TYPE'
    );
  }

  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0
  ) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_ASSET_BYTES'
    );
  }

  if (
    bytes.byteLength >
      EVENT_ASSET_SIZE_LIMITS[category]
  ) {
    throw new EventAssetValidationError(
      'EVENT_ASSET_TOO_LARGE'
    );
  }

  const detectedMimeType =
    detectEventImageMimeType(bytes);

  if (!detectedMimeType) {
    throw new EventAssetValidationError(
      'UNSUPPORTED_EVENT_IMAGE_FORMAT'
    );
  }

  if (
    detectedMimeType !== declaredMimeType
  ) {
    throw new EventAssetValidationError(
      'EVENT_ASSET_MIME_MISMATCH'
    );
  }

  return {
    category,
    mimeType: detectedMimeType,
    extension:
      EVENT_ASSET_EXTENSIONS[
        detectedMimeType
      ],
    sizeBytes: bytes.byteLength,
  };
}

/**
 * Validate trusted decoder dimensions.
 *
 * The caller must supply dimensions
 * obtained from the actual image decoder,
 * not client-provided metadata.
 */
export function assertEventImageDimensions(
  width: unknown,
  height: unknown
): void {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width >
      EVENT_ASSET_IMAGE_LIMITS.maxWidth ||
    height >
      EVENT_ASSET_IMAGE_LIMITS.maxHeight ||
    width * height >
      EVENT_ASSET_IMAGE_LIMITS.maxPixels
  ) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_IMAGE_DIMENSIONS'
    );
  }
}

/**
 * Build a controlled Storage path.
 *
 * No client-provided file paths,
 * original filenames or directory
 * traversal segments are accepted.
 */
export function buildEventAssetPath(
  visibility: unknown,
  eventId: unknown,
  category: unknown,
  assetId: unknown,
  extension: unknown
): string {
  if (
    !isEventAssetVisibility(visibility)
  ) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_ASSET_VISIBILITY'
    );
  }

  if (
    !isValidEventAssetId(eventId) ||
    !isValidEventAssetId(assetId)
  ) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_ASSET_ID'
    );
  }

  if (!isEventAssetCategory(category)) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_ASSET_CATEGORY'
    );
  }

  if (!isEventAssetExtension(extension)) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_ASSET_EXTENSION'
    );
  }

  const fileName =
    `${assetId}.${extension}`;

  if (fileName.length > 128) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_ASSET_ID'
    );
  }

  return [
    EVENT_ASSET_ROOT,
    visibility,
    eventId,
    category,
    fileName,
  ].join('/');
}

/**
 * Generate a new server-controlled
 * asset identity and its private
 * and potential public paths.
 *
 * This function performs no upload
 * and grants no publishing permission.
 */
export function createEventAssetPaths(
  eventId: string,
  category: EventAssetCategory,
  mimeType: EventAssetMimeType
): EventAssetPaths {
  if (!isEventAssetMimeType(mimeType)) {
    throw new EventAssetValidationError(
      'INVALID_EVENT_ASSET_MIME_TYPE'
    );
  }

  const assetId = randomUUID();

  const extension =
    EVENT_ASSET_EXTENSIONS[mimeType];

  const privatePath =
    buildEventAssetPath(
      'private',
      eventId,
      category,
      assetId,
      extension
    );

  const publicPath =
    buildEventAssetPath(
      'public',
      eventId,
      category,
      assetId,
      extension
    );

  return {
    assetId,
    eventId,
    category,
    fileName:
      `${assetId}.${extension}`,
    privatePath,
    publicPath,
  };
}
