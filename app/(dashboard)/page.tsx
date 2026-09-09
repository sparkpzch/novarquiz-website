"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  getRoom,
  watchRoom,
  watchTeamRoom,
  resolveJoinToken,
  watchUserSessions,
  type UserSessionEntry,
} from "@/lib/firebase/rtdb";
import { canResumeRoom, hasRecentSessionPresence } from "@/lib/session-resume";
import { ROOM_STATUS } from "@/lib/constants/session";
import { useToast } from "@/components/ui/Toast";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { motion } from "motion/react";
import ProfileAvatar from "@/components/ui/ProfileAvatar";
import { Card } from "@/components/ui/Card";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedJoinInput =
  | { type: "token"; token: string }
  | { type: "team"; sessionId: string; roomId: string; pin: string }
  | null;

type SessionResumeSnapshot = {
  is_private?: boolean;
};

function parseJoinInput(input: string): ParsedJoinInput {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const teamMatch = url.pathname.match(/\/play\/([^/]+)\/team\/([^/?#]+)/);
    if (teamMatch) {
      const pin = url.searchParams.get("pin") ?? "";
      return {
        type: "team",
        sessionId: teamMatch[1],
        roomId: teamMatch[2],
        pin,
      };
    }
    const joinMatch = url.pathname.match(/\/join\/([^/?#]+)/);
    if (joinMatch) {
      return { type: "token", token: joinMatch[1] };
    }
  } catch {
    // ignored: raw token input
  }
  if (/^[A-Za-z0-9_-]{6,}$/.test(trimmed))
    return { type: "token", token: trimmed };
  return null;
}

// ─── Pick up where you left off ───────────────────────────────────────────────

function LiveSessionsWidget() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, UserSessionEntry>>({});
  const [validRooms, setValidRooms] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (!user) return;
    return watchUserSessions(user.uid, data => { setEntries(data); setValidRooms({}); });
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribers = Object.entries(entries).map(([id, entry]) => {
      const updateValidity = (valid: boolean) => setValidRooms(previous => ({ ...previous, [id]: valid }));
      if (entry.mode === "team" && entry.roomId) {
        return watchTeamRoom(entry.roomId, room => updateValidity(
          room?.sessionId === entry.sessionId && canResumeRoom(room, user.uid),
        ));
      }
      return watchRoom(entry.sessionId, room => updateValidity(canResumeRoom(room, user.uid)));
    });
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [entries, user]);

  const list = Object.entries(entries)
    .filter(([id, entry]) => validRooms[id] && hasRecentSessionPresence(entry, now))
    .map(([, entry]) => entry)
    .sort((a, b) => b.joinedAt - a.joinedAt);
  if (list.length === 0) return null;

  const entry = list[0];

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

      if (room?.status === ROOM_STATUS.STARTED) {
        router.push(`/play/${entry.sessionId}/question`);
        return;
      }

      if (entry.mode === "solo" || session?.is_private) {
        router.push(`/play/${entry.sessionId}/question`);
        return;
      }

      if (room?.status === ROOM_STATUS.WAITING) {
        router.push(`/play/${entry.sessionId}/lobby`);
        return;
      }
    } catch {
      // Do not navigate into a stale room when verification fails.
    }
    setResuming(false);
  };

  const modeLabel =
    entry.mode === "team"
      ? "PARTY room"
      : entry.mode === "solo"
        ? "SOLO run"
        : "Lobby";
  const icon =
    entry.mode === "team" ? "🎉" : entry.mode === "solo" ? "🚀" : "👥";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.36),transparent_65%)] pointer-events-none" />

        <div className="relative z-10 mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#70A2F9] text-lg text-white shadow-[0_14px_28px_rgba(17,87,145,0.18)]">
            🕹️
          </div>
          <div>
            <p className="nq-topic">Pick up where you left off</p>
            <h2 className="nq-content">Your latest session is ready.</h2>
            <p className="nq-content">Jump back into the most recent lobby or run in one tap.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={resume}
          disabled={resuming}
          className="relative z-10 flex w-full items-center gap-4 rounded-[22px] border border-[#0460A9]/14 bg-white/78 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition duration-200 hover:bg-white hover:border-[#0460A9]/30 hover:shadow-md active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#8FC0FF] to-[#70A2F9] text-xl text-white shadow-lg shadow-[#70A2F9]/20">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="nq-subject truncate font-bold text-[#16324F]">{entry.sessionName}</p>
            <p className="nq-content mt-0.5 font-medium text-[#5D7EA1]">
              {modeLabel} · {resuming ? "Checking session…" : "Resume now"}
            </p>
          </div>
          <span className="nq-text-accent shrink-0 text-xs font-bold">→</span>
        </button>
      </Card>
    </motion.div>
  );
}

