import { NextResponse } from 'next/server';
import { getQuizById, updateQuiz, deleteQuiz } from '@/lib/db/queries';

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    const quiz = await getQuizById(quizId);
    if (!quiz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(quiz);
  } catch (err) {
    console.error(`Failed to load quiz ${quizId}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    const body = await request.json();
    const quiz = await updateQuiz(quizId, body);
    return NextResponse.json(quiz);
  } catch (err) {
    console.error(`Failed to update quiz ${quizId}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    await deleteQuiz(quizId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Failed to delete quiz ${quizId}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
