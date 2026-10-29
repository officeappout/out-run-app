// @ts-nocheck -- standalone tsx script
/**
 * firebase-admin bootstrap shared by the content pipeline scripts. Project appout-1 (production).
 * Credentials: --service-account <file>, else FIREBASE_SERVICE_ACCOUNT_KEY (JSON), else GOOGLE_APPLICATION_CREDENTIALS / gcloud application-default login.
 * Only export-exercises.ts (read) and apply-import.ts (guarded write) import this file.
 */
import fs from 'fs';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function argOf(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function adminDb() {
  if (!getApps().length) {
    const sa = argOf('--service-account');
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const credential = sa ? cert(JSON.parse(fs.readFileSync(sa, 'utf8'))) : envKey ? cert(JSON.parse(envKey)) : applicationDefault();
    initializeApp({ credential, projectId: 'appout-1' });
  }
  return getFirestore();
}
