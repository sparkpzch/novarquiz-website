"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  createTeamRoom,
  resolveJoinToken,
  trackUserSession,
  watchUserSessions,
  type UserSessionEntry,
} from "@/lib/firebase/rtdb";
import { useToast } from "@/components/ui/Toast";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { motion, AnimatePresence } from "motion/react";
import type { Quiz } from "@/lib/types";
import ProfileAvatar from "@/components/ui/ProfileAvatar";

type ParsedJoinInput =
  | { type: "token"; token: string }
  | { type: "team"; sessionId: string; roomId: string; pin: string }
  | null;

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

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="nq-card rounded-[28px] p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-4xl">{icon}</span>
        <div className={`h-3 w-24 rounded-full ${accent}`} />
      </div>
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold text-[#0460A9]">{value}</p>
    </motion.div>
  );
}

function LiveSessionsWidget() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, UserSessionEntry>>({});

  useEffect(() => {
    if (!user) return;
    return watchUserSessions(user.uid, setEntries);
  }, [user]);

  const list = Object.values(entries).sort((a, b) => b.joinedAt - a.joinedAt);
  if (list.length === 0) return null;

  const resume = (entry: UserSessionEntry) => {
    if (entry.mode === "team" && entry.roomId) {
      router.push(`/play/${entry.sessionId}/team/${entry.roomId}`);
      return;
    }
    if (entry.mode === "solo") {
      router.push(`/play/${entry.sessionId}/question`);
      return;
    }
    router.push(`/play/${entry.sessionId}/lobby`);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xl">⚡</span>
        <div>
          <h2 className="text-xl font-semibold text-[#16324F]">
            Pick up where you left off
          </h2>
          <p className="text-sm text-[#5D7EA1]">
            Active rooms and live sessions linked to this account.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((entry, index) => {
          const id = entry.roomId
            ? `${entry.sessionId}__${entry.roomId}`
            : entry.sessionId;
          const modeLabel =
            entry.mode === "team"
              ? "PARTY room"
              : entry.mode === "solo"
                ? "SOLO run"
                : "Lobby";
          const icon =
            entry.mode === "team" ? "🎉" : entry.mode === "solo" ? "🚀" : "👥";
          return (
            <motion.button
              key={id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => resume(entry)}
              className="nq-card-soft flex items-center gap-4 rounded-[28px] p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(17,87,145,0.18)]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#92BFFF] to-[#0460A9] text-2xl text-white shadow-lg shadow-[#0460A9]/20">
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-[#16324F]">
                  {entry.sessionName}
                </p>
                <p className="mt-1 text-sm text-[#5D7EA1]">
                  {modeLabel} · Resume now
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
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
    <section className="nq-card-dark rounded-[30px] p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F04D95]/20 text-xl">
          🎟️
        </div>
        <div>
          <h2 className="nq-on-dark text-xl font-semibold">Have an invite?</h2>
          <p className="nq-on-dark-muted text-sm">
            Paste a join code or invite URL from the host.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && !busy && handleJoin()}
          placeholder="Code or invite link"
          className="nq-on-dark min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 outline-none placeholder:text-[#DDEBFF] focus:border-[#92BFFF] focus:bg-white/[0.14]"
        />
        <button
          onClick={handleJoin}
          disabled={busy || !code.trim()}
          className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-[#111827]! transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
    </section>
  );
}

function SoloOrPartyModal({
  session,
  onClose,
}: {
  session: Quiz;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [creatingParty, setCreatingParty] = useState(false);

  const handleSolo = () => {
    onClose();
    router.push(`/play/${session.id}`);
  };

  const handleParty = async () => {
    if (!user) {
      showToast("Please sign in to host a party room", "error");
      return;
    }
    setCreatingParty(true);
    try {
      const { roomId } = await createTeamRoom(session.id, {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
      });
      await trackUserSession(user.uid, {
        sessionId: session.id,
        sessionName: session.name,
        mode: "team",
        roomId,
        joinedAt: Date.now(),
      });
      onClose();
      router.push(`/play/${session.id}/team/${roomId}`);
    } catch (error) {
      console.error("createTeamRoom failed:", error);
      showToast(
        `Could not create party room: ${(error as Error).message || "unknown error"}`,
        "error",
      );
      setCreatingParty(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#08122A]/45 p-4 backdrop-blur-md md:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="nq-card w-full max-w-xl rounded-[34px] p-6 md:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">
            Choose Play Mode
          </p>
          <h2 className="mt-2 text-2xl font-bold text-[#16324F]">
            {session.name}
          </h2>
          {session.description && (
            <p className="mt-2 text-sm text-[#5D7EA1]">{session.description}</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={handleSolo}
            className="rounded-[28px] border border-[#0460A9]/12 bg-white px-5 py-6 text-left shadow-[0_18px_42px_rgba(17,87,145,0.1)] transition hover:-translate-y-1"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#92BFFF] to-[#0460A9] text-2xl text-white">
              🚀
            </div>
            <p className="text-lg font-bold text-[#16324F]">SOLO</p>
            <p className="mt-2 text-sm text-[#5D7EA1]">
              Jump straight into the quiz and start answering immediately.
            </p>
          </button>

          <button
            onClick={handleParty}
            disabled={creatingParty}
            className="nq-card-dark rounded-[28px] px-5 py-6 text-left text-white transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-white/12 text-2xl">
              {creatingParty ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "🎉"
              )}
            </div>
            <p className="text-lg font-bold text-white">PARTY</p>
            <p className="mt-2 text-sm text-[#B8C7EA]">
              Open a waiting lobby, invite friends, then start together as the
              host.
            </p>
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-2xl border border-[#0460A9]/12 bg-white/60 px-4 py-3 text-sm font-semibold text-[#16324F] transition hover:bg-white"
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

type UserStats = {
  total_played: number;
  avg_score: number;
  best_score: number;
  best_streak: number;
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  useEffect(() => {
    fetch("/api/sessions")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        setSessions(data.filter((s: any) => s.is_private === false && (s.status === 'opened' || s.status === 'started')));
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    fetch(`/api/play/me/history?uid=${encodeURIComponent(user.uid)}`)
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

  const profileHandle = user?.displayName
    ? `@${user.displayName.toLowerCase().replace(/\s+/g, ".")}`
    : user?.email
      ? `@${user.email.split("@")[0]}`
      : "@player";

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-7">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="nq-card-blue relative overflow-hidden rounded-[32px] p-5 text-white! md:p-6"
        >
          <div className="absolute inset-y-0 right-[-36px] top-[14px] w-48 rounded-full border border-white/10 bg-white/[0.08]" />
          <div className="absolute inset-y-0 right-[18px] top-[-20px] w-36 rounded-full border border-white/10 bg-white/10" />
          <div className="relative flex items-center gap-4">
            <ProfileAvatar
              displayName={user?.displayName}
              photoURL={user?.photoURL}
              size={84}
              ringClassName="ring-4 ring-[#0E173A]/35 shadow-xl shadow-[#113D7A]/35"
            />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold md:text-3xl">
                {user?.displayName || "Player"}
              </h1>
              <p className="mt-1 truncate text-base text-white/80!">
                {profileHandle}
              </p>
            </div>
          </div>
        </motion.div>

        <div className="nq-card rounded-[32px] p-5 md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h2 className="text-xl font-semibold text-[#16324F]">
                Stat Summary
              </h2>
              <p className="text-sm text-[#5D7EA1]">
                Your latest quiz momentum at a glance.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] bg-white/72 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#5D7EA1]">
                Best Score
              </p>
              <p className="mt-2 text-3xl font-bold text-[#0460A9]">
                {userStats?.best_score?.toLocaleString() ?? "—"}
              </p>
            </div>
            <div className="rounded-[24px] bg-white/72 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#5D7EA1]">
                Best Streak
              </p>
              <p className="mt-2 text-3xl font-bold text-[#0460A9]">
                {userStats?.best_streak ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon="🎯"
          label={t("dashboard.total_played")}
          value={userStats ? String(userStats.total_played) : "—"}
          accent="bg-gradient-to-r from-[#0460A9] to-[#92BFFF]"
        />
        <StatCard
          icon="📈"
          label={t("dashboard.avg_score")}
          value={userStats ? `${userStats.avg_score}` : "—"}
          accent="bg-gradient-to-r from-[#055A9E] to-[#4E93E6]"
        />
        <StatCard
          icon="🧠"
          label="Available Games"
          value={String(sessions.length || 0)}
          accent="bg-gradient-to-r from-[#6C42D8] to-[#92BFFF]"
        />
      </section>

      <LiveSessionsWidget />

      <JoinByCodeCard />

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="nq-on-dark text-xl">🧩</span>
          <div>
            <h2 className="nq-on-dark text-2xl font-semibold">
              Available Games
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((key) => (
              <div
                key={key}
                className="nq-card-dark animate-pulse rounded-[30px] p-7"
              >
                <div className="mb-4 h-5 w-3/4 rounded-full bg-white/10" />
                <div className="mb-2 h-3 w-full rounded-full bg-white/10" />
                <div className="h-3 w-2/3 rounded-full bg-white/10" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="nq-card rounded-[32px] p-10 text-center">
            <p className="text-lg font-semibold text-[#16324F]">
              🎯 No available games right now
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session, index) => (
              <motion.button
                key={session.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                onClick={() => router.push(`/join/${session.pin_code || session.id}`)}
                className="nq-card-dark group min-h-[272px] overflow-hidden rounded-[30px] p-0 text-left transition hover:-translate-y-1"
              >
                {session.cover_image_url && (
                  <div className="h-52 overflow-hidden">
                    <img
                      src={session.cover_image_url}
                      alt={session.name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="p-7">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <h3 className="nq-on-dark line-clamp-2 text-xl font-bold">
                      {session.name}
                    </h3>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-[#7B8BFF]/30 px-3 py-1 text-xs font-semibold text-[#F3F7FF]">
                      {session.question_count} Q
                    </span>
                  </div>
                  {session.description && (
                    <p className="nq-on-dark-muted line-clamp-4 text-sm leading-7">
                      {session.description}
                    </p>
                  )}
                  <div className="nq-on-dark-soft mt-6 flex flex-wrap items-center gap-4 text-sm">
                    <span>🎮 Join Lobby</span>
                    {session.pin_code && <span>PIN: {session.pin_code}</span>}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
