"use client";

// Authoring and review desk for the summaries players read on /stats.
//
// Nothing here reaches a player until its row is approved — the Gemini button
// only ever produces a 'draft'. That split is the whole point of the screen.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  ANY_ARCHETYPE,
  ARCHETYPE_KEYS,
  BODY_MAX,
  HEADLINE_MAX,
  INSIGHT_LOCALES,
  SUGGESTION_MAX,
  type InsightLocale,
  type InsightReviewStatus,
  type InsightTemplate,
} from "@/lib/analytics/insights";
import type { Quiz } from "@/lib/types";

// '*' first: a public quiz produces no archetype, so it is the usual choice.
const ARCHETYPE_LABELS: Record<string, string> = {
  [ANY_ARCHETYPE]: "Any player (public quizzes)",
  conservative_guideline_follower: "Conservative guideline follower",
  evidence_seeking_early_adopter: "Evidence-seeking early adopter",
  qol_driven_prescriber: "QoL-driven prescriber",
  diagnostic_evidence_builder: "Diagnostic evidence builder",
  balanced_clinician: "Balanced clinician",
};

const STATUS_THEME: Record<InsightReviewStatus, string> = {
  draft: "bg-[#FFB020]/20 text-[#8A5A00]",
  reviewed: "bg-[#0460A9]/12 text-[#0460A9]",
  approved: "bg-[#0D8C6D]/15 text-[#0D6B54]",
};

type Editor = {
  headline: string;
  body: string;
  suggestion: string;
};

const EMPTY_EDITOR: Editor = { headline: "", body: "", suggestion: "" };

