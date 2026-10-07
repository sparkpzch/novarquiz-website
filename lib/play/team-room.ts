import { adminRtdb } from '@/lib/firebase/admin';

export function validTeamRoomId(id: string) { return /^[a-zA-Z0-9_-]{6,64}$/.test(id); }

// Move old secrets without overwriting current attempt counters before any client subscribes. Legacy rooms with
// secrets remaining at the public path are unreadable under the new rules.
export async function readTeamRoom(roomId: string) {
  const room = (await adminRtdb.ref(`teamRooms/${roomId}`).get()).val();
  if (!room) return null;
  if (room.pin || room.joinAttempts) {
    await adminRtdb.ref(`teamRoomSecrets/${roomId}`).transaction(current => ({
      ...current,
      ...(room.pin ? {pin:current?.pin ?? room.pin}:{}),
      ...(room.joinAttempts ? {joinAttempts:{...room.joinAttempts,...current?.joinAttempts}}:{}),
    }));
    await adminRtdb.ref(`teamRooms/${roomId}`).update({pin:null,joinAttempts:null});
  }
  const { pin: _pin, joinAttempts: _attempts, ...visible } = room;
  return visible;
}
