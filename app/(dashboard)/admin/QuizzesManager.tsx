import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Quiz, Session } from "@/lib/types";
import type { SessionRoom } from "@/lib/firebase/rtdb";
import { SESSION_STATUS, ROOM_STATUS } from "@/lib/constants/session";
import { useAuth } from "@/lib/hooks/useAuth";
import { openLobby, closeLobby, reopenLobby, startRoom, removeRoom } from "@/lib/firebase/rtdb";
import { motion, AnimatePresence } from "motion/react";
import InvitationModal from "@/components/InvitationModal";

function ItemCard({
  title,
  badges,
  subtitle,
  content,
  footerText,
  actions,
  highlighted = false,
  noBorder = false
}: {
  title: string;
  badges?: React.ReactNode;
  subtitle?: React.ReactNode;
  content?: React.ReactNode;
  actions: React.ReactNode;
  highlighted?: boolean;
  noBorder?: boolean;
}) {
  return (
    <div className={`rounded-[30px] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(17,87,145,0.08)] flex flex-col ${!noBorder ? 'border' : ''} ${highlighted ? (noBorder ? 'bg-[#F4F9FF]' : 'border-[#0460A9]/30 bg-[#F4F9FF]') : (noBorder ? 'bg-white/60' : 'border-[#0460A9]/10 bg-white/60')}`}>
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
  allSessions: (Session & { quiz_name?: string })[];
  rooms: Record<string, SessionRoom>;
  onDuplicate: (id: string, isQuizDuplicate: boolean) => Promise<void>;
  onCreateSession: (quizId: string, isPrivate: boolean, name?: string) => Promise<void>;
  onDeleteQuiz: (id: string) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onToggleStatus: (id: string, currentStatus: boolean) => Promise<void>;
  onRefresh: () => void;
}

export default function QuizzesManager({
  allData,
  allSessions,
  rooms,
  onDuplicate,
  onCreateSession,
  onDeleteQuiz,
  onDeleteSession,
  onToggleStatus,
  onRefresh,
}: QuizzesManagerProps) {
  const router = useRouter();
  const { user } = useAuth();
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

  const setItemLoading = (id: string, isLoading: boolean) => {
    setLoadingIds(prev => ({ ...prev, [id]: isLoading }));
  };

  const templates = allData;
  const sessions = allSessions;

  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createSessionModal.quizId) return;

    setIsSubmitting(true);
    try {
      await onCreateSession(createSessionModal.quizId, createSessionModal.isPrivate, createSessionModal.sessionName);
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
    const isOpen = room && (room.status === ROOM_STATUS.WAITING || room.status === ROOM_STATUS.STARTED);

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
          await fetch(`/api/sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: SESSION_STATUS.STARTED, pin: token }),
          });
          showToast(`Session started!`, "success");
        } else {
          await fetch(`/api/sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: SESSION_STATUS.OPENED, pin: token }),
          });
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
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: SESSION_STATUS.ARCHIVED, pin: null }),
      });
      showToast("Session archived.", "success");
      onRefresh();
    } catch (err) {
      console.error("Archive failed:", err);
      showToast("Failed to archive session.", "error");
    } finally {
      setItemLoading(sessionId, false);
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    setItemLoading(sessionId, true);
    try {
      await closeLobby(sessionId);
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: SESSION_STATUS.CLOSED, pin: null }),
      });
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
      {/* LEFT COLUMN: Sessions */}
      <div className="nq-card rounded-[34px] p-5 md:p-6 lg:p-8 flex flex-col">
        <div className="mb-6 lg:mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">Live instances</p>
          <h2 className="mt-2 text-2xl md:text-3xl font-bold text-[#16324F]">Sessions</h2>
          <p className="mt-3 text-sm text-[#5D7EA1] max-w-md">Manage active or inactive instances of quizzes that players can join.</p>
        </div>

        {sessions.length === 0 ? (
          <div className="nq-card-soft rounded-[30px] p-10 text-center">
            <p className="text-lg font-semibold text-[#16324F]">No active sessions.</p>
            <p className="mt-2 text-sm text-[#5D7EA1]">Toggle a quiz template to publish it as a session.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map(s => {
              const room = rooms[s.id];
              const status = (room?.status || s.status || SESSION_STATUS.CLOSED);
              const isJoinOpen = status === ROOM_STATUS.WAITING || status === ROOM_STATUS.STARTED || status === SESSION_STATUS.OPENED;
              const effectiveStatus = status === ROOM_STATUS.WAITING ? SESSION_STATUS.OPENED : status;
              const playerCount = room?.players ? Object.keys(room.players).length : 0;

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
                      {s.name !== s.quiz_name && s.quiz_name && (
                        <p className="text-xs font-medium text-[#5D7EA1]">Template: <span className="font-semibold text-[#16324F]">{s.quiz_name}</span></p>
                      )}
                      <p className="text-[11px] font-medium text-[#5D7EA1] uppercase tracking-wider">
                        By <span className="font-bold text-[#16324F]">{s.user_name || s.user_id}</span> • {new Date(s.started_at).toLocaleDateString()}
                      </p>
                    </div>
                  }
                  content={
                    <div className="flex flex-col gap-4 w-full">
                      <button 
                        onClick={() => router.push(`/admin/sessions/${s.slug || s.id}/analytics`)}
                        className="bg-[#F8FAFC] rounded-[20px] p-4 border border-[#0460A9]/10 hover:bg-[#F1F5F9] transition-colors w-full text-left group"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#5D7EA1]">Analytics Preview</span>
                          <span className="text-[11px] font-bold text-[#0460A9] group-hover:text-[#03508C] group-hover:underline flex items-center gap-1">
                            Full Report
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-[#5D7EA1]/70">Total Players</p>
                            <p className="text-lg font-bold text-[#16324F]">{(s as any).play_count || 0}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-[#5D7EA1]/70">Avg. Score</p>
                            <p className="text-lg font-bold text-[#16324F]">{(s as any).avg_score || 0}</p>
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
                          className={`rounded-[20px] px-4 py-2 text-sm font-semibold transition-all ${isJoinOpen && effectiveStatus !== 'started'
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
                          className="rounded-[20px] px-4 py-2 text-sm font-semibold transition-all bg-white/70 text-[#E67E22] border border-[#E67E22]/20 hover:bg-[#FDF3E9]"
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
                          className="rounded-[20px] px-4 py-2 text-sm font-semibold transition-all bg-white/50 text-[#5D7EA1] hover:bg-white hover:text-[#16324F]"
                        >
                          {loadingIds[s.id] ? "Archiving..." : "Archive"}
                        </button>
                      )}
                      <button
                        disabled={loadingIds[s.id]}
                        onClick={() => setConfirmModal({
                          isOpen: true,
                          id: s.id,
                          name: (s as any).raw_session_name || "",
                          confirmName: "",
                          type: "session",
                          action: "delete"
                        })}
                        className="rounded-[20px] px-4 py-2 text-sm font-semibold transition-all bg-white/50 text-[#E74C3C] hover:bg-[#FDEDEC]"
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

      {/* RIGHT COLUMN: Quizzes */}
      <div className="nq-card rounded-[34px] p-5 md:p-6 lg:p-8 flex flex-col">
        <div className="mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5D7EA1]">Templates</p>
            <h2 className="mt-2 text-2xl md:text-3xl font-bold text-[#16324F]">Quizzes</h2>
            <p className="mt-3 text-sm text-[#5D7EA1] max-w-sm">Raw quiz templates available for session creation.</p>
          </div>
          <button
            onClick={() => router.push('/admin/questions/create')}
            className="shrink-0 bg-[#0460A9] hover:bg-[#03508C] text-white rounded-[22px] px-6 py-2.5 font-semibold transition-all shadow-md shadow-[#0460A9]/20 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Quiz
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="nq-card-soft rounded-[30px] p-10 text-center">
            <p className="text-lg font-semibold text-[#16324F]">No quiz templates found.</p>
            <p className="mt-2 text-sm text-[#5D7EA1]">Create your first template to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map(q => (
              <ItemCard
                key={q.id}
                title={q.name}
                subtitle={
                  <div>
                    <p className="text-[11px] font-medium text-[#5D7EA1] uppercase tracking-wider">
                      By <span className="font-bold text-[#16324F]">{q.creator_name || q.created_by}</span> • {new Date(q.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-[#4D6F93] line-clamp-2 leading-relaxed">{q.description || "No description provided."}</p>
                  </div>
                }
                actions={
                  <>
                    <button
                      disabled={loadingIds[q.id]}
                      onClick={() => setCreateSessionModal({ isOpen: true, quizId: q.id, quizName: q.name, isPrivate: true, sessionName: "" })}
                      className="rounded-[20px] px-4 py-2 text-sm font-semibold transition-all bg-[#0460A9] text-white hover:bg-[#03508C] shadow-md shadow-[#0460A9]/20"
                    >
                      Create Session
                    </button>
                    <button
                      disabled={loadingIds[q.id]}
                      onClick={() => router.push(`/admin/questions/${q.slug || q.id}/edit`)}
                      className="rounded-[20px] px-4 py-2 text-sm font-semibold transition-all bg-white/70 text-[#16324F] border border-[#0460A9]/15 hover:bg-white"
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
                      className="rounded-[20px] px-4 py-2 text-sm font-semibold transition-all bg-white/50 text-[#5D7EA1] hover:bg-white hover:text-[#16324F]"
                    >
                      {loadingIds[q.id] ? "..." : "Duplicate"}
                    </button>
                    <button
                      disabled={loadingIds[q.id]}
                      onClick={() => setConfirmModal({ isOpen: true, id: q.id, name: q.name, confirmName: "", type: "quiz", action: "delete" })}
                      className="rounded-[20px] px-4 py-2 text-sm font-semibold transition-all bg-white/50 text-[#E74C3C] hover:bg-[#FDEDEC]"
                    >
                      Delete
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* CREATE SESSION MODAL */}
      {createSessionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0460A9]/20 backdrop-blur-md px-4">
          <div className="w-full max-w-md nq-card rounded-[34px] p-8 shadow-2xl">
            <h3 className="text-2xl font-bold text-[#16324F] mb-3">New Session</h3>
            <p className="text-sm text-[#5D7EA1] mb-6">
              Publishing template <strong className="text-[#16324F]">{createSessionModal.quizName}</strong>.
            </p>
            <div className="space-y-5">
              <div>
                <label className="text-[11px] font-semibold text-[#5D7EA1] uppercase tracking-[0.16em] mb-2 block">Session Name</label>
                <input
                  type="text"
                  className="w-full rounded-[22px] border border-[#0460A9]/15 bg-white/80 px-4 py-3 text-[#16324F] placeholder-[#5D7EA1]/60 focus:border-[#0460A9]/40 focus:outline-none focus:ring-4 focus:ring-[#0460A9]/10 transition-all"
                  placeholder="Enter a name for this session..."
                  value={createSessionModal.sessionName}
                  onChange={(e) => setCreateSessionModal(prev => ({ ...prev, sessionName: e.target.value }))}
                  autoFocus
                />
                <p className="text-[11px] text-[#5D7EA1] mt-2 ml-1">If empty, the quiz template name will be used.</p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  className="w-full rounded-[22px] py-3 text-sm font-bold transition-all bg-[#0460A9] text-white hover:bg-[#03508C] shadow-lg shadow-[#0460A9]/20 flex items-center justify-center gap-2"
                  onClick={() => {
                    onCreateSession(createSessionModal.quizId!, true, createSessionModal.sessionName);
                    setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true, sessionName: "" });
                    showToast("Private Lobby created.", "success");
                  }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  Create Private Lobby
                </button>
                <button
                  className="w-full rounded-[22px] py-3 text-sm font-bold transition-all bg-[#8E44AD] text-white hover:bg-[#7D3C98] shadow-lg shadow-[#8E44AD]/20 flex items-center justify-center gap-2"
                  onClick={() => {
                    onCreateSession(createSessionModal.quizId!, false, createSessionModal.sessionName);
                    setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true, sessionName: "" });
                    showToast("Public Session created.", "success");
                  }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                  Create Public Session
                </button>
                <button
                  className="w-full rounded-[22px] py-3 text-sm font-bold transition-all bg-white/70 text-[#5D7EA1] border border-[#0460A9]/10 hover:bg-white hover:text-[#16324F]"
                  onClick={() => setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true, sessionName: "" })}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SAFETY CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0460A9]/20 backdrop-blur-md px-4">
          <div className={`w-full max-w-md nq-card rounded-[34px] p-8 shadow-2xl border-2 ${confirmModal.action === 'delete' ? 'border-[#E74C3C]/30' : 'border-[#E67E22]/30'}`}>
            <h3 className="text-2xl font-bold text-[#16324F] mb-3">
              {confirmModal.action === "delete" ? "Delete" : "Archive"} {confirmModal.type === "quiz" ? "Template" : "Session"}
            </h3>
            <p className="text-sm text-[#5D7EA1] mb-6 leading-relaxed">
              {confirmModal.name
                ? <>This action {confirmModal.action === 'delete' ? 'cannot be undone' : 'will clear all access links'}. To confirm, type <strong className={`${confirmModal.action === 'delete' ? 'text-[#E74C3C]' : 'text-[#E67E22]'} select-none`}>{confirmModal.name}</strong> below.</>
                : <>Are you sure you want to {confirmModal.action} this? This action {confirmModal.action === 'delete' ? 'cannot be undone' : 'will clear all access links'}.</>
              }
            </p>
            <form onSubmit={handleConfirmSubmit}>
              {confirmModal.name && (
                <div className="mb-6">
                  <input
                    type="text"
                    className={`w-full rounded-[22px] border bg-white/80 px-4 py-3 text-[#16324F] placeholder-[#5D7EA1]/60 focus:outline-none focus:ring-4 transition-all ${confirmModal.action === 'delete'
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
                  className="rounded-[22px] px-6 py-2.5 text-sm font-bold transition-all bg-white/70 text-[#5D7EA1] border border-[#0460A9]/10 hover:bg-white hover:text-[#16324F]"
                  onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  className={`rounded-[22px] px-6 py-2.5 text-sm font-bold transition-all text-white shadow-lg flex items-center justify-center min-w-[120px] ${confirmModal.action === 'delete'
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
        </div>
      )}

      <InvitationModal
        isOpen={qrModal?.isOpen ?? false}
        onClose={() => setQrModal(null)}
        sessionName={qrModal?.sessionName ?? ""}
        joinToken={qrModal?.joinToken ?? null}
      />
    </div>
  );
}
