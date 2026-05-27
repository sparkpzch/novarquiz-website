import { NextRequest, NextResponse } from 'next/server';
import { getSessionAnalytics } from '@/lib/db/queries';
import { maskLeaderboardEntry } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';

// ---------------------------------------------------------------------------
// SECURITY INVARIANT: uid, role, and isAdmin are ALWAYS sourced from the
// server-signed session cookie via getSessionUser() (jose JWT verification).
// They are never read from the request body, query params, or headers.
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  // 1. Authenticate and authorise from server-verified cookie only.
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // 2. Rate-limit keyed on admin uid (not IP — authenticated admin route).
  const { allowed, retryAfter } = await checkRateLimit(
    `uid:${user.uid}`,
    '/api/admin',
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    );
  }

  const { sessionId } = await params;

  // L3 FIX: Validate sessionId format before it reaches the query layer.
  // Malformed values would cause a Postgres cast error (500) instead of
  // a clear 400. Sessions are UUID v1–v5.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  try {
    const analytics = await getSessionAnalytics(sessionId);
    if (!analytics) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // 3. Defensive second-pass masking at the route boundary.
    //    getSessionAnalytics() already masks inside the query layer.
    //    This ensures masking is enforced even if the query function changes.
    const safeLeaderboard = analytics.leaderboard
      .map((row) => maskLeaderboardEntry(row as Record<string, unknown>))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    // 4. Emit structured audit log when HCP profiling data is accessed.
    //    Covers sessions with HCP audience or entries with non-aggregate classification.
    const isHcpSession = analytics.session?.intended_audience === 'hcp';
    const pseudonymousCount = analytics.leaderboard.filter(
      (row) =>
        (row as Record<string, unknown>).insight_classification === 'pseudonymous' ||
        (row as Record<string, unknown>).insight_classification === 'identified',
    ).length;

    if (isHcpSession || pseudonymousCount > 0) {
      console.error(
        JSON.stringify({
          event: 'admin_hcp_profile_read',
          admin_uid: user.uid,
          session_id: sessionId,
          hcp_session: isHcpSession,
          profiled_entry_count: pseudonymousCount,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return NextResponse.json({
      ...analytics,
      leaderboard: safeLeaderboard,
    });
  } catch (error) {
    console.error('Failed to fetch session analytics:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
