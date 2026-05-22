import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getQuizById, updateQuiz, deleteQuiz } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

const UpdateQuizBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  cover_image_url: z.string().url().max(500).optional(),
  cover_image_path: z.string().max(500).optional(),
  timer_seconds: z.number().int().min(5).max(600).optional(),
  is_published: z.boolean().optional(),
});

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

    const raw = await request.json();
    const parsed = UpdateQuizBody.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const updated = await updateQuiz(quizId, parsed.data);
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
