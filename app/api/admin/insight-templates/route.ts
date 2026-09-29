import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import {
  deleteInsightTemplate,
  listInsightTemplates,
  reviewInsightTemplate,
  upsertInsightTemplate,
} from '@/lib/db/queries';
import {
  BODY_MAX,
  HEADLINE_MAX,
  INSIGHT_LOCALES,
  INSIGHT_REVIEW_STATUSES,
  SUGGESTION_MAX,
  validateInsightDraft,
} from '@/lib/analytics/insights';
import { AUDIENCE_OPTIONS } from '@/lib/analytics/quiz-metadata';

// ---------------------------------------------------------------------------
// SECURITY INVARIANT: uid and isAdmin come only from the server-signed session
// cookie via getSessionUser(). Rows written here are the text players read, so
// every write is attributed to a verified admin uid.
// ---------------------------------------------------------------------------

const UUID = z.string().uuid();

const Query = z.object({
  quizId: UUID.nullish(),
  audience: z.enum(AUDIENCE_OPTIONS.filter((a) => a !== 'mixed') as ['public', 'hcp']).optional(),
  locale: z.enum(INSIGHT_LOCALES).optional(),
  reviewStatus: z.enum(INSIGHT_REVIEW_STATUSES).optional(),
});

const UpsertBody = z.object({
  quizId: UUID.nullable(),
  clinicalTag: z.string().max(80).default(''),
  audience: z.enum(['public', 'hcp']),
  locale: z.enum(INSIGHT_LOCALES),
  headline: z.string().min(1).max(HEADLINE_MAX),
  body: z.string().min(1).max(BODY_MAX),
  suggestion: z.string().max(SUGGESTION_MAX).nullable().default(null),
});

const ReviewBody = z.object({
  id: UUID,
  reviewStatus: z.enum(INSIGHT_REVIEW_STATUSES),
});

const DeleteBody = z.object({ id: UUID });

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) };

  const { allowed, retryAfter } = await checkRateLimit(`uid:${user.uid}`, '/api/admin');
  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      ),
    };
  }

  return { user };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = Query.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    return NextResponse.json(await listInsightTemplates(parsed.data));
  } catch (err) {
    console.error('listInsightTemplates failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const parsed = UpsertBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // The same content rules a drafted summary has to clear apply to hand-written
  // text — the forbidden-claim check is about what a player reads, not about
  // who typed it.
  const checked = validateInsightDraft(parsed.data);
  if (!checked.ok) return NextResponse.json({ error: checked.reason }, { status: 422 });

  try {
    const template = await upsertInsightTemplate({
      ...parsed.data,
      ...checked.value,
      source: 'manual',
      model: null,
      createdBy: gate.user.uid,
    });
    return NextResponse.json(template);
  } catch (err) {
    console.error('upsertInsightTemplate failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const parsed = ReviewBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const template = await reviewInsightTemplate(
      parsed.data.id,
      parsed.data.reviewStatus,
      gate.user.uid,
    );
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Approval is the gate between drafted text and text a player reads.
    // Log it so there is a record of who opened that gate and when.
    console.error(
      JSON.stringify({
        event: 'insight_template_review',
        admin_uid: gate.user.uid,
        template_id: template.id,
        review_status: template.review_status,
        source: template.source,
        timestamp: new Date().toISOString(),
      }),
    );

    return NextResponse.json(template);
  } catch (err) {
    console.error('reviewInsightTemplate failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const parsed = DeleteBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const removed = await deleteInsightTemplate(parsed.data.id);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('deleteInsightTemplate failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
