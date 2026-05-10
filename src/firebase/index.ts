'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

/**
 * Firebase ইনিশিয়ালাইজ করার ফাংশন। 
 * এটি সবসময় কনফিগারেশন অবজেক্ট ব্যবহার করে যাতে ভেরসেল বা অন্য যেকোনো হোস্টিংয়ে 
 * ডিপ্লয়মেন্টের সময় 'app/no-options' এরর না আসে।
 */
export function initializeFirebase() {
  const firebaseApp = getApps().length === 0 
    ? initializeApp(firebaseConfig) 
    : getApp();
    
  return getSdks(firebaseApp);
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
    storage: getStorage(firebaseApp)
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
