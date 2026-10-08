import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { listProvisionalInsights, reviewProvisionalInsight, saveProvisionalDraft } from '@/lib/db/provisional-insights';
import { groupProvisionalInsights } from '@/lib/analytics/insight-groups';
import { reviewInsightGroup } from '@/lib/db/insight-group-review';
import { prepareInsightTranslation } from '@/lib/ai/insight-translation';
import { BODY_MAX, HEADLINE_MAX, SUGGESTION_MAX, validateInsightDraft } from '@/lib/analytics/insights';

const SummaryBody = z.object({
  headline: z.string().trim().min(1).max(HEADLINE_MAX),
  body: z.string().trim().min(1).max(BODY_MAX),
  suggestion: z.string().trim().max(SUGGESTION_MAX).nullable(),
});
const GroupMember = z.object({ id: z.string().uuid(), expectedRevision: z.string().uuid(), summary: SummaryBody.optional() });
const ReviewBody = z.object({
  id: z.string().uuid(),
  status: z.enum(['approved', 'rejected']),
  expectedRevision: z.string().uuid(),
  disposition: z.enum(['keep', 'delete']).optional(),
  members: z.array(GroupMember).min(1).max(50).optional(),
  summary: z.object({
    headline: z.string().trim().min(1).max(HEADLINE_MAX),
    body: z.string().trim().min(1).max(BODY_MAX),
    suggestion: z.string().trim().max(SUGGESTION_MAX).nullable(),
  }).optional(),
}).refine((body) => body.status !== 'rejected' || !!body.disposition, { message: 'Choose whether to keep or delete the rejected summary' });

const DraftBody = z.object({
  members: z.array(GroupMember).min(1).max(50).optional(),
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
    if (parsed.data.members) {
      for (const member of parsed.data.members) {
        if (member.summary && !validateInsightDraft(member.summary).ok) return NextResponse.json({ error: 'Invalid summary wording' }, { status: 422 });
      }
      const members = await reviewInsightGroup(parsed.data.members, parsed.data.status, gate.user.uid, parsed.data.disposition);
      if (!members) return NextResponse.json({ error: 'The summaries changed, languages are incomplete, or wording is in the wrong language. Refresh and review both languages.' }, { status: 409 });
      console.error(JSON.stringify({ event: 'provisional_insight_group_review', admin_uid: gate.user.uid,
        insight_ids: members.map(row => row.id), status: parsed.data.status,
        disposition: parsed.data.disposition, timestamp: new Date().toISOString() }));
      return NextResponse.json({ members });
    }
    // Older callers also approve the complete language pair, never only TH or EN.
    if (parsed.data.status === 'approved') {
      const group = groupProvisionalInsights(await listProvisionalInsights()).find(group => group.members.some(row => row.id === parsed.data.id));
      if (!group) return NextResponse.json({ error: 'Summary unavailable' }, { status: 409 });
      const changes = group.members.map(row => ({ id: row.id,
        expectedRevision: row.id === parsed.data.id ? parsed.data.expectedRevision : row.revision,
        summary: row.id === parsed.data.id && checked?.ok ? checked.value : undefined,
      }));
      const members = await reviewInsightGroup(changes, 'approved', gate.user.uid);
      if (!members) return NextResponse.json({ error: 'Review both languages before approving. A translation may be missing or changed.' }, { status: 409 });
      console.error(JSON.stringify({ event: 'provisional_insight_group_review', admin_uid: gate.user.uid,
        insight_ids: members.map(row => row.id), status: 'approved', timestamp: new Date().toISOString() }));
      return NextResponse.json({ ...members.find(row => row.id === parsed.data.id), members });
    }
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
    if (parsed.data.members) {
      for (const member of parsed.data.members) {
        if (!member.summary || !validateInsightDraft(member.summary).ok) return NextResponse.json({ error: 'Invalid summary wording' }, { status: 422 });
      }
      const members = await reviewInsightGroup(parsed.data.members, 'draft', gate.user.uid);
      if (!members) return NextResponse.json({ error: 'A translation changed. Refresh before saving again.' }, { status: 409 });
      return NextResponse.json({ members });
    }
    const insight = await saveProvisionalDraft(parsed.data.id, checked.value, parsed.data.expectedRevision);
    if (!insight) return NextResponse.json({ error: 'This summary changed. Refresh before saving again.' }, { status: 409 });
    return NextResponse.json(insight);
  } catch (error) {
    console.error('saveProvisionalDraft failed:', error);
    return NextResponse.json({ error: 'Could not save the draft. Please try again.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const parsed = z.object({ id: z.string().uuid(), expectedRevision: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    const source = (await listProvisionalInsights()).find(row => row.id === parsed.data.id);
    if (!source || source.revision !== parsed.data.expectedRevision) return NextResponse.json({ error: 'The source summary changed.' }, { status: 409 });
    const translated = await prepareInsightTranslation(source, gate.user.uid);
    if (!translated) return NextResponse.json({ error: 'Could not prepare the other language. Please retry.' }, { status: 503 });
    return NextResponse.json(translated);
  } catch (error) {
    console.error('prepareInsightTranslation failed:', error);
    return NextResponse.json({ error: 'Could not prepare the other language.' }, { status: 500 });
  }
}
