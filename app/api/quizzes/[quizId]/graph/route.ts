import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ConnectionSchema, GraphBody, MEDIA_PATH_RE, QuestionSchema } from './schema';
import {
  createQuestion,
  upsertChoices,
  getQuestionsByQuiz,
  saveConnections,
  getConnectionsByQuiz,
  deleteQuestionsByQuiz,
  resolveQuizId,
  replaceQuizGraph,
  getQuizById,
} from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { resolveProcessedVideos, UnpreparedVideoError } from '@/lib/video/jobs';

async function requireQuizOwnership(quizId: string) {
  const user = await getSessionUser();
  if (!user) return { error: 'Unauthorized', status: 401 } as const;
  const quiz = await getQuizById(quizId);
  if (!quiz) return { error: 'Not found', status: 404 } as const;
  if (!user.isAdmin && quiz.created_by !== user.uid) return { error: 'Forbidden', status: 403 } as const;
  return null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const denied = await requireQuizOwnership(quizId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const realId = await resolveQuizId(quizId);
    const questions = await getQuestionsByQuiz(realId);
    const connections = await getConnectionsByQuiz(realId);
    return NextResponse.json({ questions, connections });
  } catch (err) {
    if (err instanceof UnpreparedVideoError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error(`Failed to load graph for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const denied = await requireQuizOwnership(quizId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const realId = await resolveQuizId(quizId);
    const parsed = QuestionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    // `id` is deliberately dropped here: createQuestion upserts ON CONFLICT (id)
    // and rewrites session_id, so honouring a client-chosen id would let an
    // owner of quiz A pull a question row out of quiz B. Ids are only accepted
    // on PUT, where replaceQuizGraph re-mints anything that isn't a UUID.
    const [resolved] = await resolveProcessedVideos([parsed.data]);
    const { choices, ...questionData } = resolved;
    delete questionData.id;
    const question = await createQuestion({
      ...questionData,
      session_id: realId,
      node_name: questionData.node_name ?? undefined,
      media_type: questionData.media_type ?? undefined,
      media_url: questionData.media_url ?? undefined,
      media_path: questionData.media_path ?? undefined,
      timer_override: questionData.timer_override ?? undefined,
    });
    if (choices?.length) {
      await upsertChoices(question.id, choices);
    }
    return NextResponse.json(question, { status: 201 });
  } catch (err) {
    if (err instanceof UnpreparedVideoError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error(`Failed to create question for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const denied = await requireQuizOwnership(quizId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const realId = await resolveQuizId(quizId);
    let preservePaths = new Set<string>();
    try {
      const body = await request.json();
      if (Array.isArray(body?.preserve_paths)) {
        preservePaths = new Set(
          (body.preserve_paths as unknown[]).filter(
            (p): p is string => typeof p === 'string' && MEDIA_PATH_RE.test(p),
          ),
        );
      }
    } catch { /* body not provided or not JSON */ }
    await deleteQuestionsByQuiz(realId, preservePaths);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnpreparedVideoError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error(`Failed to delete questions for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const denied = await requireQuizOwnership(quizId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const realId = await resolveQuizId(quizId);
    const raw = await request.json();
    if (Array.isArray(raw.questions) && Array.isArray(raw.connections)) {
      const parsed = GraphBody.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
      }
      const result = await replaceQuizGraph(realId, parsed.data.questions, parsed.data.connections);
      return NextResponse.json({ ok: true, idMap: result.idMap });
    }
    if (raw.connections) {
      const connParsed = z.array(ConnectionSchema).max(2000).safeParse(raw.connections);
      if (!connParsed.success) {
        return NextResponse.json({ error: 'Invalid connections' }, { status: 400 });
      }
      await saveConnections(realId, connParsed.data);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnpreparedVideoError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error(`Failed to update graph for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
