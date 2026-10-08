"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/hooks/useAuth";
import { BODY_MAX, HEADLINE_MAX, SUGGESTION_MAX, type InsightLocale, type InsightTemplate } from "@/lib/analytics/insights";
import type { ProvisionalInsight } from "@/lib/db/provisional-insights";
import type { Quiz } from "@/lib/types";
import { firstInsightSentence } from "@/lib/analytics/insight-preview";
import { groupProvisionalInsights, hasBothInsightLanguages } from "@/lib/analytics/insight-groups";
import IconRefreshButton from "@/components/ui/IconRefreshButton";
import "./insights.css";

type Tab = "provisional" | "approved" | "rejected" | "templates";
type Editor = { headline: string; body: string; suggestion: string };
type Notice = { error: boolean; text: string };
const EMPTY: Editor = { headline: "", body: "", suggestion: "" };

function Icon({ name }: { name: "spark" | "check" | "clock" | "search" | "arrow" | "plus" | "book" }) {
  const paths = { spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z", check: "m5 12 4 4L19 6", clock: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0", arrow: "M5 12h14m-5-5 5 5-5 5", plus: "M12 5v14M5 12h14", book: "M3 5h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3V5Zm9 2v15" };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function InsightsAdminPage() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const th = i18n.language?.startsWith("th");
  const text = (en: string, thai: string) => th ? thai : en;
  const { isAdmin, loading: authLoading } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [templates, setTemplates] = useState<InsightTemplate[]>([]);
  const [summaries, setSummaries] = useState<ProvisionalInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<Tab>("provisional");
  const [locale, setLocale] = useState<InsightLocale | "all">("all");
  const [quizFilter, setQuizFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Editor>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [creating, setCreating] = useState(false);
  const [newEditor, setNewEditor] = useState<Editor>(EMPTY);
  const [newQuiz, setNewQuiz] = useState("");
  const [newLocale, setNewLocale] = useState<InsightLocale>(th ? "th" : "en");
  const [newAudience, setNewAudience] = useState<"public" | "hcp">("public");
  const [newTag, setNewTag] = useState("");
  const [rejectTarget, setRejectTarget] = useState<ProvisionalInsight | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<InsightTemplate | null>(null);
  const rejectDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { if (!authLoading && !isAdmin) router.replace("/"); }, [authLoading, isAdmin, router]);

  const load = useCallback(async () => {
    const read = async (url: string) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Load failed (${response.status})`);
      return response.json();
    };
    const [nextSummaries, nextTemplates, nextQuizzes] = await Promise.all([
      read("/api/admin/provisional-insights"), read("/api/admin/insight-templates"), read("/api/quizzes?all=true"),
    ]);
    setSummaries(nextSummaries); setTemplates(nextTemplates); setQuizzes(nextQuizzes); setLoadError(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { await load(); } catch { setLoadError(true); } finally { setLoading(false); }
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void Promise.resolve().then(load).catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAdmin, load]);

  const grouped = useMemo(() => groupProvisionalInsights(summaries), [summaries]);
  const filtered = useMemo(() => grouped.filter((group) =>
    (locale === "all" || group.members.some(item => item.locale === locale)) && (!quizFilter || group.quiz_id === quizFilter) &&
    group.members.some(item => `${item.quiz_name} ${item.headline} ${item.body}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
  ), [grouped, locale, quizFilter, search]);
  const visibleTemplates = templates.filter((item) =>
    (locale === "all" || item.locale === locale) && (!quizFilter || item.quiz_id === quizFilter) &&
    `${item.headline} ${item.body} ${quizzes.find((quiz) => quiz.id === item.quiz_id)?.name ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const queue = filtered.filter((item) => item.status === tab);
  const selectedAI = tab === "templates" ? null : queue.find((item) => item.id === selection) ?? queue[0] ?? null;
  const selectedTemplate = tab === "templates" ? visibleTemplates.find((item) => item.id === selection) ?? visibleTemplates[0] ?? null : null;
  const selected = selectedAI ?? selectedTemplate;
  const translationEditor = (row: ProvisionalInsight): Editor => edits[row.id] ?? { headline: row.headline, body: row.body, suggestion: row.suggestion ?? "" };
  const primaryAI = selectedAI?.members.find(row => row.locale === "th") ?? selectedAI?.members[0];
  const editor: Editor = primaryAI ? translationEditor(primaryAI) : selected && edits[selected.id] ? edits[selected.id] : selected ? { headline: selected.headline, body: selected.body, suggestion: selected.suggestion ?? "" } : EMPTY;
  const valid = (value: Editor) => !!value.headline.trim() && !!value.body.trim();
  const isDirty = (row: ProvisionalInsight) => { const value = translationEditor(row); return value.headline !== row.headline || value.body !== row.body || value.suggestion !== (row.suggestion ?? ""); };
  const dirty = selectedAI ? selectedAI.members.some(isDirty) : !!selected && (editor.headline !== selected.headline || editor.body !== selected.body || editor.suggestion !== (selected.suggestion ?? ""));
  const validSelected = selectedAI ? selectedAI.members.every(row => valid(translationEditor(row))) : valid(editor);
  const bilingualReady = !selectedAI || hasBothInsightLanguages(selectedAI.members);
  const groupChanges = () => selectedAI!.members.map(row => ({ id: row.id, expectedRevision: row.revision, summary: { ...translationEditor(row), suggestion: translationEditor(row).suggestion.trim() || null } }));
  const applyMembers = (members: ProvisionalInsight[]) => {
    setSummaries(rows => rows.map(row => members.find(next => next.id === row.id) ?? row));
    setEdits(drafts => { const next = { ...drafts }; for (const row of members) delete next[row.id]; return next; });
  };


  // New quiz recaps arrive while this desk is open. Refresh just the AI queue,
  // and pause during edits or review so a draft/revision cannot change mid-save.
  useEffect(() => {
    if (!isAdmin || loading || busy || creating || rejectTarget || deleteTemplateTarget || Object.keys(edits).length) return;
    const controller = new AbortController();
    let inFlight = false;
    const refreshQueue = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch("/api/admin/provisional-insights", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Review queue unavailable");
        const rows: ProvisionalInsight[] = await response.json();
        if (!controller.signal.aborted) {
          setSelection(value => value ?? selectedAI?.id ?? null);
          setSummaries(rows);
        }
      } catch { /* Preserve the current queue and any review work on a transient failure. */ }
      finally { inFlight = false; }
    };
    const interval = window.setInterval(() => { void refreshQueue(); }, 10_000);
    window.addEventListener("focus", refreshQueue);
    document.addEventListener("visibilitychange", refreshQueue);
    return () => {
      controller.abort(); window.clearInterval(interval);
      window.removeEventListener("focus", refreshQueue);
      document.removeEventListener("visibilitychange", refreshQueue);
    };
  }, [isAdmin, loading, busy, creating, rejectTarget, deleteTemplateTarget, edits, selectedAI?.id]);
  const statusName = (status: string) => ({ provisional: text("Awaiting review", "รอตรวจสอบ"), approved: text("Approved", "อนุมัติแล้ว"), rejected: text("Not approved", "ไม่อนุมัติ"), draft: text("Private draft", "ฉบับร่างส่วนตัว"), reviewed: text("Reviewed", "ตรวจแล้ว") })[status] ?? status;
  const status = selectedAI?.status ?? selectedTemplate?.review_status ?? "draft";

  const request = async (url: string, method: string, body: unknown) => {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errors: Record<number, string> = {
        400: text("Enter a headline and summary within the character limits.", "กรอกหัวข้อและข้อความสรุปให้ครบ โดยไม่เกินจำนวนตัวอักษรที่กำหนด"),
        403: text("Your admin session is unavailable. Sign in again to save.", "ไม่พบสิทธิ์ผู้ดูแล กรุณาเข้าสู่ระบบอีกครั้งก่อนบันทึก"),
        409: text("Another review changed this summary. Refresh, check your edits, and try again.", "สรุปนี้ถูกแก้ไขหรือตรวจสอบแล้ว กรุณาโหลดข้อมูลใหม่ ตรวจข้อความ แล้วลองอีกครั้ง"),
        422: text("Keep the summary educational. Remove personal diagnoses or treatment instructions before saving.", "กรุณาใช้ข้อความเพื่อการเรียนรู้ และนำการวินิจฉัยบุคคลหรือคำสั่งรักษาออกก่อนบันทึก"),
        429: text("Too many requests. Wait a moment and save again; your edits are preserved.", "ดำเนินการถี่เกินไป กรุณารอสักครู่แล้วบันทึกใหม่ ข้อความที่แก้ไขยังอยู่"),
        503: text("The other language could not be prepared. Please try again; existing wording is preserved.", "ยังเตรียมอีกภาษาไม่ได้ กรุณาลองอีกครั้ง ข้อความเดิมยังอยู่"),
        500: text("Could not save. Please try again; your edits are preserved.", "บันทึกไม่ได้ โปรดลองอีกครั้ง ข้อความที่แก้ไขยังอยู่"),
      };
      throw new Error(errors[response.status] ?? data.error ?? text(`Request failed (${response.status}). Please try again.`, `ดำเนินการไม่สำเร็จ (${response.status}) โปรดลองอีกครั้ง`));
    }
    return data;
  };

  const perform = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setNotice(null);
    try {
      await action();
      setNotice({ error: false, text: success });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : text("Could not save. Please try again.", "บันทึกไม่ได้ โปรดลองอีกครั้ง") });
    } finally { setBusy(false); }
  };

  const saveSelected = () => {
    if (!selected) return;
    void perform(async () => {
      const result = await request(selectedAI ? "/api/admin/provisional-insights" : "/api/admin/insight-templates", "POST", selectedAI ? {
        id: primaryAI!.id, expectedRevision: primaryAI!.revision, ...editor, suggestion: editor.suggestion.trim() || null, members: groupChanges(),
      } : {
        id: selectedTemplate!.id, quizId: selectedTemplate!.quiz_id, clinicalTag: selectedTemplate!.clinical_tag,
        audience: selectedTemplate!.audience, locale: selectedTemplate!.locale, ...editor, suggestion: editor.suggestion.trim() || null,
      });
      if (selectedAI) applyMembers(result.members);
      else setTemplates((rows) => rows.map((row) => row.id === result.id ? result : row));
      setEdits((drafts) => { const next = { ...drafts }; delete next[selected.id]; return next; });
    }, text("Draft saved. Review it when you’re ready.", "บันทึกฉบับร่างแล้ว พร้อมให้ตรวจสอบต่อ"));
  };

  const approve = () => {
    if (!selected || !bilingualReady) return;
    void perform(async () => {
      const result = await request(selectedAI ? "/api/admin/provisional-insights" : "/api/admin/insight-templates", "PATCH", selectedAI ? {
        id: primaryAI!.id, status: "approved", expectedRevision: primaryAI!.revision, members: groupChanges(),
        summary: { ...editor, suggestion: editor.suggestion.trim() || null },
      } : { id: selectedTemplate!.id, reviewStatus: "approved" });
      if (selectedAI) applyMembers(result.members);
      else setTemplates((rows) => rows.map((row) => row.id === result.id ? result : row));
      setEdits((drafts) => { const next = { ...drafts }; delete next[selected.id]; return next; });
    }, selectedAI ? text("Approved in Thai and English.", "อนุมัติทั้งภาษาไทยและอังกฤษแล้ว") : text("Approved. Matching users now see the reviewed label.", "อนุมัติแล้ว ผู้ใช้ที่มีคำตอบตรงกันจะเห็นป้ายผ่านการตรวจสอบ"));
  };

  const reject = (disposition: "keep" | "delete") => {
    if (!rejectTarget) return;
    const members = grouped.find(group => group.id === rejectTarget.id)?.members ?? [rejectTarget];
    void perform(async () => {
      const result = await request("/api/admin/provisional-insights", "PATCH", {
        members: members.map(row => ({ id: row.id, expectedRevision: row.revision })),
        id: rejectTarget.id, status: "rejected", disposition, expectedRevision: rejectTarget.revision,
      });
      if (disposition === "delete") setSummaries(rows => rows.filter(row => !members.some(member => member.id === row.id)));
      else applyMembers(result.members);
      rejectDialog.current?.close(); setRejectTarget(null);
      setEdits((drafts) => { const next = { ...drafts }; for (const row of members) delete next[row.id]; return next; });
    }, disposition === "delete" ? text("Summary deleted and hidden from users.", "ลบข้อความสรุปแล้ว และไม่แสดงให้ผู้ใช้เห็น") : text("Kept for reconsideration. Hidden from users.", "เก็บไว้พิจารณาแล้ว โดยไม่แสดงให้ผู้ใช้เห็น"));
  };

  const selectTab = (next: Tab) => { setTab(next); setSelection(null); setNotice(null); setCreating(false); };
  const openReject = () => { if (selectedAI) { setRejectTarget(selectedAI); rejectDialog.current?.showModal(); } };

  if (authLoading || !isAdmin) return null;

  return <div className="insights-desk nq-admin-panel">
    <header className="insights-header">
      <div>
        <h1>{text("Insight Summaries", "สรุปผลแบบทดสอบ")}</h1>
        <p>{text("Review, edit and approve AI summaries.", "ตรวจ แก้ไข และอนุมัติสรุปจาก AI")}</p></div>
      <button className="insights-button secondary" disabled={busy} onClick={() => { selectTab("templates"); setCreating(true); }}><Icon name="plus" />{text("Write a summary", "เขียนสรุปเอง")}</button>
    </header>

    <div className="insights-metrics">
      {([ ["provisional", "clock", text("Ready for your review", "รอให้คุณตรวจสอบ"), text("Personal drafts with an unreviewed label", "สร้างแยกสำหรับผู้ใช้พร้อมป้ายรอตรวจสอบ")], ["approved", "check", text("Approved insights", "สรุปที่อนุมัติแล้ว"), text("Reusable for matching answers", "ใช้ซ้ำกับคำตอบที่ตรงกันได้")], ["rejected", "book", text("Kept for reconsideration", "เก็บไว้พิจารณา"), text("Hidden from every user", "ซ่อนไม่ให้ผู้ใช้เห็น")]] as const).map(([key, icon, label, note]) =>
        <button className={`insights-metric ${key}`} key={key} disabled={busy} onClick={() => selectTab(key)}><span className="metric-icon"><Icon name={icon} /></span><span><strong>{filtered.filter((item) => item.status === key).length}</strong><span className="metric-label">{label}</span><small>{note}</small></span><Icon name="arrow" /></button>)}
    </div>


    {notice && <div className={`insights-notice ${notice.error ? "error" : "success"}`} role={notice.error ? "alert" : "status"}>{notice.text}<button aria-label={text("Dismiss message", "ปิดข้อความ")} onClick={() => setNotice(null)}>×</button></div>}
    {loadError && <div className="insights-notice error" role="alert">{text("Couldn’t load the latest summaries. Your typed changes are still here.", "โหลดข้อมูลล่าสุดไม่ได้ ข้อความที่คุณแก้ไขยังอยู่")}
      <button className="insights-button secondary" disabled={busy || loading} onClick={() => void refresh()}>{text("Try again", "ลองอีกครั้ง")}</button></div>}

    <section className="insights-workspace" aria-label={text("Summary review desk", "พื้นที่ตรวจสอบสรุป")}>
      <div className="insights-toolbar">
        <div className="insights-tabs" role="tablist" aria-label={text("Summary status", "สถานะสรุป")}>
          {(["provisional", "approved", "rejected", "templates"] as Tab[]).map((key) => <button key={key} id={`insights-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="insights-panel" tabIndex={tab === key ? 0 : -1} disabled={busy} onKeyDown={(event) => {
            const tabs: Tab[] = ["provisional", "approved", "rejected", "templates"];
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[3] : tabs[(tabs.indexOf(key) + (event.key === "ArrowRight" ? 1 : 3)) % 4];
              selectTab(next); document.getElementById(`insights-tab-${next}`)?.focus();
            }
          }} onClick={() => selectTab(key)}>{key === "templates" ? text("Written summaries", "สรุปที่เขียนเอง") : statusName(key)}<span>{key === "templates" ? visibleTemplates.length : filtered.filter((item) => item.status === key).length}</span></button>)}
        </div>
        <div className="insights-filters">
          <label className="insights-search"><Icon name="search" /><input aria-label={text("Search summaries", "ค้นหาสรุป")} placeholder={text("Search quiz or summary…", "ค้นหาแบบทดสอบหรือสรุป…")} value={search} disabled={busy} onChange={(e) => { setSearch(e.target.value); setSelection(null); }} /></label>
          <select aria-label={text("Filter by quiz", "กรองตามแบบทดสอบ")} value={quizFilter} disabled={busy} onChange={(e) => { setQuizFilter(e.target.value); setSelection(null); }}><option value="">{text("All quizzes", "ทุกแบบทดสอบ")}</option>{quizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.name}</option>)}</select>
          <select aria-label={text("Filter by language", "กรองตามภาษา")} value={locale} disabled={busy} onChange={(e) => { setLocale(e.target.value as InsightLocale | "all"); setSelection(null); }}><option value="all">{text("All languages", "ทุกภาษา")}</option><option value="th">ไทย</option><option value="en">English</option></select>
          <IconRefreshButton disabled={busy || loading} onRefresh={() => void refresh()} label={text("Refresh summaries", "โหลดสรุปใหม่")} />
        </div>
      </div>

      <div role="tabpanel" id="insights-panel" aria-labelledby={`insights-tab-${tab}`} aria-busy={loading || busy}>
      {creating ? <div className="insights-create">
        <div><p className="insights-eyebrow">{text("MANUAL SUMMARY", "เขียนสรุปเอง")}</p><h2>{text("Start with your own words", "เริ่มจากข้อความของคุณ")}</h2><p className="insights-muted">{text("Manual drafts stay private until approved. AI summaries from user answers appear in the review queue automatically.", "ฉบับร่างที่เขียนเองจะไม่แสดงจนกว่าจะอนุมัติ ส่วนสรุป AI จากคำตอบผู้ใช้จะเข้าคิวตรวจสอบอัตโนมัติ")}</p></div>
        <form onSubmit={(event) => { event.preventDefault(); void perform(async () => {
          const result = await request("/api/admin/insight-templates", "POST", { quizId: newQuiz || null, clinicalTag: newTag, audience: newAudience, locale: newLocale, ...newEditor, suggestion: newEditor.suggestion.trim() || null });
          setTemplates((rows) => [result, ...rows.filter((row) => row.id !== result.id)]); setSelection(result.id); setNewEditor(EMPTY);  setCreating(false); setQuizFilter(""); setLocale("all"); setSearch("");
        }, text("Draft saved. It’s private until you approve it.", "บันทึกฉบับร่างแล้ว ข้อความจะไม่แสดงจนกว่าคุณจะอนุมัติ")); }}>
          <fieldset disabled={busy} className="insights-fields">
            <div className="insights-scope"><Field label={text("Quiz", "แบบทดสอบ")}><select value={newQuiz} onChange={(e) => setNewQuiz(e.target.value)}><option value="">{text("All quizzes", "ทุกแบบทดสอบ")}</option>{quizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.name}</option>)}</select></Field><Field label={text("Language", "ภาษา")}><select value={newLocale} onChange={(e) => setNewLocale(e.target.value as InsightLocale)}><option value="th">ไทย</option><option value="en">English</option></select></Field><Field label={text("Audience", "กลุ่มผู้อ่าน")}><select value={newAudience} onChange={(e) => setNewAudience(e.target.value as "public" | "hcp")}><option value="public">{text("General public", "บุคคลทั่วไป")}</option><option value="hcp">{text("Healthcare professionals", "บุคลากรสุขภาพ")}</option></select></Field></div>
            <EditorFields value={newEditor} onChange={setNewEditor} th={!!th} />
            <details><summary>{text("Optional topic scope", "กำหนดหัวข้อเพิ่มเติม (ไม่บังคับ)")}</summary><Field label={text("Topic tag — leave blank for all topics", "แท็กหัวข้อ — เว้นว่างเพื่อใช้กับทุกหัวข้อ")}><input value={newTag} maxLength={80} onChange={(e) => setNewTag(e.target.value)} /></Field></details>
          </fieldset>
          <div className="insights-actions"><button type="submit" className="insights-button primary" disabled={busy || !valid(newEditor)}>{busy ? text("Saving…", "กำลังบันทึก…") : text("Save draft", "บันทึกฉบับร่าง")}</button><button type="button" className="insights-button secondary" disabled={busy} onClick={() => setCreating(false)}>{text("Back to summaries", "กลับไปดูสรุป")}</button></div>
        </form>
      </div> : loading ? <div className="insights-empty" role="status"><span className="insights-loader" /><h2>{text("Loading your review desk…", "กำลังโหลดรายการสรุป…")}</h2></div> : !selected ? <div className="insights-empty"><span className="empty-icon"><Icon name={tab === "provisional" ? "check" : "book"} /></span><h2>{search || quizFilter || locale !== "all" ? text("No matching summaries", "ไม่พบสรุปที่ตรงกับตัวกรอง") : tab === "provisional" ? text("You’re all caught up", "ตรวจครบแล้วในตอนนี้") : text("No summaries here yet", "ยังไม่มีสรุปในรายการนี้")}</h2><p>{search || quizFilter || locale !== "all" ? text("Try another search or clear the filters.", "ลองค้นหาใหม่หรือล้างตัวกรอง") : text("When users finish a published quiz, AI summaries are generated and saved here automatically for review.", "เมื่อผู้ใช้ทำแบบทดสอบที่เผยแพร่แล้วเสร็จ AI จะสร้างและบันทึกสรุปที่นี่โดยอัตโนมัติเพื่อรอตรวจสอบ")}</p>{(search || quizFilter || locale !== "all") && <button className="insights-button secondary" onClick={() => { setSearch(""); setQuizFilter(""); setLocale("all"); }}>{text("Clear filters", "ล้างตัวกรอง")}</button>}</div> : <div className="insights-review-layout">
        <aside className="insights-list" aria-label={text("Summaries", "รายการสรุป")}>
          <p className="insights-list-heading">{text("SELECT A SUMMARY", "เลือกสรุปเพื่อตรวจสอบ")}</p>
          {(tab === "templates" ? visibleTemplates : queue).map((item) => <button className={`insights-list-item ${selected.id === item.id ? "active" : ""}`} key={item.id} disabled={busy} aria-pressed={selected.id === item.id} onClick={() => { setSelection(item.id);  setNotice(null); }}>
            <span className="insights-list-meta"><span className={`insights-badge ${"status" in item ? item.status : item.review_status}`}>{statusName("status" in item ? item.status : item.review_status)}</span><small>{"members" in item ? [...new Set(item.members.map(row => row.locale.toUpperCase()))].join(" + ") : item.locale === "th" ? "TH" : "EN"}</small></span>
            <strong>{item.headline}</strong><span className="insights-list-quiz">{"quiz_name" in item ? item.quiz_name : quizzes.find((quiz) => quiz.id === item.quiz_id)?.name ?? text("All quizzes", "ทุกแบบทดสอบ")}</span><p>{item.body}</p>
          </button>)}
        </aside>
        <article className="insights-detail" key={selected.id}>
          <div className="insights-detail-header"><div><p className="insights-eyebrow">{selectedAI ? text("ANSWER-BASED SUMMARY", "สรุปจากคำตอบจริง") : text("WRITTEN SUMMARY", "สรุปที่เขียนไว้")}</p><h2>{selectedAI?.quiz_name ?? quizzes.find((quiz) => quiz.id === selectedTemplate?.quiz_id)?.name ?? text("All quizzes", "ทุกแบบทดสอบ")}</h2><p className="insights-muted">{selectedAI ? [...new Set(selectedAI.members.map(row => row.locale === "th" ? "ไทย" : "English"))].join(" + ") : selected.locale === "th" ? "ไทย" : "English"} · {selected.audience === "hcp" ? text("Healthcare professionals", "บุคลากรสุขภาพ") : text("General public", "บุคคลทั่วไป")}{selectedAI?.answer_context ? ` · ${selectedAI.answer_context.answers.length} ${text("answers", "คำตอบ")}` : ""}</p></div><span className={`insights-badge ${status}`}>{statusName(status)}</span></div>
          <div className={`insights-visibility ${status}`}><Icon name={status === "approved" ? "check" : "clock"} /><p>{status === "approved" ? text("Users see reviewed feedback. Answer-based summaries can be reused when the recorded selections match.", "ผู้ใช้เห็นสรุปที่ตรวจแล้ว สรุปจากคำตอบสามารถใช้ซ้ำได้เมื่อคำตอบต้นทางตรงกัน") : status === "rejected" ? text("Hidden from users. Kept here so you can reconsider, edit, or delete it.", "ไม่แสดงให้ผู้ใช้เห็น เก็บไว้ให้พิจารณา แก้ไข หรือลบภายหลัง") : selectedAI ? text("Review Thai and English together. Unapproved wording is shown with an awaiting-review label.", "ตรวจภาษาไทยและอังกฤษพร้อมกัน ข้อความที่ยังไม่อนุมัติจะแสดงพร้อมป้ายรอตรวจสอบ") : text("This draft is private. Users will only see it after approval.", "ฉบับร่างนี้ยังเป็นส่วนตัว ผู้ใช้จะเห็นได้หลังจากอนุมัติเท่านั้น")}</p></div>
          {selectedAI && !bilingualReady && <div className="insights-missing-language"><p>{text("Review both languages before approving. This summary is missing a translation.", "ตรวจทั้งสองภาษาก่อนอนุมัติ สรุปนี้ยังขาดอีกหนึ่งภาษา")}</p><button type="button" className="insights-button secondary" disabled={busy || dirty} onClick={() => void perform(async () => {
            const source = primaryAI!;
            const result = await request("/api/admin/provisional-insights", "PUT", { id: source.id, expectedRevision: source.revision });
            const rows: ProvisionalInsight[] = await request("/api/admin/provisional-insights", "GET", undefined);
            setSummaries(rows); setLocale("all");
            setTab(source.status === "rejected" ? "rejected" : "provisional");
            setSelection([...selectedAI.members.map(row => row.id), result.id].sort()[0]);
          }, text("Translation ready. Review both languages before approving.", "เตรียมอีกภาษาแล้ว กรุณาตรวจทั้งสองภาษาก่อนอนุมัติ"))}>{busy ? text("Preparing…", "กำลังเตรียม…") : text("Prepare missing language", "เตรียมอีกภาษา")}</button>{dirty && <small>{text("Save your edits first.", "บันทึกการแก้ไขก่อน")}</small>}</div>}
          <form onSubmit={(event) => { event.preventDefault(); saveSelected(); }}>
            <fieldset disabled={busy} className="insights-fields">{selectedAI ? <div className="insights-translations">{selectedAI.members.map(row => <section key={row.id} className="insights-translation" aria-label={row.locale === "th" ? "สรุปภาษาไทย" : "English summary"}><h3>{row.locale === "th" ? "ภาษาไทย · TH" : "English · EN"}<span className={`insights-badge ${row.status}`}>{statusName(row.status)}</span></h3><EditorFields value={translationEditor(row)} onChange={value => setEdits(drafts => ({ ...drafts, [row.id]: value }))} th={row.locale === "th"} /></section>)}</div> : <EditorFields value={editor} onChange={(value) => setEdits((drafts) => ({ ...drafts, [selected.id]: value }))} th={!!th} />}</fieldset>
            {selectedAI ? selectedAI.members.map(row => <SummaryPreview key={row.id} value={translationEditor(row)} locale={row.locale} ai status={row.status} th={!!th} />) : <SummaryPreview value={editor} locale={selectedTemplate!.locale} status={status} th={!!th} />}

            {selectedAI?.answer_context?.answers.length ? <section className="insights-evidence"><div><Icon name="book" /><h3>{text("Source answers", "คำตอบที่ AI ใช้สร้างสรุป")}</h3><span>{selectedAI.answer_context.answers.length}</span></div><p className="insights-muted">{text("Compare the wording with the recorded selections and authored explanations before approving.", "เปรียบเทียบข้อความกับคำตอบที่เลือกและคำอธิบายต้นฉบับก่อนอนุมัติ")}</p><ol>{selectedAI.answer_context.answers.map((answer, index) => <li key={index}><details open={selectedAI.answer_context!.answers.length === 1}><summary><span className="answer-number">{index + 1}</span><span>{answer.question}</span><span className={`answer-result ${answer.selectedAligned ? "aligned" : "review"}`}>{answer.selectedAligned ? text("Correct", "ถูกต้อง") : text("To revisit", "ควรทบทวน")}</span></summary><div className="answer-source"><p><strong>{text("Selected answer", "คำตอบที่เลือก")}</strong>{answer.selected}</p>{answer.selectedExplanation && <p><strong>{text("Author’s explanation", "คำอธิบายจากผู้เขียน")}</strong>{answer.selectedExplanation}</p>}{answer.alignedChoices.map((choice, i) => <p className="answer-key" key={i}><strong>{text("Answer key", "เฉลย")}</strong>{choice.text}{choice.explanation && <span>{choice.explanation}</span>}</p>)}</div></details></li>)}</ol></section> : selectedAI ? <p className="insights-muted">{text("Source answers are unavailable for this older summary. Review carefully before approving.", "สรุปเก่านี้ไม่มีข้อมูลคำตอบต้นทาง กรุณาตรวจข้อความก่อนอนุมัติ")}</p> : null}
            <div className="insights-detail-footer"><p>{dirty ? text("Unsaved changes", "มีการแก้ไขที่ยังไม่บันทึก") : text("All changes saved", "บันทึกการเปลี่ยนแปลงแล้ว")}{selected.reviewed_at && ` · ${text("Reviewed", "ตรวจเมื่อ")} ${new Date(selected.reviewed_at).toLocaleDateString(th ? "th-TH" : "en-GB", { timeZone: "Asia/Bangkok" })}`}</p><div className="insights-actions">
              <button type="submit" className="insights-button secondary" disabled={busy || !validSelected}>{busy ? text("Saving…", "กำลังบันทึก…") : text("Save draft", "บันทึกฉบับร่าง")}</button>
              {(status !== "approved" || dirty) && <button type="button" className="insights-button primary" disabled={busy || !validSelected || !bilingualReady || (!!selectedTemplate && !!dirty)} onClick={approve}><Icon name="check" />{selectedAI ? text("Approve TH + EN", "อนุมัติ TH + EN") : text("Approve summary", "อนุมัติสรุป")}</button>}
              {selectedAI && <button type="button" className="insights-button danger" disabled={busy} onClick={openReject}>{status === "rejected" ? text("Delete or keep", "ลบหรือเก็บไว้") : text("Not approved", "ไม่อนุมัติ")}</button>}
              {selectedTemplate && status === "approved" && <button type="button" className="insights-button danger" disabled={busy} onClick={() => void perform(async () => {
                const result = await request("/api/admin/insight-templates", "PATCH", { id: selectedTemplate.id, reviewStatus: "draft" });
                setTemplates((rows) => rows.map((row) => row.id === result.id ? result : row));
              }, text("Approval withdrawn. The draft is private.", "ถอนการอนุมัติแล้ว ฉบับร่างไม่แสดงให้ผู้ใช้เห็น"))}>{text("Withdraw approval", "ถอนการอนุมัติ")}</button>}
              {selectedTemplate && <button type="button" className="insights-button danger" disabled={busy} onClick={() => { setDeleteTemplateTarget(selectedTemplate); rejectDialog.current?.showModal(); }}>{text("Delete", "ลบ")}</button>}
            </div>{selectedTemplate && dirty && <small>{text("Save your changes before approving.", "บันทึกการแก้ไขก่อนอนุมัติ")}</small>}</div>
          </form>
        </article>
      </div>}
      </div>
    </section>
    <p className="insights-bottom-note"><Icon name="book" />{text("Reuse requires all source selections to match and cover at least 80% of the new answers. Changed answers or explanations need a new summary.", "ใช้ซ้ำได้เมื่อคำตอบต้นทางทั้งหมดตรงกัน และครอบคลุมอย่างน้อย 80% ของคำตอบใหม่ หากคำตอบหรือคำอธิบายเปลี่ยน ต้องสร้างสรุปใหม่")}</p>

    <dialog ref={rejectDialog} className="insights-dialog" aria-labelledby="insights-reject-title" aria-describedby="insights-reject-description" onCancel={(event) => { if (busy) event.preventDefault(); else { setRejectTarget(null); setDeleteTemplateTarget(null); } }} onClose={() => { setRejectTarget(null); setDeleteTemplateTarget(null); }}>
      <p className="insights-eyebrow">{text("REVIEW DECISION", "ผลการตรวจสอบ")}</p><h2 id="insights-reject-title">{deleteTemplateTarget ? text("Delete this written summary?", "ต้องการลบสรุปที่เขียนไว้นี้?") : text("What should happen to this summary?", "ต้องการจัดการสรุปนี้อย่างไร?")}</h2><p id="insights-reject-description">{deleteTemplateTarget ? text("The summary will be removed permanently. Cancel to keep it.", "ข้อความสรุปจะถูกลบถาวร กดยกเลิกหากต้องการเก็บไว้") : text("Both choices hide it from users. Keep it if you want to reconsider later, or delete its wording so a new summary can be generated.", "ทั้งสองตัวเลือกจะซ่อนข้อความจากผู้ใช้ คุณสามารถเก็บไว้พิจารณาภายหลัง หรือลบเพื่อให้สร้างสรุปใหม่")}</p><blockquote>{deleteTemplateTarget?.headline ?? rejectTarget?.headline}</blockquote>
      {!deleteTemplateTarget && <button className="insights-decision" disabled={busy} onClick={() => reject("keep")}><Icon name="book" /><span><strong>{text("Keep for reconsideration", "เก็บไว้พิจารณา")}</strong><small>{text("Move to Not approved. You can edit and approve it later.", "ย้ายไปที่ไม่อนุมัติ สามารถแก้ไขและอนุมัติภายหลังได้")}</small></span><Icon name="arrow" /></button>}
      <button className="insights-decision danger" disabled={busy} onClick={() => {
        if (!deleteTemplateTarget) { reject("delete"); return; }
        void perform(async () => {
          await request("/api/admin/insight-templates", "DELETE", { id: deleteTemplateTarget.id });
          setTemplates((rows) => rows.filter((row) => row.id !== deleteTemplateTarget.id));
          setEdits((drafts) => { const next = { ...drafts }; delete next[deleteTemplateTarget.id]; return next; });
          rejectDialog.current?.close();
        }, text("Written summary deleted.", "ลบสรุปที่เขียนไว้แล้ว"));
      }}><span className="decision-x" aria-hidden="true">×</span><span><strong>{text("Delete summary", "ลบข้อความสรุป")}</strong><small>{deleteTemplateTarget ? text("Remove this written summary permanently.", "ลบสรุปที่เขียนไว้นี้ถาวร") : text("Remove the text. Generate a new summary when the user loads their recap.", "ลบข้อความ แล้วสร้างสรุปใหม่เมื่อผู้ใช้เปิดดูสรุป")}</small></span><Icon name="arrow" /></button>
      <button className="insights-button secondary" disabled={busy} onClick={() => rejectDialog.current?.close()}>{text("Cancel", "ยกเลิก")}</button>
    </dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="insights-field"><span>{label}</span>{children}</label>; }
