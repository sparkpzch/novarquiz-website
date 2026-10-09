"use client";

import { useState, useEffect, useMemo } from "react";
import { ReactFlowProvider, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import {
  EditorCanvas,
  type AppNode,
  type AppEdge,
} from "@/components/node-editor/EditorCanvas";
import { EditorHeader, useLeaveGuard } from "@/components/node-editor/EditorHeader";
import { serializeGraph, validateGraph } from "@/lib/quiz-editor/graph";

async function getErrorMessage(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? `Request failed (${response.status})`;
}

export default function CreateQuestionPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [sessionName, setSessionName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  // Set once the quiz row exists, so retrying after a failed graph save
  // updates that quiz instead of creating a duplicate.
  const [createdQuizId, setCreatedQuizId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);

  // Anything typed or placed counts as work worth protecting.
  const dirty = useMemo(
    () => sessionName.trim() !== "" || description.trim() !== "" || nodes.length > 0,
    [sessionName, description, nodes.length],
  );
  const { dialog: leaveDialog, allowLeave } = useLeaveGuard(dirty);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  if (authLoading || !isAdmin) return null;

  const handleSave = async () => {
    if (!sessionName.trim()) {
      showToast("Quiz name is required", "error");
      return;
    }
    const validationError = validateGraph(nodes);
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    setSaving(true);
    try {
      let quizId = createdQuizId;
      if (!quizId) {
        // 1. Create the quiz as a draft. The server takes the owner from the session.
        const res = await fetch("/api/quizzes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: sessionName, description }),
        });
        if (!res.ok) throw new Error(await getErrorMessage(res));
        quizId = (await res.json()).id as string;
        setCreatedQuizId(quizId);
      }

      // 2. Content.
      const graphRes = await fetch(`/api/quizzes/${quizId}/graph`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeGraph(nodes, edges)),
      });
      if (!graphRes.ok) throw new Error(await getErrorMessage(graphRes));

      // 3. Metadata last. Publishing goes here because the server refuses it
      //    while uploaded videos are still processing. On a retry this also
      //    stores a name/description edited since the quiz was created.
      const isRetry = createdQuizId !== null;
      if (published || isRetry) {
        const metaRes = await fetch(`/api/quizzes/${quizId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: sessionName, description, ...(published ? { is_published: true } : {}) }),
        });
        if (!metaRes.ok) {
          const message = await getErrorMessage(metaRes);
          throw new Error(published ? `${message} The quiz was saved as a draft.` : message);
        }
      }

      showToast("Quiz created!", "success");
      allowLeave();
      router.push("/admin?tab=quizzes-manager");
    } catch (err) {
      showToast(`Save failed: ${(err as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 112px)", gap: 12 }}>
      {leaveDialog}
      <EditorHeader
        title="New quiz"
        name={sessionName}
        description={description}
        onNameChange={setSessionName}
        onDescriptionChange={setDescription}
        published={published}
        onPublishedChange={setPublished}
        onSave={handleSave}
        saving={saving}
        dirty={dirty}
        backHref="/admin?tab=quizzes-manager"
      />

      {/* Canvas */}
      <div className="nq-node-editor nq-ne-card" style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
        <ReactFlowProvider>
          <EditorCanvas
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            sessionId="draft"
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
