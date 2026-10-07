import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { adminRtdb } from '@/lib/firebase/admin';
import { readTeamRoom, validTeamRoomId } from '@/lib/play/team-room';

export async function GET(_request: Request, {params}: {params:Promise<{roomId:string}>}) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  const {roomId}=await params;
  if (!validTeamRoomId(roomId)) return NextResponse.json({error:'Not found'},{status:404});
  try {
    const room = await readTeamRoom(roomId);
    if (!room) return NextResponse.json({error:'Not found'},{status:404});
    const member = room.hostId===user.uid || !!room.players?.[user.uid];
    const pin = room.hostId===user.uid ? (await adminRtdb.ref(`teamRoomSecrets/${roomId}/pin`).get()).val() : undefined;
    return NextResponse.json({sessionId:room.sessionId,hostId:member?room.hostId:'',status:room.status,
      ...(member?{players:room.players}:{}),...(pin?{pin}: {})}, {headers:{'Cache-Control':'no-store'}});
  } catch {return NextResponse.json({error:'Could not load room'},{status:500});}
}

export async function POST(request: Request, {params}: {params:Promise<{roomId:string}>}) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  const {roomId}=await params;
  if (!validTeamRoomId(roomId)) return NextResponse.json({error:'Not found'},{status:404});
  const body=await request.json().catch(()=>null);
  if(body?.action!=='start') return NextResponse.json({error:'Invalid action'},{status:400});
  const room = await readTeamRoom(roomId);
  if(!room || room.hostId!==user.uid) return NextResponse.json({error:'Forbidden'},{status:403});
  await adminRtdb.ref(`teamRooms/${roomId}/status`).set('started');
  return NextResponse.json({ok:true});
}

export async function DELETE(_request: Request, {params}: {params:Promise<{roomId:string}>}) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  const {roomId}=await params;
  if (!validTeamRoomId(roomId)) return NextResponse.json({error:'Not found'},{status:404});
  await adminRtdb.ref(`teamRooms/${roomId}/players/${user.uid}`).remove();
  return NextResponse.json({ok:true});
}
