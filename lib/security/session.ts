import { jwtVerify } from 'jose';

// Changing this invalidates every application session, including admin sessions.
export const SESSION_VERSION = 'participant-survey-2026-10-v1';

export async function verifySessionToken(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'],
    requiredClaims: ['uid', 'isAdmin', 'iat', 'exp'],
  });
  if (typeof payload.uid !== 'string' || !payload.uid.trim() ||
      payload.sessionVersion !== SESSION_VERSION ||
      typeof payload.isAdmin !== 'boolean' || typeof payload.iat !== 'number' ||
      payload.iat > Math.floor(Date.now() / 1000) || payload.exp! <= payload.iat) {
    throw new Error('Invalid session claims');
  }
  return { uid: payload.uid, isAdmin: payload.isAdmin, expiresAt: payload.exp! };
}
