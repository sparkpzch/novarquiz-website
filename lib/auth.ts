import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'session';

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export type SessionUser = {
  uid: string;
  isAdmin: boolean;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    return {
      uid: payload.uid as string,
      isAdmin: !!payload.isAdmin,
    };
  } catch (err) {
    console.error('Session verification failed:', err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}