function EditorFields({ value, onChange, th }: { value: Editor; onChange: (value: Editor) => void; th: boolean }) {
  return <>{([
    ["headline", th ? "หัวข้อสรุป" : "Headline", HEADLINE_MAX, th ? "ประเด็นสำคัญจากคำตอบ" : "The key takeaway"],
    ["body", th ? "ข้อความสรุป" : "Summary", BODY_MAX, th ? "สรุปสิ่งที่ผู้ใช้เรียนรู้จากคำตอบ" : "Summary of the selected answers"],
    ["suggestion", th ? "คำแนะนำ (ไม่บังคับ)" : "Suggestion (optional)", SUGGESTION_MAX, th ? "สิ่งที่ควรทบทวนหรือเรียนรู้ต่อ" : "Suggested topic to review"],
  ] as const).map(([key, label, max, placeholder]) => <label className="insights-field" key={key}><span>{label}<small>{value[key].length}/{max}</small></span>{key === "body" ? <textarea required value={value[key]} rows={4} maxLength={max} placeholder={placeholder} onChange={(e) => onChange({ ...value, [key]: e.target.value })} /> : <input required={key === "headline"} value={value[key]} maxLength={max} placeholder={placeholder} onChange={(e) => onChange({ ...value, [key]: e.target.value })} />}</label>)}</>;
}

