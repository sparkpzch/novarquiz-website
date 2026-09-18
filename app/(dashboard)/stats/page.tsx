"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { motion } from "motion/react";
import { Trans, useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { WEAK_TOPIC_THRESHOLD, type HealthStats } from "@/lib/stats/health";
import type { InsightSummary } from "@/lib/analytics/insights";

/** health-stats returns the aggregate plus whichever reviewed summary matched. */
type StatsResponse = HealthStats & { summary: InsightSummary | null };

type HistoryEntry = {
  session_id: string;
  session_name: string;
  session_description: string | null;
  total_score: number;
  correct_count: number;
  incorrect_count: number;
  streak: number;
  total_time_ms: number;
  completed_at: string;
  rank: number;
  total_players: number;
};

type Tab = "health" | "game";

const RECENT_COUNT = 5;

function StatTile({
  label,
  value,
  unit,
  valueClassName = "text-[#0460A9]",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  valueClassName?: string;
}) {
  return (
    <div className="nq-card rounded-[20px] px-4 py-3.5 md:rounded-[24px] md:px-5 md:py-5">
      <p className="truncate text-xs font-medium text-[#5D7EA1]">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span className={cn("font-display text-2xl font-bold tabular-nums md:text-[26px]", valueClassName)}>
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-[#5D7EA1]">{unit}</span>}
      </p>
    </div>
  );
}

function Bar({ pct, warn = false, delay = 0 }: { pct: number; warn?: boolean; delay?: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-[#0460A9]/8">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        transition={{ duration: 0.7, ease: "easeOut", delay }}
        className={cn(
          "h-full rounded-full",
          warn ? "bg-[#F29A4A]" : "bg-gradient-to-r from-[#0460A9] to-[#92BFFF]",
        )}
      />
    </div>
  );
}

// Big knowledge circle with a 90° progress capsule arcing over it.
// Geometry lives in a 354×310 box; the circle is positioned in percentages
// of that box so the whole gauge scales with its container.
const G = { w: 354, h: 310, cx: 177, cy: 180, r: 150, stroke: 20, circle: 224 };
const polar = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return `${G.cx + G.r * Math.cos(rad)} ${G.cy + G.r * Math.sin(rad)}`;
};
const ARC = `M ${polar(225)} A ${G.r} ${G.r} 0 0 1 ${polar(315)}`;

function KnowledgeGauge({ stats }: { stats: HealthStats }) {
  const { t } = useTranslation();
  const gradientId = useId();
  const circleLeft = ((G.cx - G.circle / 2) / G.w) * 100;
  const circleTop = ((G.cy - G.circle / 2) / G.h) * 100;

  return (
    <div className="relative mx-auto aspect-[354/310] w-full max-w-[354px]">
      <p className="absolute inset-x-0 top-0 text-center text-xs font-semibold text-[#5D7EA1]">
        {t("stats.progress", { value: stats.progress })}
      </p>
      <svg
        viewBox={`0 0 ${G.w} ${G.h}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        role="img"
        aria-label={t("stats.progress_aria", {
          done: stats.completedQuizzes,
          total: stats.publishedQuizzes,
        })}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2BB39A" />
            <stop offset="100%" stopColor="#0460A9" />
          </linearGradient>
        </defs>
        <path d={ARC} fill="none" stroke="#0460A9" strokeOpacity={0.12} strokeWidth={G.stroke} strokeLinecap="round" />
        {stats.progress > 0 && (
          <motion.path
            d={ARC}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={G.stroke}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: stats.progress / 100 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        )}
      </svg>

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="absolute flex aspect-square flex-col items-center justify-center rounded-full border-[6px] border-white/60 bg-gradient-to-br from-[#70A2F9] to-[#0460A9] text-[#fff] shadow-[0_16px_36px_rgba(4,96,169,0.3)]"
        style={{ left: `${circleLeft}%`, top: `${circleTop}%`, width: `${(G.circle / G.w) * 100}%` }}
      >
        <p className="text-sm font-medium">{t("stats.health_knowledge")}</p>
        <p className="flex items-baseline gap-0.5 font-display">
          <span className="text-5xl font-bold tabular-nums sm:text-6xl">{stats.knowledgeScore}</span>
          <span className="text-lg font-medium">/100</span>
        </p>
        <span className="mt-1 rounded-full bg-white/22 px-3.5 py-1 text-[13px] font-semibold">
          {t("stats.level", { level: t(`stats.level_${stats.level}`) })}
        </span>
      </motion.div>
    </div>
  );
}

function InsightCard({ stats }: { stats: StatsResponse }) {
  const { t } = useTranslation();
  const { summary, archetype, weakestTopic } = stats;
  const hl = <span className="text-[#E67E22]" />;

  return (
    <section className="nq-card space-y-3 rounded-[24px] px-5 py-5 md:rounded-[28px] md:px-8 md:py-7">
      <p className="nq-insight-eyebrow text-[12px] font-semibold uppercase tracking-wide md:text-[13px]">
        {t("stats.insight_label")}
      </p>

      {/* A reviewed summary wins. Without one we fall back to the behavioural
          segment, then to the plain weakest-topic line — every branch is text
          the app itself owns, none of it generated at request time. */}
      {summary ? (
        <>
          <h2 className="nq-insight-headline font-display text-[26px] font-bold leading-tight tracking-tight md:text-[34px]">
            {summary.headline}
          </h2>
          <p className="nq-insight-body text-[15px] font-medium leading-relaxed md:text-[17px]">{summary.body}</p>
          {summary.suggestion && (
            <p className="nq-insight-suggestion flex gap-2.5 rounded-[14px] px-3.5 py-3 text-[13px] font-semibold leading-relaxed md:text-[15px]">
              <span aria-hidden="true">👉</span>
              {summary.suggestion}
            </p>
          )}
        </>
      ) : archetype ? (
        <>
          <h2 className="nq-insight-headline font-display text-[26px] font-bold leading-tight tracking-tight md:text-[34px]">
            <Trans
              i18nKey="stats.insight_archetype"
              values={{ label: t(`stats.archetype_${archetype}`) }}
              components={{ hl }}
            />
          </h2>
          <p className="nq-insight-body text-[15px] font-medium leading-relaxed md:text-[17px]">
            {t(`stats.archetype_${archetype}_desc`)}
          </p>
        </>
      ) : weakestTopic ? (
        <h2 className="nq-insight-headline font-display text-[26px] font-bold leading-tight tracking-tight md:text-[34px]">
          <Trans
            i18nKey={stats.topics.length > 1 ? "stats.insight_weakest" : "stats.insight_single"}
            values={{ topic: weakestTopic.name, score: weakestTopic.score }}
            components={{ hl }}
          />
        </h2>
      ) : null}

      <p className="nq-insight-note flex gap-2 rounded-[14px] px-3 py-2.5 text-xs leading-relaxed md:text-[13px]">
        <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.8} />
          <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
        {t("stats.disclaimer")}
      </p>
    </section>
  );
}

function TabToggle({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useTranslation();
  const tabs: Array<[Tab, string]> = [
    ["health", t("stats.health_tab")],
    ["game", t("stats.game_tab")],
  ];
  return (
    <div
      role="tablist"
      className="flex w-full gap-1 rounded-full border border-[#0460A9]/14 bg-white/85 p-1 lg:max-w-[420px]"
    >
      {tabs.map(([key, label]) => {
        const active = tab === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              "relative flex-1 rounded-full py-2.5 font-display text-[15px] font-semibold transition-colors",
              active ? "text-[#fff]" : "text-[#5D7EA1] hover:text-[#16324F]",
            )}
          >
            {active && (
              <motion.span
                layoutId="stats-tab-pill"
                className="absolute inset-0 rounded-full bg-gradient-to-r from-[#0460A9] to-[#2F7FD0] shadow-[0_4px_12px_rgba(4,96,169,0.25)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function HealthPanel({ stats }: { stats: HealthStats }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <section className="nq-card space-y-3.5 rounded-[24px] p-5 md:rounded-[28px] md:p-7">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[17px] font-bold text-[#16324F]">{t("stats.by_topic")}</h3>
          <span className="shrink-0 text-xs font-medium text-[#5D7EA1]">
            {t("stats.from_answers", { count: stats.answered })}
          </span>
        </div>
        {stats.topics.map((topic, i) => {
          const weak = topic.score < WEAK_TOPIC_THRESHOLD;
          return (
            <div key={topic.quiz_id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#16324F]">{topic.name}</span>
                {weak && (
                  <span className="shrink-0 rounded-full bg-[#E67E22]/14 px-2 py-0.5 text-[11px] font-semibold text-[#C4661A]">
                    {t("stats.needs_work")}
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 font-display text-sm font-semibold tabular-nums",
                    weak ? "text-[#E67E22]" : "text-[#0460A9]",
                  )}
                >
                  {topic.score}%
                </span>
              </div>
              <Bar pct={topic.score} warn={weak} delay={0.1 + i * 0.04} />
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-3 gap-2.5 md:gap-4">
        <StatTile
          label={t("stats.topics_solid")}
          value={stats.solidTopics}
          unit={t("stats.of_topics", { total: stats.topics.length })}
          valueClassName="text-[#0D8C6D]"
        />
        <StatTile
          label={t("stats.answered")}
          value={stats.answered.toLocaleString()}
          unit={t("stats.unit_questions")}
        />
        <StatTile
          label={t("stats.day_streak")}
          value={stats.dayStreak}
          unit={t("stats.unit_days")}
          valueClassName="text-[#E67E22]"
        />
      </div>
    </div>
  );
}

function GamePanel({ history }: { history: HistoryEntry[] }) {
  const { t } = useTranslation();
  const bestScore = history.length ? Math.max(...history.map((h) => h.total_score)) : 0;
  const avgScore = history.length
    ? Math.round(history.reduce((sum, h) => sum + h.total_score, 0) / history.length)
    : 0;
  const bestStreak = history.length ? Math.max(...history.map((h) => h.streak)) : 0;
  const totalCorrect = history.reduce((sum, h) => sum + h.correct_count, 0);
  const totalAnswered = totalCorrect + history.reduce((sum, h) => sum + h.incorrect_count, 0);
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const topRank = history.length ? `#${Math.min(...history.map((h) => h.rank))}` : "—";
  const recent = history.slice(0, RECENT_COUNT);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-4">
        <StatTile label={t("stats.total_played")} value={history.length} />
        <StatTile label={t("stats.best_score")} value={bestScore.toLocaleString()} />
        <StatTile label={t("stats.avg_score")} value={avgScore.toLocaleString()} />
        <StatTile label={t("stats.best_streak")} value={bestStreak} valueClassName="text-[#E67E22]" />
        <StatTile label={t("stats.correct")} value={totalCorrect.toLocaleString()} valueClassName="text-[#0D8C6D]" />
        <StatTile label={t("stats.accuracy")} value={accuracy} unit="%" />
        <StatTile label={t("stats.top_rank")} value={topRank} />
      </div>

      {recent.length > 0 && (
        <section className="nq-card space-y-3 rounded-[24px] p-5 md:rounded-[28px] md:p-7">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[17px] font-bold text-[#16324F]">{t("stats.recent_scores")}</h3>
            <span className="shrink-0 text-xs font-medium text-[#5D7EA1]">
              {t("stats.recent_count", { count: recent.length })}
            </span>
          </div>
          {recent.map((entry, i) => (
            <div key={`${entry.session_id}-${entry.completed_at}`} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-display text-xs font-semibold text-[#5D7EA1]">#{entry.rank}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#16324F]">
                  {entry.session_name}
                </span>
                <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-[#0460A9]">
                  {entry.total_score.toLocaleString()}
                </span>
              </div>
              <Bar pct={bestScore > 0 ? (entry.total_score / bestScore) * 100 : 0} delay={0.1 + i * 0.04} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function StatsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [health, setHealth] = useState<StatsResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("health");

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const load = async <T,>(path: string): Promise<T> => {
      const r = await fetch(`/api/users/${user.uid}/${path}`);
      if (!r.ok) throw new Error(`${path} ${r.status}`);
      return r.json();
    };
    const locale = i18n.language?.startsWith("en") ? "en" : "th";
    Promise.all([
      load<HistoryEntry[]>("history"),
      load<StatsResponse>(`health-stats?locale=${locale}`),
    ])
      .then(([h, s]) => {
        setHistory(h);
        setHealth(s);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoaded(true));
  }, [user, i18n.language]);

  const loading = !!user && !user.isAnonymous && !loaded;

  const header = (
    <header className="text-center lg:text-left">
      <p className="hidden font-display text-[13px] font-semibold text-[#FFFFFF] lg:block">
        {t("stats.performance")}
      </p>
      <h1 className="text-[22px] font-bold text-[#16324F] lg:mt-1 lg:text-4xl">{t("stats.my_stats")}</h1>
    </header>
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        {header}
        <div className="nq-card h-32 animate-pulse rounded-[28px]" />
        <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
          <div className="nq-card h-80 animate-pulse rounded-[32px]" />
          <div className="nq-card h-80 animate-pulse rounded-[28px]" />
        </div>
      </div>
    );
  }

  const hasData = history.length > 0 || (health?.topics.length ?? 0) > 0;

  if (failed || !health || !hasData) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        {header}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="nq-card rounded-[34px] p-12 text-center"
        >
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#92BFFF] to-[#0460A9] text-4xl shadow-lg shadow-[#0460A9]/20">
            🎯
          </div>
          <h2 className="font-display text-xl font-bold text-[#16324F]">
            {failed ? t("stats.load_error") : t("stats.no_data")}
          </h2>
          {!failed && <p className="mt-2 text-sm font-medium text-[#5D7EA1]">{t("stats.no_data_desc")}</p>}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 md:space-y-6">
      {header}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <InsightCard stats={health} />
      </motion.div>

      <div className="grid items-start gap-5 lg:grid-cols-[400px_1fr] lg:gap-6">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.35 }}
          className="relative flex flex-col items-center gap-4 lg:sticky lg:top-5 lg:px-6 lg:py-8"
        >
          {/* Card surface on desktop only — the mobile gauge sits on the page background. */}
          <div aria-hidden="true" className="nq-card absolute inset-0 hidden rounded-[32px] lg:block" />
          <div className="relative w-full">
            <KnowledgeGauge stats={health} />
          </div>
          <p className="relative hidden text-center text-[13px] text-[#5D7EA1] lg:block">{t("stats.score_caption")}</p>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="space-y-5"
        >
          <TabToggle tab={tab} onChange={setTab} />
          <div role="tabpanel">
            {tab === "health" ? <HealthPanel stats={health} /> : <GamePanel history={history} />}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
