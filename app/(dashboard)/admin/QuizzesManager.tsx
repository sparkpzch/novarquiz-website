import QuizThumbnail from '@/components/ui/QuizThumbnail';
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useToast } from "@/components/ui/Toast";
import type { Quiz, Session } from "@/lib/types";
import type { SessionRoom } from "@/lib/firebase/rtdb";
import { SESSION_STATUS, ROOM_STATUS } from "@/lib/constants/session";
import { useAuth } from "@/lib/hooks/useAuth";
import { openLobby, closeLobby, reopenLobby, startRoom, endRoom, removeRoom } from "@/lib/firebase/rtdb";
import InvitationModal from "@/components/InvitationModal";
import CompareSessionsModal from "@/components/admin/CompareSessionsModal";

async function updateQuiz(quizId: string, data: Record<string, unknown>) {
  const response = await fetch(`/api/quizzes/${quizId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Quiz update failed (${response.status})`);
}

async function patchSession(sessionId: string, data: Record<string, unknown>) {
  const response = await fetch(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Session update failed (${response.status})`);
}

function ItemCard({
  title,
  badges,
  media,
  subtitle,
  content,
  actions,
  highlighted = false,
  noBorder = false
}: {
  title: string;
  badges?: React.ReactNode;
  media?: React.ReactNode;
  subtitle?: React.ReactNode;
  content?: React.ReactNode;
  actions: React.ReactNode;
  highlighted?: boolean;
  noBorder?: boolean;
}) {
  return (
    <div className={`rounded-xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(17,87,145,0.08)] flex flex-col ${!noBorder ? 'border' : ''} ${highlighted ? (noBorder ? 'bg-[#F4F9FF]' : 'border-[#0460A9]/30 bg-[#F4F9FF]') : (noBorder ? 'bg-white/60' : 'border-[#0460A9]/10 bg-white/60')}`}>
      {media && <div className="mb-4">{media}</div>}
      <div className="min-w-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-xl font-bold text-[#16324F] leading-tight truncate">{title}</h3>
          {badges}
        </div>
        {subtitle && <div className="mb-2">{subtitle}</div>}
        {content && <div className="mt-2 mb-4">{content}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-[#0460A9]/10">
        {actions}
      </div>
    </div>
  );
}

interface QuizzesManagerProps {
  allData: Quiz[];
  allSessions: (Session & { quiz_name?: string; play_count?: number; avg_score?: number; raw_session_name?: string | null })[];
  rooms: Partial<Record<string, SessionRoom>>;
  onDuplicate: (id: string, isQuizDuplicate: boolean) => Promise<void>;
  onCreateSession: (quizId: string, isPrivate: boolean, name?: string) => Promise<void>;
  onDeleteQuiz: (id: string) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onToggleStatus: (id: string, currentStatus: boolean) => Promise<void>;
  onRefresh: () => void;
  loading?: boolean;
}

/**
 * The name the user must type to confirm a delete/archive. Clicking copies it
 * exactly (Thai names and trailing spaces are easy to mistype). Falls back to
 * selecting the text when the Clipboard API is unavailable.
 */
function CopyableName({ name, className }: { name: string; className: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const textRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    let next: "copied" | "manual" = "copied";
    try {
      await navigator.clipboard.writeText(name);
    } catch {
      // Clipboard API blocked (no focus, insecure context): select the text
      // and try the legacy copy command; leave it selected for ⌘C otherwise.
      const el = textRef.current;
      if (el) window.getSelection()?.selectAllChildren(el);
      next = el && document.execCommand("copy") ? "copied" : "manual";
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <button
        type="button"
        onClick={copy}
        title="Click to copy"
        className={`${className} inline-flex items-baseline gap-1 rounded px-0.5 font-bold underline decoration-dotted underline-offset-4 hover:decoration-solid`}
      >
        <span ref={textRef}>{name}</span>
        <svg aria-hidden="true" className="h-3.5 w-3.5 self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 8V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-3M5 8h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z" />
        </svg>
      </button>
      <span role="status" aria-live="polite" className="text-xs font-semibold text-emerald-600">
        {state === "copied" ? "Copied to clipboard" : state === "manual" ? "Press ⌘C / Ctrl+C to copy" : ""}
      </span>
    </span>
  );
}

function ListSkeleton({ label, withMedia = false }: { label: string; withMedia?: boolean }) {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((k) => (
        <div key={k} aria-hidden="true" className="animate-pulse rounded-xl border border-[var(--nq-line)] bg-[var(--nq-panel)] p-5">
          {withMedia && <div className="mb-4 aspect-[16/7] rounded-xl bg-[var(--nq-inset)]" />}
          <div className="h-4 w-2/3 rounded-md bg-[var(--nq-inset)]" />
          <div className="mt-3 h-3 w-1/2 rounded-md bg-[var(--nq-inset)]" />
          <div className="mt-5 flex gap-2">
            <div className="h-8 w-20 rounded-lg bg-[var(--nq-inset)]" />
            <div className="h-8 w-20 rounded-lg bg-[var(--nq-inset)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function QuizzesManager({
  allData,
  allSessions,
  rooms,
  onDuplicate,
  onCreateSession,
  onDeleteQuiz,
  onDeleteSession,
  onRefresh,
  loading = false,
}: QuizzesManagerProps) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [createSessionModal, setCreateSessionModal] = useState<{ isOpen: boolean; quizId: string | null; quizName: string; isPrivate: boolean; sessionName: string }>({
    isOpen: false,
    quizId: null,
    quizName: "",
    isPrivate: true,
    sessionName: ""
  });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    id: string | null;
    name: string;
    confirmName: string;
    type: "quiz" | "session";
    action: "delete" | "archive";
  }>({
    isOpen: false,
    id: null,
    name: "",
    confirmName: "",
    type: "quiz",
    action: "delete"
  });
  const [qrModal, setQrModal] = useState<{ isOpen: boolean; sessionId: string; sessionName: string; joinToken: string | null; slug: string | null } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  // Optimistic overrides for the Random Choices toggle; `allData` only catches
  // up on the next onRefresh, which would otherwise snap the checkbox back.
  const [shuffleOverrides, setShuffleOverrides] = useState<Record<string, boolean>>({});

  const [compareModal, setCompareModal] = useState<{
    isOpen: boolean;
    quizId: string | null;
    selectedSessionIds: string[];
  }>({
    isOpen: false,
    quizId: null,
    selectedSessionIds: []
  });

  const setItemLoading = (id: string, isLoading: boolean) => {
    setLoadingIds(prev => ({ ...prev, [id]: isLoading }));
  };

  const handleThumbnailUpload = async (quizId: string, file: File) => {
    const loadingKey = `thumbnail:${quizId}`;
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      showToast("Thumbnail must be a JPG, PNG, GIF, or WebP image.", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("Thumbnail must be smaller than 10 MB.", "error");
      return;
    }

    setItemLoading(loadingKey, true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("quizId", quizId);
      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        headers: {"X-Quiz-Id":quizId},
        body: formData,
      });
      const uploaded = await uploadResponse.json().catch(() => null);
      if (!uploadResponse.ok || !uploaded?.url || !uploaded?.path) {
        throw new Error(uploaded?.error || "Thumbnail upload failed");
      }

      await updateQuiz(quizId, {
        cover_image_url: uploaded.url,
        cover_image_path: uploaded.path,
      });
      showToast("Quiz thumbnail updated.", "success");
      onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update thumbnail.", "error");
    } finally {
      setItemLoading(loadingKey, false);
    }
  };

  const handleThumbnailRemove = async (quizId: string) => {
    const loadingKey = `thumbnail:${quizId}`;
    setItemLoading(loadingKey, true);
    try {
      await updateQuiz(quizId, {
        cover_image_url: null,
        cover_image_path: null,
      });
      showToast("Quiz thumbnail removed.", "success");
      onRefresh();
    } catch {
      showToast("Failed to remove thumbnail.", "error");
    } finally {
      setItemLoading(loadingKey, false);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"owned" | "all">("owned");
  const [sessionFilterQuizId, setSessionFilterQuizId] = useState<string | null>(null);
  const [sessionPage, setSessionPage] = useState(1);
  const [quizPage, setQuizPage] = useState(1);
  const SESSION_ITEMS_PER_PAGE = 3;
  const QUIZ_ITEMS_PER_PAGE = 5;

  useEffect(() => {
    const hasOverlay = createSessionModal.isOpen || confirmModal.isOpen || compareModal.isOpen;
    if (!hasOverlay) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [createSessionModal.isOpen, confirmModal.isOpen]);

  const filteredTemplates = allData.filter(q => {
    const ownerId = q.created_by;
    if (filterMode === "owned" && ownerId !== user?.uid) return false;
    if (sessionFilterQuizId && q.id !== sessionFilterQuizId) return false;
    if (searchQuery) {
      if (!q.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !q.description?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
    }
    return true;
  });

  const filteredSessions = allSessions.filter(s => {
    if (filterMode === "owned" && s.user_id !== user?.uid) return false;
    if (sessionFilterQuizId && s.session_id !== sessionFilterQuizId) return false;
    if (searchQuery) {
      const sq = searchQuery.toLowerCase();
      const sessionName = (s.name || "").toLowerCase();
      const quizName = (s.quiz_name || "").toLowerCase();
      if (!sessionName.includes(sq) && !quizName.includes(sq)) {
        return false;
      }
    }
    return true;
  });


  const totalSessionPages = Math.max(1, Math.ceil(filteredSessions.length / SESSION_ITEMS_PER_PAGE));


  const totalQuizPages = Math.max(1, Math.ceil(filteredTemplates.length / QUIZ_ITEMS_PER_PAGE));


  const safeSessionPage = Math.min(sessionPage, totalSessionPages);
  const safeQuizPage = Math.min(quizPage, totalQuizPages);
  const paginatedSessions = filteredSessions.slice((safeSessionPage - 1) * SESSION_ITEMS_PER_PAGE, safeSessionPage * SESSION_ITEMS_PER_PAGE);
  const paginatedTemplates = filteredTemplates.slice((safeQuizPage - 1) * QUIZ_ITEMS_PER_PAGE, safeQuizPage * QUIZ_ITEMS_PER_PAGE);

  const handleCreateSessionSubmit = async (isPrivate: boolean) => {
    if (isSubmitting) return;
    if (!createSessionModal.quizId) return;

    setIsSubmitting(true);
    try {
      await onCreateSession(createSessionModal.quizId, isPrivate, createSessionModal.sessionName);
      setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true, sessionName: "" });
      showToast("Session created. Check the Sessions column.", "success");
    } catch (error) {
      console.error("Failed to create session:", error);
      showToast("Failed to create session. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleJoin = async (sessionId: string, isPrivate: boolean) => {
    const room = rooms[sessionId];
    const status = room?.status ?? allSessions.find(session => session.id===sessionId)?.status;
    const isOpen = status===ROOM_STATUS.WAITING || status===ROOM_STATUS.STARTED || status===SESSION_STATUS.OPENED;

    setItemLoading(sessionId, true);
    try {
      if (isOpen) {
        await handleArchiveSession(sessionId);
      } else {
        if (!user) return;

        await reopenLobby(sessionId, user.uid);
        const token = await openLobby(sessionId);

        if (!isPrivate) {
          await startRoom(sessionId);
          await patchSession(sessionId, { status: SESSION_STATUS.STARTED, pin: token });
          showToast(`Session started!`, "success");
        } else {
          await patchSession(sessionId, { status: SESSION_STATUS.OPENED, pin: token });
          showToast("Lobby opened! Share the invite link.", "success");
        }
        onRefresh();
      }
    } catch (err) {
      console.error("Lobby action failed:", err);
      showToast("Action failed. Please try again.", "error");
    } finally {
      setItemLoading(sessionId, false);
    }
  };

  const handleArchiveSession = async (sessionId: string) => {
    setItemLoading(sessionId, true);
    try {
      await removeRoom(sessionId);
      await patchSession(sessionId, { status: SESSION_STATUS.ARCHIVED, pin: null });
      showToast("Session archived.", "success");
      onRefresh();
    } catch (err) {
      console.error("Archive failed:", err);
      throw err;
    } finally {
      setItemLoading(sessionId, false);
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    setItemLoading(sessionId, true);
    try {
      await endRoom(sessionId);
      await closeLobby(sessionId);
      await patchSession(sessionId, { status: SESSION_STATUS.CLOSED, pin: null });
      showToast("Session closed.", "success");
      onRefresh();
    } catch (err) {
      console.error("Close failed:", err);
      showToast("Failed to close session.", "error");
    } finally {
      setItemLoading(sessionId, false);
    }
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmModal.confirmName === confirmModal.name && confirmModal.id) {
      setIsSubmitting(true);
      try {
        if (confirmModal.action === "delete") {
          if (confirmModal.type === "quiz") {
            await onDeleteQuiz(confirmModal.id);
          } else {
            await removeRoom(confirmModal.id);
            await onDeleteSession(confirmModal.id);
          }
          showToast("Deleted successfully.", "success");
        } else {
          await handleArchiveSession(confirmModal.id);
        }
        setConfirmModal({ isOpen: false, id: null, name: "", confirmName: "", type: "quiz", action: "delete" });
      } catch (err) {
        console.error("Action failed:", err);
        showToast("Action failed.", "error");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      showToast("Name does not match.", "error");
    }
  };

  return (
    <div className="nq-quiz-manager flex h-full w-full flex-col gap-6 pb-12 lg:gap-8">
      {/* Control Bar */}
      <div className="nq-card rounded-xl p-4 flex flex-col sm:flex-row sm:flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setFilterMode("owned"); setSessionPage(1); setQuizPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filterMode === "owned" ? "bg-[#0460A9] text-white" : "text-[#5D7EA1] hover:bg-[#0460A9]/10"}`}
          >
            Owned
          </button>
          <button
            onClick={() => { setFilterMode("all"); setSessionPage(1); setQuizPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filterMode === "all" ? "bg-[#0460A9] text-white" : "text-[#5D7EA1] hover:bg-[#0460A9]/10"}`}
          >
            All
          </button>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setCompareModal({
              isOpen: true,
              quizId: sessionFilterQuizId || (allData[0]?.id ?? null),
              selectedSessionIds: []
            })}
            className="flex items-center gap-2 rounded-lg bg-[#0460A9]/10 hover:bg-[#0460A9] text-[#0460A9] hover:text-white px-4 py-2 text-sm font-bold transition-all shadow-sm shrink-0"
            title="Compare session results"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Compare Sessions
          </button>
          {sessionFilterQuizId && (
            <button
              onClick={() => { setSessionFilterQuizId(null); setSessionPage(1); setQuizPage(1); }}
              className="px-3 py-2 rounded-lg bg-[#E74C3C]/10 text-[#E74C3C] text-sm font-bold flex items-center gap-1 hover:bg-[#E74C3C]/20 transition-all shrink-0"
            >
              Clear Template Filter ✕
            </button>
          )}
          <div className="relative w-full sm:w-64">
            <svg className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-[#5D7EA1]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSessionPage(1); setQuizPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[#0460A9]/10 bg-[#F8FAFC] text-[#16324F] placeholder-[#5D7EA1]/50 focus:outline-none focus:border-[#0460A9]/40 focus:bg-white transition-all text-sm font-medium"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch flex-1">
        {/* LEFT COLUMN: Sessions */}
        <div className="nq-card flex min-w-0 flex-col rounded-xl p-5 md:p-6 lg:min-h-[calc(100dvh-13rem)] lg:p-8">
          <div className="mb-6 lg:mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">Live instances</p>
            <h2 className="mt-2 text-2xl md:text-3xl font-bold text-[#16324F]">Sessions</h2>
            <p className="mt-3 text-sm text-[#5D7EA1] max-w-md">Manage active or inactive instances of quizzes that players can join.</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading && allSessions.length === 0 ? (
              <ListSkeleton label="Loading sessions…" />
            ) : paginatedSessions.length === 0 ? (
              <div className="nq-card-soft rounded-xl p-10 text-center">
                <p className="text-lg font-semibold text-[#16324F]">No matching sessions.</p>
                <p className="mt-2 text-sm text-[#5D7EA1]">Try adjusting your search or filters.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedSessions.map(s => {
                  const room = rooms[s.id];
                  // An 'ended' room is no longer live — fall back to the DB status
                  // so a closed session shows as closed and can be reopened.
                  const liveRoom = room?.status === ROOM_STATUS.ENDED ? undefined : room;
                  const status = (liveRoom?.status || s.status || SESSION_STATUS.CLOSED);
                  const isJoinOpen = status === ROOM_STATUS.WAITING || status === ROOM_STATUS.STARTED || status === SESSION_STATUS.OPENED;
                  const effectiveStatus = status === ROOM_STATUS.WAITING ? SESSION_STATUS.OPENED : status;

                  return (
                    <ItemCard
                      key={s.id}
                      noBorder={true}
                      highlighted={isJoinOpen}
                      title={s.name || s.quiz_name || "Unknown Session"}
                      badges={
                        <>
                          <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase shrink-0 ${s.is_private ? "bg-[#0460A9]/10 text-[#0460A9]" : "bg-[#8E44AD]/10 text-[#8E44AD]"}`}>
                            {s.is_private ? "Private" : "Public"}
                          </span>
                          {isJoinOpen ? (
                            <span className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${effectiveStatus === SESSION_STATUS.OPENED
                              ? "bg-[#0D8C6D]/10 text-[#0D8C6D]"
                              : "bg-[#E67E22]/10 text-[#E67E22]"
                              }`}>
                              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${effectiveStatus === SESSION_STATUS.OPENED ? "bg-[#0D8C6D]" : "bg-[#E67E22]"}`} />
                              {effectiveStatus === SESSION_STATUS.OPENED ? "Opened" : "Started"}
                            </span>
                          ) : (
                            <span className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${status === SESSION_STATUS.ARCHIVED ? 'bg-[#E74C3C]/10 text-[#E74C3C]' : 'bg-[#5D7EA1]/10 text-[#5D7EA1]'}`}>
                              {status === SESSION_STATUS.ARCHIVED ? "Archived" : "Closed"}
                            </span>
                          )}
                        </>
                      }
                      subtitle={
                        <div className="flex flex-col gap-1">
                          <p className="text-[11px] font-medium text-[#5D7EA1] uppercase tracking-wider">
                            By <span className="font-bold text-[#16324F]">{s.user_name || s.user_id}</span> • {new Date(s.started_at).toLocaleDateString()}
                          </p>
                          {s.name !== s.quiz_name && s.quiz_name && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setSessionFilterQuizId(s.session_id);
                                  setQuizPage(1);
                                  setSessionPage(1);
                                }}
                                className="p-1 rounded-md bg-[#0460A9]/5 text-[#0460A9] hover:bg-[#0460A9]/15 transition-colors"
                                title="Filter sessions by this template"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                              </button>
                              <p className="text-xs font-medium text-[#5D7EA1]">Template: <span className="font-semibold text-[#16324F]">{s.quiz_name}</span></p>
                            </div>
                          )}
                        </div>
                      }
                      content={
                        <div className="flex flex-col gap-4 w-full">
                          <button
                            onClick={() => router.push(`/admin/sessions/${s.id}/analytics`)}
                            className="bg-[#F8FAFC] rounded-xl p-4 border border-[#0460A9]/10 hover:bg-[#F1F5F9] transition-colors w-full text-left group"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#5D7EA1]">Analytics Preview</span>
                              <span className="nq-report-cta flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold">
                                Full Report
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-[#5D7EA1]/70">Total Players</p>
                                <p className="text-lg font-bold text-[#16324F]">{s.play_count || 0}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-[#5D7EA1]/70">Avg. Score</p>
                                <p className="text-lg font-bold text-[#16324F]">{s.avg_score || 0}</p>
                              </div>
                            </div>
                          </button>

                          {!isJoinOpen && (
                            <p className="text-sm font-medium text-[#5D7EA1]">
                              {status === SESSION_STATUS.ARCHIVED ? "This session is archived." : "This session is currently closed. Open it to allow players to join."}
                            </p>
                          )}
                        </div>
                      }
                      actions={
                        <>
                          {(isJoinOpen || status === SESSION_STATUS.CLOSED) && (
                            <button
                              disabled={loadingIds[s.id]}
                              onClick={async () => {
                                if (isJoinOpen) {
                                  if (effectiveStatus === 'started') {
                                    let token = room?.joinToken || s.pin_code;

                                    if (!token) {
                                      try {
                                        token = await openLobby(s.id);
                                        // Sync to DB for future use
                                        fetch(`/api/sessions/${s.id}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ pin: token }),
                                        });
                                      } catch (err) {
                                        console.error("Failed to regenerate token:", err);
                                      }
                                    }

                                    setQrModal({
                                      isOpen: true,
                                      sessionId: s.id,
                                      sessionName: s.name || s.quiz_name || "Session",
                                      joinToken: token || null,
                                      slug: s.slug || null
                                    });
                                  } else {
                                    router.push(`/admin/questions/${s.slug || s.id}/lobby`);
                                  }
                                } else {
                                  handleToggleJoin(s.id, s.is_private);
                                }
                              }}
                              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${isJoinOpen && effectiveStatus !== 'started'
                                ? 'bg-[#0460A9] text-white hover:bg-[#03508C] shadow-md shadow-[#0460A9]/20'
                                : 'bg-white/70 text-[#16324F] border border-[#0460A9]/15 hover:bg-white'
                                }`}
                            >
                              {loadingIds[s.id] ? "Loading..." : (isJoinOpen ? (effectiveStatus === SESSION_STATUS.OPENED ? "Manage Lobby" : "Invitation") : (s.is_private ? "Open Lobby" : "Start Session"))}
                            </button>
                          )}
                          {isJoinOpen && (
                            <button
                              disabled={loadingIds[s.id]}
                              onClick={() => handleCloseSession(s.id)}
                              className="rounded-lg px-4 py-2 text-sm font-semibold transition-all bg-white/70 text-[#E67E22] border border-[#E67E22]/20 hover:bg-[#FDF3E9]"
                            >
                              {loadingIds[s.id] ? "Closing..." : "Close"}
                            </button>
                          )}
                          {status !== SESSION_STATUS.ARCHIVED && (
                            <button
                              disabled={loadingIds[s.id]}
                              onClick={() => setConfirmModal({
                                isOpen: true,
                                id: s.id,
                                name: s.name || s.quiz_name || "",
                                confirmName: "",
                                type: "session",
                                action: "archive"
                              })}
                              className="rounded-lg px-4 py-2 text-sm font-semibold transition-all bg-white/50 text-[#5D7EA1] hover:bg-white hover:text-[#16324F]"
                            >
                              {loadingIds[s.id] ? "Archiving..." : "Archive"}
                            </button>
                          )}
                          <button
                            disabled={loadingIds[s.id]}
                            onClick={() => setCompareModal({
                              isOpen: true,
                              quizId: s.session_id,
                              selectedSessionIds: [s.id]
                            })}
                            className="rounded-lg px-4 py-2 text-sm font-semibold transition-all bg-[#0460A9]/10 text-[#0460A9] hover:bg-[#0460A9]/20"
                            title="Compare session with peers"
                          >
                            Compare
                          </button>
                          <button
                            disabled={loadingIds[s.id]}
                            onClick={() => setConfirmModal({
                              isOpen: true,
                              id: s.id,
                              name: s.raw_session_name || "",
                              confirmName: "",
                              type: "session",
                              action: "delete"
                            })}
                            className="rounded-lg px-4 py-2 text-sm font-semibold transition-all bg-white/50 text-[#E74C3C] hover:bg-[#FDEDEC]"
                          >
                            Delete
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>

          {totalSessionPages > 1 && (
            <div className="mt-6 flex shrink-0 items-center justify-center gap-2 border-t border-[#0460A9]/10 pt-4">
              <button
                onClick={() => setSessionPage(Math.max(1, safeSessionPage - 1))}
                disabled={safeSessionPage === 1}
                className="px-3 py-1.5 rounded-md bg-white border border-[#0460A9]/10 text-[#5D7EA1] hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-sm shadow-sm"
              >
                Prev
              </button>
              <span className="text-sm font-bold text-[#16324F] px-4">
                {safeSessionPage} / {totalSessionPages}
              </span>
              <button
                onClick={() => setSessionPage(Math.min(totalSessionPages, safeSessionPage + 1))}
                disabled={safeSessionPage === totalSessionPages}
                className="px-3 py-1.5 rounded-md bg-white border border-[#0460A9]/10 text-[#5D7EA1] hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-sm shadow-sm"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Quizzes */}
        <div className="nq-card flex min-w-0 flex-col rounded-xl p-5 md:p-6 lg:min-h-[calc(100dvh-13rem)] lg:p-8">
          <div className="mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">Templates</p>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold text-[#16324F]">Quizzes</h2>
              <p className="mt-3 text-sm text-[#5D7EA1] max-w-sm">Raw quiz templates available for session creation.</p>
            </div>
            <button
              onClick={() => router.push('/admin/questions/create')}
              className="shrink-0 bg-[#0460A9] hover:bg-[#03508C] text-white rounded-lg px-6 py-2.5 font-semibold transition-all shadow-md shadow-[#0460A9]/20 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Quiz
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading && allData.length === 0 ? (
              <ListSkeleton label="Loading quizzes…" withMedia />
            ) : paginatedTemplates.length === 0 ? (
              <div className="nq-card-soft rounded-xl p-10 text-center">
                <p className="text-lg font-semibold text-[#16324F]">No matching quiz templates found.</p>
                <p className="mt-2 text-sm text-[#5D7EA1]">Try adjusting your search or filters.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedTemplates.map(q => {
                  const sessionCount = allSessions.filter(s => s.session_id === q.id).length;
                  const canEditQuiz = isAdmin || q.created_by === user?.uid;
                  const shuffleOn = shuffleOverrides[q.id] ?? !!q.shuffle_choices;
                  return (
                    <ItemCard
                      key={q.id}
                      title={q.name}
                      media={
                        <div className="nq-always-dark group relative aspect-[16/7] overflow-hidden rounded-xl border border-white/10 bg-[var(--nq-brand)]">
                          {q.cover_image_url ? (
                            <Image
                              src={q.cover_image_url}
                              alt={`${q.name} thumbnail`}
                              fill
                              sizes="(max-width: 1024px) 100vw, 44vw"
                              className="object-cover transition duration-500 group-hover:scale-[1.03]"
                            />
                          ) : (
          <QuizThumbnail />
                          )}
                          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-end gap-2 bg-black/60 p-3">
                            {canEditQuiz && (
                              <>
                                <input
                                  id={`quiz-thumbnail-${q.id}`}
                                  type="file"
                                  accept="image/jpeg,image/png,image/gif,image/webp"
                                  className="sr-only"
                                  disabled={loadingIds[`thumbnail:${q.id}`]}
                                  onChange={(event) => {
                                    const file = event.currentTarget.files?.[0];
                                    event.currentTarget.value = "";
                                    if (file) void handleThumbnailUpload(q.id, file);
                                  }}
                                />
                                <label
                                  htmlFor={`quiz-thumbnail-${q.id}`}
                                  className={`cursor-pointer rounded-full border border-white/20 bg-[#0b1434]/85 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur transition hover:bg-[#172455] ${loadingIds[`thumbnail:${q.id}`] ? "pointer-events-none opacity-60" : ""}`}
                                >
                                  {loadingIds[`thumbnail:${q.id}`] ? "Uploading…" : q.cover_image_url ? "Replace" : "Upload"}
                                </label>
                                {q.cover_image_url && (
                                  <button
                                    type="button"
                                    disabled={loadingIds[`thumbnail:${q.id}`]}
                                    onClick={() => void handleThumbnailRemove(q.id)}
                                    className="rounded-full border border-rose-300/25 bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-100 backdrop-blur transition hover:bg-rose-500/25 disabled:opacity-60"
                                  >
                                    Remove
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      }
                      subtitle={
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-medium text-[#5D7EA1] uppercase tracking-wider">
                              By <span className="font-bold text-[#16324F]">{q.creator_name || q.created_by}</span> • {new Date(q.created_at).toLocaleDateString()}
                            </p>
                            {sessionCount > 0 && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setSessionFilterQuizId(q.id);
                                    setQuizPage(1);
                                    setSessionPage(1);
                                    // Scroll to sessions column for mobile
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0460A9]/5 text-[#0460A9] hover:bg-[#0460A9]/15 transition-colors text-[10px] font-bold uppercase tracking-wide"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                  </svg>
                                  Show Sessions ({sessionCount})
                                </button>
                                <button
                                  onClick={() => {
                                    const relatedSessions = allSessions.filter(s => s.session_id === q.id).map(s => s.id);
                                    setCompareModal({
                                      isOpen: true,
                                      quizId: q.id,
                                      selectedSessionIds: relatedSessions.slice(0, 2)
                                    });
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#7C3AED]/10 text-[#7C3AED] hover:bg-[#7C3AED]/20 transition-colors text-[10px] font-bold uppercase tracking-wide"
                                  title="Compare sessions of this quiz"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                  </svg>
                                  Compare ({sessionCount})
                                </button>
                                <button
                                  onClick={() => router.push(`/admin/quizzes/${q.id}/analytics`)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors text-[10px] font-bold uppercase tracking-wide border border-emerald-200"
                                  title="View overall aggregated analytics across all sessions of this quiz"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  Analytics ({sessionCount})
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-[#4D6F93] line-clamp-2 leading-relaxed">{q.description || "No description provided."}</p>
                          {canEditQuiz && (
                            <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-semibold text-[#5D7EA1] select-none">
                              <input
                                type="checkbox"
                                checked={shuffleOn}
                                disabled={loadingIds[q.id]}
                                onChange={async (e) => {
                                  const next = e.target.checked;
                                  setShuffleOverrides(prev => ({ ...prev, [q.id]: next }));
                                  setItemLoading(q.id, true);
                                  try {
                                    await updateQuiz(q.id, { shuffle_choices: next });
                                    showToast(next ? "Random Choices enabled." : "Random Choices disabled.", "success");
                                    onRefresh();
                                  } catch {
                                    setShuffleOverrides(prev => ({ ...prev, [q.id]: !next }));
                                    showToast("Failed to update Random Choices.", "error");
                                  } finally {
                                    setItemLoading(q.id, false);
                                  }
                                }}
                                className="h-4 w-4 cursor-pointer rounded-[5px] border-[#0460A9]/30 accent-[#0460A9] disabled:cursor-not-allowed"
                              />
                              Random Choices
                              <span className="font-medium text-[#8AA4C0]">— shuffle answer order for each player</span>
                            </label>
                          )}
                        </div>
                      }
                      actions={
                        <>
                          {sessionCount > 0 && (
                            <button
                              disabled={loadingIds[q.id]}
                              onClick={() => router.push(`/admin/quizzes/${q.id}/analytics`)}
                              className="rounded-lg px-4 py-2 text-sm font-semibold transition-all bg-[#0460A9]/10 text-[#0460A9] hover:bg-[#0460A9]/20"
                              title="View overall quiz analytics"
                            >
                              Analytics
                            </button>
                          )}
                          <button
                            disabled={loadingIds[q.id]}
                            onClick={() => setCreateSessionModal({ isOpen: true, quizId: q.id, quizName: q.name, isPrivate: true, sessionName: "" })}
                            className="rounded-lg px-4 py-2 text-sm font-semibold transition-all bg-[#0460A9] text-white hover:bg-[#03508C] shadow-md shadow-[#0460A9]/20"
                          >
                            Create Session
                          </button>
                          <button
                            disabled={loadingIds[q.id]}
                            onClick={() => router.push(`/admin/questions/${q.slug || q.id}/edit`)}
                            className="rounded-lg px-4 py-2 text-sm font-semibold transition-all bg-white/70 text-[#16324F] border border-[#0460A9]/15 hover:bg-white"
                          >
                            Edit
                          </button>
                          <button
                            disabled={loadingIds[q.id]}
                            onClick={async () => {
                              setItemLoading(q.id, true);
                              try {
                                await onDuplicate(q.id, true);
                                showToast("Quiz duplicated.", "success");
                              } catch {
                                showToast("Failed to duplicate quiz.", "error");
                              } finally {
                                setItemLoading(q.id, false);
                              }
                            }}
                            className="rounded-lg px-4 py-2 text-sm font-semibold transition-all bg-white/50 text-[#5D7EA1] hover:bg-white hover:text-[#16324F]"
                          >
                            {loadingIds[q.id] ? "..." : "Duplicate"}
                          </button>
                          <button
                            disabled={loadingIds[q.id]}
                            onClick={() => setConfirmModal({ isOpen: true, id: q.id, name: q.name, confirmName: "", type: "quiz", action: "delete" })}
                            className="rounded-lg px-4 py-2 text-sm font-semibold transition-all bg-white/50 text-[#E74C3C] hover:bg-[#FDEDEC]"
                          >
                            Delete
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>

          {totalQuizPages > 1 && (
            <div className="mt-6 flex shrink-0 items-center justify-center gap-2 border-t border-[#0460A9]/10 pt-4">
              <button
                onClick={() => setQuizPage(Math.max(1, safeQuizPage - 1))}
                disabled={safeQuizPage === 1}
                className="px-3 py-1.5 rounded-md bg-white border border-[#0460A9]/10 text-[#5D7EA1] hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-sm shadow-sm"
              >
                Prev
              </button>
              <span className="text-sm font-bold text-[#16324F] px-4">
                {safeQuizPage} / {totalQuizPages}
              </span>
              <button
                onClick={() => setQuizPage(Math.min(totalQuizPages, safeQuizPage + 1))}
                disabled={safeQuizPage === totalQuizPages}
                className="px-3 py-1.5 rounded-md bg-white border border-[#0460A9]/10 text-[#5D7EA1] hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-sm shadow-sm"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CREATE SESSION MODAL */}
      {createSessionModal.isOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#0460A9]/20 px-4 backdrop-blur-md">
          <div className="w-full max-w-md nq-card rounded-xl p-8 shadow-2xl">
            <h3 className="text-2xl font-bold text-[#16324F] mb-3">New Session</h3>
            <p className="text-sm text-[#5D7EA1] mb-6">
              Publishing template <strong className="text-[#16324F]">{createSessionModal.quizName}</strong>.
            </p>
            <div className="space-y-5">
              <div>
                <label className="text-[11px] font-semibold text-[#5D7EA1] uppercase tracking-[0.16em] mb-2 block">Session Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-[#0460A9]/15 bg-white/80 px-4 py-3 text-[#16324F] placeholder-[#5D7EA1]/60 focus:border-[#0460A9]/40 focus:outline-none focus:ring-4 focus:ring-[#0460A9]/10 transition-all"
                  placeholder="Enter a name for this session..."
                  value={createSessionModal.sessionName}
                  onChange={(e) => setCreateSessionModal(prev => ({ ...prev, sessionName: e.target.value }))}
                  autoFocus
                />
                <p className="text-[11px] text-[#5D7EA1] mt-2 ml-1">If empty, the quiz template name will be used.</p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  className="w-full rounded-lg py-3 text-sm font-bold transition-all bg-[#0460A9] text-white hover:bg-[#03508C] shadow-lg shadow-[#0460A9]/20 flex items-center justify-center gap-2"
                  disabled={isSubmitting}
                  onClick={() => void handleCreateSessionSubmit(true)}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  Create Private Lobby
                </button>
                <button
                  className="w-full rounded-lg py-3 text-sm font-bold transition-all bg-[#8E44AD] text-white hover:bg-[#7D3C98] shadow-lg shadow-[#8E44AD]/20 flex items-center justify-center gap-2"
                  disabled={isSubmitting}
                  onClick={() => void handleCreateSessionSubmit(false)}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                  Create Public Session
                </button>
                <button
                  className="w-full rounded-lg py-3 text-sm font-bold transition-all bg-white/70 text-[#5D7EA1] border border-[#0460A9]/10 hover:bg-white hover:text-[#16324F]"
                  onClick={() => setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true, sessionName: "" })}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* SAFETY CONFIRMATION MODAL */}
      {confirmModal.isOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#0460A9]/20 px-4 backdrop-blur-md">
          <div className={`w-full max-w-md nq-card rounded-xl p-8 shadow-2xl border-2 ${confirmModal.action === 'delete' ? 'border-[#E74C3C]/30' : 'border-[#E67E22]/30'}`}>
            <h3 className="text-2xl font-bold text-[#16324F] mb-3">
              {confirmModal.action === "delete" ? "Delete" : "Archive"} {confirmModal.type === "quiz" ? "Template" : "Session"}
            </h3>
            <p className="text-sm text-[#5D7EA1] mb-6 leading-relaxed">
              {confirmModal.name
                ? <>This action {confirmModal.action === 'delete' ? 'cannot be undone' : 'will clear all access links'}. To confirm, type <CopyableName name={confirmModal.name} className={confirmModal.action === 'delete' ? 'text-[#E74C3C]' : 'text-[#E67E22]'} /> below.</>
                : <>Are you sure you want to {confirmModal.action} this? This action {confirmModal.action === 'delete' ? 'cannot be undone' : 'will clear all access links'}.</>
              }
            </p>
            <form onSubmit={handleConfirmSubmit}>
              {confirmModal.name && (
                <div className="mb-6">
                  <input
                    type="text"
                    className={`w-full rounded-lg border bg-white/80 px-4 py-3 text-[#16324F] placeholder-[#5D7EA1]/60 focus:outline-none focus:ring-4 transition-all ${confirmModal.action === 'delete'
                      ? 'border-[#E74C3C]/30 focus:border-[#E74C3C]/50 focus:ring-[#E74C3C]/10'
                      : 'border-[#E67E22]/30 focus:border-[#E67E22]/50 focus:ring-[#E67E22]/10'
                      }`}
                    placeholder="Type name to confirm"
                    value={confirmModal.confirmName}
                    onChange={(e) => setConfirmModal(prev => ({ ...prev, confirmName: e.target.value }))}
                    autoFocus
                  />
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg px-6 py-2.5 text-sm font-bold transition-all bg-white/70 text-[#5D7EA1] border border-[#0460A9]/10 hover:bg-white hover:text-[#16324F]"
                  onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  className={`rounded-lg px-6 py-2.5 text-sm font-bold transition-all text-white shadow-lg flex items-center justify-center min-w-[120px] ${confirmModal.action === 'delete'
                    ? 'bg-[#E74C3C] hover:bg-[#C0392B] shadow-[#E74C3C]/20'
                    : 'bg-[#E67E22] hover:bg-[#D35400] shadow-[#E67E22]/20'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  type="submit"
                  disabled={isSubmitting || (!!confirmModal.name && confirmModal.confirmName !== confirmModal.name)}
                >
                  {isSubmitting ? "Processing..." : `Confirm ${confirmModal.action === 'delete' ? 'Delete' : 'Archive'}`}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <InvitationModal
        isOpen={qrModal?.isOpen ?? false}
        onClose={() => setQrModal(null)}
        sessionName={qrModal?.sessionName ?? ""}
        joinToken={qrModal?.joinToken ?? null}
      />

      <CompareSessionsModal
        isOpen={compareModal.isOpen}
        onClose={() => setCompareModal({ isOpen: false, quizId: null, selectedSessionIds: [] })}
        allQuizzes={allData}
        allSessions={allSessions}
        initialQuizId={compareModal.quizId}
        initialSelectedSessionIds={compareModal.selectedSessionIds}
        onLaunchCompare={(quizId, sessionIds) => {
          router.push(`/admin/quizzes/${quizId}/compare?sessions=${sessionIds.join(',')}`);
        }}
      />
    </div>
  );
}
