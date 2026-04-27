"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Quiz } from "@/lib/types";

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-all ${
        active
          ? "border-[#0460A9] bg-[#0460A9] !text-white shadow-md shadow-[#0460A9]/20"
          : "border-[#0460A9]/18 bg-white/60 text-[#4D6F93] hover:bg-white/90 hover:border-[#0460A9]/35"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Session Card — matches home page "Available Quiz" style exactly ─────────────

function SessionCard({
  session,
  index,
  onClick,
}: {
  session: any;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className="group nq-card-soft flex min-h-[228px] flex-col overflow-hidden rounded-[28px] p-0 text-left transition hover:-translate-y-1 hover:shadow-[0_22px_48px_rgba(17,87,145,0.18)]"
    >
      {session.cover_image_url && (
        <div className="h-40 overflow-hidden">
          <img
            src={session.cover_image_url}
            alt={session.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 flex-1 text-[1.75rem] font-bold leading-tight text-[#16324F]">
            {session.name}
          </h3>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[#0460A9]/10 px-3 py-1.5 text-sm font-bold text-[#0460A9]">
            {session.question_count ?? 0} Q
          </span>
        </div>
        {session.description && (
          <p className="line-clamp-3 text-sm leading-relaxed text-[#5D7EA1]">
            {session.description}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          {session.pin_code && (
            <div className="rounded-full bg-white/75 px-3 py-2 text-xs text-[#5D7EA1]">
              PIN: {session.pin_code}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 text-sm font-semibold text-[#0460A9]">
            <span>Play Now</span>
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Quizzes Content ──────────────────────────────────────────────────────────

function QuizzesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const qParam = searchParams.get("q") ?? "";
  const sortParam = (searchParams.get("sort") ?? "newest") as
    | "newest"
    | "most-played"
    | "top-rated";
  const lengthParam = (searchParams.get("length") ?? "all") as
    | "all"
    | "short"
    | "medium"
    | "long";

  const [inputValue, setInputValue] = useState(qParam);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch all active public sessions once
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => setSessions(data.filter((s: any) => s.is_private === false && (s.status === 'opened' || s.status === 'started'))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Keep input in sync when URL changes (e.g. back/forward)
  useEffect(() => {
    setInputValue(qParam);
  }, [qParam]);

  // Debounced URL update for search
  const handleSearch = useCallback(
    (value: string) => {
      setInputValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value.trim()) {
          params.set("q", value.trim());
        } else {
          params.delete("q");
        }
        router.replace(`/quizzes?${params.toString()}`, { scroll: false });
      }, 300);
    },
    [router, searchParams]
  );

  const setFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all" && value !== "newest") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`/quizzes?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Client-side filter + sort
  const filtered = sessions
    .filter((s) => {
      const term = qParam.toLowerCase();
      if (term) {
        return (
          s.name.toLowerCase().includes(term) ||
          (s.description ?? "").toLowerCase().includes(term)
        );
      }
      return true;
    })
    .filter((s) => {
      const count = s.question_count ?? 0;
      if (lengthParam === "short") return count < 5;
      if (lengthParam === "medium") return count >= 5 && count <= 15;
      if (lengthParam === "long") return count > 15;
      return true;
    })
    .sort((a, b) => {
      // For sessions, default to newest first based on created_at or id
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const sortOptions = [
    { value: "newest", label: "Newest" },
  ];

  const lengthOptions = [
    { value: "all", label: "All Lengths" },
    { value: "short", label: "Short (< 5Q)" },
    { value: "medium", label: "Medium (5–15Q)" },
    { value: "long", label: "Long (> 15Q)" },
  ];

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <p className="nq-details font-bold uppercase tracking-[0.28em] text-white/80 drop-shadow-sm">
            Library
          </p>
          <h1 className="mt-1 text-3xl font-bold text-white drop-shadow-md font-display tracking-tight">Browse Quizzes</h1>
        </motion.div>

        {/* Search + Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.35 }}
          className="nq-card rounded-[28px] p-5 space-y-6"
        >
          {/* Search bar */}
          <div role="search" className="relative">
            <svg
              className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#5D7EA1]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z"
              />
            </svg>
            <input
              id="quizzes-search"
              type="search"
              aria-label="Search quizzes"
              value={inputValue}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search quizzes by name or description…"
              className="w-full rounded-[18px] border border-[#0460A9]/14 bg-white/80 py-3 pl-11 pr-4 text-[#16324F] outline-none placeholder:text-[#5D7EA1]/70 focus:border-[#0460A9]/40 focus:ring-2 focus:ring-[#0460A9]/10 transition font-medium"
            />
            {inputValue && (
              <button
                onClick={() => handleSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#5D7EA1] hover:bg-[#0460A9]/08 transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filter rows */}
          <div className="space-y-4">
            {/* Sort */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="shrink-0 nq-details font-bold uppercase tracking-[0.18em] text-[#5D7EA1] sm:w-10">
                Sort
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar sm:pb-0">
                {sortOptions.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={sortParam === opt.value}
                    onClick={() => setFilter("sort", opt.value)}
                  />
                ))}
              </div>
            </div>

            {/* Length */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="shrink-0 nq-details font-bold uppercase tracking-[0.18em] text-[#5D7EA1] sm:w-10">
                Size
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar sm:pb-0">
                {lengthOptions.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={lengthParam === opt.value}
                    onClick={() => setFilter("length", opt.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Results summary */}
          {!loading && (
            <p className="text-xs text-[#5D7EA1]">
              {filtered.length === sessions.length
                ? `${sessions.length} quizzes available`
                : `${filtered.length} of ${sessions.length} quizzes`}
              {qParam && (
                <span>
                  {" for "}
                  <span className="font-semibold text-[#0460A9]">"{qParam}"</span>
                </span>
              )}
            </p>
          )}
        </motion.div>

        {/* Cards Grid */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div key={k} className="nq-card-soft animate-pulse rounded-[28px] p-7 min-h-[220px]">
                <div className="mb-4 h-5 w-3/4 rounded-full bg-[#70A2F9]/18" />
                <div className="mb-2 h-3 w-full rounded-full bg-[#70A2F9]/18" />
                <div className="h-3 w-2/3 rounded-full bg-[#70A2F9]/18" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="nq-card rounded-[34px] p-12 text-center"
          >
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#92BFFF] to-[#0460A9] text-4xl shadow-lg shadow-[#0460A9]/20">
              🔍
            </div>
            <h2 className="text-xl font-bold text-[#16324F]">No quizzes found</h2>
            <p className="mt-2 text-sm text-[#5D7EA1]">
              Try adjusting your search or filters.
            </p>
            <button
              onClick={() => {
                handleSearch("");
                setFilter("sort", null);
                setFilter("length", null);
              }}
              className="mt-5 rounded-2xl bg-[#0460A9] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#055A9E]"
            >
              Clear all filters
            </button>
          </motion.div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((session, i) => (
              <SessionCard
                key={session.id}
                session={session}
                index={i}
                onClick={() => router.push(`/join/${session.pin_code || session.id}`)}
              />
            ))}
          </div>
        )}
      </div>

    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuizzesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="h-9 w-56 animate-pulse rounded-full bg-[#70A2F9]/20" />
          <div className="nq-card-soft animate-pulse rounded-[28px] p-5 h-32" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div key={k} className="nq-card-soft animate-pulse rounded-[28px] p-7 min-h-[220px]" />
            ))}
          </div>
        </div>
      }
    >
      <QuizzesContent />
    </Suspense>
  );
}
