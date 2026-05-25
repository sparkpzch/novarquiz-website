import { NextRequest, NextResponse } from 'next/server';
import { getQuizById, updateQuiz, deleteQuiz } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    const quiz = await getQuizById(quizId);
    if (!quiz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const user = await getSessionUser();
    const isOwnerOrAdmin = user && (user.isAdmin || quiz.created_by === user.uid);
    if (!isOwnerOrAdmin && !quiz.is_published) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(quiz);
  } catch (err) {
    console.error(`Failed to load quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { quizId } = await params;
  try {
    const quiz = await getQuizById(quizId);
    if (!quiz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!user.isAdmin && quiz.created_by !== user.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updated = await updateQuiz(quizId, body);
    return NextResponse.json(updated);
  } catch (err) {
    console.error(`Failed to update quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { quizId } = await params;
  try {
    const quiz = await getQuizById(quizId);
    if (!quiz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!user.isAdmin && quiz.created_by !== user.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await deleteQuiz(quizId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Failed to delete quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
