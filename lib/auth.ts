import { verifySessionToken } from '@/lib/security/session';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'session';

export type SessionUser = {
  uid: string;
  isAdmin: boolean;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const session = await verifySessionToken(token);
    return {
      uid: session.uid,
      isAdmin: session.isAdmin,
    };
  } catch (err) {
    console.error('Session verification failed:', err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}
