'use client';

import { use, useEffect, useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { NormalNode, type NormalNodeData } from '@/components/node-editor/NormalNode';
import { SituationNode, type SituationNodeData } from '@/components/node-editor/SituationNode';
import { ContextMenu } from '@/components/node-editor/ContextMenu';
import { EditNodeModal } from '@/components/node-editor/EditNodeModal';
import type { Question, QuestionConnection, QuestionSession } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type AppNodeData = NormalNodeData | SituationNodeData;
type AppNode = Node<AppNodeData, 'normalNode' | 'situationNode'>;
type AppEdge = Edge;

interface CtxMenu {
  x: number; y: number;
  mode: 'canvas' | 'node';
  nodeId?: string;
  flowX?: number; flowY?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHOICE_COLORS: Record<string, string> = {
  A: '#ef4444', B: '#3b82f6', C: '#22c55e', D: '#f59e0b', continue: '#8b5cf6',
};

const nodeTypes: NodeTypes = { normalNode: NormalNode, situationNode: SituationNode };

const defaultNormalData = (): NormalNodeData => ({
  question_text: '',
  choices: [
    { label: 'A', choice_text: '', is_correct: false },
    { label: 'B', choice_text: '', is_correct: false },
    { label: 'C', choice_text: '', is_correct: false },
    { label: 'D', choice_text: '', is_correct: false },
  ],
  media_type: null,
  media_url: null,
  is_entry_point: false,
  timer_override: null,
});

const defaultSituationData = (): SituationNodeData => ({
  question_text: '',
  media_type: null,
  media_url: null,
  is_entry_point: false,
});

function toFlowNodes(questions: Question[]): AppNode[] {
  return questions.map(q => ({
    id: q.id,
    type: q.node_type === 'situation' ? 'situationNode' : 'normalNode',
    position: { x: q.node_x ?? 0, y: q.node_y ?? 0 },
    data: q.node_type === 'situation'
      ? { question_text: q.question_text, media_type: q.media_type, media_url: q.media_url, is_entry_point: q.is_entry_point } as SituationNodeData
      : { question_text: q.question_text, choices: q.choices ?? [], media_type: q.media_type, media_url: q.media_url, is_entry_point: q.is_entry_point, timer_override: q.timer_override } as NormalNodeData,
  }));
}

function toFlowEdges(connections: QuestionConnection[]): AppEdge[] {
  return connections.map(c => {
    const color = CHOICE_COLORS[c.from_choice_label] ?? '#6366f1';
    return {
      id: `${c.from_question_id}-${c.from_choice_label}-${c.to_question_id}`,
      source: c.from_question_id,
      sourceHandle: c.from_choice_label,
      target: c.to_question_id,
      type: 'smoothstep',
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    };
  });
}

const toolbarBtnStyle = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px',
  background: `${color}22`, border: `1px solid ${color}44`,
  borderRadius: 8, color: '#e2e8f0', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', transition: 'background 0.15s',
});

// ─── Inner canvas ─────────────────────────────────────────────────────────────

