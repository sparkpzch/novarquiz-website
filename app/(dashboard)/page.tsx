"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  getRoom,
  resolveJoinToken,
  watchRoom,
  watchTeamRoom,
  watchUserSessions,
  type UserSessionEntry,
} from "@/lib/firebase/rtdb";
import { canResumeRoom, hasRecentSessionPresence } from "@/lib/session-resume";
import { ROOM_STATUS } from "@/lib/constants/session";
import { useToast } from "@/components/ui/Toast";
import ProfileAvatar from "@/components/ui/ProfileAvatar";
import "@/lib/i18n";

type ParsedJoinInput =
  | { type: "token"; token: string }
  | { type: "team"; sessionId: string; roomId: string; pin: string }
  | null;

type SessionResumeSnapshot = {
  is_private?: boolean;
};

type UserStats = {
  total_played: number;
  avg_score: number;
  best_score: number;
  best_streak: number;
};

type DashboardSession = {
  id: string;
  name?: string;
  description?: string | null;
  cover_image_url?: string | null;
  question_count?: number;
  pin_code?: string | null;
  status?: string;
  is_private?: boolean;
  created_at?: string;
};

function parseJoinInput(input: string): ParsedJoinInput {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const teamMatch = url.pathname.match(/\/play\/([^/]+)\/team\/([^/?#]+)/);
    if (teamMatch) {
      return {
        type: "team",
        sessionId: teamMatch[1],
        roomId: teamMatch[2],
        pin: url.searchParams.get("pin") ?? "",
      };
    }

    const joinMatch = url.pathname.match(/\/join\/([^/?#]+)/);
    if (joinMatch) return { type: "token", token: joinMatch[1] };
  } catch {
    // Raw token input is handled below.
  }

  return /^[A-Za-z0-9_-]{6,}$/.test(trimmed)
    ? { type: "token", token: trimmed }
    : null;
}

function DashboardIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4f76ff]/15 text-[#7898ff]">
      {children}
    </span>
  );
}

function LiveSessionsWidget() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, UserSessionEntry>>({});
  const [validRooms, setValidRooms] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (!user) return;
    return watchUserSessions(user.uid, (data) => {
      setEntries(data);
      setValidRooms({});
    });
  }, [user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribers = Object.entries(entries).map(([id, entry]) => {
      const updateValidity = (valid: boolean) =>
        setValidRooms((previous) => ({ ...previous, [id]: valid }));

      if (entry.mode === "team" && entry.roomId) {
        return watchTeamRoom(entry.roomId, (room) =>
          updateValidity(room?.sessionId === entry.sessionId && canResumeRoom(room, user.uid)),
        );
      }

      return watchRoom(entry.sessionId, (room) =>
        updateValidity(canResumeRoom(room, user.uid)),
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [entries, user]);

  const entry = Object.entries(entries)
    .filter(([id, item]) => validRooms[id] && hasRecentSessionPresence(item, now))
    .map(([, item]) => item)
    .sort((a, b) => b.joinedAt - a.joinedAt)[0];

  if (!entry) return null;

  const resume = async () => {
    if (resuming) return;
    setResuming(true);

    if (entry.mode === "team" && entry.roomId) {
      router.push(`/play/${entry.sessionId}/team/${entry.roomId}`);
      return;
    }

    try {
      const [sessionResponse, room] = await Promise.all([
        fetch(`/api/sessions/${entry.sessionId}`),
        getRoom(entry.sessionId),
      ]);
      const session = sessionResponse.ok
        ? ((await sessionResponse.json()) as SessionResumeSnapshot)
        : null;

      if (!session || !user || !canResumeRoom(room, user.uid)) {
        setResuming(false);
        return;
      }

      if (room?.status === ROOM_STATUS.STARTED || entry.mode === "solo" || session.is_private) {
        router.push(`/play/${entry.sessionId}/question`);
        return;
      }

      if (room?.status === ROOM_STATUS.WAITING) {
        router.push(`/play/${entry.sessionId}/lobby`);
        return;
      }
    } catch {
      // Keep the user on the dashboard if the room is stale.
    }

    setResuming(false);
  };

  return (
    <motion.button
      type="button"
      onClick={resume}
      disabled={resuming}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex w-full items-center gap-3 rounded-xl border border-[#557cff]/35 bg-[#101b49] px-4 py-3 text-left shadow-[0_14px_36px_rgba(0,0,0,0.18)] transition hover:border-[#7898ff]/70 hover:bg-[#142153] disabled:cursor-wait disabled:opacity-70"
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4f76ff] text-white">
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#68f0b0]" />
        ▶
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7898ff]">
          Continue playing
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-white">
          {entry.sessionName}
        </span>
      </span>
      <span className="text-sm font-semibold text-[#9aabda] transition group-hover:translate-x-0.5 group-hover:text-white">
        {resuming ? "Checking…" : "Resume →"}
      </span>
    </motion.button>
  );
}

function JoinByCodeCard() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handleJoin = async () => {
    const parsed = parseJoinInput(code);
    if (!parsed) {
      showToast("Enter a valid invite code or link", "error");
      return;
    }

    if (!user) {
      if (parsed.type === "token") {
        router.push(`/sign-in?next=/join/${parsed.token}`);
      } else {
        router.push(
          `/sign-in?next=${encodeURIComponent(`/play/${parsed.sessionId}/team/${parsed.roomId}?pin=${parsed.pin}`)}`,
        );
      }
      return;
    }

    setBusy(true);
    if (parsed.type === "team") {
      router.push(`/play/${parsed.sessionId}/team/${parsed.roomId}?pin=${parsed.pin}`);
      return;
    }

    try {
      const sessionId = await resolveJoinToken(parsed.token);
      if (!sessionId) {
        showToast("That invite link has expired. Ask the host for a new one.", "error");
        setBusy(false);
        return;
      }
    } catch {
      // The join page performs the authoritative check.
    }

    router.push(`/join/${parsed.token}`);
  };

  return (
    <section className="relative overflow-hidden rounded-xl border border-white/8 bg-[#0d173e] p-4 sm:p-5">
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#3f6fff]/20 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <DashboardIcon>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M6.75 3v4.5m10.5-4.5v4.5M5 11h4m2 0h4m2 0h2M5 15h4m2 0h4m2 0h2" />
          </svg>
        </DashboardIcon>
        <div>
          <h2 className="text-sm font-semibold text-white">Quick Join</h2>
          <p className="mt-1 text-xs leading-5 text-[#8391bc]">Enter a room code or paste an invite link.</p>
        </div>
      </div>

      <div className="relative mt-4 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && !busy && handleJoin()}
          placeholder="Code or invite link"
          aria-label="Code or invite link"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#070d2b] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-[#53618f] focus:border-[#557cff]/70 focus:ring-2 focus:ring-[#557cff]/15"
        />
        <button
          type="button"
          onClick={handleJoin}
          disabled={busy || !code.trim()}
          className="rounded-lg bg-[#4f76ff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(79,118,255,0.25)] transition hover:bg-[#6386ff] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/7 bg-[#0a1234] px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#62709d]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function QuizCard({ session, onClick }: { session: DashboardSession; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-w-0 overflow-hidden rounded-xl border border-white/8 bg-[#0a1234] text-left transition hover:-translate-y-0.5 hover:border-[#557cff]/45 hover:shadow-[0_18px_40px_rgba(0,0,0,0.25)]"
    >
      <div className="nq-always-dark relative h-28 overflow-hidden bg-[linear-gradient(135deg,#2346ae,#101942_55%,#542d8e)] sm:h-32">
        {session.cover_image_url ? (
          <Image
            src={session.cover_image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 24vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0">
            <div className="absolute -left-8 top-3 h-28 w-28 rounded-full bg-[#4f76ff]/70 blur-2xl" />
            <div className="absolute right-0 top-0 h-24 w-24 rotate-12 rounded-[30%] bg-[#bf5eff]/45 blur-xl" />
            <div className="absolute bottom-4 left-5 text-3xl opacity-80">✦</div>
          </div>
        )}
        <span className="absolute right-2 top-2 rounded-full border border-white/15 bg-[#080e2d]/80 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur">
          {session.question_count ?? 0} questions
        </span>
      </div>
      <div className="p-3.5">
        <h3 className="line-clamp-1 text-sm font-semibold text-white">{session.name || "Untitled quiz"}</h3>
        <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-[#7987b3]">
          {session.description || "Test your knowledge and challenge your friends."}
        </p>
        <span className="mt-3 inline-flex items-center rounded-md border border-[#557cff]/45 px-2.5 py-1 text-[10px] font-semibold text-[#91a7ff] transition group-hover:bg-[#4f76ff] group-hover:text-white">
          Play now
        </span>
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    fetch(`/api/users/${user.uid}/history`)
      .then((response) => (response.ok ? response.json() : []))
      .then((history: Array<{ total_score: number; streak: number }>) => {
        if (!history.length) return;
        setUserStats({
          total_played: history.length,
          avg_score: Math.round(
            history.reduce((sum, item) => sum + item.total_score, 0) / history.length,
          ),
          best_score: Math.max(...history.map((item) => item.total_score)),
          best_streak: Math.max(...history.map((item) => item.streak)),
        });
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    fetch("/api/sessions")
      .then((response) => (response.ok ? response.json() : []))
      .then((items: DashboardSession[]) => {
        const available = items
          .filter(
            (item) =>
              item.is_private === false &&
              (item.status === "opened" || item.status === "started"),
          )
          .sort(
            (a, b) =>
              new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
          );
        setSessions(available.slice(0, 3));
      })
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, []);

  const avgForRing = Math.max(0, Math.min(userStats?.avg_score ?? 0, 100));

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 lg:space-y-5">
      <div className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[#5f6e9c] lg:flex">
        <span>Pages</span>
        <span>/</span>
        <span className="text-[#aab6da]">Dashboard</span>
      </div>

      <LiveSessionsWidget key={user?.uid} />

      <section className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="nq-always-dark relative min-h-[205px] overflow-hidden rounded-xl border border-[#506eff]/25 bg-[linear-gradient(135deg,#17246f_0%,#3435b6_45%,#294ee5_100%)] p-5 sm:min-h-[226px] sm:p-6"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-12 -top-16 h-60 w-60 rounded-[42%] bg-[#ce6cff]/55 blur-2xl" />
            <div className="absolute bottom-[-90px] left-[20%] h-56 w-72 rotate-[-18deg] rounded-[48%] bg-[#159cff]/55 blur-2xl" />
            <div className="absolute right-[12%] top-[40%] h-24 w-52 rotate-[-28deg] rounded-[80%_20%] bg-white/40 blur-xl" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_25%,rgba(255,255,255,.12)_55%,transparent_70%)]" />
          </div>
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3">
              <ProfileAvatar
                displayName={user?.displayName}
                photoURL={user?.photoURL}
                size={42}
                ringClassName="ring-2 ring-white/35 shadow-lg"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/70">Welcome back!</p>
                <h1 className="truncate text-xl font-semibold text-white sm:text-2xl">
                  {user?.displayName || "Player"}
                </h1>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/quizzes")}
              className="mt-auto self-start text-xs font-medium text-white/85 transition hover:text-white"
            >
              All quizzes →
            </button>
          </div>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-[1.3fr_0.8fr]">
          <section className="rounded-xl border border-white/8 bg-[#0d173e] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Performance overview</h2>
                <p className="mt-1 text-xs text-[#7886b2]">Your latest quiz activity and score.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/stats")}
                className="shrink-0 text-[10px] font-semibold text-[#7898ff] hover:text-white"
              >
                View stats →
              </button>
            </div>

            <div className="mt-4 grid grid-cols-[104px_1fr] items-center gap-4 sm:grid-cols-[120px_1fr]">
              <div
                className="relative mx-auto flex h-[98px] w-[98px] items-center justify-center rounded-full sm:h-[108px] sm:w-[108px]"
                style={{
                  background: `conic-gradient(#f19a38 ${avgForRing * 3.6}deg, #182044 0deg)`,
                }}
              >
                <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-[#0d173e] sm:h-[84px] sm:w-[84px]">
                  <span className="text-xl font-semibold tabular-nums text-white sm:text-2xl">
                    {userStats?.avg_score ?? "—"}
                  </span>
                  <span className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-[#7180ad]">Avg score</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="Best score" value={userStats?.best_score ?? "—"} />
                <MetricCard label="Best streak" value={userStats?.best_streak ?? "—"} />
                <MetricCard label={t("dashboard.total_played")} value={userStats?.total_played ?? "—"} />
                <MetricCard label="Status" value={userStats ? "Active" : "New"} />
              </div>
            </div>
          </section>

          <JoinByCodeCard />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.42fr_1.58fr]">
        <div className="rounded-xl border border-white/8 bg-[#0d173e] p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Stat Summary</h2>
            <span className="rounded-md bg-[#4f76ff]/15 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#7898ff]">
              Live
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["Best score", userStats?.best_score ?? "—"],
              ["Best streak", userStats?.best_streak ?? "—"],
              ["Average score", userStats?.avg_score ?? "—"],
              ["Total played", userStats?.total_played ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-white/6 pb-2.5 last:border-0 last:pb-0">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#7784ae]">{label}</span>
                <span className="text-base font-semibold tabular-nums text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <section className="rounded-xl border border-white/8 bg-[#0d173e] p-4 sm:p-5">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Quizzes</h2>
              <p className="mt-1 text-xs text-[#7886b2]">Available quizzes picked for you.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/quizzes")}
              className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-semibold text-[#9aa8d1] transition hover:border-[#557cff]/50 hover:text-white"
            >
              View all
            </button>
          </div>

          {sessionsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-56 animate-pulse rounded-xl bg-white/[0.035]" />
              ))}
            </div>
          ) : sessions.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((session) => (
                <QuizCard
                  key={session.id}
                  session={session}
                  onClick={() => router.push(`/join/${session.pin_code || session.id}`)}
                />
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/quizzes")}
              className="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-[#0a1234] px-5 text-center transition hover:border-[#557cff]/45"
            >
              <span className="text-2xl">✦</span>
              <span className="mt-2 text-sm font-semibold text-white">Explore the quiz library</span>
              <span className="mt-1 text-xs text-[#7886b2]">New public sessions will appear here.</span>
            </button>
          )}
        </section>
      </section>
    </div>
  );
}
