"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInAnonymously, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  resolveJoinToken,
  getRoom,
} from "@/lib/firebase/rtdb";
import { trackEvent } from "@/lib/firebase/analytics";
import { ROOM_STATUS } from "@/lib/constants/session";
import { motion } from "motion/react";
import { getVideoSourceType } from "@/components/ui/AutoPlayVideo";

type SessionInfo = {
  id: string;
  name: string;
  description: string | null;
  is_private?: boolean;
};

export default function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [roomChecking, setRoomChecking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [guestName, setGuestName] = useState("");
  const [firstVideoUrl, setFirstVideoUrl] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(true);

  // Sign in anonymously if there's no existing session.
  // This lets anyone join via a shareable link without creating an account.
  useEffect(() => {
    if (!authLoading && !user) {
      signInAnonymously(auth).catch(() => {
        setFetchError("Could not start a guest session. Please try again.");
      });
    }
  }, [authLoading, user]);

  // Show error early if anonymous sign-in failed (user stays null after auth settles).
  if (!authLoading && !user && fetchError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8 text-center max-w-md w-full">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-white mb-2">Unable to Join</h1>
          <p className="text-gray-400 text-sm">{fetchError}</p>
        </div>
      </div>
    );
  }

  // Resolve join token → session info, then check room status in the background.
  // API path (~200 ms) covers pin_code / session-id tokens from the quizzes page.
  // RTDB path covers ephemeral lobby tokens from host-generated share links.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const TIMED_OUT = Symbol('timed_out');
    function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
      return Promise.race([p, new Promise<typeof TIMED_OUT>(r => setTimeout(() => r(TIMED_OUT), ms))]);
    }

    async function backgroundRoomCheck(sessionId: string) {
      const result = await withTimeout(getRoom(sessionId), 4000);
      if (cancelled || result === TIMED_OUT) return; // unreachable — let server validate on join
      if (!result || result.status === ROOM_STATUS.ENDED) {
        setSession(null);
        setFetchError("This invite link is no longer valid. Ask the host for a new one.");
      }
      setRoomChecking(false);
    }

    (async () => {
      try {
        // Fast path: API resolves pin_code / session.id in ~200 ms.
        // Show the modal immediately; verify room status in the background.
        const apiRes = await fetch(`/api/join/${token}`).catch(() => null);
        if (cancelled) return;

        if (apiRes?.ok) {
          const data = await apiRes.json();
          if (cancelled) return;
          setSession({ id: data.id, name: data.name, description: data.description, is_private: data.is_private });
          setRoomChecking(true);
          backgroundRoomCheck(data.id);
          return;
        }

        // Slow path: ephemeral RTDB token from host share link.
        const rtdbResult = await withTimeout(resolveJoinToken(token), 5000);
        if (cancelled) return;

        if (!rtdbResult || rtdbResult === TIMED_OUT) {
          setFetchError("This invite link is no longer valid. Ask the host for a new one.");
          return;
        }

        const res = await fetch(`/api/sessions/${rtdbResult}`);
        if (!res.ok) { setFetchError("Session not found"); return; }
        const data = await res.json();
        if (cancelled) return;
        setSession({ id: data.id, name: data.quiz_name || data.name, description: data.quiz_description || data.description, is_private: data.is_private });
        setRoomChecking(true);
        backgroundRoomCheck(rtdbResult);
      } catch {
        if (!cancelled) setFetchError("Failed to load session");
      }
    })();
    return () => { cancelled = true; };
  }, [token, user]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}/preview`);
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (data?.media_type === "video" && data?.media_url) {
          setVideoReady(false);
          setFirstVideoUrl(data.media_url);
        }
      } catch {
        // no video to preload — leave videoReady as true
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!firstVideoUrl) return;
    // failsafe: unblock button after 10 s even if canplaythrough never fires
    const timeout = window.setTimeout(() => setVideoReady(true), 10_000);
    return () => window.clearTimeout(timeout);
  }, [firstVideoUrl]);

  const handleJoin = async () => {
    if (!session || !user) return;
    setJoining(true);
    setJoinError("");

    trackEvent("session_join_attempted", { session_id: session.id });

    try {
      if (user.isAnonymous && guestName.trim()) {
        await updateProfile(user, { displayName: guestName.trim() });
      }

      // 1. Call RESTful Join API
      const res = await fetch(`/api/sessions/${session.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: user.displayName || guestName.trim() || "Anonymous",
          photoURL: user.photoURL,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to join session");
      }

      const joinData = await res.json();

      trackEvent("session_join_succeeded", { session_id: session.id });

      // Once the room has started, late joiners go directly into gameplay.
      if (joinData.roomStatus === ROOM_STATUS.STARTED) {
        router.push(`/play/${session.id}/question`);
      } else {
        router.push(`/play/${session.id}/lobby`);
      }
    } catch (err) {
      console.error("Join failed:", err);
      setJoinError(
        `Could not join: ${(err as Error).message || "unknown error"}`,
      );
      setJoining(false);
    }
  };

  // Show spinner while Firebase resolves auth state (including anonymous sign-in).
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-angular-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-angular-700/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-angular-300/15 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        {fetchError ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h1 className="text-xl font-bold text-white mb-2">
              Session Unavailable
            </h1>
            <p className="text-gray-400 text-sm">{fetchError}</p>
          </div>
        ) : !session ? (
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-angular-700 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-angular-700 to-angular-500 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎮</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">
                {session.name}
              </h1>
              {session.description && (
                <p className="text-gray-400 text-sm">{session.description}</p>
              )}
            </div>

            {user.isAnonymous && (
              <div className="mb-6">
                <label className="text-sm font-medium text-gray-300 block mb-2">
                  Your name (optional)
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  placeholder="Guest"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-angular-700 focus:outline-none placeholder:text-gray-600"
                />
              </div>
            )}

            {joinError && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-400 text-sm mb-4 text-center"
              >
                {joinError}
              </motion.p>
            )}

            {firstVideoUrl && (
              <video
                key={firstVideoUrl}
                preload="auto"
                muted
                playsInline
                aria-hidden="true"
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                onLoadedData={() => setVideoReady(true)}
                onCanPlay={() => setVideoReady(true)}
                onCanPlayThrough={() => setVideoReady(true)}
                onError={() => setVideoReady(true)}
              >
                <source src={firstVideoUrl} type={getVideoSourceType(firstVideoUrl)} />
              </video>
            )}

            <button
              onClick={handleJoin}
              disabled={joining || !videoReady || roomChecking}
              className="w-full py-3 rounded-xl bg-linear-to-r from-angular-700 to-angular-500 text-white! font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed hover:from-angular-500 hover:to-angular-700 transition-all"
            >
              {joining ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Joining…
                </span>
              ) : roomChecking ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Checking availability…
                </span>
              ) : !videoReady ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Preparing Question…
                </span>
              ) : (
                "Join Session"
              )}
            </button>

            <p className="text-center text-xs text-gray-500 mt-4">
              {user.isAnonymous ? (
                "Playing as guest — progress won't be saved"
              ) : (
                <>
                  Joining as{" "}
                  <span className="text-angular-300">
                    {user.displayName || user.email}
                  </span>
                </>
              )}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
