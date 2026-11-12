import 'server-only';

import {
  applicationDefault,
  getApps,
  initializeApp,
} from 'firebase-admin/app';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function getFirebaseAdmin() {
  const appName = 'tabstartup-admin';

  const app =
    getApps().find((existing) => existing.name === appName) ??
    initializeApp(
      {
        credential: applicationDefault(),
      },
      appName
    );

  return {
    adminApp: app,
    adminAuth: getAuth(app),
    adminDb: getFirestore(app),
  };
}
