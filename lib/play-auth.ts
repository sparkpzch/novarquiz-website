import { getSessionUser } from '@/lib/auth';

// Quiz participation requires a verified application session. Anonymous
// Firebase bearer tokens cannot authorize invitations or quiz APIs.
export async function getPlayUser(_request: Request) {
  const sessionUser = await getSessionUser();
  return sessionUser ? { ...sessionUser, isGuest: false } : null;
}