function SummaryPreview({ value, locale, ai = false, status, th }: { value: Editor; locale: InsightLocale; ai?: boolean; status: string; th: boolean }) {
  const text = (en: string, thai: string) => th ? thai : en;
  return <section className="insights-preview" aria-label={`${text("User preview", "ตัวอย่างที่ผู้ใช้จะเห็น")} · ${locale === "th" ? "TH" : "EN"}`}>
    <p className="insights-eyebrow">{text("USER PREVIEW", "ตัวอย่างสำหรับผู้ใช้")} · {locale === "th" ? "TH" : "EN"}</p>
    {ai && status === "provisional" && <span className="insights-badge provisional">{text("AI · awaiting admin or doctor review", "AI · ยังไม่ผ่านการตรวจสอบจากผู้ดูแลหรือแพทย์")}</span>}
    <h3>{value.headline || text("Your headline", "หัวข้อสรุป")}</h3>
    <p>{(ai ? firstInsightSentence(value.body, locale) : value.body) || text("Your summary will appear here.", "ข้อความสรุปจะแสดงที่นี่")}</p>
    {!ai && value.suggestion && <div className="insights-next-step"><Icon name="arrow" /><span>{value.suggestion}</span></div>}
    <small>{text("Quiz summary, not medical advice.", "สรุปผลแบบทดสอบ ไม่ใช่คำแนะนำทางการแพทย์")}{status === "rejected" && ` · ${text("Preview only — hidden from users", "ตัวอย่างเท่านั้น — ไม่แสดงให้ผู้ใช้เห็น")}`}</small>
  </section>;
}
