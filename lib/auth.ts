import { verifySessionToken } from '@/lib/security/session';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/admin';
import { authorizeCurrentSession, idTokenSessionContext } from '@/lib/security/live-session';

const COOKIE_NAME = 'session';

export type SessionUser = {
  uid: string;
  isAdmin: boolean;
};

export async function getVerifiedFirebaseIdentity(token: string) {
  const decoded = await adminAuth.verifyIdToken(token, true);
  const account = await adminAuth.getUser(decoded.uid);
  idTokenSessionContext(decoded, account);
  return { ...decoded, admin: decoded.admin === true && account.customClaims?.admin === true };
}

// adminAuth.getUser() costs ~300ms per call, and gameplay makes several
// requests per question. Revocation, disable and admin-claim changes therefore
// take effect within ACCOUNT_CACHE_MS rather than instantly.
const ACCOUNT_CACHE_MS = 30_000;
const ACCOUNT_CACHE_MAX = 1_000;
const accountCache = new Map<string, { expiresAt: number; account: ReturnType<typeof adminAuth.getUser> }>();

function getCachedAccount(uid: string) {
  const now = Date.now();
  const hit = accountCache.get(uid);
  if (hit && hit.expiresAt > now) return hit.account;
  if (accountCache.size >= ACCOUNT_CACHE_MAX) accountCache.clear();
  const account = adminAuth.getUser(uid);
  accountCache.set(uid, { expiresAt: now + ACCOUNT_CACHE_MS, account });
  account.catch(() => { if (accountCache.get(uid)?.account === account) accountCache.delete(uid); });
  return account;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const session = await verifySessionToken(token);
    const account = await getCachedAccount(session.uid);
    return authorizeCurrentSession(session, account);
  } catch (err) {
    console.error('Session verification failed:', err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}
