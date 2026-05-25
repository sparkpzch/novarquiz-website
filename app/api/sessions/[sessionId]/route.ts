import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, getSessionById, updateSession } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    // Require auth even for the "public fields" response. Anonymous metadata
    // disclosure lets unauthenticated callers enumerate session existence via
    // slug guessing and harvest names/descriptions/quiz IDs.
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isOwnerOrAdmin = user.isAdmin || session.user_id === user.uid;
    if (!isOwnerOrAdmin) {
      const { pin_code: _pin, user_id: _uid, ...publicFields } = session;
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

    const data = await request.json();

    // Only allow user-editable fields; server-managed fields (status,
    // finished_at, current_question_id, current_score, current_streak)
    // must never be writable by the session owner.
    const USER_EDITABLE_FIELDS = new Set(['pin', 'pin_code', 'name']);
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (USER_EDITABLE_FIELDS.has(key)) updateData[key] = value;
    }
    if ('pin' in updateData) {
      updateData.pin_code = updateData.pin;
      delete updateData.pin;
    }

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
