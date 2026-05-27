import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteUserData } from '@/lib/db/queries';
import { adminAuth, adminDb, adminRtdb, adminStorage } from '@/lib/firebase/admin';
import { checkRateLimit } from '@/lib/ratelimit';
import { getRateLimitIp } from '@/lib/security/request-ip';

// ---------------------------------------------------------------------------
// SECURITY INVARIANT: Identity is verified exclusively via Firebase Admin
// verifyIdToken() on the Bearer token from the Authorization header.
// The uid used for all deletion steps comes only from the verified decoded token.
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'session';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type SessionRoomRecord = {
  hostId?: string;
  leaderId?: string;
  joinToken?: string | null;
  players?: Record<string, unknown>;
  scores?: Record<string, unknown>;
};

type TeamRoomRecord = {
  hostId?: string;
  players?: Record<string, unknown>;
};

async function cleanupRealtimeData(uid: string) {
  const rootRef = adminRtdb.ref();
  const updates: Record<string, null> = {
    [`userSessions/${uid}`]: null,
  };

  const sessionsSnap = await adminRtdb.ref('sessions').get();
  const sessions =
    (sessionsSnap.val() as Record<string, SessionRoomRecord> | null) ?? {};

  for (const [sessionId, session] of Object.entries(sessions)) {
    if (session.hostId === uid) {
      updates[`sessions/${sessionId}`] = null;
      if (session.joinToken) {
        updates[`joinTokens/${session.joinToken}`] = null;
      }
      continue;
    }

    if (session.leaderId === uid) {
      updates[`sessions/${sessionId}/leaderId`] = null;
    }
    if (session.players?.[uid] !== undefined) {
      updates[`sessions/${sessionId}/players/${uid}`] = null;
    }
    if (session.scores?.[uid] !== undefined) {
      updates[`sessions/${sessionId}/scores/${uid}`] = null;
    }
  }

  const teamRoomsSnap = await adminRtdb.ref('teamRooms').get();
  const teamRooms =
    (teamRoomsSnap.val() as Record<string, TeamRoomRecord> | null) ?? {};

  for (const [roomId, room] of Object.entries(teamRooms)) {
    if (room.hostId === uid) {
      updates[`teamRooms/${roomId}`] = null;
      continue;
    }

    if (room.players?.[uid] !== undefined) {
      updates[`teamRooms/${roomId}/players/${uid}`] = null;
    }
  }

  await rootRef.update(updates);
}

async function cleanupProfilePhoto(uid: string) {
  await adminStorage
    .bucket()
    .file(`Users/Profile Pictures/${uid}`)
    .delete({ ignoreNotFound: true });
}

export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!idToken) {
    return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
  }

  // Pre-verify IP-keyed rate-limit so a flood of junk tokens cannot exhaust
  // Firebase Auth quota on the verifyIdToken call below. Per-uid limiter still
  // runs after the verify succeeds as a second layer.
  {
    const { allowed, retryAfter } = await checkRateLimit(
      getRateLimitIp(request),
      '/api/account',
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }
  }

  let uid: string;
  try {
    // H1 FIX: checkRevoked=true rejects tokens that have been revoked via
    // Firebase console or after a password reset — prevents stale tokens
    // from triggering the deletion cascade.
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
  }

  // L2 FIX: Rate-limit deletion attempts keyed on uid. Destructive operation —
  // conservative cap of 5/min to prevent accidental or abusive repeat calls.
  const { allowed, retryAfter } = await checkRateLimit(`uid:${uid}`, '/api/account');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // ---------------------------------------------------------------------------
  // Coordinated best-effort deletion cascade.
  //
  // Order matters for PDPA "Right to be Forgotten":
  //   1. PostgreSQL  — transactional; roll back on failure (no partial deletes).
  //   2. Firestore   — consent record; log failure, continue.
  //   3. RTDB        — live presence/sessions; log failure, continue.
  //   4. Storage     — profile photo; log failure, continue.
  //   5. Firebase Auth — delete the identity record; fail-hard (must succeed
  //                      so the user cannot log back in after data is gone).
  //   6. Session cookie — clear.
  //
  // Cross-system atomicity is not possible; each step is logged individually
  // so any partial failure is surfaced in server logs for manual remediation.
  // ---------------------------------------------------------------------------

  // Step 1: PostgreSQL cascade (transactional).
  try {
    await deleteUserData(uid);
  } catch (err) {
    // M3 FIX: log only the message — not the raw error which may contain
    // query text, connection strings, or other sensitive server internals.
    console.error('[account/delete] Step 1 FAILED — PostgreSQL cascade:', {
      uid,
      message: errorMessage(err),
    });
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 });
  }

  // Step 2: Firestore consent record.
  try {
    await adminDb.collection('userConsents').doc(uid).delete();
  } catch (err) {
    console.error('[account/delete] Step 2 PARTIAL — Firestore consent record not deleted:', {
      uid,
      message: errorMessage(err),
    });
  }

  // Step 3: Firebase Realtime Database — live presence, sessions, team rooms.
  try {
    await cleanupRealtimeData(uid);
  } catch (err) {
    console.error('[account/delete] Step 3 PARTIAL — RTDB cleanup incomplete:', {
      uid,
      message: errorMessage(err),
    });
  }

  // Step 4: Cloud Storage — profile photo.
  try {
    await cleanupProfilePhoto(uid);
  } catch (err) {
    console.error('[account/delete] Step 4 PARTIAL — profile photo not deleted:', {
      uid,
      message: errorMessage(err),
    });
  }

  // Step 5: Firebase Auth — must succeed; user must not be able to log back in.
  try {
    await adminAuth.deleteUser(uid);
  } catch (err) {
    console.error('[account/delete] Step 5 FAILED — Firebase Auth user not deleted:', {
      uid,
      message: errorMessage(err),
    });
    return NextResponse.json({ error: 'Failed to delete auth account' }, { status: 500 });
  }

  // Step 6: Clear session cookie.
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);

  return NextResponse.json({ ok: true });
}
