// Do not clear Firebase state while a valid server cookie could sign us back in.
export async function endClientSession(
  deleteSession: () => Promise<Response>,
  signOutClient: () => Promise<void>,
): Promise<void> {
  const response = await deleteSession();
  if (!response.ok) throw new Error('Server sign-out failed');
  await signOutClient();
}
