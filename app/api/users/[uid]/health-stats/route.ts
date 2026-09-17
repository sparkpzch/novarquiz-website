import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getUserHealthStatsInput } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { summarizeHealthStats } from '@/lib/stats/health';

const Params = z.object({ uid: z.string().min(1).max(128) });

// Per-topic knowledge summary for the /stats "Health" tab. Only the player's
// own answers (or any, for admins) — same access rule as /history.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const parsed = Params.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { uid } = parsed.data;

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.isAdmin && user.uid !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const input = await getUserHealthStatsInput(uid);
    return NextResponse.json(summarizeHealthStats(input));
  } catch (err) {
    console.error('health-stats failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
