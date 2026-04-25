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
  onCreateSession: (quizId: string, isPrivate: boolean) => Promise<void>;
  onDeleteQuiz: (id: string) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onToggleStatus: (id: string, currentStatus: boolean) => Promise<void>;
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
}: QuizzesManagerProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [createSessionModal, setCreateSessionModal] = useState<{ isOpen: boolean; quizId: string | null; quizName: string; isPrivate: boolean }>({
    isOpen: false,
    quizId: null,
    quizName: "",
    isPrivate: true
  });
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    id: string | null;
    name: string;
    confirmName: string;
    type: "quiz" | "session";
  }>({
    isOpen: false,
    id: null,
    name: "",
    confirmName: "",
    type: "quiz"
  });

  const templates = allData;
  const sessions = allSessions;

  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createSessionModal.quizId) return;

    try {
      await onCreateSession(createSessionModal.quizId, createSessionModal.isPrivate);
      setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true });
      showToast("Session created. Check the Sessions column.", "success");
    } catch (error) {
      console.error("Failed to create session:", error);
      showToast("Failed to create session. Please try again.", "error");
    }
  };

  const handleToggleJoin = async (sessionId: string, isPrivate: boolean) => {
    const room = rooms[sessionId];
    const isOpen = room && (room.status === "waiting" || room.status === "started");
    
    if (isOpen) {
      await closeLobby(sessionId);
      showToast("Session closed.", "info");
    } else {
      // Get current host ID (the current admin)
      if (!user) return;
      
      // Ensure room is fresh
      await reopenLobby(sessionId, user.uid);
      const token = await openLobby(sessionId);
      
      if (!isPrivate) {
        // Public Session: Start immediately and keep lobby open for others to join
        await startRoom(sessionId);
        showToast(`Session started! Players can join with PIN: ${token.toUpperCase().slice(0, 6)}`, "success");
        router.push(`/admin/questions/${sessionId}/observe`);
      } else {
        // Private Lobby: Wait for host to start
        showToast(`Lobby opened! Join PIN: ${token.toUpperCase().slice(0, 6)}`, "success");
        router.push(`/admin/questions/${sessionId}/lobby`);
      }
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteModal.confirmName === deleteModal.name && deleteModal.id) {
      if (deleteModal.type === "quiz") {
        await onDeleteQuiz(deleteModal.id);
      } else {
        await onDeleteSession(deleteModal.id);
      }
      setDeleteModal({ isOpen: false, id: null, name: "", confirmName: "", type: "quiz" });
      showToast("Deleted successfully.", "success");
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
              const room = rooms[s.id]; // Use Instance ID instead of Quiz ID
              const isJoinOpen = room && (room.status === "waiting" || room.status === "started");
              const joinToken = room?.joinToken;

              return (
                <div key={s.id} className="rounded-2xl border border-[#0460A9]/20 bg-white/5 p-5 hover:bg-white/10 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{s.quiz_name || "Unknown Quiz"}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${s.is_private ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"}`}>
                          {s.is_private ? "Private" : "Public"}
                        </span>
                      </div>
                      {s.pin_code && (
                        <p className="text-sm text-emerald-400 font-mono mt-1">PIN: {s.pin_code}</p>
                      )}
                      <p className="text-[10px] text-gray-500 mt-2">
                        Created by: <span className="text-gray-400">{s.user_name || s.user_id}</span> • {new Date(s.started_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/5">
                    <Button 
                      variant={isJoinOpen ? "primary" : "secondary"} 
                      size="sm" 
                      onClick={() => isJoinOpen 
                        ? router.push(`/admin/questions/${s.id}/${s.is_private ? 'lobby' : 'observe'}`) 
                        : handleToggleJoin(s.id, s.is_private)
                      }
                    >
                      {isJoinOpen ? "Manage Live" : (s.is_private ? "Open Lobby" : "Start Session")}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => setDeleteModal({ isOpen: true, id: s.id, name: s.quiz_name || "Session", confirmName: "", type: "session" })}>
                      Delete
                    </Button>
                    {isJoinOpen && (
                      <Button variant="danger" size="sm" onClick={() => handleToggleJoin(s.id, s.is_private)}>
                        Close
                      </Button>
                    )}
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
                  <Button variant="primary" size="sm" onClick={() => setCreateSessionModal({ isOpen: true, quizId: q.id, quizName: q.name })}>
                    Create Session
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => router.push(`/admin/questions/${q.id}/edit`)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => onDuplicate(q.id, true)}>Duplicate</Button>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => setDeleteModal({ isOpen: true, id: q.id, name: q.name, confirmName: "", type: "quiz" })}>
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
            <div className="flex flex-col gap-3">
              <Button
                variant="primary"
                className="w-full justify-center bg-amber-500 hover:bg-amber-600 border-amber-500"
                onClick={() => {
                  onCreateSession(createSessionModal.quizId!, true);
                  setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true });
                  showToast("Private Lobby created.", "success");
                }}
              >
                Create Private Lobby
              </Button>
              <Button
                variant="primary"
                className="w-full justify-center bg-emerald-500 hover:bg-emerald-600 border-emerald-500"
                onClick={() => {
                  onCreateSession(createSessionModal.quizId!, false);
                  setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true });
                  showToast("Public Session created.", "success");
                }}
              >
                Create Public Session
              </Button>
              <Button variant="ghost" className="w-full justify-center" onClick={() => setCreateSessionModal({ isOpen: false, quizId: null, quizName: "", isPrivate: true })}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE SAFETY MODAL */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-3xl bg-[#16324F] p-6 shadow-2xl border border-red-500/30">
            <h3 className="text-xl font-bold text-white mb-4">Delete {deleteModal.type === "quiz" ? "Quiz Template" : "Active Session"}</h3>
            <p className="text-sm text-gray-400 mb-4">
              This action cannot be undone. To confirm, type <strong className="text-red-400 select-none">{deleteModal.name}</strong> below.
            </p>
            <form onSubmit={handleDeleteSubmit}>
              <input
                type="text"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-gray-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 mb-6"
                placeholder="Type name to confirm"
                value={deleteModal.confirmName}
                onChange={(e) => setDeleteModal(prev => ({ ...prev, confirmName: e.target.value }))}
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <Button variant="ghost" type="button" onClick={() => setDeleteModal({ isOpen: false, id: null, name: "", confirmName: "" })}>Cancel</Button>
                <Button variant="primary" type="submit" className="bg-red-500 hover:bg-red-600 border-red-500" disabled={deleteModal.confirmName !== deleteModal.name}>
                  Delete Permanently
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
