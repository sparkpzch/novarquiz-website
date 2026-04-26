import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteUserData } from "@/lib/db/queries";
import { adminAuth, adminRtdb, adminStorage } from "@/lib/firebase/admin";

const COOKIE_NAME = "session";

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

  const sessionsSnap = await adminRtdb.ref("sessions").get();
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

  const teamRoomsSnap = await adminRtdb.ref("teamRooms").get();
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
  const authHeader = request.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!idToken) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    await cleanupRealtimeData(uid);
    await cleanupProfilePhoto(uid);
    await deleteUserData(uid);
    await adminAuth.deleteUser(uid);

    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("delete account failed:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 },
    );
  }
}
