import { NextResponse } from 'next/server';
import { getSessionById, updateSession, deleteSession } from '@/lib/db/queries';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(session);
  } catch (err) {
    console.error(`Failed to load session ${sessionId}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const body = await request.json();
    const session = await updateSession(sessionId, body);
    return NextResponse.json(session);
  } catch (err) {
    console.error(`Failed to update session ${sessionId}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    await deleteSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Failed to delete session ${sessionId}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
