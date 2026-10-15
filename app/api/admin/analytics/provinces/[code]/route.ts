import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getParticipantRows, getProvinceActivity } from '@/lib/db/lscvd-analytics';
import { ProvinceFiltersSchema, summarize } from '@/lib/analytics/lscvd';
import { PROVINCE_CODES, type ProvinceCode } from '@/lib/onboarding/provinces';

/** One province's LSCVD detail next to the national figures. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { allowed, retryAfter } = await checkRateLimit(`uid:${user.uid}`, '/api/admin');
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  const { code } = await params;
  if (!(PROVINCE_CODES as string[]).includes(code)) return NextResponse.json({ error: 'Unknown province' }, { status: 400 });
  const filters = ProvinceFiltersSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!filters.success) return NextResponse.json({ error: 'Invalid filters' }, { status: 400 });
  try {
    const rows = await getParticipantRows(filters.data);
    const summary = summarize(rows.filter(r => r.province === code));
    const activity = summary.suppressed ? null : await getProvinceActivity(code as ProvinceCode, filters.data);
    return NextResponse.json({ code, summary, national: summarize(rows), activity }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Province analytics unavailable' }, { status: 503 });
  }
}
