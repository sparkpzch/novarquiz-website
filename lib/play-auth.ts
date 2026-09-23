import { getSessionUser } from '@/lib/auth';
import { adminAuth } from '@/lib/firebase/admin';

// Anonymous players have Firebase identity but no application session cookie.
// Accept their ID token only for routes that explicitly support guest play.
export async function getPlayUser(request: Request) {
  const sessionUser = await getSessionUser();
  if (sessionUser) return { ...sessionUser, isGuest: false };
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    if (decoded.firebase?.sign_in_provider !== 'anonymous') return null;
    return { uid: decoded.uid, isAdmin: false, isGuest: true };
  } catch {
    return null;
  }
}
