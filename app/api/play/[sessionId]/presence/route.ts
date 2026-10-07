import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlayUser } from '@/lib/play-auth';
import { adminRtdb } from '@/lib/firebase/admin';
import { withPlayerAnswerLock, getQuestionById } from '@/lib/db/queries';
import { getProgress } from '@/lib/db/play-progress';
import { requireLobbyAccess, requestConnectionId } from '@/lib/play/lobby-access';
import { ownsLobbyMember } from '@/lib/play/lobby-policy';

const Metadata = z.object({
  currentQuestionId: z.string().uuid().nullable().optional(),
  currentQuestionLabel: z.string().max(100).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getPlayUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { sessionId } = await params;
  try {
    const body = Metadata.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    return await withPlayerAnswerLock(sessionId, user.uid, async () => {
      const denied = await requireLobbyAccess(request, sessionId, user.uid, false);
      if (denied) return denied;
      const connectionId = requestConnectionId(request);
      const player = adminRtdb.ref(`sessions/${sessionId}/players/${user.uid}`);
      const now = Date.now();
      const changed = await player.transaction(current => !current ? current : ownsLobbyMember(current, connectionId) ? { ...current, lastActiveAt: now } : undefined);
      if (!changed.committed || !changed.snapshot.val()) return NextResponse.json({ ok: true });
      if (Object.keys(body.data).length) {
        const progress = await getProgress(sessionId,user.uid);
        const question = progress && !progress.completed ? await getQuestionById(progress.question_id) : null;
        await adminRtdb.ref(`sessions/${sessionId}/scores/${user.uid}`).update({
          currentQuestionId: question?.id ?? null,
          currentQuestionLabel: question ? `Q${question.question_order+1}` : null, updatedAt: now,
        });
      }
      await adminRtdb.ref(`userSessions/${user.uid}/${sessionId}`).transaction(current =>
        !current ? current : current.connectionId === connectionId ? { ...current, lastActiveAt: now } : undefined);
      return NextResponse.json({ ok: true });
    });
  } catch {
    return NextResponse.json({ error: 'Could not update connection' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getPlayUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { sessionId } = await params;
  const connectionId = requestConnectionId(request);
  try {
    return await withPlayerAnswerLock(sessionId, user.uid, async () => {
      await adminRtdb.ref(`sessions/${sessionId}/players/${user.uid}`).transaction(current =>
        !current ? current : ownsLobbyMember(current, connectionId) ? { ...current, left: true } : undefined);
      await adminRtdb.ref(`userSessions/${user.uid}/${sessionId}`).transaction(current =>
        !current ? current : current.connectionId === connectionId ? null : undefined);
      return NextResponse.json({ ok: true });
    });
  } catch {
    return NextResponse.json({ error: 'Could not leave lobby' }, { status: 500 });
  }
}
