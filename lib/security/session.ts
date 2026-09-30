import { jwtVerify } from 'jose';

export async function verifySessionToken(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'],
    requiredClaims: ['uid', 'isAdmin', 'iat', 'exp'],
  });
  if (typeof payload.uid !== 'string' || !payload.uid.trim() ||
      typeof payload.isAdmin !== 'boolean' || typeof payload.iat !== 'number' ||
      payload.iat > Math.floor(Date.now() / 1000) || payload.exp! <= payload.iat) {
    throw new Error('Invalid session claims');
  }
  return { uid: payload.uid, isAdmin: payload.isAdmin, expiresAt: payload.exp! };
}
