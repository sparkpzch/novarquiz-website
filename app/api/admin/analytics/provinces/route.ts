import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getParticipantRows } from '@/lib/db/lscvd-analytics';
import { ProvinceFiltersSchema, summarizeProvinces } from '@/lib/analytics/lscvd';

/** Per-province LSCVD summaries for the admin map. Small groups are suppressed in summarizeProvinces. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { allowed, retryAfter } = await checkRateLimit(`uid:${user.uid}`, '/api/admin');
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  const filters = ProvinceFiltersSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!filters.success) return NextResponse.json({ error: 'Invalid filters' }, { status: 400 });
  try {
    const report = summarizeProvinces(await getParticipantRows(filters.data));
    return NextResponse.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Province analytics unavailable' }, { status: 503 });
  }
}
