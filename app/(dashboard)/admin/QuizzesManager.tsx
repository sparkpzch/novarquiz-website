import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Quiz, Session } from "@/lib/types";
import type { SessionRoom } from "@/lib/firebase/rtdb";
import { useAuth } from "@/lib/hooks/useAuth";
import { openLobby, closeLobby, reopenLobby, startRoom } from "@/lib/firebase/rtdb";

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
    const isOpen = room && (room.status === "waiting" || room.status === "started");

    setItemLoading(sessionId, true);
    try {
      if (isOpen) {
        await handleArchiveSession(sessionId);
      } else {
        if (!user) return;

        // Generate PIN for private session if it doesn't have one
        let pin = null;
        if (isPrivate) {
          pin = Math.floor(100000 + Math.random() * 900000).toString();
        }

        await reopenLobby(sessionId, user.uid);
        const token = await openLobby(sessionId);

        if (!isPrivate) {
          await startRoom(sessionId);
          await fetch(`/api/sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: 'started' }),
          });
          showToast(`Session started!`, "success");
        } else {
          await fetch(`/api/sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: 'opened', pin }),
          });
          showToast(`Lobby opened! Join PIN: ${pin}`, "success");
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
      await closeLobby(sessionId);
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: 'archived', pin: null }),
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
        body: JSON.stringify({ status: 'closed', pin: null }),
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* LEFT COLUMN: Sessions */}
      <div className="space-y-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">Sessions</h2>
          <p className="text-sm text-gray-400 mt-1">Manage active/inactive instances of quizzes that players can join.</p>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/5 p-8 text-center">
            <p className="text-gray-400">No active sessions. Toggle a quiz template to publish it as a session.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map(s => {
              const room = rooms[s.id];
              const status = room?.status || s.status || "closed";
              const isJoinOpen = status === "waiting" || status === "started" || status === "opened";
              const effectiveStatus = status === "waiting" ? "opened" : status;
              const playerCount = room?.players ? Object.keys(room.players).length : 0;

              return (
                <div key={s.id} className={`rounded-2xl border ${isJoinOpen ? 'border-[#0460A9]/40 bg-[#0460A9]/5' : 'border-white/5 bg-white/5'} p-5 hover:bg-white/10 transition-all duration-300`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold text-white leading-tight">{s.name || s.quiz_name || "Unknown Session"}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${s.is_private ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"}`}>
                            {s.is_private ? "Private" : "Public"}
                          </span>
                          {isJoinOpen ? (
                            <span className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border animate-pulse ${effectiveStatus === "opened"
                                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${effectiveStatus === "opened" ? "bg-blue-400" : "bg-emerald-400"}`} />
                              {effectiveStatus === "opened" ? "Opened" : "Started"}
                            </span>
                          ) : (
                            <span className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${status === 'archived' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                              {status === 'archived' ? "Archived" : "Closed"}
                            </span>
                          )}
                        </div>
                        {s.name !== s.quiz_name && s.quiz_name && (
                          <p className="text-[10px] text-gray-500 italic">Template: {s.quiz_name}</p>
                        )}
                      </div>

                      {isJoinOpen ? (
                        <div className="mt-4 flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">Players currently connected:</span>
                          <span className="text-xs font-bold text-white">{playerCount}</span>
                        </div>
                      ) : (
                        <div className="mt-4">
                          <p className="text-xs text-gray-500 italic">
                            {status === 'archived' ? "This session is archived." : "This session is currently closed. Open it to allow players to join."}
                          </p>
                        </div>
                      )}

                      <p className="text-[10px] text-gray-600 mt-4">
                        Created by: <span className="text-gray-500">{s.user_name || s.user_id}</span> • {new Date(s.started_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/5">
                    {(isJoinOpen || status === 'closed') && (
                      <Button
                        variant={isJoinOpen ? "primary" : "secondary"}
                        size="sm"
                        disabled={loadingIds[s.id]}
                        onClick={() => isJoinOpen
                          ? router.push(`/admin/questions/${s.id}/${effectiveStatus === 'opened' && s.is_private ? 'lobby' : 'observe'}`)
                          : handleToggleJoin(s.id, s.is_private)
                        }
                      >
                        {loadingIds[s.id] ? "Loading..." : (isJoinOpen ? (effectiveStatus === 'opened' ? "Manage Lobby" : "Observe Live") : (s.is_private ? "Open Lobby" : "Start Session"))}
                      </Button>
                    )}
                    {isJoinOpen && (
                      <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300 border border-amber-500/10" disabled={loadingIds[s.id]} onClick={() => handleCloseSession(s.id)}>
                        {loadingIds[s.id] ? "Closing..." : "Close"}
                      </Button>
                    )}
                    {status !== 'archived' && (
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-300" disabled={loadingIds[s.id]} onClick={() => setConfirmModal({
                        isOpen: true,
                        id: s.id,
                        name: s.name || s.quiz_name || "",
                        confirmName: "",
                        type: "session",
                        action: "archive"
                      })}>
                        {loadingIds[s.id] ? "Archiving..." : "Archive"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300"
                      disabled={loadingIds[s.id]}
                      onClick={() => setConfirmModal({
                        isOpen: true,
                        id: s.id,
                        name: (s as any).raw_session_name || "",
                        confirmName: "",
                        type: "session",
                        action: "delete"
                      })}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Quizzes */}
      <div className="space-y-4">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Quizzes</h2>
            <p className="text-sm text-gray-400 mt-1">Raw quiz templates available for session creation.</p>
          </div>
          <Button onClick={() => router.push('/admin/questions/create')} size="sm">
            New Quiz
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/5 p-8 text-center">
            <p className="text-gray-400">No quiz templates found. Create one first.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map(q => (
              <div key={q.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition-colors">
                <h3 className="text-lg font-bold text-white mb-2">{q.name}</h3>
                <p className="text-[10px] text-gray-500 mb-3">
                  Created By: <span className="text-gray-400">{q.creator_name || q.created_by}</span> • {new Date(q.created_at).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-400 line-clamp-2 mb-4">{q.description || "No description."}</p>

                <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-white/5">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={loadingIds[q.id]}
                    onClick={() => setCreateSessionModal({ isOpen: true, quizId: q.id, quizName: q.name, isPrivate: true, sessionName: "" })}
                  >
                    Create Session
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={loadingIds[q.id]}
                    onClick={() => router.push(`/admin/questions/${q.id}/edit`)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
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
                  >
                    {loadingIds[q.id] ? "Duplicating..." : "Duplicate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300"
                    disabled={loadingIds[q.id]}
                    onClick={() => setConfirmModal({ isOpen: true, id: q.id, name: q.name, confirmName: "", type: "quiz", action: "delete" })}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE SESSION MODAL */}
      {createSessionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-3xl bg-[#16324F] p-6 shadow-2xl border border-white/10">
            <h3 className="text-xl font-bold text-white mb-4">Create New Session</h3>
            <p className="text-sm text-gray-400 mb-6">
              Select how you want to publish the template <strong className="text-white">{createSessionModal.quizName}</strong>.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Session Name</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-gray-500 focus:border-[#0460A9] focus:outline-none focus:ring-1 focus:ring-[#0460A9]"
                  placeholder="Enter a name for this session..."
                  value={createSessionModal.sessionName}
                  onChange={(e) => setCreateSessionModal(prev => ({ ...prev, sessionName: e.target.value }))}
                  autoFocus
                />
                <p className="text-[10px] text-gray-500 mt-1">If empty, the quiz template name will be used.</p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <Button
                  variant="primary"
                  className="w-full justify-center bg-amber-500 hover:bg-amber-600 border-amber-500"
                  onClick={() => {
                    onCreateSession(createSessionModal.quizId!, true, createSessionModal.sessionName);
                    setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true, sessionName: "" });
                    showToast("Private Lobby created.", "success");
                  }}
                >
                  Create Private Lobby
                </Button>
                <Button
                  variant="primary"
                  className="w-full justify-center bg-emerald-500 hover:bg-emerald-600 border-emerald-500"
                  onClick={() => {
                    onCreateSession(createSessionModal.quizId!, false, createSessionModal.sessionName);
                    setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true, sessionName: "" });
                    showToast("Public Session created.", "success");
                  }}
                >
                  Create Public Session
                </Button>
                <Button variant="ghost" className="w-full justify-center" onClick={() => setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true, sessionName: "" })}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SAFETY CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className={`w-full max-w-md rounded-3xl bg-[#16324F] p-6 shadow-2xl border ${confirmModal.action === 'delete' ? 'border-red-500/30' : 'border-amber-500/30'}`}>
            <h3 className="text-xl font-bold text-white mb-4">
              {confirmModal.action === "delete" ? "Delete" : "Archive"} {confirmModal.type === "quiz" ? "Quiz Template" : "Active Session"}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {confirmModal.name
                ? <>This action {confirmModal.action === 'delete' ? 'cannot be undone' : 'will clear all access links'}. To confirm, type <strong className={`${confirmModal.action === 'delete' ? 'text-red-400' : 'text-amber-400'} select-none`}>{confirmModal.name}</strong> below.</>
                : <>Are you sure you want to {confirmModal.action} this? This action {confirmModal.action === 'delete' ? 'cannot be undone' : 'will clear all access links'}.</>
              }
            </p>
            <form onSubmit={handleConfirmSubmit}>
              {confirmModal.name && (
                <input
                  type="text"
                  className={`w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-1 mb-6 ${
                    confirmModal.action === 'delete' ? 'focus:border-red-500 focus:ring-red-500' : 'focus:border-amber-500 focus:ring-amber-500'
                  }`}
                  placeholder="Type name to confirm"
                  value={confirmModal.confirmName}
                  onChange={(e) => setConfirmModal(prev => ({ ...prev, confirmName: e.target.value }))}
                  autoFocus
                />
              )}
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant={confirmModal.action === 'delete' ? 'danger' : 'primary'}
                  className={confirmModal.action === 'archive' ? 'bg-amber-500 hover:bg-amber-600 border-amber-500' : ''}
                  type="submit"
                  disabled={isSubmitting || (confirmModal.name && confirmModal.confirmName !== confirmModal.name)}
                >
                  {isSubmitting ? "Processing..." : `Confirm ${confirmModal.action.charAt(0).toUpperCase() + confirmModal.action.slice(1)}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