// ─── Join by Code ─────────────────────────────────────────────────────────────

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
      router.push(
        `/play/${parsed.sessionId}/team/${parsed.roomId}?pin=${parsed.pin}`,
      );
      return;
    }

    try {
      const sessionId = await resolveJoinToken(parsed.token);
      if (!sessionId) {
        showToast(
          "That invite link has expired. Ask the host for a new one.",
          "error",
        );
        setBusy(false);
        return;
      }
    } catch {
      // let the join page re-check
    }

    router.push(`/join/${parsed.token}`);
  };

  return (
    <Card className="relative overflow-hidden">
      {/* decorative gradient */}
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.36),transparent_65%)] pointer-events-none" />

      <div className="relative z-10 mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#70A2F9] text-lg text-white shadow-[0_14px_28px_rgba(17,87,145,0.18)]">
          🎟️
        </div>
        <div>
          <p className="nq-topic">Quick join</p>
          <h2 className="nq-content">Have an invite?</h2>
          <p className="nq-content">Paste a join code or invite URL from the host.</p>
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-2.5 sm:flex-row">
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && !busy && handleJoin()}
          placeholder="Code or invite link"
          className="min-w-0 flex-1 rounded-[18px] border border-[#0460A9]/12 bg-white/80 px-4 py-2.5 nq-subject outline-none placeholder:text-[#5D7EA1]/70 focus:border-[#0460A9]/35"
        />
        <button
          onClick={handleJoin}
          disabled={busy || !code.trim()}
          className="rounded-[18px] bg-[#70A2F9] px-5 py-2.5 nq-subject text-[#16324F] transition hover:bg-[#5B8EE0] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
    </Card>
  );
}

// ─── Stats types ──────────────────────────────────────────────────────────────

type UserStats = {
  total_played: number;
  avg_score: number;
  best_score: number;
  best_streak: number;
};

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    fetch(`/api/users/${user.uid}/history`)
      .then((response) => (response.ok ? response.json() : []))
      .then((history: Array<{ total_score: number; streak: number }>) => {
        if (!history.length) return;
        setUserStats({
          total_played: history.length,
          avg_score: Math.round(
            history.reduce((sum, item) => sum + item.total_score, 0) /
            history.length,
          ),
          best_score: Math.max(...history.map((item) => item.total_score)),
          best_streak: Math.max(...history.map((item) => item.streak)),
        });
      })
      .catch(() => { });
  }, [user]);

  const statItems = [
    {
      label: "Best Score",
      value: userStats?.best_score?.toLocaleString() ?? "—",
    },
    {
      label: "Best Streak",
      value: userStats?.best_streak ?? "—",
    },
    {
      label: t("dashboard.total_played"),
      value: userStats ? String(userStats.total_played) : "—",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">

      {/* ── Profile + Stats row ── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">

        {/* Profile card */}
        <motion.div
          className="min-w-0"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="relative overflow-hidden h-full">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.4),transparent_65%)] pointer-events-none" />
            <div className="absolute right-[-36px] top-[14px] h-full w-48 rounded-full border border-[#0460A9]/12 bg-[#70A2F9]/10 pointer-events-none" />
            <div className="absolute right-[18px] top-[-20px] h-full w-36 rounded-full border border-[#0460A9]/12 bg-[#70A2F9]/12 pointer-events-none" />
            <div className="relative flex items-center gap-4 overflow-hidden">
              <ProfileAvatar
                displayName={user?.displayName}
                photoURL={user?.photoURL}
                size={64}
                ringClassName="ring-2 ring-white/80 shadow-lg shadow-[#113D7A]/18"
              />
              <div className="min-w-0 flex-1">
                <p className="nq-details mb-1 font-bold text-[#5D7EA1]">Welcome back,</p>
                <h1 className="nq-header truncate text-xl sm:text-2xl font-display tracking-tight">{user?.displayName || "Player"}</h1>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Stat summary card */}
        <Card className="min-w-0">
          <Card.Header icon="📊" title="Stat Summary" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {statItems.map((item) => (
              <Card.Tile key={item.label} label={item.label} value={item.value} />
            ))}
            <Card.Tile
              label="More"
              value="→"
              onClick={() => router.push("/stats")}
            />
          </div>
        </Card>

      </section>

      {/* Browse Quizzes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <button
          onClick={() => router.push('/quizzes')}
          className="w-full text-left"
        >
          <Card className="relative overflow-hidden transition hover:brightness-[0.97] active:scale-[0.99]">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.36),transparent_65%)] pointer-events-none" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#70A2F9] text-lg text-white shadow-[0_14px_28px_rgba(17,87,145,0.18)]">
                📚
              </div>
              <div>
                <p className="nq-topic">Quizzes</p>
                <h2 className="nq-content">Browse quizzes</h2>
                <p className="nq-content">Find and join available quizzes.</p>
              </div>
              <span className="nq-text-accent ml-auto text-xs font-bold">→</span>
            </div>
          </Card>
        </button>
      </motion.div>

      <JoinByCodeCard />

      <LiveSessionsWidget key={user?.uid} />

    </div>
  );
}
