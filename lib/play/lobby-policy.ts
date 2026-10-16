export type LobbyMember = { connectionId?: string; roundId?: string; left?: boolean };
export type LobbyState = {
  hostId?: string;
  isSolo?: boolean;
  status: string;
  joinToken?: string | null;
  roundId?: string;
  players?: Record<string, LobbyMember>;
};

export function lobbyAccess(room: LobbyState | null, uid: string, connectionId: string | null, playing: boolean) {
  if (!room || room.status === 'ended' || !room.joinToken) return 'closed';
  const member = room.players?.[uid];
  if (!member || member.left) return 'invitation_required';
  if (!connectionId || member.connectionId !== connectionId || member.roundId !== room.roundId) return 'session_replaced';
  if (playing && room.status !== 'started') return 'waiting';
  return null;
}

export function canJoinLobby(room: LobbyState | null, privateQuiz: boolean, invitation: string | undefined) {
  return !!room && room.status !== 'ended' && (!privateQuiz || (!!room.joinToken && invitation === room.joinToken));
}

export function ownsLobbyMember(member: LobbyMember | null | undefined, connectionId: string | null) {
  return !!connectionId && member?.connectionId === connectionId && !member.left;
}

// Only admins can open a hosted lobby, so a player that lobbyAccess admits
// through a live invitation connection may play the quiz even while it is a
// draft. Solo rooms are not hosted and grant nothing.
export function isAdmittedLobbyPlayer(room: LobbyState | null, uid: string, connectionId: string | null) {
  return !!room?.hostId && !room.isSolo && lobbyAccess(room, uid, connectionId, true) === null;
}

export async function canPlayQuiz(quiz: { is_published?: boolean; created_by?: string }, user: { uid: string; isAdmin: boolean },
  admittedLobbyPlayer: () => Promise<boolean>) {
  return quiz.is_published || user.isAdmin || quiz.created_by === user.uid || await admittedLobbyPlayer();
}
