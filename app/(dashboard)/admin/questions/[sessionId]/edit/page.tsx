"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import {
  EditorCanvas,
  type AppNode,
  type AppEdge,
} from "@/components/node-editor/EditorCanvas";
import { EditorHeader, useLeaveGuard } from "@/components/node-editor/EditorHeader";
import {
  serializeGraph,
  toFlowEdges,
  toFlowNodes,
  validateGraph,
} from "@/lib/quiz-editor/graph";
import type { Question, QuestionConnection, Quiz } from "@/lib/types";

async function getErrorMessage(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? `Request failed (${response.status})`;
}

/** Everything a save would write; compared against the last save for "dirty". */
function snapshotOf(name: string, description: string, published: boolean, nodes: AppNode[], edges: AppEdge[]) {
  return JSON.stringify({ name, description, published, graph: serializeGraph(nodes, edges) });
}

const MANAGER_HREF = "/admin?tab=quizzes-manager";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditQuestionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [sessionName, setSessionName] = useState("");
  const [description, setDescription] = useState("");
  const [quizId, setQuizId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Metadata as last stored, so a save only sends what changed.
  const [savedMeta, setSavedMeta] = useState({ name: "", description: "", published: false });
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);

  const currentSnapshot = useMemo(
    () => snapshotOf(sessionName, description, published, nodes, edges),
    [sessionName, description, published, nodes, edges],
  );
  const dirty = savedSnapshot !== null && currentSnapshot !== savedSnapshot;
  const { dialog: leaveDialog, allowLeave } = useLeaveGuard(dirty);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  // A failed load must never fall back to an empty canvas: saving that would
  // replace the stored quiz with nothing. Instead show an error and block Save.
  const load = useCallback(async () => {
    setFetching(true);
    setLoadError(null);
    try {
      const [quizRes, graphRes] = await Promise.all([
        fetch(`/api/quizzes/${sessionId}`, { cache: "no-store" }),
        fetch(`/api/quizzes/${sessionId}/graph`, { cache: "no-store" }),
      ]);
      if (!quizRes.ok) throw new Error(await getErrorMessage(quizRes));
      if (!graphRes.ok) throw new Error(await getErrorMessage(graphRes));
      const quiz: Quiz = await quizRes.json();
      const graph: { questions?: Question[]; connections?: QuestionConnection[] } = await graphRes.json();
      if (!Array.isArray(graph?.questions) || !Array.isArray(graph?.connections)) {
        throw new Error("Unexpected response while loading the quiz graph");
      }
      const loadedNodes = toFlowNodes(graph.questions);
      const loadedEdges = toFlowEdges(graph.connections);
      const loadedDescription = quiz.description ?? "";
      setSessionName(quiz.name);
      setDescription(loadedDescription);
      setQuizId(quiz.id);
      setPublished(!!quiz.is_published);
      setSavedMeta({ name: quiz.name, description: loadedDescription, published: !!quiz.is_published });
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      setSavedSnapshot(snapshotOf(quiz.name, loadedDescription, !!quiz.is_published, loadedNodes, loadedEdges));
    } catch (err) {
      setLoadError((err as Error).message || "Could not load this quiz");
    } finally {
      setFetching(false);
    }
  }, [sessionId, setEdges, setNodes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (authLoading || !isAdmin) return null;

  const handleSave = async () => {
    if (!quizId || loadError || fetching) return;
    if (!sessionName.trim()) {
      showToast("Quiz name is required", "error");
      return;
    }
    const validationError = validateGraph(nodes);
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    const meta: { name?: string; description?: string; is_published?: boolean } = {};
    if (sessionName !== savedMeta.name) meta.name = sessionName;
    if (description !== savedMeta.description) meta.description = description;
    if (published !== savedMeta.published) meta.is_published = published;

    const saveMeta = async () => {
      if (Object.keys(meta).length === 0) return;
      const res = await fetch(`/api/quizzes/${quizId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      if (!res.ok) {
        const message = await getErrorMessage(res);
        throw new Error(meta.is_published && res.status === 409
          ? `${message} The quiz content was saved as a draft.`
          : message);
      }
      setSavedMeta({ name: sessionName, description, published });
    };
    const saveGraph = async () => {
      // Addressed by UUID, so a rename (new slug) can't break it.
      const res = await fetch(`/api/quizzes/${quizId}/graph`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeGraph(nodes, edges)),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res));
    };

    setSaving(true);
    try {
      // A published quiz only accepts content whose videos are ready, so
      // unpublish before writing content and publish only after it.
      if (meta.is_published === false) {
        await saveMeta();
        await saveGraph();
      } else {
        await saveGraph();
        await saveMeta();
      }
      showToast("Quiz saved!", "success");
      allowLeave();
      router.push(MANAGER_HREF);
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
        title="Edit quiz"
        name={sessionName}
        description={description}
        onNameChange={setSessionName}
        onDescriptionChange={setDescription}
        onSave={handleSave}
        published={published}
        onPublishedChange={setPublished}
        saving={saving}
        dirty={dirty}
        disabled={fetching || !!loadError || !quizId}
        backHref={MANAGER_HREF}
      />

      {/* Canvas */}
      <div className="nq-node-editor nq-ne-card" style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
        {fetching ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", background: "var(--nq-canvas)" }}>
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--nq-primary)", borderTopColor: "transparent" }} />
            <span style={{ fontSize: 13, color: "var(--nq-muted)" }}>Loading quiz…</span>
          </div>
        ) : loadError ? (
          <div role="alert" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--nq-canvas)", padding: 24 }}>
            <div style={{ textAlign: "center", maxWidth: 380 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--nq-ink)", margin: "0 0 6px" }}>Couldn&apos;t load this quiz</p>
              <p style={{ fontSize: 13, color: "var(--nq-muted)", margin: "0 0 16px", lineHeight: 1.6 }}>
                {loadError}. Nothing was changed. Editing stays off until the quiz loads, so the saved version can&apos;t be overwritten.
              </p>
              <Button size="sm" onClick={() => void load()}>Try again</Button>
            </div>
          </div>
        ) : (
          <ReactFlowProvider>
            <EditorCanvas
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              sessionId={sessionId}
              quizId={quizId ?? undefined}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
