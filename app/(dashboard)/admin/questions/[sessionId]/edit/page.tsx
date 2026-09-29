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
import { HCP_VECTOR_KEYS } from "@/lib/analytics/hcp";
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

function validateGraph(nodes: AppNode[]) {
  for (const node of nodes) {
    const data = node.data as AppNodeData;
    // Basic validation only
    if (!data.question_text?.trim()) {
      return `Node "${data.node_name || node.id}" needs question or display text.`;
    }

    if (node.type === "normalNode") {
      const choices = (data as NormalNodeData).choices ?? [];
      if (choices.length === 0) {
        return `Question node "${data.node_name || node.id}" needs at least one choice.`;
      }
      for (const choice of choices) {
        if (!choice.choice_text?.trim()) {
          return `Choice ${choice.label} on "${data.node_name || node.id}" needs text.`;
        }
      }
    }
  }
  return null;
}

function serializeGraph(nodes: AppNode[], edges: AppEdge[]) {
  return {
    questions: nodes.map((node, index) => {
      const isNormal = node.type === "normalNode";
      const isEnd = node.type === "endNode";
      const data = node.data as AppNodeData;

      return {
        id: node.id,
        question_order: index,
        question_text: data.question_text,
        node_name: data.node_name ?? null,
        media_type: data.media_type,
        media_url: data.media_url,
        media_path: data.media_path,
        is_entry_point: data.is_entry_point,
        node_x: Math.round(node.position.x),
        node_y: Math.round(node.position.y),
        node_type: isNormal ? "normal" : isEnd ? "end" : "situation",
        timer_override: isNormal ? null : undefined,
        choices: isNormal ? (data as NormalNodeData).choices : [],
      };
    }),
    connections: edges
      .filter((edge) => edge.source && edge.target)
      .map((edge) => ({
        from_question_id: edge.source,
        from_choice_label: edge.sourceHandle ?? "A",
        to_question_id: edge.target,
      })),
  };
}

function remapGraphIds(nodes: AppNode[], edges: AppEdge[], idMap: Record<string, string>) {
  const remappedNodes = nodes.map((node) =>
    idMap[node.id] ? { ...node, id: idMap[node.id] } : node,
  );

  const remappedEdges = edges.map((edge) => ({
    ...edge,
    id: `${idMap[edge.source] ?? edge.source}-${edge.sourceHandle ?? "A"}-${idMap[edge.target] ?? edge.target}`,
    source: idMap[edge.source] ?? edge.source,
    target: idMap[edge.target] ?? edge.target,
  }));

  return { remappedNodes, remappedEdges };
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
      node_name: q.node_name ?? null,
      question_text: q.question_text,
      media_type: q.media_type,
      media_url: q.media_url,
      media_path: q.media_path,
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
  const [quizId, setQuizId] = useState<string | null>(null);
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
            setQuizId(session.id);
          }
          setNodes(toFlowNodes(graph.questions ?? []));
          setEdges(toFlowEdges(graph.connections ?? []));
        },
      )
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [sessionId, setEdges, setNodes]);

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
    const validationError = validateGraph(nodes);
    if (validationError) {
      showToast(validationError, "error");
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
      const sesData = await sesRes.json();
      if (!sesRes.ok) throw new Error(sesData.error);
      
      // Update URL if slug changed
      if (sesData.slug && sesData.slug !== sessionId) {
        router.replace(`/admin/questions/${sesData.slug}/edit`);
      }

      const graphRes = await fetch(`/api/quizzes/${sessionId}/graph`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeGraph(nodes, edges)),
      });
      if (!graphRes.ok) throw new Error(await getErrorMessage(graphRes));
      const graphData = await graphRes.json();

      if (graphData?.idMap) {
        const { remappedNodes, remappedEdges } = remapGraphIds(nodes, edges, graphData.idMap);
        setNodes(remappedNodes);
        setEdges(remappedEdges);
      }

      showToast("Quiz saved!", "success");
      // router.push("/admin?tab=quizzes-manager"); // Removed as per user request
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
              quizId={quizId ?? undefined}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
