import 'server-only';

import sharp from 'sharp';

import {
  PROFILE_IMAGE_MAX_BYTES,
} from '@/lib/profile-image-validation';

const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_IMAGE_DIMENSION = 8192;

/**
 * Validate actual image bytes and force full decoding.
 * Reject unsupported, oversized and animated images.
 */
export async function validateProfileImageContent(
  bytes: Buffer,
  expectedFormat: 'jpeg' | 'png' | 'webp'
): Promise<boolean> {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length === 0 ||
    bytes.length > PROFILE_IMAGE_MAX_BYTES
  ) {
    return false;
  }

  try {
    const image = sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    });

    const metadata = await image.metadata();

    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION ||
      metadata.width * metadata.height >
        MAX_IMAGE_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      return false;
    }

    // Force decoding rather than trusting headers.
    // Decode the complete image without resize shortcuts.
    await image
      .toColourspace('srgb')
      .raw()
      .toBuffer();

    return true;
  } catch {
    return false;
  }
}
