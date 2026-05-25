import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, getSessionById, updateSession } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const user = await getSessionUser();
    const isOwnerOrAdmin = user && (user.isAdmin || session.user_id === user.uid);
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

    // Support both legacy 'pin' key and direct DB field names
    const updateData: Record<string, unknown> = { ...data };
    if ('pin' in data) {
      updateData.pin_code = data.pin;
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
