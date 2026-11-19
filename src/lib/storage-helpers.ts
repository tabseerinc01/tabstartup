'use client';

import { ref, uploadBytesResumable, getDownloadURL, FirebaseStorage } from 'firebase/storage';

/**
 * Validates a file for image type and size.
 * @param file The file to validate.
 * @returns { error?: string } Validation result.
 */
export function validateImage(file: File) {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { error: 'Invalid format. Please upload JPEG, PNG, or WebP.' };
  }
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size <= 0) {
    return { error: 'Empty image files are not allowed.' };
  }

  if (file.size > maxSize) {
    return { error: 'File too large. Maximum size is 5MB.' };
  }
  return {};
}

/**
 * Handles uploading a profile image to Firebase Storage.
 * @param storage Firebase Storage instance.
 * @param uid User's unique identifier.
 * @param file The file to upload.
 * @param onProgress Optional callback for progress tracking.
 * @returns Promise that resolves to the download URL.
 */
export async function uploadProfileImage(
  storage: FirebaseStorage,
  uid: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  const validation = validateImage(file);

  if (validation.error) {
    throw new Error(validation.error);
  }

  const timestamp = Date.now();

  const fileExtension =
    file.type === 'image/png' ? 'png' :
    file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `profile-images/${uid}/${timestamp}.${fileExtension}`;
  const storageRef = ref(storage, path);
  
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType:
      fileExtension === 'jpg' ? 'image/jpeg' : file.type,
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(progress);
      },
      (error) => reject(error),
      async () => {
        try {
          const downloadURL = await getDownloadURL(
            uploadTask.snapshot.ref
          );

          resolve(downloadURL);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}