export default function InsightsAdminPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [templates, setTemplates] = useState<InsightTemplate[]>([]);
  const [quizId, setQuizId] = useState<string>("");
  const [archetypeId, setArchetypeId] = useState<string>(ANY_ARCHETYPE);
  const [clinicalTag, setClinicalTag] = useState("");
  const [locale, setLocale] = useState<InsightLocale>("th");
  const [editor, setEditor] = useState<Editor>(EMPTY_EDITOR);
  const [busy, setBusy] = useState<"" | "save" | "draft">("");
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  const fetchTemplates = useCallback(
    (): Promise<InsightTemplate[]> =>
      fetch("/api/admin/insight-templates")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    [],
  );

  useEffect(() => {
    if (!isAdmin) return;
    void fetchTemplates().then(setTemplates);
    void fetch("/api/quizzes?all=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Quiz[]) => setQuizzes(Array.isArray(rows) ? rows : []))
      .catch(() => setQuizzes([]));
  }, [isAdmin, fetchTemplates]);

  const run = async (kind: "save" | "draft", request: () => Promise<Response>) => {
    setBusy(kind);
    setMessage(null);
    try {
      const r = await request();
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage({ kind: "error", text: data.error ?? `Request failed (${r.status})` });
        return;
      }
      if (kind === "draft" && data.headline) {
        setEditor({
          headline: data.headline,
          body: data.body,
          suggestion: data.suggestion ?? "",
        });
      }
      setMessage({
        kind: "ok",
        text: kind === "draft" ? "Draft written — review it, then approve." : "Saved as draft.",
      });
      setTemplates(await fetchTemplates());
    } finally {
      setBusy("");
    }
  };

  const save = () =>
    run("save", () =>
      fetch("/api/admin/insight-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quizId || null,
          archetypeId,
          clinicalTag,
          audience: "public",
          locale,
          headline: editor.headline,
          body: editor.body,
          suggestion: editor.suggestion || null,
        }),
      }),
    );

  const draft = () =>
    run("draft", () =>
      fetch("/api/admin/insight-templates/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, archetypeId, clinicalTag, locale }),
      }),
    );

  const review = async (id: string, reviewStatus: InsightReviewStatus) => {
    await fetch("/api/admin/insight-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reviewStatus }),
    });
    setTemplates(await fetchTemplates());
  };

  const remove = async (id: string) => {
    await fetch("/api/admin/insight-templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTemplates(await fetchTemplates());
  };

  if (authLoading || !isAdmin) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-[22px] font-bold text-[#16324F] lg:text-4xl">Insight Summaries</h1>
        <p className="mt-1 text-sm text-[#5D7EA1]">
          Text shown on a player&apos;s stats page. Only <strong>approved</strong> rows are ever served;
          Gemini drafts are stored unapproved and never reach a player on their own.
        </p>
      </header>

      <section className="nq-card space-y-4 rounded-[24px] p-5 md:rounded-[28px] md:p-7">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Quiz">
            <select
              value={quizId}
              onChange={(e) => setQuizId(e.target.value)}
              className="nq-input w-full rounded-xl border border-[#0460A9]/20 px-3 py-2 text-sm"
            >
              <option value="">Global (any quiz)</option>
              {quizzes.map((quiz) => (
                <option key={quiz.id} value={quiz.id}>
                  {quiz.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Archetype">
            <select
              value={archetypeId}
              onChange={(e) => setArchetypeId(e.target.value)}
              className="nq-input w-full rounded-xl border border-[#0460A9]/20 px-3 py-2 text-sm"
            >
              {ARCHETYPE_KEYS.map((id) => (
                <option key={id} value={id}>
                  {ARCHETYPE_LABELS[id]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Clinical tag (blank = any)">
            <input
              value={clinicalTag}
              onChange={(e) => setClinicalTag(e.target.value)}
              placeholder="e.g. screening"
              className="nq-input w-full rounded-xl border border-[#0460A9]/20 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Language">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as InsightLocale)}
              className="nq-input w-full rounded-xl border border-[#0460A9]/20 px-3 py-2 text-sm"
            >
              {INSIGHT_LOCALES.map((code) => (
                <option key={code} value={code}>
                  {code.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={`Headline (${editor.headline.length}/${HEADLINE_MAX})`}>
          <input
            value={editor.headline}
            maxLength={HEADLINE_MAX}
            onChange={(e) => setEditor({ ...editor, headline: e.target.value })}
            className="nq-input w-full rounded-xl border border-[#0460A9]/20 px-3 py-2 text-sm"
          />
        </Field>
        <Field label={`Body (${editor.body.length}/${BODY_MAX})`}>
          <textarea
            value={editor.body}
            maxLength={BODY_MAX}
            rows={3}
            onChange={(e) => setEditor({ ...editor, body: e.target.value })}
            className="nq-input w-full rounded-xl border border-[#0460A9]/20 px-3 py-2 text-sm"
          />
        </Field>
        <Field label={`Suggestion (${editor.suggestion.length}/${SUGGESTION_MAX})`}>
          <input
            value={editor.suggestion}
            maxLength={SUGGESTION_MAX}
            onChange={(e) => setEditor({ ...editor, suggestion: e.target.value })}
            className="nq-input w-full rounded-xl border border-[#0460A9]/20 px-3 py-2 text-sm"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={draft}
            disabled={!quizId || busy !== ""}
            title={quizId ? "" : "Pick a quiz — a draft is grounded in that quiz's authored text"}
            className="rounded-full border border-[#0460A9]/25 px-4 py-2 text-sm font-semibold text-[#0460A9] disabled:opacity-40"
          >
            {busy === "draft" ? "Drafting…" : "✨ Draft with Gemini"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!editor.headline || !editor.body || busy !== ""}
            className="rounded-full bg-gradient-to-r from-[#0460A9] to-[#2F7FD0] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy === "save" ? "Saving…" : "Save as draft"}
          </button>
          {message && (
            <span
              className={`text-sm font-medium ${message.kind === "error" ? "text-[#D63A3D]" : "text-[#0D6B54]"}`}
            >
              {message.text}
            </span>
          )}
        </div>
      </section>

      <section className="nq-card space-y-3 rounded-[24px] p-5 md:rounded-[28px] md:p-7">
        <h2 className="text-[17px] font-bold text-[#16324F]">All summaries ({templates.length})</h2>
        {templates.length === 0 && (
          <p className="text-sm text-[#5D7EA1]">Nothing yet. Draft or write one above.</p>
        )}
        {templates.map((template) => (
          <motion.div
            key={template.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2 rounded-[18px] border border-[#0460A9]/12 p-4"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#5D7EA1]">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_THEME[template.review_status]}`}>
                {template.review_status}
              </span>
              <span>{ARCHETYPE_LABELS[template.archetype_id] ?? template.archetype_id}</span>
              <span>· {template.locale.toUpperCase()}</span>
              <span>· {template.audience}</span>
              {template.clinical_tag && <span>· #{template.clinical_tag}</span>}
              <span>· {template.quiz_id ? "quiz-scoped" : "global"}</span>
              {template.source === "llm_draft" && <span>· 🤖 {template.model}</span>}
            </div>
            <p className="text-sm font-bold text-[#16324F]">{template.headline}</p>
            <p className="text-sm text-[#5D7EA1]">{template.body}</p>
            {template.suggestion && <p className="text-sm text-[#0D6B54]">👉 {template.suggestion}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {template.review_status !== "approved" && (
                <button
                  type="button"
                  onClick={() => review(template.id, "approved")}
                  className="rounded-full bg-[#0D8C6D] px-3 py-1 text-xs font-semibold text-white"
                >
                  Approve
                </button>
              )}
              {template.review_status === "approved" && (
                <button
                  type="button"
                  onClick={() => review(template.id, "draft")}
                  className="rounded-full border border-[#0460A9]/25 px-3 py-1 text-xs font-semibold text-[#0460A9]"
                >
                  Unapprove
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setEditor({
                    headline: template.headline,
                    body: template.body,
                    suggestion: template.suggestion ?? "",
                  })
                }
                className="rounded-full border border-[#0460A9]/25 px-3 py-1 text-xs font-semibold text-[#0460A9]"
              >
                Load into editor
              </button>
              <button
                type="button"
                onClick={() => remove(template.id)}
                className="rounded-full border border-[#D63A3D]/30 px-3 py-1 text-xs font-semibold text-[#D63A3D]"
              >
                Delete
              </button>
            </div>
          </motion.div>
        ))}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-[#5D7EA1]">{label}</span>
      {children}
    </label>
  );
}
