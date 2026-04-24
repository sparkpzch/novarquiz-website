import { NextResponse } from 'next/server';
import { duplicateQuizOrSession } from '@/lib/db/queries';

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const { createdBy, isQuizDuplicate } = body;

    if (!createdBy) {
      return NextResponse.json({ error: 'createdBy is required' }, { status: 400 });
    }

    const newSession = await duplicateQuizOrSession(sessionId, createdBy, !!isQuizDuplicate);
    return NextResponse.json(newSession, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
