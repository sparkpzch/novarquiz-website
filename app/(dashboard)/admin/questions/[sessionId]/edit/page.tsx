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
import { EndNode, type EndNodeData } from '@/components/node-editor/EndNode';
import { ContextMenu } from '@/components/node-editor/ContextMenu';
import { EditNodeModal } from '@/components/node-editor/EditNodeModal';
import type { Question, QuestionConnection, QuestionSession } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type AppNodeData = NormalNodeData | SituationNodeData | EndNodeData;
type AppNodeType = 'normalNode' | 'situationNode' | 'endNode';
type AppNode = Node<AppNodeData, AppNodeType>;
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

const nodeTypes: NodeTypes = { normalNode: NormalNode, situationNode: SituationNode, endNode: EndNode };

const defaultNormalData = (): NormalNodeData => ({
  question_text: '',
  // Default points = 0 per the per-choice scoring spec — admin sets values
  // explicitly. See migration 003.
  choices: [
    { label: 'A', choice_text: '', points: 0 },
    { label: 'B', choice_text: '', points: 0 },
    { label: 'C', choice_text: '', points: 0 },
    { label: 'D', choice_text: '', points: 0 },
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

const defaultEndData = (): EndNodeData => ({
  question_text: '',
  media_type: null,
  media_url: null,
  is_entry_point: false,
});

function nodeTypeFor(q: Question): AppNodeType {
  if (q.node_type === 'situation') return 'situationNode';
  if (q.node_type === 'end') return 'endNode';
  return 'normalNode';
}

function toFlowNodes(questions: Question[]): AppNode[] {
  return questions.map(q => {
    const t = nodeTypeFor(q);
    const common = {
      question_text: q.question_text,
      media_type: q.media_type,
      media_url: q.media_url,
      is_entry_point: q.is_entry_point,
    };
    const data: AppNodeData =
      t === 'situationNode' ? (common as SituationNodeData) :
      t === 'endNode' ? (common as EndNodeData) :
      { ...common, choices: q.choices ?? [], timer_override: q.timer_override } as NormalNodeData;
    return { id: q.id, type: t, position: { x: q.node_x ?? 0, y: q.node_y ?? 0 }, data };
  });
}

function toFlowEdges(connections: QuestionConnection[]): AppEdge[] {
  return connections.map(c => {
    const color = CHOICE_COLORS[c.from_choice_label] ?? '#6366f1';
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

const toolbarBtnStyle = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px',
  background: `${color}22`, border: `1px solid ${color}44`,
  borderRadius: 8, color: '#e2e8f0', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', transition: 'background 0.15s',
});

// ─── Inner canvas ─────────────────────────────────────────────────────────────

function EditorCanvas({
  nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange, onSave, saving, sessionId,
}: {
  nodes: AppNode[];
  edges: AppEdge[];
  setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>;
  onNodesChange: any;
  onEdgesChange: any;
  onSave: (publish: boolean) => void;
  saving: boolean;
  sessionId: string;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [editNode, setEditNode] = useState<AppNode | null>(null);
  const [inspectedNode, setInspectedNode] = useState<AppNode | null>(null);
  const [inspectorDraft, setInspectorDraft] = useState<AppNodeData | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const closeCtx = useCallback(() => setCtxMenu(null), []);

  const addNode = useCallback((type: AppNodeType, pos: { x: number; y: number }) => {
    const id = `${type}-${Date.now()}`;
    const isFirst = nodes.length === 0;
    const data: AppNodeData =
      type === 'normalNode' ? { ...defaultNormalData(), is_entry_point: isFirst } :
      type === 'situationNode' ? { ...defaultSituationData(), is_entry_point: isFirst } :
      { ...defaultEndData(), is_entry_point: false }; // end nodes never start a session
    setNodes(ns => [...ns, { id, type, position: pos, data } as AppNode]);
  }, [nodes.length, setNodes]);

  const onConnect = useCallback((params: Connection) => {
    if (params.sourceHandle === 'all') {
      // Connect all 4 choices to the target at once — Unreal Engine style
      setEdges(es => {
        const filtered = es.filter(
          e => !(e.source === params.source && ['A', 'B', 'C', 'D'].includes(e.sourceHandle ?? ''))
        );
        const newEdges: AppEdge[] = ['A', 'B', 'C', 'D'].map(label => {
          const color = CHOICE_COLORS[label];
          return {
            id: `${params.source}-${label}-${params.target}`,
            source: params.source!,
            sourceHandle: label,
            target: params.target!,
            style: { stroke: color, strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
          };
        });
        return [...filtered, ...newEdges];
      });
      return;
    }
    const color = CHOICE_COLORS[params.sourceHandle ?? ''] ?? '#6366f1';
    setEdges(es => addEdge({
      ...params,
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    }, es));
  }, [setEdges]);

  const onPaneCtx = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'canvas', flowX: flow.x, flowY: flow.y });
  }, [screenToFlowPosition]);

  const onNodeCtx = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault(); e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'node', nodeId: node.id });
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const n = node as AppNode;
    setInspectedNode(n);
    setInspectorDraft(structuredClone(n.data as AppNodeData));
  }, []);

  const applyInspector = useCallback((draft: AppNodeData) => {
    setInspectorDraft(draft);
    if (inspectedNode) {
      setNodes(ns => ns.map(n => n.id === inspectedNode.id ? { ...n, data: draft } as AppNode : n));
    }
  }, [inspectedNode, setNodes]);

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
      {/* Handle hover / connecting states */}
      <style>{`
        .react-flow__handle:hover {
          transform: scale(1.6) !important;
          box-shadow: 0 0 0 3px rgba(255,255,255,0.15), 0 0 14px rgba(255,255,255,0.35) !important;
          transition: transform 0.1s, box-shadow 0.1s !important;
        }
        .react-flow__handle[data-handleid="all"]:hover {
          transform: scale(1.7) !important;
          box-shadow: 0 0 0 4px rgba(255,255,255,0.25), 0 0 18px rgba(255,255,255,0.6) !important;
        }
        .react-flow__handle.connecting {
          transform: scale(1.5) !important;
          box-shadow: 0 0 0 4px rgba(99,102,241,0.4), 0 0 16px rgba(99,102,241,0.7) !important;
        }
        .react-flow__handle.valid {
          transform: scale(1.7) !important;
          box-shadow: 0 0 0 4px rgba(52,211,153,0.4), 0 0 18px rgba(52,211,153,0.7) !important;
          background: #34d399 !important;
        }
        .react-flow__edge.selected .react-flow__edge-path {
          stroke: #ffffff !important;
          stroke-width: 3 !important;
          filter: drop-shadow(0 0 6px rgba(255,255,255,0.55));
        }
      `}</style>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange as any} onEdgesChange={onEdgesChange as any}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDblClick}
        onPaneClick={() => { closeCtx(); setInspectedNode(null); setInspectorDraft(null); }}
        onPaneContextMenu={onPaneCtx}
        onNodeContextMenu={onNodeCtx}
        nodeTypes={nodeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid snapGrid={[16, 16]}
        fitView fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{ type: 'default', animated: false }}
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
          <button onClick={() => addNode('endNode', { x: 80 + nodes.length * 30, y: 80 + nodes.length * 20 })} style={toolbarBtnStyle('#f43f5e')} title="Add End Node">
            <span style={{ fontSize: 14 }}>🏁</span> End Node
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

      {/* Node Inspector — outside ReactFlow to avoid overflow:hidden clipping */}
      {inspectedNode && inspectorDraft && (() => {
        const d = inspectorDraft;
        const isNormal = inspectedNode.type === 'normalNode';
        const isEnd = inspectedNode.type === 'endNode';
        const nd = isNormal ? d as NormalNodeData : null;
        const COLORS: Record<string, string> = { A: '#ef4444', B: '#3b82f6', C: '#22c55e', D: '#f59e0b' };
        const inputStyle: React.CSSProperties = {
          width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, padding: '4px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none',
        };
        return (
          <div style={{
            position: 'absolute', top: 56, left: 12, zIndex: 20,
            width: 256,
            maxHeight: 'calc(100% - 80px)',
            overflowY: 'auto',
            background: 'rgba(8,8,20,0.97)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 11,
            color: '#e2e8f0',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 10, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {isNormal ? '❓ Question' : isEnd ? '🏁 End' : '🎬 Situation'}
              </span>
              <button
                onClick={() => { setInspectedNode(null); setInspectorDraft(null); }}
                style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
              >✕</button>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#6b7280', fontSize: 10, marginBottom: 3 }}>Text</div>
              <textarea
                value={d.question_text}
                onChange={e => applyInspector({ ...d, question_text: e.target.value })}
                rows={2}
                placeholder={isNormal ? 'Question text…' : isEnd ? 'Final message…' : 'Scene description…'}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            {/* End nodes can never be entry points — hide the toggle */}
            {!isEnd && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ color: '#9ca3af' }}>Entry point</span>
                <div
                  onClick={() => applyInspector({ ...d, is_entry_point: !d.is_entry_point })}
                  style={{
                    width: 32, height: 17, borderRadius: 9, cursor: 'pointer', transition: 'background 0.2s',
                    background: d.is_entry_point ? '#10b981' : 'rgba(255,255,255,0.12)',
                    display: 'flex', alignItems: 'center', padding: '0 2px',
                  }}
                >
                  <div style={{
                    width: 13, height: 13, borderRadius: '50%', background: '#fff',
                    transition: 'transform 0.2s',
                    transform: d.is_entry_point ? 'translateX(15px)' : 'translateX(0)',
                  }} />
                </div>
              </div>
            )}

            {nd && (
              <>
                <div style={{ color: '#6b7280', fontSize: 10, marginBottom: 4 }}>Choices</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {nd.choices?.map((c, idx) => (
                    <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%', background: COLORS[c.label] ?? '#6366f1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 8, fontWeight: 800, flexShrink: 0,
                      }}>{c.label}</span>
                      <input
                        value={c.choice_text}
                        onChange={e => {
                          const choices = [...(nd.choices ?? [])];
                          choices[idx] = { ...choices[idx], choice_text: e.target.value };
                          applyInspector({ ...d, choices } as NormalNodeData);
                        }}
                        placeholder={`Choice ${c.label}`}
                        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                      />
                      <input
                        type="number"
                        step={1}
                        value={c.points}
                        onChange={e => {
                          const v = e.target.value === '' ? 0 : Math.trunc(Number(e.target.value));
                          const choices = [...(nd.choices ?? [])];
                          choices[idx] = { ...choices[idx], points: Number.isFinite(v) ? v : 0 };
                          applyInspector({ ...d, choices } as NormalNodeData);
                        }}
                        title="Points awarded for this choice (negative allowed)"
                        style={{
                          flexShrink: 0, width: 38, height: 20, borderRadius: 4,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: c.points > 0
                            ? 'rgba(52,211,153,0.15)'
                            : c.points < 0
                              ? 'rgba(251,113,133,0.15)'
                              : 'rgba(255,255,255,0.04)',
                          color: c.points > 0 ? '#34d399' : c.points < 0 ? '#fb7185' : '#9ca3af',
                          fontSize: 10, textAlign: 'center', outline: 'none',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ color: '#9ca3af' }}>Timer override</span>
                  {nd.timer_override !== null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number" min={5} max={120}
                        value={nd.timer_override}
                        onChange={e => applyInspector({ ...d, timer_override: Number(e.target.value) } as NormalNodeData)}
                        style={{ ...inputStyle, width: 52, textAlign: 'center' }}
                      />
                      <span style={{ color: '#6b7280' }}>s</span>
                      <button
                        onClick={() => applyInspector({ ...d, timer_override: null } as NormalNodeData)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                      >✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => applyInspector({ ...d, timer_override: 30 } as NormalNodeData)}
                      style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 5, color: '#a5b4fc', cursor: 'pointer', fontSize: 10, padding: '2px 8px' }}
                    >+ Set</button>
                  )}
                </div>
              </>
            )}

            {d.media_url && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 6 }}>
                {d.media_type === 'video' ? '🎬 Video' : '🖼 Image'} attached
              </div>
            )}
          </div>
        );
      })()}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} mode={ctxMenu.mode}
          isEntryPoint={(ctxNodeData as AppNodeData | undefined)?.is_entry_point}
          onAddNormal={() => addNode('normalNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onAddSituation={() => addNode('situationNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onAddEnd={() => addNode('endNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onEdit={() => { const n = nodes.find(n => n.id === ctxMenu.nodeId); if (n) setEditNode(n); }}
          onSetEntry={() => ctxMenu.nodeId && setAsEntry(ctxMenu.nodeId)}
          onDelete={() => ctxMenu.nodeId && deleteNode(ctxMenu.nodeId)}
          onClose={closeCtx}
        />
      )}

      <EditNodeModal
        node={editNode ? { id: editNode.id, type: editNode.type as 'normalNode' | 'situationNode', data: editNode.data } : null}
        sessionId={sessionId}
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
  const [timerSeconds, setTimerSeconds] = useState<number | null>(30);
  const [isPrivate, setIsPrivate] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [shareToken, setShareToken] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
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
        setTimerSeconds(session.timer_seconds ?? null);
        setIsPrivate(session.is_private ?? false);
        setPinCode(session.pin_code ?? '');
        setShareToken(session.share_token ?? '');
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
        body: JSON.stringify({ name: sessionName, description, timer_seconds: timerSeconds, is_published: publish, is_private: isPrivate }),
      });
      if (!sesRes.ok) throw new Error((await sesRes.json()).error);

      // 2. Delete existing questions
      await fetch(`/api/questions/sessions/${sessionId}/graph`, { method: 'DELETE' });

      // 3. Re-create questions, map tempId → realId
      const idMap: Record<string, string> = {};
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isNormal = node.type === 'normalNode';
        const isEnd = node.type === 'endNode';
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
          node_type: isNormal ? 'normal' : isEnd ? 'end' : 'situation',
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
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Default Timer</label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <div
                onClick={() => setTimerSeconds(v => v === null ? 30 : null)}
                className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${timerSeconds === null ? 'bg-white/10' : 'bg-indigo-600'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${timerSeconds === null ? 'translate-x-0' : 'translate-x-4'}`} />
              </div>
              <span className="text-sm text-gray-400">{timerSeconds === null ? 'No timer' : 'Timed'}</span>
            </label>
            {timerSeconds !== null && (
              <Input type="number" value={timerSeconds} onChange={e => setTimerSeconds(Number(e.target.value))} min={5} max={120} placeholder="30" />
            )}
          </div>
        </div>
      </div>

      {/* Session settings bar */}
      <div className="flex flex-wrap items-center gap-3 flex-shrink-0 px-1">
        {/* Private toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setIsPrivate(v => !v)}
            className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${isPrivate ? 'bg-indigo-600' : 'bg-white/10'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${isPrivate ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <span className="text-sm text-gray-300">Private</span>
        </label>

        {/* PIN display */}
        {pinCode && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10">
            <span className="text-xs text-gray-500">PIN</span>
            <span className="font-mono text-sm font-bold text-white tracking-widest">{pinCode}</span>
          </div>
        )}

        {/* Share link */}
        {shareToken && (
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/join/${shareToken}`);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
            className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            {linkCopied ? 'Copied!' : 'Copy Join Link'}
          </button>
        )}

        {/* Open Lobby */}
        <button
          onClick={() => router.push(`/admin/questions/${sessionId}/lobby`)}
          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-sm text-indigo-400 hover:bg-indigo-600/30 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Open Lobby
        </button>
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
              sessionId={sessionId}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
