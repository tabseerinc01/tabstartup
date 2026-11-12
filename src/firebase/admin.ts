import 'server-only';

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'studio-3911951123-2080a';

export function getFirebaseAdmin() {
  const appName = 'tabstartup-admin';

  let app = getApps().find(
    (existing) => existing.name === appName
  );

  if (!app) {
    const emulatorEnabled =
      !!process.env.FIRESTORE_EMULATOR_HOST ||
      !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

    if (emulatorEnabled) {
      if (
        process.env.VERCEL === '1' ||
        process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
        process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
      ) {
        throw new Error('INVALID_EMULATOR_CONFIGURATION');
      }

      app = initializeApp(
        { projectId: 'demo-tabstartup' },
        appName
      );
    } else {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

      if (process.env.VERCEL === '1' && !raw) {
        throw new Error('FIREBASE_ADMIN_NOT_CONFIGURED');
      }

      const account = raw ? JSON.parse(raw) : null;

      if (account && account.project_id !== PROJECT_ID) {
        throw new Error('FIREBASE_PROJECT_MISMATCH');
      }

      app = initializeApp(
        {
          projectId: PROJECT_ID,
          credential: account
            ? cert(account)
            : applicationDefault(),
        },
        appName
      );
    }
  }

  return {
    adminApp: app,
    adminAuth: getAuth(app),
    adminDb: getFirestore(app),
  };
}
