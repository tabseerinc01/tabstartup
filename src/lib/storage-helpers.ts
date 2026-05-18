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
  const timestamp = Date.now();
  const fileExtension = file.name.split('.').pop();
  const path = `profile-images/${uid}/${timestamp}.${fileExtension}`;
  const storageRef = ref(storage, path);
  
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(progress);
      },
      (error) => reject(error),
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadURL);
      }
    );
  });
}