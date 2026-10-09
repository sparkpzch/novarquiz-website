// scripts/admin/set-admin.ts
// Usage: npm run set-admin -- --email=user@example.com

import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

const args = process.argv.slice(2);
const emailArg = args.find((a) => a.startsWith('--email='));

if (!emailArg) {
  console.error('Usage: npm run set-admin -- --email=user@example.com');
  process.exit(1);
}

const email = emailArg.split('=')[1];

// Load service account
const keyFile = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || 'novartis-decisionlab-firebase-adminsdk-fbsvc-5a3233811b.json';
const resolvedPath = path.resolve(process.cwd(), keyFile);
const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function setAdmin() {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
    console.log(`✅ Successfully set admin claims for ${email} (UID: ${user.uid})`);
    console.log('The user needs to sign out and sign back in for changes to take effect.');
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

setAdmin();
