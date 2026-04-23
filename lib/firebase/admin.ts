import admin from 'firebase-admin';

function getFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  let credential: admin.credential.Credential;
  if (serviceAccountJson) {
    try {
      credential = admin.credential.cert(JSON.parse(serviceAccountJson));
    } catch (err) {
      console.error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is set but not valid JSON — falling back to application default credentials.',
        err,
      );
      credential = admin.credential.applicationDefault();
    }
  } else {
    credential = admin.credential.applicationDefault();
  }

  return admin.initializeApp({
    credential,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export const adminApp = getFirebaseAdmin();
export const adminAuth = admin.auth(adminApp);
export const adminDb = admin.firestore(adminApp);
