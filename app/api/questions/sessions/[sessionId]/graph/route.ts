import { NextResponse } from 'next/server';
import { createQuestion, upsertChoices, getQuestionsBySession, saveConnections, getConnectionsBySession, deleteQuestionsBySession } from '@/lib/db/queries';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const questions = await getQuestionsBySession(sessionId);
    const connections = await getConnectionsBySession(sessionId);
    return NextResponse.json({ questions, connections });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const body = await request.json();
    const question = await createQuestion({ ...body, session_id: sessionId });
    if (body.choices?.length) {
      await upsertChoices(question.id, body.choices);
    }
    return NextResponse.json(question, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    await deleteQuestionsBySession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const body = await request.json();
    if (body.connections) {
      await saveConnections(sessionId, body.connections);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
