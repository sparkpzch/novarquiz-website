import { jwtVerify } from 'jose';

// Changing this invalidates every application session, including admin sessions.
export const SESSION_VERSION = 'revocable-session-2026-10-v2';

export async function verifySessionToken(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'],
    requiredClaims: ['uid', 'isAdmin', 'iat', 'exp', 'authTime', 'userSessionVersion'],
  });
  if (typeof payload.uid !== 'string' || !payload.uid.trim() ||
      payload.sessionVersion !== SESSION_VERSION ||
      typeof payload.isAdmin !== 'boolean' || typeof payload.iat !== 'number' ||
      typeof payload.authTime !== 'number' || !Number.isInteger(payload.authTime) || payload.authTime <= 0 || payload.authTime > payload.iat ||
      typeof payload.userSessionVersion !== 'string' || !payload.userSessionVersion ||
      payload.iat > Math.floor(Date.now() / 1000) || payload.exp! <= payload.iat) {
    throw new Error('Invalid session claims');
  }
  return { uid: payload.uid, isAdmin: payload.isAdmin, expiresAt: payload.exp!, authTime: payload.authTime,
    userSessionVersion: payload.userSessionVersion };
}
