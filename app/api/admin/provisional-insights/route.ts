import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { listProvisionalInsights, reviewProvisionalInsight } from '@/lib/db/provisional-insights';

const ReviewBody = z.object({
  id: z.string().uuid(),
  status: z.enum(['approved', 'rejected']),
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
    const insight = await reviewProvisionalInsight(parsed.data.id, parsed.data.status, gate.user.uid);
    if (!insight) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(JSON.stringify({
      event: 'provisional_insight_review',
      admin_uid: gate.user.uid,
      insight_id: insight.id,
      status: insight.status,
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json(insight);
  } catch (error) {
    console.error('reviewProvisionalInsight failed:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
