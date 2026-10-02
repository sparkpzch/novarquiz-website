import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { listProvisionalInsights, reviewProvisionalInsight, saveProvisionalDraft } from '@/lib/db/provisional-insights';
import { BODY_MAX, HEADLINE_MAX, SUGGESTION_MAX, validateInsightDraft } from '@/lib/analytics/insights';

const ReviewBody = z.object({
  id: z.string().uuid(),
  status: z.enum(['approved', 'rejected']),
  expectedRevision: z.string().uuid(),
  disposition: z.enum(['keep', 'delete']).optional(),
  summary: z.object({
    headline: z.string().trim().min(1).max(HEADLINE_MAX),
    body: z.string().trim().min(1).max(BODY_MAX),
    suggestion: z.string().trim().max(SUGGESTION_MAX).nullable(),
  }).optional(),
}).refine((body) => body.status !== 'rejected' || !!body.disposition, { message: 'Choose whether to keep or delete the rejected summary' });

const DraftBody = z.object({
  id: z.string().uuid(),
  expectedRevision: z.string().uuid(),
  headline: z.string().trim().min(1).max(HEADLINE_MAX),
  body: z.string().trim().min(1).max(BODY_MAX),
  suggestion: z.string().trim().max(SUGGESTION_MAX).nullable().default(null),
});

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) };
  const { allowed, retryAfter } = await checkRateLimit(`uid:${user.uid}`, '/api/admin');
  if (!allowed) {
    return {
      error: NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }),
    };
  }
  return { user };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    return NextResponse.json(await listProvisionalInsights());
  } catch (error) {
    console.error('listProvisionalInsights failed:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const parsed = ReviewBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const checked = parsed.data.summary ? validateInsightDraft(parsed.data.summary) : null;
    if (checked && !checked.ok) return NextResponse.json({ error: checked.reason }, { status: 422 });
    const insight = await reviewProvisionalInsight(parsed.data.id, parsed.data.status, gate.user.uid, {
      expectedRevision: parsed.data.expectedRevision,
      disposition: parsed.data.disposition,
      summary: checked?.ok ? checked.value : undefined,
    });
    if (!insight) return NextResponse.json({ error: 'This summary changed. Refresh before reviewing it again.' }, { status: 409 });
    console.error(JSON.stringify({
      event: 'provisional_insight_review',
      admin_uid: gate.user.uid,
      insight_id: insight.id,
      status: insight.status,
      disposition: parsed.data.disposition,
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json(insight);
  } catch (error) {
    console.error('reviewProvisionalInsight failed:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const parsed = DraftBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a headline and body within the character limits.' }, { status: 400 });
  const checked = validateInsightDraft(parsed.data);
  if (!checked.ok) return NextResponse.json({ error: checked.reason }, { status: 422 });
  try {
    const insight = await saveProvisionalDraft(parsed.data.id, checked.value, parsed.data.expectedRevision);
    if (!insight) return NextResponse.json({ error: 'This summary changed. Refresh before saving again.' }, { status: 409 });
    return NextResponse.json(insight);
  } catch (error) {
    console.error('saveProvisionalDraft failed:', error);
    return NextResponse.json({ error: 'Could not save the draft. Please try again.' }, { status: 500 });
  }
}
