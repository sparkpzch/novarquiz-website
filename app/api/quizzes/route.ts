import { NextResponse } from "next/server";
import { z } from "zod";
import { createQuiz, getAllQuizzes } from "@/lib/db/queries";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const quizzes = await getAllQuizzes();
    const includeDrafts = user.isAdmin && new URL(request.url).searchParams.get("all") === "true";
    const published = includeDrafts ? quizzes : quizzes.filter((q) => q.is_published === true);
    return NextResponse.json(published);
  } catch (error) {
    console.error("Failed to load quizzes:", error);
    return NextResponse.json([], { status: 500 });
  }
}

// Only metadata the creator chooses. `id` is deliberately absent: createQuiz
// upserts ON CONFLICT (id), so a client-chosen id could overwrite another
// quiz. `created_by` comes from the session, never the body. New quizzes are
// drafts; publishing goes through PUT /api/quizzes/<id>, which checks videos.
const QuizCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The Create Quiz page is admin-only; enforce the same rule server-side.
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { allowed, retryAfter } = await checkRateLimit(`uid:${user.uid}`, "/api/quizzes");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const parsed = QuizCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quiz = await createQuiz({
      name: parsed.data.name,
      description: parsed.data.description ?? undefined,
      created_by: user.uid,
      is_published: false,
    });
    return NextResponse.json(quiz, { status: 201 });
  } catch (error) {
    console.error("Failed to create quiz:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
