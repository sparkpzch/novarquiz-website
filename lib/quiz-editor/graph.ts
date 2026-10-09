/**
 * Pure helpers shared by the node-editor Create and Edit pages: mapping the
 * stored graph to React Flow nodes/edges, validating it, and serializing it
 * back for PUT /api/quizzes/<id>/graph. Kept free of React so it is testable.
 *
 * The save endpoint replaces the whole graph, so anything serializeGraph omits
 * is lost on save. Every stored question field must round-trip through here.
 */
import type { MarkerType } from '@xyflow/react';
import type { AppEdge, AppNode, AppNodeData } from '@/components/node-editor/EditorCanvas';
import type { NormalNodeData } from '@/components/node-editor/NormalNode';
import type { Question, QuestionConnection } from '@/lib/types';

export const CHOICE_COLORS: Record<string, string> = {
  A: '#ef4444', B: '#3b82f6', C: '#22c55e', D: '#f59e0b', continue: '#8b5cf6',
};
const FALLBACK_EDGE_COLOR = '#3d63f0';

/** Builds the styled edge for one outgoing handle. */
export function makeEdge(source: string, sourceHandle: string, target: string): AppEdge {
  const color = CHOICE_COLORS[sourceHandle] ?? FALLBACK_EDGE_COLOR;
  return {
    id: `${source}-${sourceHandle}-${target}`,
    source,
    sourceHandle,
    target,
    style: { stroke: color, strokeWidth: 2 },
    // Literal value of MarkerType.ArrowClosed; avoids a runtime React import.
    markerEnd: { type: 'arrowclosed' as MarkerType, color, width: 14, height: 14 },
  };
}

/**
 * Sets the single target of one outgoing handle. The DB allows one connection
 * per (from_question_id, from_choice_label), so an extra edge would make the
 * whole save fail; the new connection replaces the old one instead.
 */
export function setHandleTarget(
  edges: AppEdge[], source: string, sourceHandle: string, target: string | null,
): AppEdge[] {
  const rest = edges.filter((e) => !(e.source === source && (e.sourceHandle ?? 'A') === sourceHandle));
  return target ? [...rest, makeEdge(source, sourceHandle, target)] : rest;
}

type AppNodeType = 'normalNode' | 'situationNode' | 'endNode';

function nodeTypeFor(q: Question): AppNodeType {
  if (q.node_type === 'situation') return 'situationNode';
  if (q.node_type === 'end') return 'endNode';
  return 'normalNode';
}

export function toFlowNodes(questions: Question[]): AppNode[] {
  return questions.map((q) => {
    const type = nodeTypeFor(q);
    const common = {
      node_name: q.node_name ?? null,
      question_text: q.question_text,
      media_type: q.media_type,
      media_url: q.media_url,
      media_explanation: q.media_explanation ?? (q.node_type === 'situation' ? q.question_text : null),
      media_path: q.media_path,
      is_entry_point: q.is_entry_point,
    };
    const data: AppNodeData = type === 'normalNode'
      ? { ...common, choices: q.choices ?? [], timer_override: q.timer_override ?? null } as NormalNodeData
      : common as AppNodeData;
    return { id: q.id, type, position: { x: q.node_x ?? 0, y: q.node_y ?? 0 }, data } as AppNode;
  });
}

export function toFlowEdges(connections: QuestionConnection[]): AppEdge[] {
  return connections.map((c) => makeEdge(c.from_question_id, c.from_choice_label, c.to_question_id));
}

/** Returns a user-facing error for the first problem found, or null. */
export function validateGraph(nodes: AppNode[]): string | null {
  if (nodes.length === 0) return 'Add at least one node.';
  for (const node of nodes) {
    const data = node.data as AppNodeData;
    const name = data.node_name || node.id;
    // End-node messages are optional; the end screen works without one.
    if (node.type !== 'endNode' && !data.question_text?.trim()) {
      return `Node "${name}" needs question or display text.`;
    }
    if (node.type === 'normalNode') {
      const choices = (data as NormalNodeData).choices ?? [];
      if (choices.length === 0) return `Question node "${name}" needs at least one choice.`;
      for (const choice of choices) {
        if (!choice.choice_text?.trim()) return `Choice ${choice.label} on "${name}" needs text.`;
      }
    }
  }
  // Without an entry point players skip straight to the final leaderboard.
  const starts = nodes.filter((n) => n.type !== 'endNode' && (n.data as AppNodeData).is_entry_point);
  if (starts.length === 0) return 'Set a start node (right-click a node → Set as Start).';
  if (starts.length > 1) return 'Only one node can be the start node.';
  return null;
}

export function serializeGraph(nodes: AppNode[], edges: AppEdge[]) {
  return {
    questions: nodes.map((node, index) => {
      const isNormal = node.type === 'normalNode';
      const isEnd = node.type === 'endNode';
      const data = node.data as AppNodeData;
      return {
        id: node.id,
        question_order: index,
        question_text: data.question_text,
        node_name: data.node_name ?? null,
        media_type: data.media_type,
        media_url: data.media_url,
        media_explanation: data.media_explanation ?? (node.type === 'situationNode' ? data.question_text : null),
        media_path: data.media_path,
        // End nodes cannot be entered first; never let a stale flag persist on one.
        is_entry_point: isEnd ? false : data.is_entry_point,
        node_x: Math.round(node.position.x),
        node_y: Math.round(node.position.y),
        node_type: isNormal ? 'normal' : isEnd ? 'end' : 'situation',
        timer_override: isNormal ? (data as NormalNodeData).timer_override ?? null : null,
        choices: isNormal ? (data as NormalNodeData).choices : [],
      };
    }),
    connections: edges
      .filter((edge) => edge.source && edge.target)
      .map((edge) => ({
        from_question_id: edge.source,
        from_choice_label: edge.sourceHandle ?? 'A',
        to_question_id: edge.target,
      })),
  };
}

/** Applies the server's idMap (temporary editor ids → stored UUIDs). */
export function remapGraphIds(nodes: AppNode[], edges: AppEdge[], idMap: Record<string, string>) {
  const remap = (id: string) => idMap[id] ?? id;
  return {
    nodes: nodes.map((node) => (idMap[node.id] ? { ...node, id: idMap[node.id] } : node)),
    edges: edges.map((edge) => makeEdge(remap(edge.source), edge.sourceHandle ?? 'A', remap(edge.target))),
  };
}
