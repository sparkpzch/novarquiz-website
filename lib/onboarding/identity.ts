/** Explicit signup tokens take precedence over a cookie from another account.
 * Only a verified Firebase identity or a server-verified session supplies uid. */
export async function surveyIdentity(authorization: string | null, dependencies: {
  session: () => Promise<{ uid: string } | null>;
  verify: (token: string) => Promise<{ uid: string; firebase?: { sign_in_provider?: string } }>;
}): Promise<string | null> {
  if (!authorization) return (await dependencies.session())?.uid ?? null;
  if (!authorization.startsWith('Bearer ') || !authorization.slice(7).trim()) return null;
  try {
    const token = await dependencies.verify(authorization.slice(7));
    return token.firebase?.sign_in_provider === 'anonymous' ? null : token.uid;
  } catch { return null; }
}
