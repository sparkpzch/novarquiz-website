import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminRtdb } from '@/lib/firebase/admin';
import { getSessionById, getEntryQuestion, withPlayerAnswerLock } from '@/lib/db/queries';
import { getProgress, startProgress, resetProgress } from '@/lib/db/play-progress';
import { getPlayUser } from '@/lib/play-auth';
import { sanitizePhotoUrl } from '@/lib/security/photo-url';
import { canJoinLobby } from '@/lib/play/lobby-policy';
import { connectionIdFor, LobbyAccessError } from '@/lib/play/lobby-access';

const JoinBody = z.object({ invitationToken: z.string().max(64).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getPlayUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { sessionId } = await params;
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const body = JoinBody.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const profile = await adminAuth.getUser(user.uid);

    return await withPlayerAnswerLock(session.id, user.uid, async () => {
      const roomRef = adminRtdb.ref(`sessions/${session.id}`);
      const room = (await roomRef.get()).val();
      if (!canJoinLobby(room, session.is_private, body.data.invitationToken)) {
        return NextResponse.json({ error: 'This invitation is unavailable. Ask the host for a new link.' }, { status: 403 });
      }
      // Taking over an unfinished attempt keeps its question and score.
      await resetProgress(session.id, user.uid);
      let progress = await getProgress(session.id, user.uid);
      const token = randomBytes(32).toString('hex');
      const connectionId = connectionIdFor(token);
      const roundId = room.roundId ?? randomUUID();
      if (!progress?.attempt_boundary.startsWith(`lobby:${roundId}:`)) {
        const entry = await getEntryQuestion(session.id);
        if (!entry) return NextResponse.json({ error: 'This quiz has no entry question.' }, { status: 400 });
        progress = await startProgress(session.id, user.uid, `lobby:${roundId}:${randomUUID()}`, entry.id, true);
      }
      const now = Date.now();
      const identity = { displayName: profile.displayName || 'Player', photoURL: sanitizePhotoUrl(profile.photoURL) };
      const previous = room.players?.[user.uid];
      const joined = await roomRef.transaction(current => {
        // RTDB transactions can first receive null before the server value is
        // cached. Return null to retry the compare-and-set, rather than abort.
        if (!current) return current;
        if (!canJoinLobby(current, session.is_private, body.data.invitationToken) || current.roundId !== room.roundId) return;
        return { ...current, roundId, players: { ...current.players, [user.uid]: {
          ...identity, joinedAt: previous?.joinedAt ?? now, lastActiveAt: now, connectionId, roundId,
        } }, scores: { ...current.scores, [user.uid]: {
          ...identity, score: progress?.score ?? 0, finished: false, roundId,
          currentQuestionId: progress?.question_id ?? null,
          currentQuestionLabel: progress ? current.scores?.[user.uid]?.currentQuestionLabel ?? null : null,
          updatedAt: now, authorityVersion: progress ? new Date(progress.updated_at).getTime() : now,
        } } };
      });
      if (!joined.committed || joined.snapshot.val()?.players?.[user.uid]?.connectionId !== connectionId) throw new LobbyAccessError(NextResponse.json({ error: 'The lobby changed. Open the invitation again.' }, { status: 409 }));
      await adminRtdb.ref(`userSessions/${user.uid}/${session.id}`).set({
        sessionId: session.id, sessionName: session.name, mode: 'lobby', joinedAt: now,
        lastActiveAt: now, connectionId,
      });
      return NextResponse.json({ success: true, sessionId: session.id, roomStatus: joined.snapshot.val().status, token, connectionId });
    });
  } catch (error) {
    if (error instanceof LobbyAccessError) return error.response;
    console.error('Could not join lobby:', error);
    return NextResponse.json({ error: 'Could not join the quiz. Please try again.' }, { status: 500 });
  }
}
