import type { verifySessionToken } from './session';

export type CurrentAccount = {
  disabled: boolean;
  tokensValidAfterTime?: string;
  customClaims?: Record<string, unknown>;
};

export function accountSessionVersion(account: CurrentAccount): string {
  const version = account.customClaims?.applicationSessionVersion;
  if (version === undefined) return '0';
  if (typeof version === 'string' && version) return version;
  if (typeof version === 'number' && Number.isSafeInteger(version) && version >= 0) return String(version);
  throw new Error('Invalid account session version');
}

// Check current account state on every protected API request. Rehydrating or
// refreshing an app JWT must never move the original Firebase auth_time forward.
export function authorizeCurrentSession(session: Awaited<ReturnType<typeof verifySessionToken>>, account: CurrentAccount) {
  if (account.disabled) throw new Error('Account disabled');
  const revokedBefore = account.tokensValidAfterTime ? Date.parse(account.tokensValidAfterTime) : 0;
  if (!Number.isFinite(revokedBefore) || session.authTime * 1000 < revokedBefore) throw new Error('Session revoked');
  if (session.userSessionVersion !== accountSessionVersion(account)) throw new Error('Session version revoked');
  return { uid: session.uid, isAdmin: session.isAdmin && account.customClaims?.admin === true };
}

export function idTokenSessionContext(token: { auth_time: number; firebase?: { sign_in_provider?: string };
  applicationAuthTime?: unknown; applicationSessionVersion?: unknown }, account: CurrentAccount) {
  const custom = token.firebase?.sign_in_provider === 'custom';
  const authTime = custom ? token.applicationAuthTime : token.auth_time;
  const version = custom ? token.applicationSessionVersion : accountSessionVersion({
    disabled: false, customClaims: { applicationSessionVersion: token.applicationSessionVersion },
  });
  if (typeof authTime !== 'number' || !Number.isInteger(authTime) || authTime <= 0 || authTime > Math.floor(Date.now() / 1000) || typeof version !== 'string') {
    throw new Error('Invalid authentication context');
  }
  authorizeCurrentSession({ uid: '', isAdmin: false, expiresAt: 0, authTime, userSessionVersion: version }, account);
  return { authTime, userSessionVersion: version };
}
