import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

const ALLOWED_MEDIA_ORIGINS = new Set([
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
]);

function isAllowedMediaUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === 'https:' && ALLOWED_MEDIA_ORIGINS.has(hostname);
  } catch {
    return false;
  }
}

const ChoiceSchema = z.object({
  label: z.string().min(1).max(10),
  choice_text: z.string().max(1000),
  score_impact: z.number().finite().min(-10000).max(10000).optional(),
  explanation: z.string().max(2000).optional(),
});

const QuestionSchema = z.object({
  question_text: z.string().max(5000),
  question_order: z.number().int().min(0),
  node_type: z.enum(['question', 'situation', 'end']).optional(),
  media_url: z.string().max(500).optional().nullable().refine(
    (v) => !v || isAllowedMediaUrl(v),
    { message: 'media_url must be an https URL from an allowed storage domain' },
  ),
  media_type: z.enum(['image', 'video']).optional().nullable(),
  node_x: z.number().finite().optional(),
  node_y: z.number().finite().optional(),
  choices: z.array(ChoiceSchema).max(20).optional(),
});

const ConnectionSchema = z.object({
  from_question_id: z.string(),
  to_question_id: z.string(),
  choice_label: z.string().max(10),
});

const GraphBody = z.object({
  questions: z.array(QuestionSchema).max(500),
  connections: z.array(ConnectionSchema).max(2000),
});

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
    const { choices, ...questionData } = parsed.data;
    const question = await createQuestion({ ...questionData, session_id: realId });
    if (choices?.length) {
      await upsertChoices(question.id, choices);
    }
    return NextResponse.json(question, { status: 201 });
  } catch (err) {
    console.error(`Failed to create question for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const MEDIA_PATH_RE = /^quiz-media\/[\w.-]+$/;

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
    console.error(`Failed to update graph for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
