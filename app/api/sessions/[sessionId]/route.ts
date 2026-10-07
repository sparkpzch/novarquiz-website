import { requireLobbyAccess } from '@/lib/play/lobby-access';
import { adminRtdb } from '@/lib/firebase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteSession, getSessionById, updateSession } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { SESSION_STATUS } from '@/lib/constants/session';

const SessionPatchSchema = z.object({
  pin: z.string().min(1).max(64).nullable().optional(),
  pin_code: z.string().min(1).max(64).nullable().optional(),
  status: z
    .enum([
      SESSION_STATUS.CLOSED,
      SESSION_STATUS.OPENED,
      SESSION_STATUS.STARTED,
      SESSION_STATUS.ARCHIVED,
    ])
    .optional(),
  current_question_id: z.string().uuid().nullable().optional(),
  current_score: z.number().int().optional(),
  current_streak: z.number().int().min(0).optional(),
  finished_at: z.string().datetime().nullable().optional(),
  name: z.string().max(200).nullable().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const user = await getSessionUser();
    const isOwnerOrAdmin = user && (user.isAdmin || session.user_id === user.uid);
    if (!isOwnerOrAdmin) {
      if (session.is_private) {
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const invitation = request.headers.get('X-Lobby-Invitation');
        const room = (await adminRtdb.ref(`sessions/${session.id}`).get()).val();
        if (!invitation || invitation !== room?.joinToken || room.status === 'ended') {
          const denied = await requireLobbyAccess(request, session.id, user.uid, false);
          if (denied) return denied;
        }
      }
      const { pin_code: _pin, user_id: _uid, share_token: _share, ...publicFields } = session;
      return NextResponse.json(publicFields);
    }

    return NextResponse.json(session);
  } catch (err) {
    console.error(`Failed to load session instance ${sessionId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  try {
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!user.isAdmin && session.user_id !== user.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const raw = await request.json().catch(() => null);
    const parsed = SessionPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Support both legacy 'pin' key and direct DB field names
    const { pin, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (pin !== undefined) updateData.pin_code = pin;

    await updateSession(session.id, updateData);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Failed to update session ${sessionId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  try {
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!user.isAdmin && session.user_id !== user.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await deleteSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Failed to delete session ${sessionId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
