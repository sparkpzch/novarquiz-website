import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

type RawServiceAccount = Partial<admin.ServiceAccount> & {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function normalizeServiceAccount(raw: RawServiceAccount): admin.ServiceAccount | null {
  const projectId = raw.projectId ?? raw.project_id;
  const clientEmail = raw.clientEmail ?? raw.client_email;
  const privateKey = (raw.privateKey ?? raw.private_key)?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      'Firebase service account is missing one or more required fields: project_id/projectId, client_email/clientEmail, private_key/privateKey.',
    );
    return null;
  }

  return { projectId, clientEmail, privateKey };
}

function parseServiceAccountJson(raw: string, source: string): admin.ServiceAccount | null {
  try {
    const parsed = JSON.parse(raw) as RawServiceAccount;
    return normalizeServiceAccount(parsed);
  } catch (err) {
    console.error(`${source} is set but not valid JSON:`, err);
    return null;
  }
}

function loadServiceAccountFromKeyFile(): admin.ServiceAccount | null {
  const keyFile = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!keyFile) return null;
  const filePath = isAbsolute(keyFile) ? keyFile : resolve(process.cwd(), keyFile);
  try {
    return parseServiceAccountJson(
      readFileSync(filePath, 'utf8'),
      `FIREBASE_SERVICE_ACCOUNT_KEY file at ${filePath}`,
    );
  } catch (err) {
    console.error(`Failed to read FIREBASE_SERVICE_ACCOUNT_KEY file at ${filePath}:`, err);
    return null;
  }
}

function loadServiceAccountFromJsonEnv(): admin.ServiceAccount | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!json) return null;
  return parseServiceAccountJson(json, 'FIREBASE_SERVICE_ACCOUNT_JSON');
}

function loadServiceAccountFromBase64Env(): admin.ServiceAccount | null {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (!encoded) return null;
  try {
    return parseServiceAccountJson(
      Buffer.from(encoded, 'base64').toString('utf8'),
      'FIREBASE_SERVICE_ACCOUNT_JSON_BASE64',
    );
  } catch (err) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64:', err);
    return null;
  }
}

function canUseApplicationDefaultCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE ||
      process.env.FUNCTION_TARGET ||
      process.env.GAE_ENV,
  );
}

function getCredential() {
  const serviceAccount =
    loadServiceAccountFromJsonEnv() ??
    loadServiceAccountFromBase64Env() ??
    loadServiceAccountFromKeyFile();

  if (serviceAccount) {
    return admin.credential.cert(serviceAccount);
  }

  if (canUseApplicationDefaultCredentials()) {
    return admin.credential.applicationDefault();
  }

  throw new Error(
    'Firebase Admin SDK credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (recommended for local development), FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, FIREBASE_SERVICE_ACCOUNT_KEY, or GOOGLE_APPLICATION_CREDENTIALS. On Google-hosted runtimes such as Firebase App Hosting or Cloud Run, attach a service account and rely on Application Default Credentials.',
  );
}

function getFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  return admin.initializeApp({
    credential: getCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// Defer initialization until first property access so Next.js build doesn't
// throw when no credentials are present (credentials are only available at runtime).
function makeLazy<T extends object>(factory: () => T): T {
  let inst: T | undefined;
  return new Proxy({} as T, {
    get(_, prop) {
      inst ??= factory();
      const v = Reflect.get(inst, prop, inst);
      return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(inst) : v;
    },
  });
}

let _app: admin.app.App | undefined;
function adminAppInstance() {
  return (_app ??= getFirebaseAdmin());
}

export const adminApp = makeLazy(adminAppInstance);
export const adminAuth = makeLazy(() => admin.auth(adminAppInstance()));
export const adminRtdb = makeLazy(() => admin.database(adminAppInstance()));
export const adminStorage = makeLazy(() => admin.storage(adminAppInstance()));
