"use client";

import { useState, useEffect } from "react";
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

function validateGraph(nodes: AppNode[]) {
  for (const node of nodes) {
    if (node.type === "normalNode") {
      const data = node.data as AppNodeData;
      const choices = (data as NormalNodeData).choices ?? [];
      for (const choice of choices) {
      }
    }
  }
  return null;
}

async function getErrorMessage(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? `Request failed (${response.status})`;
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

export default function CreateQuestionPage() {
  const { isAdmin, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [sessionName, setSessionName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

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
      // 1. Create session
      const sesRes = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sessionName,
          description,
          timer_seconds: null,
          is_published: true,
          created_by: user?.uid,
        }),
      });
      const session = await sesRes.json();
      if (!sesRes.ok) throw new Error(session.error);

      const graphRes = await fetch(`/api/quizzes/${session.id}/graph`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeGraph(nodes, edges)),
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
          placeholder="e.g. Snowdrop Quiz"
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
            sessionId="draft"
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
