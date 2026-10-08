"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "next/navigation";
import type { Quiz, Session } from "@/lib/types";
import dynamic from "next/dynamic";
import { watchRoom, type SessionRoom } from "@/lib/firebase/rtdb";

const QuizzesManager = dynamic(() => import("./QuizzesManager"), {
  loading: () => <p role="status">Loading quiz manager…</p>,
});

export default function AdminQuizzesPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [dataError, setDataError] = useState("");
  const [allData, setAllData] = useState<Quiz[]>([]);
  const [allSessions, setAllSessions] = useState<(Session & { quiz_name?: string })[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [rooms, setRooms] = useState<Record<string, SessionRoom>>({});

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/quizzes");
  }, [authLoading, isAdmin, router]);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    setDataError("");
    const results = await Promise.allSettled([
      fetch("/api/quizzes?all=true", { signal: AbortSignal.timeout(20000) }).then(async r => {
        if (!r.ok) throw new Error("Could not load quizzes");
        const data = await r.json();
        if (!Array.isArray(data)) throw new Error("Invalid quiz response");
        setAllData(data);
      }),
      fetch("/api/sessions", { signal: AbortSignal.timeout(20000) }).then(async r => {
        if (!r.ok) throw new Error("Could not load sessions");
        const data = await r.json();
        if (!Array.isArray(data)) throw new Error("Invalid session response");
        setAllSessions(data);
      }),
    ]);
    if (results.some(result => result.status === "rejected")) {
      setDataError("Some data could not be loaded. Please retry.");
    }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAdmin) void fetchData();
  }, [isAdmin, fetchData]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribers = allSessions.map(session => watchRoom(session.id, room => {
      setRooms(previous => {
        const next = { ...previous };
        if (room) next[session.id] = room;
        else delete next[session.id];
        return next;
      });
    }));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [isAdmin, allSessions]);

  const handleDeleteQuiz = async (id: string) => {
    const res = await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete quiz");
    setAllData((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDeleteSession = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete session");
    setAllSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDuplicate = async (id: string, isQuizDuplicate: boolean) => {
    if (!user) return;
    setLoadingData(true);
    try {
      const res = await fetch(`/api/quizzes/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdBy: user.uid, isQuizDuplicate }),
      });
      if (!res.ok) throw new Error("Failed to duplicate quiz");
      await fetchData();
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateSession = async (quizId: string, isPrivate: boolean, name?: string) => {
    if (!user) return;
    setLoadingData(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, userId: user.uid, isPrivate, name }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create session");
      }
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setLoadingData(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/quizzes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: !currentStatus }),
      });
      if (res.ok) {
        setAllData((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, is_published: !currentStatus } : s,
          ),
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading || !isAdmin) return null;

  return (
    <div className="nq-admin-panel mx-auto w-full max-w-[1500px] space-y-6">
      {dataError && (
        <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800">
          {dataError}
          <button type="button" className="ml-4 font-semibold underline" onClick={() => void fetchData()}>Retry</button>
        </div>
      )}
      {loadingData && <p role="status">Loading quizzes and sessions…</p>}
      <QuizzesManager
        allData={allData}
        allSessions={allSessions}
        rooms={rooms}
        onDuplicate={handleDuplicate}
        onCreateSession={handleCreateSession}
        onDeleteQuiz={handleDeleteQuiz}
        onDeleteSession={handleDeleteSession}
        onToggleStatus={handleToggleStatus}
        onRefresh={fetchData}
      />
    </div>
  );
}
