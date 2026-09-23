import { createHmac, timingSafeEqual } from 'node:crypto';

function signature(sessionId: string, userId: string, questionId: string, attemptBoundary: string, issuedAt: number) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  return createHmac('sha256', secret)
    .update(JSON.stringify([sessionId, userId, questionId, attemptBoundary, issuedAt]))
    .digest('hex');
}

export function createQuestionToken(sessionId: string, userId: string, questionId: string, attemptBoundary: string) {
  const issuedAt = Date.now();
  return `${issuedAt}.${signature(sessionId, userId, questionId, attemptBoundary, issuedAt)}`;
}

export function readQuestionToken(token: string, sessionId: string, userId: string, questionId: string, attemptBoundary: string): number | null {
  const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const issuedAt = Number(match[1]);
  if (issuedAt > Date.now() + 60_000 || Date.now() - issuedAt > 24 * 60 * 60_000) return null;
  const expected = Buffer.from(signature(sessionId, userId, questionId, attemptBoundary, issuedAt), 'hex');
  return timingSafeEqual(Buffer.from(match[2], 'hex'), expected) ? issuedAt : null;
}

export function verifyQuestionToken(token: string, sessionId: string, userId: string, questionId: string, attemptBoundary: string) {
  return readQuestionToken(token, sessionId, userId, questionId, attemptBoundary) !== null;
}
