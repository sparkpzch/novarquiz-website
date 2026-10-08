'use client';

/**
 * EditorCanvas — shared ReactFlow canvas used by both the Create and Edit pages.
 *
 * Props:
 *   sessionId  — real session UUID on the edit page, or 'draft' on the create page.
 *                Used only by EditNodeModal for Firebase Storage paths.
 *   onSave     — called with `publish: boolean` when the page-level Save/Publish
 *                buttons are clicked. The page is responsible for the API calls.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useReactFlow,
  MarkerType,
  type Connection,
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  DEFAULT_CHOICE_METADATA,
} from '@/lib/analytics/quiz-metadata';
import { NormalNode, type NormalNodeData } from './NormalNode';
import { SituationNode, type SituationNodeData } from './SituationNode';
import { EndNode, type EndNodeData } from './EndNode';
import { ContextMenu } from './ContextMenu';
import { LeftInspector, type InspectorNode } from './LeftInspector';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppNodeData = NormalNodeData | SituationNodeData | EndNodeData;
export type AppNodeType = 'normalNode' | 'situationNode' | 'endNode';
export type AppNode = Node<AppNodeData, AppNodeType>;
export type AppEdge = Edge;

interface CtxMenu {
  x: number; y: number;
  mode: 'canvas' | 'node';
  nodeId?: string;
  flowX?: number; flowY?: number;
}

export interface EditorCanvasProps {
  nodes: AppNode[];
  edges: AppEdge[];
  setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>;
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange<AppEdge>;
  /** Called when the Save button is clicked */
  onSave: () => void;
  saving: boolean;
  /** Real session UUID (edit page) or 'draft' (create page) */
  sessionId?: string;
  /** Quiz UUID from DB — used as Firebase Storage folder to avoid slug encoding issues */
  quizId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CHOICE_COLORS: Record<string, string> = {
  A: '#ef4444', B: '#3b82f6', C: '#22c55e', D: '#f59e0b', continue: '#8b5cf6',
};

const QUESTION_NODE_ACCENT = '#70A2F9';
const EDITOR_CANVAS_BG = '#eef4ff';
const EDITOR_PANEL_BG = 'rgba(236,244,255,0.86)';
const EDITOR_PANEL_BORDER = 'rgba(112,162,249,0.22)';

const nodeTypes: NodeTypes = {
  normalNode: NormalNode,
  situationNode: SituationNode,
  endNode: EndNode,
};

// ─── Default node data factories ─────────────────────────────────────────────

export const defaultNormalData = (): NormalNodeData => ({
  node_name: null,
  question_text: '',
  choices: [
    { label: 'A', choice_text: '', score_impact: 0, explanation: '', ...DEFAULT_CHOICE_METADATA },
    { label: 'B', choice_text: '', score_impact: 0, explanation: '', ...DEFAULT_CHOICE_METADATA },
    { label: 'C', choice_text: '', score_impact: 0, explanation: '', ...DEFAULT_CHOICE_METADATA },
    { label: 'D', choice_text: '', score_impact: 0, explanation: '', ...DEFAULT_CHOICE_METADATA },
  ],
  media_type: null,
  media_url: null,
  media_explanation: null,
  media_path: null,
  is_entry_point: false,
  timer_override: null,
});

export const defaultSituationData = (): SituationNodeData => ({
  node_name: null,
  question_text: '',
  media_type: null,
  media_url: null,
  media_explanation: null,
  media_path: null,
  is_entry_point: false,
});

export const defaultEndData = (): EndNodeData => ({
  node_name: null,
  question_text: '',
  media_type: null,
  media_url: null,
  media_explanation: null,
  media_path: null,
  is_entry_point: false,
});

// ─── Toolbar button style helper ─────────────────────────────────────────────

export const toolbarBtnStyle = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px',
  background: `${color}22`, border: `1px solid ${color}44`,
  borderRadius: 8, color: '#223a63', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', transition: 'background 0.15s',
});

// ─── Component ────────────────────────────────────────────────────────────────

