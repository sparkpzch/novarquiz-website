"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  resolveJoinToken,
  watchUserSessions,
  type UserSessionEntry,
} from "@/lib/firebase/rtdb";
import { useToast } from "@/components/ui/Toast";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { motion } from "motion/react";
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
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#92BFFF] to-[#70A2F9] text-2xl text-white shadow-lg shadow-[#0460A9]/16">
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
    <section
      className="nq-card relative overflow-hidden rounded-[34px] p-6"
    >
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.36),transparent_65%)]" />
      <div className="relative z-10 mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#70A2F9] text-xl text-white shadow-[0_14px_28px_rgba(17,87,145,0.18)]">
          🎟️
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5D7EA1]">
            Quick join
          </p>
          <h2 className="text-xl font-semibold text-[#16324F]">Have an invite?</h2>
          <p className="text-sm text-[#5D7EA1]">
            Paste a join code or invite URL from the host.
          </p>
        </div>
      </div>
      <div className="relative z-10 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && !busy && handleJoin()}
          placeholder="Code or invite link"
          className="min-w-0 flex-1 rounded-[22px] border border-[#0460A9]/12 bg-white/80 px-4 py-3 text-[#16324F] outline-none placeholder:text-[#5D7EA1]/70 focus:border-[#0460A9]/35"
        />
        <button
          onClick={handleJoin}
          disabled={busy || !code.trim()}
          className="rounded-[22px] bg-[#70A2F9] px-6 py-3 text-sm font-bold text-[#16324F] transition hover:bg-[#5B8EE0] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
    </section>
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
      accent: "bg-gradient-to-r from-[#0460A9] to-[#92BFFF]",
    },
    {
      label: "Best Streak",
      value: userStats?.best_streak ?? "—",
      accent: "bg-gradient-to-r from-[#055A9E] to-[#4E93E6]",
    },
    {
      label: t("dashboard.total_played"),
      value: userStats ? String(userStats.total_played) : "—",
      accent: "bg-gradient-to-r from-[#0460A9] to-[#92BFFF]",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-7">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="nq-card relative overflow-hidden rounded-[30px] p-4 md:p-5"
        >
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.4),transparent_65%)]" />
          <div className="absolute inset-y-0 right-[-36px] top-[14px] w-48 rounded-full border border-[#0460A9]/12 bg-[#70A2F9]/10" />
          <div className="absolute inset-y-0 right-[18px] top-[-20px] w-36 rounded-full border border-[#0460A9]/12 bg-[#70A2F9]/12" />
          <div className="relative flex items-center gap-3">
            <ProfileAvatar
              displayName={user?.displayName}
              photoURL={user?.photoURL}
              size={72}
              ringClassName="ring-4 ring-white/80 shadow-xl shadow-[#113D7A]/18"
            />
            <div className="min-w-0">
              <h1 className="truncate text-[1.9rem] font-bold text-[#16324F] md:text-[2.2rem]">
                {user?.displayName || "Player"}
              </h1>
            </div>
          </div>
        </motion.div>

        <div className="nq-card rounded-[30px] p-4 md:p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-xl">📊</span>
            <div>
              <h2 className="text-lg font-semibold text-[#16324F]">
                Stat Summary
              </h2>
              <p className="text-xs text-[#5D7EA1] md:text-sm">
                Your latest quiz momentum at a glance.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            {statItems.map((item) => (
              <div
                key={item.label}
                className="rounded-[22px] bg-white/72 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5D7EA1]">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-[#0460A9]">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LiveSessionsWidget />

      <JoinByCodeCard />

    </div>
  );
}
