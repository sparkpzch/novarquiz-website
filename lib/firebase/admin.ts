import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

function loadServiceAccountFromKeyFile(): admin.ServiceAccount | null {
  const keyFile = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!keyFile) return null;
  const filePath = isAbsolute(keyFile) ? keyFile : resolve(process.cwd(), keyFile);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read FIREBASE_SERVICE_ACCOUNT_KEY file at ${filePath}:`, err);
    return null;
  }
}

function loadServiceAccountFromJsonEnv(): admin.ServiceAccount | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (err) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is set but not valid JSON:', err);
    return null;
  }
}

function getFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const serviceAccount = loadServiceAccountFromKeyFile() ?? loadServiceAccountFromJsonEnv();
  const credential = serviceAccount
    ? admin.credential.cert(serviceAccount)
    : admin.credential.applicationDefault();

  return admin.initializeApp({
    credential,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export const adminApp = getFirebaseAdmin();
export const adminAuth = admin.auth(adminApp);
export const adminDb = admin.firestore(adminApp);
export const adminStorage = admin.storage(adminApp);
