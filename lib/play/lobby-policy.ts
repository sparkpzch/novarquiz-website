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
