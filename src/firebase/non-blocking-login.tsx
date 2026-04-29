
'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

/** 
 * Initiate anonymous sign-in (non-blocking). 
 * Note: These helpers fire and forget. Catch errors in the calling component 
 * if UI feedback for failure is required.
 */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  signInAnonymously(authInstance).catch(() => {});
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string): void {
  createUserWithEmailAndPassword(authInstance, email, password).catch(() => {});
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  signInWithEmailAndPassword(authInstance, email, password).catch(() => {});
}

/** Initiate sign-out (non-blocking). */
export function initiateSignOut(authInstance: Auth): void {
  signOut(authInstance).catch(() => {});
}