export function EditorCanvas({
  nodes, edges, setNodes, setEdges,
  onNodesChange, onEdgesChange,
  onSave, saving,
  sessionId = 'draft',
  quizId,
}: EditorCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const { showToast } = useToast();
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [inspectedNode, setInspectedNode] = useState<AppNode | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ nodeId: string; uploading: boolean; progress: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Inspector helpers ──────────────────────────────────────────────────────

  const questionOptions = nodes.map((n, idx) => ({
    id: n.id,
    label: `#${idx + 1} ${(n.data as AppNodeData).question_text?.slice(0, 40) || `(${n.type})`}`,
  }));

  const inspectorConnections = (node: AppNode | null): Record<string, string> => {
    if (!node) return {};
    return Object.fromEntries(
      edges
        .filter(e => e.source === node.id && e.sourceHandle)
        .map(e => [e.sourceHandle!, e.target])
    );
  };

  const applyInspector = useCallback((id: string, data: AppNodeData) => {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data } as AppNode : n));
    setInspectedNode(prev => prev?.id === id ? { ...prev, data: { ...data } } as AppNode : prev);
  }, [setNodes]);

  const [uploadDraftId] = useState(() => crypto.randomUUID());
  const latestUploads = useRef(new Map<string, string>());
  const applyMedia = useCallback((nodeId: string, media: { media_type: string; media_url: string | null; media_path: string }) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...media } } as AppNode : n));
    setInspectedNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...media } } as AppNode : prev);
  }, [setNodes]);
  const handleFileUpload = useCallback(async (nodeId: string, file: File) => {
    const scope = quizId ? {quizId} : {draftId:uploadDraftId};
    const requestId = crypto.randomUUID();
    latestUploads.current.set(nodeId, requestId);
    setUploadStatus({ nodeId, uploading: true, progress: 0 });
    try {
      let data;
      if (file.type.startsWith('video/')) {
        const init = await fetch('/api/upload/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'init', type: file.type, size: file.size, ...scope }) });
        const session = await init.json();
        if (!init.ok) throw new Error(session.error || 'Upload failed');
        await new Promise<void>((resolve, reject) => {
          const upload = new XMLHttpRequest(); upload.open('PUT', session.uploadUrl);
          upload.setRequestHeader('Content-Type', file.type);
          upload.upload.onprogress = event => { if (event.lengthComputable && latestUploads.current.get(nodeId) === requestId) setUploadStatus({ nodeId, uploading: true, progress: Math.round(event.loaded / event.total * 100) }); };
          upload.onload = () => upload.status >= 200 && upload.status < 300 ? resolve() : reject(new Error('Upload failed. Please retry.'));
          upload.onerror = () => reject(new Error('Upload failed. Check your connection.'));
          upload.send(file);
        });
        const finish = await fetch('/api/upload/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'finish', id: session.id, ext: session.ext, ...scope }) });
        data = await finish.json();
        if (!finish.ok) throw new Error(data.error || 'Upload failed');
      } else {
        const form = new FormData(); form.set('file', file);
        form.set(quizId ? 'quizId' : 'draftId', quizId ?? uploadDraftId);
        const response = await fetch('/api/upload', { method: 'POST', headers:quizId?{'X-Quiz-Id':quizId}:{'X-Upload-Draft-Id':uploadDraftId}, body: form });
        data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed');
      }
      if (latestUploads.current.get(nodeId) !== requestId) return;
      applyMedia(nodeId, { media_type: file.type.startsWith('video/') ? 'video' : file.type === 'image/gif' ? 'gif' : 'image', media_url: data.url, media_path: data.path });
      setUploadStatus(null);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Upload failed', 'error'); setUploadStatus(null); }
  }, [applyMedia, showToast, quizId, uploadDraftId]);

  // A saved draft retains the source path, so processing resumes after closing
  // and reopening the editor. Only update nodes still pointing at that source.
  useEffect(() => {
    let stopped = false;
    const pending = nodes.flatMap(node => {
      const path = (node.data as AppNodeData).media_path;
      const id = path?.match(/^quiz-media\/original-([a-f0-9-]+)\.(mp4|mov)$/)?.[1];
      return id ? [{ nodeId: node.id, id, path }] : [];
    });
    if (!pending.length) return;
    const poll = async () => {
      for (const item of pending) {
        try {
          const response = await fetch(`/api/video-processing/${item.id}`, { cache: 'no-store' });
          if (!response.ok) continue;
          const job = await response.json();
          if (stopped) return;
          if (job.status === 'ready') {
            setNodes(ns => ns.map(n => n.id === item.nodeId && (n.data as AppNodeData).media_path === item.path
              ? { ...n, data: { ...n.data, media_url: job.url, media_path: job.path } } as AppNode : n));
            setInspectedNode(prev => prev?.id === item.nodeId && prev.data.media_path === item.path
              ? { ...prev, data: { ...prev.data, media_url: job.url, media_path: job.path } } as AppNode : prev);
          }
        } catch { /* Retry on the next poll; the worker continues independently. */ }
      }
    };
    void poll(); const timer = setInterval(() => void poll(), 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [nodes, setNodes]);

  const handleConnectionChange = useCallback((choiceLabel: string, toQuestionId: string | null) => {
    if (!inspectedNode) return;
    const color = CHOICE_COLORS[choiceLabel] ?? QUESTION_NODE_ACCENT;
    setEdges(es => {
      const filtered = es.filter(e => !(e.source === inspectedNode.id && e.sourceHandle === choiceLabel));
      if (!toQuestionId) return filtered;
      return [
        ...filtered,
        {
          id: `${inspectedNode.id}-${choiceLabel}-${toQuestionId}`,
          source: inspectedNode.id,
          sourceHandle: choiceLabel,
          target: toQuestionId,
          style: { stroke: color, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        },
      ];
    });
  }, [inspectedNode, setEdges]);

  // ── Node operations ────────────────────────────────────────────────────────

  const closeCtx = useCallback(() => setCtxMenu(null), []);

  const addNode = useCallback((type: AppNodeType, pos: { x: number; y: number }) => {
    const id = `${type}-${Date.now()}`;
    const isFirst = nodes.length === 0;
    const data: AppNodeData =
      type === 'normalNode' ? { ...defaultNormalData(), is_entry_point: isFirst } :
        type === 'situationNode' ? { ...defaultSituationData(), is_entry_point: isFirst } :
          { ...defaultEndData(), is_entry_point: false };
    setNodes(ns => [...ns, { id, type, position: pos, data } as AppNode]);
  }, [nodes.length, setNodes]);

  const deleteNode = useCallback((id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
  }, [setNodes, setEdges]);

  const setAsEntry = useCallback((id: string) => {
    setNodes(ns => ns.map(n => ({
      ...n, data: { ...n.data, is_entry_point: n.id === id },
    }) as AppNode));
  }, [setNodes]);

  // ── Edge handlers ──────────────────────────────────────────────────────────

  const onConnect = useCallback((params: Connection) => {
    if (params.sourceHandle === 'all') {
      // Unreal-Engine-style: connect all 4 choice handles at once
      setEdges(es => {
        const filtered = es.filter(
          e => !(e.source === params.source && ['A', 'B', 'C', 'D'].includes(e.sourceHandle ?? ''))
        );
        return [
          ...filtered,
          ...['A', 'B', 'C', 'D'].map(label => {
            const color = CHOICE_COLORS[label];
            return {
              id: `${params.source}-${label}-${params.target}`,
              source: params.source!,
              sourceHandle: label,
              target: params.target!,
              style: { stroke: color, strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
            };
          }),
        ];
      });
      return;
    }
    const color = CHOICE_COLORS[params.sourceHandle ?? ''] ?? QUESTION_NODE_ACCENT;
    setEdges(es => addEdge({
      ...params,
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    }, es));
  }, [setEdges]);


  // ── Event handlers ─────────────────────────────────────────────────────────

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
    setInspectedNode(node as AppNode);
  }, []);

  const onNodeDblClick = useCallback((_: React.MouseEvent, node: Node) => {
    setInspectedNode(node as AppNode);
  }, []);

  // A click where the pointer moves even a pixel is a drag to React Flow, so
  // onNodeClick never fires — yet the node still becomes selected. Inspect on
  // drag start too, or the panel keeps showing the previous node.
  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    setInspectedNode(node as AppNode);
  }, []);

  const ctxNodeData = ctxMenu?.nodeId
    ? nodes.find(n => n.id === ctxMenu.nodeId)?.data as AppNodeData | undefined
    : undefined;

  const inspectorNode: InspectorNode | null = inspectedNode
    ? {
      id: inspectedNode.id,
      type: inspectedNode.type as 'normalNode' | 'situationNode' | 'endNode',
      data: inspectedNode.data as AppNodeData,
    }
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>

      {/* ── Left Inspector ── */}
      <LeftInspector
        selectedNode={inspectorNode}
        questionOptions={questionOptions}
        onChange={applyInspector}
        onSave={applyInspector}
        connections={inspectorConnections(inspectedNode)}
        onConnectionChange={handleConnectionChange}
        sessionId={sessionId}
        onUpload={(file) => inspectedNode && handleFileUpload(inspectedNode.id, file)}
        uploadStatus={uploadStatus?.nodeId === inspectedNode?.id ? uploadStatus : null}
      />

      {/* ── Canvas ── */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
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
            box-shadow: 0 0 0 4px rgba(112,162,249,0.4), 0 0 16px rgba(112,162,249,0.7) !important;
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
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDblClick}
          onNodeDragStart={onNodeDragStart}
          onPaneClick={() => { closeCtx(); setInspectedNode(null); }}
          onPaneContextMenu={onPaneCtx}
          onNodeContextMenu={onNodeCtx}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          snapToGrid snapGrid={[16, 16]}
          fitView fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{ type: 'default', animated: false }}
          style={{ background: EDITOR_CANVAS_BG }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="rgba(112,162,249,0.18)" gap={24} size={1.5} />
          <Controls
            style={{
              background: EDITOR_PANEL_BG,
              border: `1px solid ${EDITOR_PANEL_BORDER}`,
              borderRadius: 10,
              boxShadow: '0 12px 28px rgba(101,137,195,0.18)',
              backdropFilter: 'blur(18px)',
            }}
            showInteractive={false}
          />
          <MiniMap
            style={{
              background: 'rgba(224,236,255,0.88)',
              border: `1px solid ${EDITOR_PANEL_BORDER}`,
              borderRadius: 10,
              boxShadow: '0 12px 28px rgba(101,137,195,0.18)',
              backdropFilter: 'blur(18px)',
            }}
            nodeColor={QUESTION_NODE_ACCENT} maskColor="rgba(8,8,15,0.7)"
          />

          {/* Toolbar */}
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => addNode('normalNode', { x: 80 + nodes.length * 30, y: 80 + nodes.length * 20 })} style={toolbarBtnStyle(QUESTION_NODE_ACCENT)} title="Add Question Node">
              <span style={{ fontSize: 14 }}>❓</span> Question Node
            </button>
            <button onClick={() => addNode('situationNode', { x: 80 + nodes.length * 30, y: 80 + nodes.length * 20 })} style={toolbarBtnStyle('#8b5cf6')} title="Add Situation Node">
              <span style={{ fontSize: 14 }}>🎬</span> Situation Node
            </button>
            <button onClick={() => addNode('endNode', { x: 80 + nodes.length * 30, y: 80 + nodes.length * 20 })} style={toolbarBtnStyle('#f43f5e')} title="Add End Node">
              <span style={{ fontSize: 14 }}>🏁</span> End Node
            </button>
            <div style={{ width: 1, height: 24, background: 'rgba(112,162,249,0.2)' }} />
            <span style={{ fontSize: 11, color: '#35527e', fontWeight: 600 }}>Right-click canvas · Del to remove</span>
          </div>

          {/* Save button */}
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
            <Button onClick={onSave} loading={saving} size="sm" style={{ color: '#ffffff', textShadow: '0 1px 1px rgba(0,0,0,0.12)' }}>Save</Button>
          </div>

          {/* Empty state */}
          {nodes.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
              <div style={{ textAlign: 'center', color: '#4e6b96', maxWidth: 320 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🕸</div>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: '#35527e' }}>Empty canvas</p>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: '#4e6b96', fontWeight: 500 }}>Right-click anywhere or use the toolbar above to add nodes.</p>
              </div>
            </div>
          )}
        </ReactFlow>
      </div>

      {/* Context menu — rendered outside ReactFlow to avoid overflow clipping */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} mode={ctxMenu.mode}
          isEntryPoint={(ctxNodeData as AppNodeData | undefined)?.is_entry_point}
          onAddNormal={() => addNode('normalNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onAddSituation={() => addNode('situationNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onAddEnd={() => addNode('endNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onEdit={() => { const n = nodes.find(n => n.id === ctxMenu.nodeId); if (n) setInspectedNode(n); }}
          onSetEntry={() => ctxMenu.nodeId && setAsEntry(ctxMenu.nodeId)}
          onDelete={() => ctxMenu.nodeId && deleteNode(ctxMenu.nodeId)}
          onClose={closeCtx}
        />
      )}
    </div>
  );
}
