export type PlayerIdentity = { displayName?: string | null; photoURL?: string | null };

/** Prefer current Auth/room identities over legacy score placeholders. */
export function resolveLivePlayerIdentity(score: PlayerIdentity, roomPlayer?: PlayerIdentity, currentUser?: PlayerIdentity) {
  const names = [roomPlayer?.displayName?.trim(), score.displayName?.trim()];
  const displayName = currentUser?.displayName?.trim() || names.find(name => name && name !== 'Player') || names.find(Boolean) || 'Player';
  const photoURL = currentUser && Object.hasOwn(currentUser, 'photoURL')
    ? currentUser.photoURL || null
    : roomPlayer?.photoURL || score.photoURL || null;
  return { displayName, photoURL };
}
