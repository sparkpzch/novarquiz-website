"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  resolveJoinToken,
  getRoom,
  watchScores,
  watchRoomPlayers,
  type WaitingPlayer,
  type PlayerScore,
} from "@/lib/firebase/rtdb";
import { trackEvent } from "@/lib/firebase/analytics";
import { ROOM_STATUS } from "@/lib/constants/session";
import { motion } from "motion/react";
import AutoPlayVideo from "@/components/ui/AutoPlayVideo";
import ProfileAvatar from "@/components/ui/ProfileAvatar";
import { resolveLivePlayerIdentity } from "@/lib/play/player-identity";

type SessionInfo = {
  id: string;
  name: string;
  description: string | null;
  cover_image_url?: string | null;
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
  const [firstVideoUrl, setFirstVideoUrl] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, PlayerScore>>({});
  const [roomPlayers, setRoomPlayers] = useState<Record<string, WaitingPlayer>>({});
  const rankedPlayers = Object.entries(scores)
    .filter(([, player]) => typeof player?.score === "number" && Number.isFinite(player.score))
    .map(([uid, player]): [string, PlayerScore] => [uid, { ...player, ...resolveLivePlayerIdentity(player, roomPlayers[uid], uid === user?.uid ? user : undefined) }])
    .sort(([, a], [, b]) => b.score - a.score);
  const podium = [
    rankedPlayers[1] ? { player: rankedPlayers[1][1], uid: rankedPlayers[1][0], rank: 2 } : null,
    rankedPlayers[0] ? { player: rankedPlayers[0][1], uid: rankedPlayers[0][0], rank: 1 } : null,
    rankedPlayers[2] ? { player: rankedPlayers[2][1], uid: rankedPlayers[2][0], rank: 3 } : null,
  ];

  useEffect(() => {
    if (!authLoading && (!user || user.isAnonymous)) {
      const destination = window.location.pathname + window.location.search + window.location.hash;
      router.replace(`/sign-in?next=${encodeURIComponent(destination)}`);
    }
  }, [authLoading, user, router]);

  // Resolve join token → session info, then check room status in the background.
  // API path (~200 ms) covers pin_code / session-id tokens from the quizzes page.
  // RTDB path covers ephemeral lobby tokens from host-generated share links.
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    let cancelled = false;

    const TIMED_OUT = Symbol('timed_out');
    function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
      return Promise.race([p, new Promise<typeof TIMED_OUT>(r => setTimeout(() => r(TIMED_OUT), ms))]);
    }

    async function backgroundRoomCheck(sessionId: string) {
      // 1 s window: catches ended sessions when RTDB is already connected.
      // If RTDB is slow (LP on enterprise networks) this times out immediately
      // and the server-side join API does the authoritative validation instead.
      const result = await withTimeout(getRoom(sessionId), 1000);
      if (cancelled) return;
      if (result !== TIMED_OUT && (!result || result.status === ROOM_STATUS.ENDED)) {
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
          setSession({ id: data.id, name: data.name, description: data.description, cover_image_url: data.cover_image_url, is_private: data.is_private });
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
        setSession({ id: data.id, name: data.quiz_name || data.name, description: data.quiz_description || data.description, cover_image_url: data.cover_image_url, is_private: data.is_private });
        setRoomChecking(true);
        backgroundRoomCheck(rtdbResult);
      } catch {
        if (!cancelled) setFetchError("Failed to load session");
      }
    })();
    return () => { cancelled = true; };
  }, [token, user]);

  const liveSessionId = session?.id;
  useEffect(() => {
    if (!liveSessionId || !user || user.isAnonymous) return;
    const stopScores = watchScores(liveSessionId, setScores);
    const stopPlayers = watchRoomPlayers(liveSessionId, setRoomPlayers);
    return () => { stopScores(); stopPlayers(); };
  }, [liveSessionId, user]);

  useEffect(() => {
    if (!session || !user || user.isAnonymous) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}/preview`);
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (data?.media_type === "video" && data?.media_url) {
          setFirstVideoUrl(data.media_url);
        }
      } catch {
        // Preview warmup is optional and never blocks joining.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, user]);

  const handleJoin = async () => {
    if (!session || !user || user.isAnonymous) return;
    setJoining(true);
    setJoinError("");

    trackEvent("session_join_attempted", { session_id: session.id });

    try {
      // 1. Call RESTful Join API
      const headers = new Headers({ "Content-Type": "application/json" });
      const res = await fetch(`/api/sessions/${session.id}/join`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          displayName: user.displayName || "Player",
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

  if (authLoading || !user || user.isAnonymous) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-angular-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eaf1fb] px-4 py-8 text-[#16324F] dark:bg-[#101010] dark:text-[#f5f5f5] sm:py-12">
      {session?.cover_image_url && <img src={session.cover_image_url} alt="" aria-hidden="true" className="pointer-events-none fixed inset-0 h-full w-full scale-105 object-cover opacity-30 blur-md dark:opacity-40" />}
      <div className="pointer-events-none absolute inset-0 bg-[#eaf1fb]/65 dark:bg-[#101010]/65" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-5xl"
      >
        {fetchError ? (
          <div className="nq-card rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h1 className="mb-2 text-xl font-bold text-[#16324F] dark:text-white">
              Session Unavailable
            </h1>
            <p className="text-sm text-[#5D7EA1] dark:text-[#b4c1d3]">{fetchError}</p>
          </div>
        ) : !session ? (
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-angular-700 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="nq-card grid overflow-hidden rounded-[28px] md:grid-cols-[1.08fr_.92fr]">
            <section className="flex min-h-full flex-col border-b border-[#0460A9]/10 dark:border-white/10 md:border-b-0 md:border-r">
              <div className="relative min-h-64 overflow-hidden bg-gradient-to-br from-[#22334c] to-[#255956] sm:min-h-80 md:flex-1">
                {session.cover_image_url ? <img src={session.cover_image_url} alt={`${session.name} cover`} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(134,186,169,.38),transparent_30%),radial-gradient(circle_at_20%_90%,rgba(100,132,183,.45),transparent_38%)]" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#10294a]/95 via-[#10294a]/25 to-black/5" />
                <div className="absolute inset-x-6 bottom-6">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[.18em] text-white/75">You’re invited to play</p>
                  <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">{session.name}</h1>
                </div>
              </div>
              {session.description && <p className="px-6 py-5 text-sm leading-relaxed text-[#5D7EA1] dark:text-[#bdc9d8]">{session.description}</p>}
            </section>

            <section className="bg-white/65 p-5 dark:bg-[#191919]/90 sm:p-7">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#0460A9] dark:text-[#92bfff]">Join session</p>
                <p className="mt-1 text-sm text-[#5D7EA1] dark:text-[#b4b4b4]">Enter the game and see how you rank.</p>
              </div>

            {joinError && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-600 text-sm mb-4 text-center"
              >
                {joinError}
              </motion.p>
            )}

            {firstVideoUrl && (
              <AutoPlayVideo
                src={firstVideoUrl}
                autoPlay={false}
                key={firstVideoUrl}
                preload="auto"
                muted
                playsInline
                aria-hidden="true"
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
              />
            )}

            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full rounded-xl bg-[#0460A9] px-4 py-3.5 text-base font-semibold text-white! shadow-[0_10px_24px_rgba(4,96,169,.2)] transition hover:bg-[#055a9e] disabled:cursor-not-allowed disabled:opacity-50"
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
              ) : (
                "Join Session"
              )}
            </button>

            <p className="mt-4 text-center text-xs text-[#7187a1] dark:text-[#a3a3a3]">
              Joining as <span className="text-[#0460A9] dark:text-[#92bfff]">{user.displayName || user.email}</span>
            </p>

            <div className="mt-7 border-t border-[#0460A9]/12 pt-5 dark:border-white/10">
              <div className="mb-3 flex items-center justify-between">
                <div><h2 className="text-sm font-semibold text-[#16324F] dark:text-white">Leaderboard</h2><p className="mt-0.5 text-xs text-[#7187a1] dark:text-[#a3a3a3]">Live session scores</p></div>
              </div>
              {rankedPlayers.length ? <div className="flex items-end justify-center gap-2 pt-2">
                {podium.map((place, index) => {
                  const height = place?.rank === 1 ? 'h-[104px]' : place?.rank === 2 ? 'h-[78px]' : 'h-[60px]';
                  const accent = place?.rank === 1 ? 'border-[#70A2F9]/55 bg-[#0460A9]/10 text-[#0460A9]' : place?.rank === 2 ? 'border-slate-300 bg-slate-100 text-[#456786]' : 'border-amber-700/20 bg-amber-100 text-[#8b5e20]';
                  return <div key={place?.uid ?? `empty-${index}`} className="flex min-w-0 flex-1 flex-col items-center">
                    {place ? <>
                      <ProfileAvatar displayName={place.player.displayName} photoURL={place.player.photoURL} size={44} ringClassName={`ring-2 shadow-lg ${place.rank === 1 ? 'ring-amber-300/80' : place.rank === 2 ? 'ring-slate-200/70' : 'ring-orange-300/70'}`} />
                      <p className="mt-2 w-full truncate text-center text-[11px] font-semibold text-[#294867] dark:text-[#e5e5e5]">{place.player.displayName || 'Player'}{place.uid === user.uid && <span className="font-normal"> · You</span>}</p>
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-[#16324F] dark:text-white">{(place.player.score ?? 0).toLocaleString()} <span className="font-normal text-[#8298b2] dark:text-[#a3a3a3]">pts</span></p>
                    </> : <div className="h-[82px]" />}
                    <div className={`mt-2 flex w-full flex-col items-center justify-start rounded-t-xl border-t px-2 pt-2 ${height} ${place ? accent : 'border-[#0460A9]/10 bg-[#0460A9]/[.025] text-[#9bb2c9] dark:border-white/10 dark:bg-white/[.03] dark:text-white/25'}`}>
                      <span className="text-base leading-none">{place ? '🏆' : '·'}</span>
                      <span className="mt-1 text-xs font-semibold">{place ? `#${place.rank}` : '—'}</span>
                    </div>
                  </div>;
                })}
              </div> : <p className="rounded-lg bg-[#0460A9]/[.04] px-3 py-3 text-xs leading-relaxed text-[#7187a1] dark:bg-white/[.04] dark:text-[#a3a3a3]">Scores will appear here as players answer questions.</p>}
            </div>
            </section>
          </div>
        )}
      </motion.div>
    </div>
  );
}
