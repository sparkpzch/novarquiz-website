import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlayUser } from '@/lib/play-auth';
import { adminRtdb } from '@/lib/firebase/admin';
import { withPlayerAnswerLock, getQuestionById } from '@/lib/db/queries';
import { getProgress } from '@/lib/db/play-progress';
import { requireLobbyAccess, requestConnectionId } from '@/lib/play/lobby-access';
import { ownsLobbyMember } from '@/lib/play/lobby-policy';
import { presenceScore } from '@/lib/play/lobby-progress';

const Metadata = z.object({
  transportId: z.string().uuid().optional(),
  departingTransportId: z.string().uuid().optional(),
  lastInteractionAt: z.number().finite().nonnegative().optional(),
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
    // No per-player DB lock here: activity heartbeats fire on every click, and
    // holding the answer lock across these RTDB round-trips stalled answers.
    // Each write below is an RTDB transaction gated on connection ownership.
    {
      const denied = await requireLobbyAccess(request, sessionId, user.uid, false);
      if (denied) return denied;
      const connectionId = requestConnectionId(request);
      const player = adminRtdb.ref(`sessions/${sessionId}/players/${user.uid}`);
      const now = Date.now();
      if (body.data.departingTransportId) {
        const transports = adminRtdb.ref(`sessions/${sessionId}/connections/${user.uid}/${connectionId}`);
        await transports.child(body.data.departingTransportId).remove();
        if (!Object.values((await transports.get()).val() ?? {}).some(Boolean)) {
          await adminRtdb.ref(`userSessions/${user.uid}/${sessionId}`).transaction(current =>
            !current ? current : current.connectionId === connectionId ? { ...current, lastLeftAt: now } : undefined);
        }
        return NextResponse.json({ ok: true });
      }
      if (body.data.transportId && !(await adminRtdb.ref(
        `sessions/${sessionId}/connections/${user.uid}/${connectionId}/${body.data.transportId}`,
      ).get()).val()) return NextResponse.json({ ok: true });
      const changed = await player.transaction(current => !current ? current : ownsLobbyMember(current, connectionId) ? { ...current, lastActiveAt: now } : undefined);
      if (!changed.committed || !changed.snapshot.val()) return NextResponse.json({ ok: true });
      if (body.data.currentQuestionId !== undefined || body.data.currentQuestionLabel !== undefined) {
        const progress = await getProgress(sessionId,user.uid);
        const question = progress && !progress.completed ? await getQuestionById(progress.question_id) : null;
        // A transaction, not update(): a plain write here aborts the concurrent
        // completion transaction on sessions/{id} and loses `finished`.
        await adminRtdb.ref(`sessions/${sessionId}/scores/${user.uid}`).transaction(current =>
          presenceScore(current, question as { id: string; question_order: number } | null, !!progress?.completed, now));
      }
      await adminRtdb.ref(`userSessions/${user.uid}/${sessionId}`).transaction(current =>
        !current ? current : current.connectionId === connectionId ? {
          ...current, lastActiveAt: now,
          ...(body.data.lastInteractionAt !== undefined ? {
            lastLeftAt: null,
            lastInteractionAt: Math.max(current.lastInteractionAt ?? 0, Math.min(body.data.lastInteractionAt, now)),
          } : {}),
        } : undefined);
      return NextResponse.json({ ok: true });
    }
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
