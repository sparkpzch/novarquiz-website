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

async function getErrorMessage(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error ?? `Request failed (${response.status})`;
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

  const handleSave = async (publish: boolean) => {
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
      // 1. Create session
      const sesRes = await fetch("/api/questions/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sessionName,
          description,
          timer_seconds: null,
          is_published: publish,
          created_by: user?.uid,
        }),
      });
      const session = await sesRes.json();
      if (!sesRes.ok) throw new Error(session.error);

      // 2. Create questions, map tempId → realId
      const idMap: Record<string, string> = {};
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isNormal = node.type === "normalNode";
        const isEnd = node.type === "endNode";
        const d = node.data as AppNodeData;

        const body: Record<string, unknown> = {
          session_id: session.id,
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

        const qRes = await fetch(
          `/api/questions/sessions/${session.id}/graph`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const q = await qRes.json();
        if (!qRes.ok) throw new Error(q.error);
        idMap[node.id] = q.id;
      }

      // 3. Save connections
      const connections = edges
        .filter((e) => idMap[e.source] && idMap[e.target])
        .map((e) => ({
          from_question_id: idMap[e.source],
          from_choice_label: e.sourceHandle ?? "A",
          to_question_id: idMap[e.target],
        }));

      const graphRes = await fetch(`/api/questions/sessions/${session.id}/graph`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connections }),
      });
      if (!graphRes.ok) throw new Error(await getErrorMessage(graphRes));

      showToast(publish ? "Session published!" : "Draft saved!", "success");
      router.push("/admin?tab=question-manager");
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
