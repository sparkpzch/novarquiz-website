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
import { Card } from "@/components/ui/Card";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Pick up where you left off ───────────────────────────────────────────────

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

  const entry = list[0];

  const resume = () => {
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
      <Card>
        <Card.Header icon="🕹️" title="Pick up where you left off" />
        <Card.Row
          icon={icon}
          title={entry.sessionName}
          subtitle={`${modeLabel} · Resume now`}
          trailing={<span className="nq-text-accent text-xs font-bold">→</span>}
          onClick={resume}
        />
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
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">

        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="relative overflow-hidden h-full">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(146,191,255,0.4),transparent_65%)] pointer-events-none" />
            <div className="absolute right-[-36px] top-[14px] h-full w-48 rounded-full border border-[#0460A9]/12 bg-[#70A2F9]/10 pointer-events-none" />
            <div className="absolute right-[18px] top-[-20px] h-full w-36 rounded-full border border-[#0460A9]/12 bg-[#70A2F9]/12 pointer-events-none" />
            <div className="relative flex items-center gap-3">
              <ProfileAvatar
                displayName={user?.displayName}
                photoURL={user?.photoURL}
                size={52}
                ringClassName="ring-2 ring-white/80 shadow-lg shadow-[#113D7A]/18"
              />
              <div className="min-w-0">
                <h1 className="nq-header truncate">{user?.displayName || "Player"}</h1>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Stat summary card */}
        <Card>
          <Card.Header icon="📊" title="Stat Summary" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

      <LiveSessionsWidget />

      <JoinByCodeCard />

    </div>
  );
}
