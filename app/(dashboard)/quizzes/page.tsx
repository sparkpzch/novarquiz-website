"use client";

import QuizThumbnail from '@/components/ui/QuizThumbnail';
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { Session } from "@/lib/types";

type BrowseSession = Session & { created_at?: string };

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
  session: BrowseSession;
  index: number;
  onClick: () => void;
}) {
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith("th");
  return (
    <motion.button
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className="group nq-card-soft flex min-h-[228px] flex-col overflow-hidden rounded-xl p-0 text-left transition hover:-translate-y-1 hover:shadow-[0_22px_48px_rgba(17,87,145,0.18)]"
    >
      <div className="nq-always-dark relative h-40 overflow-hidden bg-[var(--nq-brand)]">
        {session.cover_image_url ? (
          <Image
            src={session.cover_image_url}
            alt={session.name ?? (th ? "แบบทดสอบ" : "Quiz")}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <QuizThumbnail />
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 flex-1 text-[1.75rem] font-bold leading-tight text-[#16324F]">
            {session.name}
          </h3>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[#0460A9]/10 px-3 py-1.5 text-sm font-bold text-[#0460A9]">
            {session.question_count ?? 0} {th ? "ข้อ" : "questions"}
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
              {th ? "รหัสห้อง" : "Room code"}: {session.pin_code}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 text-sm font-semibold text-[#0460A9]">
            <span>{th ? "เริ่มแบบทดสอบ" : "Start quiz"}</span>
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
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith("th");
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
  const [sessions, setSessions] = useState<BrowseSession[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch all active public sessions once
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: BrowseSession[]) => setSessions(data.filter((s) => s.is_private === false && (s.status === 'opened' || s.status === 'started'))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Keep input in sync when URL changes (e.g. back/forward)
  useEffect(() => {
    // This mirrors browser navigation state into the controlled search field.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          (s.name ?? "").toLowerCase().includes(term) ||
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
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

  const sortOptions = [
    { value: "newest", label: th ? "ล่าสุด" : "Newest" },
  ];

  const lengthOptions = [
    { value: "all", label: th ? "ทุกจำนวนข้อ" : "Any number" },
    { value: "short", label: th ? "น้อยกว่า 5 ข้อ" : "Fewer than 5 questions" },
    { value: "medium", label: th ? "5–15 ข้อ" : "5–15 questions" },
    { value: "long", label: th ? "มากกว่า 15 ข้อ" : "More than 15 questions" },
  ];

  return (
    <>
      <div className="mx-auto max-w-[1500px] space-y-6">
        <h1 className="sr-only">{th ? "แบบทดสอบ" : "Quizzes"}</h1>

        {/* Search + Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.35 }}
          className="nq-card rounded-xl p-5 space-y-6"
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
              aria-label={th ? "ค้นหาแบบทดสอบ" : "Search quizzes"}
              value={inputValue}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={th ? "ค้นหาชื่อหรือคำอธิบายแบบทดสอบ" : "Search by quiz name or description"}
              className="w-full rounded-lg border border-[#0460A9]/14 bg-white/80 py-3 pl-11 pr-4 text-[#16324F] outline-none placeholder:text-[#5D7EA1]/70 focus:border-[#0460A9]/40 focus:ring-2 focus:ring-[#0460A9]/10 transition font-medium"
            />
            {inputValue && (
              <button
                onClick={() => handleSearch("")}
                aria-label={th ? "ล้างคำค้นหา" : "Clear search"}
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
              <span className="shrink-0 nq-details font-bold uppercase tracking-[0.18em] text-[#5D7EA1] sm:w-24">
                {th ? "เรียงตาม" : "Sort by"}
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
              <span className="shrink-0 nq-details font-bold uppercase tracking-[0.18em] text-[#5D7EA1] sm:w-24">
                {th ? "จำนวนข้อ" : "Questions"}
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
                ? (th ? `มี ${sessions.length} แบบทดสอบ` : `${sessions.length} quizzes`)
                : (th ? `แสดง ${filtered.length} จาก ${sessions.length} แบบทดสอบ` : `${filtered.length} of ${sessions.length} quizzes`)}
              {qParam && (
                <span>
                  {th ? " สำหรับ " : " for "}
                  <span className="font-semibold text-[#0460A9]">&ldquo;{qParam}&rdquo;</span>
                </span>
              )}
            </p>
          )}
        </motion.div>

        {/* Cards Grid */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div key={k} className="nq-card-soft animate-pulse rounded-xl p-7 min-h-[220px]">
                <div className="mb-4 h-5 w-3/4 rounded-full bg-[#70A2F9]/18" />
                <div className="mb-2 h-3 w-full rounded-full bg-[#70A2F9]/18" />
                <div className="h-3 w-2/3 rounded-full bg-[#70A2F9]/18" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center rounded-xl border border-[var(--nq-line)] bg-[var(--nq-panel)] px-6 py-14 text-center"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--nq-inset)] text-[var(--nq-muted)]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-[var(--nq-ink)]">{th ? "ไม่พบแบบทดสอบ" : "No quizzes found"}</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-[var(--nq-muted)]">
              {qParam
                ? th ? `ไม่มีแบบทดสอบที่ตรงกับ “${qParam}” ลองคำค้นหาอื่น หรือล้างตัวกรอง` : `No quizzes match “${qParam}”. Try another search or clear the filters.`
                : th ? "ไม่มีแบบทดสอบที่ตรงกับตัวกรองนี้ ลองเปลี่ยนตัวกรอง หรือล้างตัวกรองทั้งหมด" : "No quizzes match these filters. Change them or clear all filters."}
            </p>
            <button
              onClick={() => {
                handleSearch("");
                setFilter("sort", null);
                setFilter("length", null);
              }}
              className="mt-5 rounded-lg border border-[var(--nq-line)] bg-[var(--nq-panel)] px-4 py-2 text-sm font-semibold text-[var(--nq-ink)] transition hover:bg-[var(--nq-inset)]"
            >
              {th ? "ล้างตัวกรอง" : "Clear filters"}
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
        <div className="mx-auto max-w-[1500px] space-y-6">
          <div className="nq-card-soft animate-pulse rounded-xl p-5 h-32" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div key={k} className="nq-card-soft animate-pulse rounded-xl p-7 min-h-[220px]" />
            ))}
          </div>
        </div>
      }
    >
      <QuizzesContent />
    </Suspense>
  );
}
