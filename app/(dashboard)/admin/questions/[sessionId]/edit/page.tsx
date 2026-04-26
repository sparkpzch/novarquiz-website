"use client";

import { use, useEffect, useState } from "react";
import { ReactFlowProvider, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import Input from "@/components/ui/Input";
import {
  EditorCanvas,
  type AppNode,
  type AppEdge,
  type AppNodeData,
} from "@/components/node-editor/EditorCanvas";
import type { NormalNodeData } from "@/components/node-editor/NormalNode";
import type {
  Question,
  QuestionConnection,
  Quiz,
} from "@/lib/types";

// ─── Data-mapping helpers ─────────────────────────────────────────────────────

import { MarkerType } from "@xyflow/react";
import type { SituationNodeData } from "@/components/node-editor/SituationNode";
import type { EndNodeData } from "@/components/node-editor/EndNode";
import { CHOICE_COLORS } from "@/components/node-editor/EditorCanvas";

async function getErrorMessage(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? `Request failed (${response.status})`;
}

type AppNodeType = "normalNode" | "situationNode" | "endNode";

function nodeTypeFor(q: Question): AppNodeType {
  if (q.node_type === "situation") return "situationNode";
  if (q.node_type === "end") return "endNode";
  return "normalNode";
}

function toFlowNodes(questions: Question[]): AppNode[] {
  return questions.map((q) => {
    const t = nodeTypeFor(q);
    const common = {
      question_text: q.question_text,
      media_type: q.media_type,
      media_url: q.media_url,
      is_entry_point: q.is_entry_point,
    };
    const data: AppNodeData =
      t === "situationNode"
        ? (common as SituationNodeData)
        : t === "endNode"
          ? (common as EndNodeData)
          : ({
              ...common,
              choices: q.choices ?? [],
              timer_override: q.timer_override,
            } as NormalNodeData);
    return {
      id: q.id,
      type: t,
      position: { x: q.node_x ?? 0, y: q.node_y ?? 0 },
      data,
    };
  });
}

function toFlowEdges(connections: QuestionConnection[]): AppEdge[] {
  return connections.map((c) => {
    const color = CHOICE_COLORS[c.from_choice_label] ?? "#6366f1";
    return {
      id: `${c.from_question_id}-${c.from_choice_label}-${c.to_question_id}`,
      source: c.from_question_id,
      sourceHandle: c.from_choice_label,
      target: c.to_question_id,
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    };
  });
}

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
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/quizzes/${sessionId}`).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`/api/quizzes/${sessionId}/graph`).then((r) =>
        r.ok ? r.json() : { questions: [], connections: [] },
      ),
    ])
      .then(
        ([session, graph]: [
          Quiz | null,
          { questions: Question[]; connections: QuestionConnection[] },
        ]) => {
          if (session) {
            setSessionName(session.name);
            setDescription(session.description ?? "");
          }
          setNodes(toFlowNodes(graph.questions ?? []));
          setEdges(toFlowEdges(graph.connections ?? []));
        },
      )
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [sessionId]);

  if (authLoading || !isAdmin) return null;

  const handleSave = async () => {
    if (!sessionName.trim()) {
      showToast("Session name is required", "error");
      return;
    }
    if (nodes.length === 0) {
      showToast("Add at least one node", "error");
      return;
    }

    setSaving(true);
    try {
      // 1. Update session metadata
      const sesRes = await fetch(`/api/quizzes/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sessionName,
          description,
          timer_seconds: null,
          is_published: true,
        }),
      });
      if (!sesRes.ok) throw new Error((await sesRes.json()).error);

      // 2. Delete existing questions
      const deleteGraphRes = await fetch(`/api/quizzes/${sessionId}/graph`, {
        method: "DELETE",
      });
      if (!deleteGraphRes.ok) throw new Error(await getErrorMessage(deleteGraphRes));

      // 3. Re-create questions, map tempId → realId
      const idMap: Record<string, string> = {};
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isNormal = node.type === "normalNode";
        const isEnd = node.type === "endNode";
        const d = node.data as AppNodeData;

        const body: Record<string, unknown> = {
          session_id: sessionId,
          question_order: i,
          question_text: d.question_text,
          media_type: d.media_type,
          media_url: d.media_url,
          is_entry_point: d.is_entry_point,
          node_x: Math.round(node.position.x),
          node_y: Math.round(node.position.y),
          node_type: isNormal ? "normal" : isEnd ? "end" : "situation",
        };
        if (isNormal) {
          const nd = d as NormalNodeData;
          body.timer_override = null;
          body.choices = nd.choices;
        }

        const qRes = await fetch(`/api/quizzes/${sessionId}/graph`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const q = await qRes.json();
        if (!qRes.ok) throw new Error(q.error);
        idMap[node.id] = q.id;
      }

      // 4. Save connections
      const connections = edges
        .filter((e) => idMap[e.source] && idMap[e.target])
        .map((e) => ({
          from_question_id: idMap[e.source],
          from_choice_label: e.sourceHandle ?? "A",
          to_question_id: idMap[e.target],
        }));

      const graphRes = await fetch(`/api/quizzes/${sessionId}/graph`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connections }),
      });
      if (!graphRes.ok) throw new Error(await getErrorMessage(graphRes));

      showToast("Quiz saved!", "success");
      router.push("/admin?tab=quizzes-manager");
    } catch (err) {
      showToast(`Save failed: ${(err as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 112px)",
        gap: 12,
      }}
    >
      {/* Session metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-shrink-0">
        <Input
          label="Session Name"
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          placeholder="e.g. Capital Cities"
        />
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {/* Session settings bar */}
      <div className="flex flex-wrap items-center gap-3 flex-shrink-0 px-1">
        {/* Open Lobby */}
        <button
          onClick={() => router.push(`/admin/questions/${sessionId}/lobby`)}
          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-sm text-indigo-400 hover:bg-indigo-600/30 transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Open Lobby
        </button>
      </div>

      {/* Canvas */}
      <div
        style={{
          flex: 1,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          position: "relative",
        }}
      >
        {fetching ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#08080f",
            }}
          >
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
              onSave={handleSave}
              saving={saving}
              sessionId={sessionId}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
