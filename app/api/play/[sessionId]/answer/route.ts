import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEntryQuestion, getNextQuestion, getQuestionById, saveUserAnswer, getOrCreateSession, getUserCumulativeScore, getQuizForQuestion, getQuizById, resolveSessionToQuizId, getExistingAnswer, getAttemptBoundary, withPlayerAnswerLock } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { adminRtdb } from '@/lib/firebase/admin';
import type { Choice } from '@/lib/types';
import { createQuestionToken, readQuestionToken, verifyQuestionToken } from '@/lib/security/question-token';
import { getPlayUser } from '@/lib/play-auth';

const StartBody = z.object({
  action: z.literal('start'),
  is_guest: z.boolean().optional(),
  display_name: z.string().max(100).optional(),
  photo_url: z.string().url().max(500).optional().nullable(),
});
const AnswerBody = z.object({
  question_id: z.string().uuid(),
  chosen_label: z.string().min(1).max(10),
  question_token: z.string().optional(),
  time_taken_ms: z.number().int().min(0).max(300_000),
  is_guest: z.boolean().optional(),
});

// Deterministic PRNG so a question's choice order is stable for a given player.
// The client fetches the same question more than once (prefetch on answer, then
// a refetch when the prefetch failed, plus any reload), and a fresh random order
// on each fetch would visibly reshuffle the list mid-question.
function seedFrom(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates: a uniform permutation, so every choice lands on a distinct
// position and none is dropped or duplicated.
function shuffleChoices<T>(choices: T[], seed: string): T[] {
  const out = [...choices];
  const rand = mulberry32(seedFrom(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Strip answer-key fields from player-facing question payloads.
// Choice outcomes are returned only after a player answers via POST.
//
// `shuffleSeed` reorders the choices for display when the quiz has
// shuffle_choices on. Each choice keeps its own `label`, so branching
// (question_connections.from_choice_label) and scoring (user_answers.chosen_label)
// are unaffected by the order the player sees.
function sanitizeQuestion(question: Record<string, unknown> | null, shuffleSeed?: string, questionToken?: string) {
  if (!question) return question;
  const choices = Array.isArray(question.choices)
    ? question.choices.map((choice) => {
        const item = choice as Record<string, unknown>;
        return { id: item.id, label: item.label, choice_text: item.choice_text };
      })
    : [];
  const orderedChoices =
    shuffleSeed ? shuffleChoices(choices, shuffleSeed) : choices;
  return {
    id: question.id,
    question_order: question.question_order,
    question_text: question.question_text,
    node_type: question.node_type,
    media_type: question.media_type,
    media_url: question.media_url,
    poster_url: question.poster_url,
    thumbnail_url: question.thumbnail_url,
    session_timer_seconds: question.session_timer_seconds,
    choices: orderedChoices,
    question_token: questionToken,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getPlayUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const searchParams = request.nextUrl.searchParams;

  try {
    const attemptBoundary = user.isGuest ? 'guest' : await getAttemptBoundary(sessionId, user.uid);
    if (searchParams.get('entry') === 'true') {
      const quizId = await resolveSessionToQuizId(sessionId);
      if (!quizId) return NextResponse.json(null, { status: 404 });
      const quiz = await getQuizById(quizId);
      if (!quiz || (!quiz.is_published && !user.isAdmin && quiz.created_by !== user.uid)) {
        return NextResponse.json(null, { status: 404 });
      }
      const question = await getEntryQuestion(sessionId);
      if (!question) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(
        sanitizeQuestion(question, quiz.shuffle_choices ? `${user.uid}:${question.id}` : undefined,
          createQuestionToken(sessionId, user.uid, question.id, attemptBoundary)),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const fromQuestionId = searchParams.get('fromQuestionId');
    const choiceLabel = searchParams.get('choiceLabel');
    if (fromQuestionId && choiceLabel) {
      const fromToken = searchParams.get('questionToken') ?? '';
      if (!verifyQuestionToken(fromToken, sessionId, user.uid, fromQuestionId, attemptBoundary)) {
        return NextResponse.json({ error: 'Invalid question' }, { status: 403 });
      }
      const access = await getQuizForQuestion(fromQuestionId);
      if (!access) return NextResponse.json(null, { status: 404 });
      const sessionQuizId = await resolveSessionToQuizId(sessionId);
      if (sessionQuizId !== access.quiz_id) return NextResponse.json(null, { status: 404 });
      if (!access.is_published && !user.isAdmin && access.created_by !== user.uid) {
        return NextResponse.json(null, { status: 404 });
      }
      const fromQuestion = await getQuestionById(fromQuestionId);
      if (fromQuestion?.node_type === 'situation') {
        if (choiceLabel !== 'continue') return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
      } else if (!user.isGuest) {
        const answer = await getExistingAnswer(sessionId, user.uid, fromQuestionId);
        if (!answer || answer.chosen_label !== choiceLabel) {
          return NextResponse.json({ error: 'Answer required' }, { status: 403 });
        }
      }
      const next = await getNextQuestion(fromQuestionId, choiceLabel);
      if (!next) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      // `next` is reachable only via a connection, so it shares fromQuestionId's quiz.
      return NextResponse.json(
        sanitizeQuestion(next, access.shuffle_choices ? `${user.uid}:${next.id}` : undefined,
          createQuestionToken(sessionId, user.uid, next.id, attemptBoundary)),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const raw = await request.json();

    if (raw?.action === 'start') {
      const parsed = StartBody.safeParse(raw);
      if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      if (parsed.data.is_guest) return NextResponse.json({ is_guest: true });
      const user = await getSessionUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const playSession = await getOrCreateSession(sessionId, user.uid);
      return NextResponse.json(playSession);
    }

    const parsed = AnswerBody.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const user = await getPlayUser(request);

    // An authenticated caller is ALWAYS routed through the non-guest path so
    // the one-answer-per-(session,user,question) guard applies. Otherwise a
    // logged-in player could set is_guest:true to probe every label, learn
    // score_impact, then resubmit the best label non-guest for a perfect score.
    if (user?.isGuest) {
      const access = await getQuizForQuestion(parsed.data.question_id);
      if (!access || !access.is_published) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const sessionQuizId = await resolveSessionToQuizId(sessionId);
      if (!sessionQuizId || sessionQuizId !== access.quiz_id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const question = await getQuestionById(parsed.data.question_id);
      if (!verifyQuestionToken(parsed.data.question_token ?? '', sessionId, user.uid, parsed.data.question_id, 'guest')) {
        return NextResponse.json({ error: 'Invalid question' }, { status: 403 });
      }
      const selectedChoice = question?.choices?.find(
        (choice: Choice) => choice.label === parsed.data.chosen_label,
      );
      if (!selectedChoice || question?.node_type !== 'normal') {
        return NextResponse.json({ error: 'Invalid answer' }, { status: 400 });
      }
      return NextResponse.json({
        is_guest: true,
        points_earned: selectedChoice?.score_impact ?? 0,
        explanation: selectedChoice?.explanation ?? null,
      });
    }

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Authorize: the question must belong to the same quiz this play session
    // is for. Without this, an authenticated user could inject answers from
    // unrelated (or draft) quizzes into their session_id row and inflate
    // their leaderboard score.
    const access = await getQuizForQuestion(parsed.data.question_id);
    if (!access) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const sessionQuizId = await resolveSessionToQuizId(sessionId);
    if (!sessionQuizId || sessionQuizId !== access.quiz_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // One answer per (session, user, question). The leaderboard aggregator
    // takes the LATEST row per question, so without this guard a player can
    // probe every label, observe points_earned, and resubmit the best label
    // last to walk away with a perfect score.
    const saved = await withPlayerAnswerLock(sessionId, user.uid, async () => {
      const boundary = await getAttemptBoundary(sessionId, user.uid);
      if (readQuestionToken(parsed.data.question_token ?? '', sessionId, user.uid, parsed.data.question_id, boundary) === null) {
        return { invalidToken: true } as const;
      }
      const existing = await getExistingAnswer(sessionId, user.uid, parsed.data.question_id);
      if (existing) return { answer: existing, score: await getUserCumulativeScore(sessionId, user.uid) };
      const question = await getQuestionById(parsed.data.question_id);
      if (!question || question.node_type === 'situation' || question.node_type === 'end' ||
          !question.choices?.some((choice: Choice) => choice.label === parsed.data.chosen_label)) {
        return null;
      }
      const answer = await saveUserAnswer({
        session_id: sessionId,
        user_id: user.uid,
        question_id: parsed.data.question_id,
        chosen_label: parsed.data.chosen_label,
        time_taken_ms: parsed.data.time_taken_ms,
      });
      return { answer, score: await getUserCumulativeScore(sessionId, user.uid) };
    });
    if (saved && 'invalidToken' in saved) return NextResponse.json({ error: 'Invalid question' }, { status: 403 });
    if (!saved) return NextResponse.json({ error: 'Invalid answer' }, { status: 400 });
    const { answer: result, score: cumScore } = saved;

    // Fire-and-forget: server writes authoritative score to RTDB so clients
    // cannot spoof the live leaderboard by writing arbitrary values directly.
    void (async () => {
      try {
        await adminRtdb.ref(`sessions/${sessionId}/scores/${user.uid}`).update({
          score: cumScore,
          displayName: 'Player',
          updatedAt: Date.now(),
        });
      } catch { /* non-fatal — live leaderboard degrades gracefully */ }
    })();

    return NextResponse.json({
      chosen_label: 'chosen_label' in result ? result.chosen_label : parsed.data.chosen_label,
      points_earned: result.points_earned,
      explanation: result.explanation,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
