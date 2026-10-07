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

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const session = await verifySessionToken(token);
    const account = await adminAuth.getUser(session.uid);
    return authorizeCurrentSession(session, account);
  } catch (err) {
    console.error('Session verification failed:', err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}
