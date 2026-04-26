import { NextResponse } from 'next/server';
import { createQuestion, upsertChoices, getQuestionsByQuiz, saveConnections, getConnectionsByQuiz, deleteQuestionsByQuiz } from '@/lib/db/queries';

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    const questions = await getQuestionsByQuiz(quizId);
    const connections = await getConnectionsByQuiz(quizId);
    return NextResponse.json({ questions, connections });
  } catch (err) {
    console.error(`Failed to load graph for quiz ${quizId}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    const body = await request.json();
    const question = await createQuestion({ ...body, session_id: quizId });
    if (body.choices?.length) {
      await upsertChoices(question.id, body.choices);
    }
    return NextResponse.json(question, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    await deleteQuestionsByQuiz(quizId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    const body = await request.json();
    if (body.connections) {
      await saveConnections(quizId, body.connections);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
