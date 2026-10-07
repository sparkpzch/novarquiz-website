import { adminRtdb } from '@/lib/firebase/admin';
import { requireLobbyAccess } from '@/lib/play/lobby-access';
import { NextResponse } from 'next/server';
import { getEntryQuestion, getSessionById } from '@/lib/db/queries';
import { getPlayUser } from '@/lib/play-auth';

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getPlayUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  try {
    const session = await getSessionById(sessionId);
    if (session?.is_private) {
      const room = (await adminRtdb.ref(`sessions/${session.id}`).get()).val();
      const invite = request.headers.get('X-Lobby-Invitation');
      if (!invite || invite !== room?.joinToken || room.status === 'ended') {
        const denied = await requireLobbyAccess(request, session.id, user.uid, false);
        if (denied) return denied;
      }
    }
    const question = await getEntryQuestion(sessionId);
    return NextResponse.json({
      media_url: question?.media_url ?? null,
      media_type: question?.media_type ?? null,
    });
  } catch {
    return NextResponse.json({ media_url: null, media_type: null });
  }
}
