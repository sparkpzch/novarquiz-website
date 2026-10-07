type LobbyConnection = { token: string; connectionId: string };
const key = (sessionId: string, uid: string) => `novarquiz-lobby:${uid}:${sessionId}`;

export function readLobbyConnection(sessionId: string, uid: string): LobbyConnection | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key(sessionId, uid)) ?? 'null');
    return typeof value?.token === 'string' && typeof value?.connectionId === 'string' ? value : null;
  } catch { return null; }
}

export function saveLobbyConnection(sessionId: string, uid: string, connection: LobbyConnection) {
  sessionStorage.setItem(key(sessionId, uid), JSON.stringify(connection));
}

export function lobbyHeaders(sessionId: string, uid: string, initial?: HeadersInit) {
  const headers = new Headers(initial);
  const connection = readLobbyConnection(sessionId, uid);
  if (connection) headers.set('X-Lobby-Connection', connection.token);
  return headers;
}