function EditorCanvas({
  nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange, onSave, saving,
}: {
  nodes: AppNode[];
  edges: AppEdge[];
  setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>;
  onNodesChange: Parameters<typeof useNodesState>[1];
  onEdgesChange: Parameters<typeof useEdgesState>[1];
  onSave: (publish: boolean) => void;
  saving: boolean;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [editNode, setEditNode] = useState<AppNode | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const closeCtx = useCallback(() => setCtxMenu(null), []);

  const addNode = useCallback((type: 'normalNode' | 'situationNode', pos: { x: number; y: number }) => {
    const id = `${type}-${Date.now()}`;
    const isFirst = nodes.length === 0;
    const data: AppNodeData = type === 'normalNode'
      ? { ...defaultNormalData(), is_entry_point: isFirst }
      : { ...defaultSituationData(), is_entry_point: isFirst };
    setNodes(ns => [...ns, { id, type, position: pos, data } as AppNode]);
  }, [nodes.length, setNodes]);

  const onConnect = useCallback((params: Connection) => {
    const color = CHOICE_COLORS[params.sourceHandle ?? ''] ?? '#6366f1';
    setEdges(es => addEdge({
      ...params, type: 'smoothstep', animated: false,
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    }, es));
  }, [setEdges]);

  const onPaneCtx = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'canvas', flowX: flow.x, flowY: flow.y });
  }, [screenToFlowPosition]);

  const onNodeCtx = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault(); e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'node', nodeId: node.id });
  }, []);

  const onNodeDblClick = useCallback((_: React.MouseEvent, node: Node) => {
    setEditNode(node as AppNode);
  }, []);

  const handleEditSave = useCallback((id: string, data: AppNodeData) => {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data } as AppNode : n));
    setEditNode(null);
  }, [setNodes]);

  const ctxNodeData = ctxMenu?.nodeId
    ? nodes.find(n => n.id === ctxMenu.nodeId)?.data as AppNodeData | undefined
    : undefined;

  const deleteNode = useCallback((id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
  }, [setNodes, setEdges]);

  const setAsEntry = useCallback((id: string) => {
    setNodes(ns => ns.map(n => ({ ...n, data: { ...n.data, is_entry_point: n.id === id } }) as AppNode));
  }, [setNodes]);

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDblClick}
        onPaneClick={closeCtx}
        onPaneContextMenu={onPaneCtx}
        onNodeContextMenu={onNodeCtx}
        nodeTypes={nodeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid snapGrid={[16, 16]}
        fitView fitViewOptions={{ padding: 0.2 }}
        style={{ background: '#08080f' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.06)" gap={24} size={1.5} />
        <Controls
          style={{ background: '#13132b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
          showInteractive={false}
        />
        <MiniMap
          style={{ background: '#0d0d20', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
          nodeColor="#6366f1" maskColor="rgba(8,8,15,0.7)"
        />

        {/* Toolbar */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => addNode('normalNode', { x: 80 + nodes.length * 30, y: 80 + nodes.length * 20 })} style={toolbarBtnStyle('#6366f1')} title="Add Question Node">
            <span style={{ fontSize: 14 }}>❓</span> Question Node
          </button>
          <button onClick={() => addNode('situationNode', { x: 80 + nodes.length * 30, y: 80 + nodes.length * 20 })} style={toolbarBtnStyle('#8b5cf6')} title="Add Situation Node">
            <span style={{ fontSize: 14 }}>🎬</span> Situation Node
          </button>
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>Right-click canvas · Del to remove</span>
        </div>

        {/* Save buttons */}
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => onSave(false)} loading={saving} size="sm">Save Draft</Button>
          <Button onClick={() => onSave(true)} loading={saving} size="sm">Publish</Button>
        </div>

        {nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
            <div style={{ textAlign: 'center', color: '#374151', maxWidth: 320 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🕸</div>
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Empty canvas</p>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>Right-click anywhere or use the toolbar above to add nodes.</p>
            </div>
          </div>
        )}
      </ReactFlow>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} mode={ctxMenu.mode}
          isEntryPoint={(ctxNodeData as AppNodeData | undefined)?.is_entry_point}
          onAddNormal={() => addNode('normalNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onAddSituation={() => addNode('situationNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onEdit={() => { const n = nodes.find(n => n.id === ctxMenu.nodeId); if (n) setEditNode(n); }}
          onSetEntry={() => ctxMenu.nodeId && setAsEntry(ctxMenu.nodeId)}
          onDelete={() => ctxMenu.nodeId && deleteNode(ctxMenu.nodeId)}
          onClose={closeCtx}
        />
      )}

      <EditNodeModal
        node={editNode ? { id: editNode.id, type: editNode.type as 'normalNode' | 'situationNode', data: editNode.data } : null}
        onClose={() => setEditNode(null)}
        onSave={handleEditSave}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditQuestionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { isAdmin, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [sessionName, setSessionName] = useState('');
  const [description, setDescription] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/');
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/questions/sessions/${sessionId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/questions/sessions/${sessionId}/graph`).then(r => r.ok ? r.json() : { questions: [], connections: [] }),
    ]).then(([session, graph]: [QuestionSession | null, { questions: Question[]; connections: QuestionConnection[] }]) => {
      if (session) {
        setSessionName(session.name);
        setDescription(session.description ?? '');
        setTimerSeconds(session.timer_seconds);
      }
      setNodes(toFlowNodes(graph.questions ?? []));
      setEdges(toFlowEdges(graph.connections ?? []));
    }).catch(() => {}).finally(() => setFetching(false));
  }, [sessionId]);

  if (authLoading || !isAdmin) return null;

  const handleSave = async (publish: boolean) => {
    if (!sessionName.trim()) { showToast('Session name is required', 'error'); return; }
    if (nodes.length === 0) { showToast('Add at least one node', 'error'); return; }

    setSaving(true);
    try {
      // 1. Update session metadata
      const sesRes = await fetch(`/api/questions/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: sessionName, description, timer_seconds: timerSeconds, is_published: publish }),
      });
      if (!sesRes.ok) throw new Error((await sesRes.json()).error);

      // 2. Delete existing questions
      await fetch(`/api/questions/sessions/${sessionId}/graph`, { method: 'DELETE' });

      // 3. Re-create questions, map tempId → realId
      const idMap: Record<string, string> = {};
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isNormal = node.type === 'normalNode';
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
          node_type: isNormal ? 'normal' : 'situation',
        };
        if (isNormal) {
          const nd = d as NormalNodeData;
          body.timer_override = nd.timer_override;
          body.choices = nd.choices;
        }

        const qRes = await fetch(`/api/questions/sessions/${sessionId}/graph`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const q = await qRes.json();
        if (!qRes.ok) throw new Error(q.error);
        idMap[node.id] = q.id;
      }

      // 4. Save connections
      const connections = edges
        .filter(e => idMap[e.source] && idMap[e.target])
        .map(e => ({
          from_question_id: idMap[e.source],
          from_choice_label: e.sourceHandle ?? 'A',
          to_question_id: idMap[e.target],
        }));

      await fetch(`/api/questions/sessions/${sessionId}/graph`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connections }),
      });

      showToast(publish ? 'Session published!' : 'Draft saved!', 'success');
      router.push('/admin/questions');
    } catch (err) {
      showToast(`Save failed: ${(err as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)', gap: 12 }}>
      {/* Session metadata */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
        <Input label="Session Name" value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="e.g. Capital Cities" />
        <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
        <Input label="Default Timer (seconds)" type="number" value={timerSeconds} onChange={e => setTimerSeconds(Number(e.target.value))} min={5} max={120} />
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
        {fetching ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08080f' }}>
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ReactFlowProvider>
            <EditorCanvas
              nodes={nodes} edges={edges}
              setNodes={setNodes} setEdges={setEdges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onSave={handleSave} saving={saving}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
