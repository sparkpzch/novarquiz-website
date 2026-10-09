'use client';

/**
 * EditorCanvas — shared ReactFlow canvas used by both the Create and Edit pages.
 *
 * Props:
 *   sessionId  — real session UUID on the edit page, or 'draft' on the create page.
 *   quizId     — quiz UUID, used as the upload folder.
 * Saving lives in the page header (EditorHeader); this component only edits
 * the in-memory nodes/edges.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useToast } from '@/components/ui/Toast';
import {
  DEFAULT_CHOICE_METADATA,
} from '@/lib/analytics/quiz-metadata';
import { NormalNode, type NormalNodeData } from './NormalNode';
import { SituationNode, type SituationNodeData } from './SituationNode';
import { EndNode, type EndNodeData } from './EndNode';
import { ContextMenu } from './ContextMenu';
import { LeftInspector, type InspectorNode } from './LeftInspector';
import { NodeIcon } from './NodeIcon';
import { MAX_ZOOM, MIN_ZOOM, useCanvasGestures } from './useCanvasGestures';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const SHORTCUTS: Array<[string, string]> = [
  ['Pan', 'Two-finger scroll · Space + drag'],
  ['Zoom', `Pinch · ${MOD} + scroll`],
  ['Select several', `Drag on empty canvas · ${MOD} + click`],
  ['Zoom in / out', `${MOD} + / ${MOD} −`],
  ['Fit all nodes', 'Shift + 1'],
  ['Zoom to 100%', `Shift + 0 · ${MOD} 0`],
  ['Delete selected', 'Delete / Backspace'],
  ['Add node', 'Right-click the canvas'],
];
import { CHOICE_COLORS, setHandleTarget } from '@/lib/quiz-editor/graph';

export { CHOICE_COLORS };

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
  /** Real session UUID (edit page) or 'draft' (create page) */
  sessionId?: string;
  /** Quiz UUID from DB — used as Firebase Storage folder to avoid slug encoding issues */
  quizId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function EditorCanvas({
  nodes, edges, setNodes, setEdges,
  onNodesChange, onEdgesChange,
  sessionId = 'draft',
  quizId,
}: EditorCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const { showToast } = useToast();
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  // Store only the id and read the node from `nodes`, so the inspector always
  // shows live data and clears itself when the node is deleted (Del key).
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspectedNode = useMemo(() => nodes.find(n => n.id === inspectedId) ?? null, [nodes, inspectedId]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  useCanvasGestures(canvasRef);
  const [uploadStatus, setUploadStatus] = useState<{ nodeId: string; uploading: boolean; progress: number } | null>(null);

  // ── Inspector helpers ──────────────────────────────────────────────────────

  const questionOptions = nodes.map((n, idx) => {
    const d = n.data as AppNodeData;
    const kind = n.type === 'endNode' ? 'End' : n.type === 'situationNode' ? 'Situation' : 'Question';
    return {
      id: n.id,
      label: `#${idx + 1} ${kind} · ${d.node_name || d.question_text?.slice(0, 40) || 'Untitled'}`,
    };
  });

  const inspectorConnections = (node: AppNode | null): Record<string, string> => {
    if (!node) return {};
    return Object.fromEntries(
      edges
        .filter(e => e.source === node.id && e.sourceHandle)
        .map(e => [e.sourceHandle!, e.target])
    );
  };

  const applyInspector = useCallback((id: string, data: AppNodeData) => {
    setNodes(ns => {
      // Turning on "Start Node" moves the start here; there is only one.
      const becameStart = data.is_entry_point && !ns.find(n => n.id === id)?.data.is_entry_point;
      return ns.map(n => n.id === id
        ? { ...n, data } as AppNode
        : becameStart && n.data.is_entry_point ? { ...n, data: { ...n.data, is_entry_point: false } } as AppNode : n);
    });
  }, [setNodes]);

  const [uploadDraftId] = useState(() => crypto.randomUUID());
  const latestUploads = useRef(new Map<string, string>());
  const applyMedia = useCallback((nodeId: string, media: { media_type: string; media_url: string | null; media_path: string }) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...media } } as AppNode : n));
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
          }
        } catch { /* Retry on the next poll; the worker continues independently. */ }
      }
    };
    void poll(); const timer = setInterval(() => void poll(), 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [nodes, setNodes]);

  const handleConnectionChange = useCallback((choiceLabel: string, toQuestionId: string | null) => {
    if (!inspectedId) return;
    setEdges(es => setHandleTarget(es, inspectedId, choiceLabel, toQuestionId));
  }, [inspectedId, setEdges]);

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
    setInspectedId(id);
  }, [nodes.length, setNodes]);

  // Toolbar adds land in the middle of what is on screen (staggered so
  // repeated clicks don't stack exactly), not at a fixed spot that may be
  // scrolled out of view.
  const addNodeInView = useCallback((type: AppNodeType) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 80, y: 80 };
    const offset = (nodes.length % 5) * 24;
    addNode(type, { x: center.x - 124 + offset, y: center.y - 90 + offset });
  }, [addNode, nodes.length, screenToFlowPosition]);

  const deleteNode = useCallback((id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
  }, [setNodes, setEdges]);

  const setAsEntry = useCallback((id: string) => {
    setNodes(ns => ns.map(n => (n.data.is_entry_point === (n.id === id) ? n : {
      ...n, data: { ...n.data, is_entry_point: n.id === id },
    }) as AppNode));
  }, [setNodes]);

  // ── Edge handlers ──────────────────────────────────────────────────────────

  const onConnect = useCallback((params: Connection) => {
    const { source, target, sourceHandle } = params;
    if (!source || !target) return;
    if (sourceHandle === 'all') {
      // Unreal-Engine-style: connect every choice handle at once
      const node = nodes.find(n => n.id === source);
      const labels = ((node?.data as NormalNodeData | undefined)?.choices ?? []).map(c => c.label);
      setEdges(es => (labels.length ? labels : ['A', 'B', 'C', 'D'])
        .reduce((acc, label) => setHandleTarget(acc, source, label, target), es));
      return;
    }
    // One target per handle: a new connection replaces the old one.
    setEdges(es => setHandleTarget(es, source, sourceHandle ?? 'A', target));
  }, [nodes, setEdges]);

  // Box-select makes deleting many nodes one keypress away, and there is no
  // undo, so confirm anything beyond a single node.
  const onBeforeDelete = useCallback(async ({ nodes: doomed }: { nodes: AppNode[]; edges: AppEdge[] }) => (
    doomed.length <= 1 || window.confirm(`Delete ${doomed.length} nodes and their connections?`)
  ), []);

  // A node routing to itself would loop the player forever.
  const isValidConnection = useCallback((c: Connection | AppEdge) => c.source !== c.target, []);

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
    setInspectedId(node.id);
  }, []);

  // A click where the pointer moves even a pixel is a drag to React Flow, so
  // onNodeClick never fires — yet the node still becomes selected. Inspect on
  // drag start too, or the panel keeps showing the previous node.
  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    setInspectedId(node.id);
  }, []);

  const ctxNodeData = ctxMenu?.nodeId
    ? nodes.find(n => n.id === ctxMenu.nodeId)?.data as AppNodeData | undefined
    : undefined;

  const inspectorNode: InspectorNode | null = useMemo(() => inspectedNode
    ? {
      id: inspectedNode.id,
      type: inspectedNode.type as 'normalNode' | 'situationNode' | 'endNode',
      data: inspectedNode.data as AppNodeData,
    }
    : null, [inspectedNode]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="nq-node-editor" style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>

      {/* ── Left Inspector ── */}
      <LeftInspector
        selectedNode={inspectorNode}
        questionOptions={questionOptions}
        onChange={applyInspector}
        connections={inspectorConnections(inspectedNode)}
        onConnectionChange={handleConnectionChange}
        sessionId={sessionId}
        onUpload={(file) => inspectedNode && handleFileUpload(inspectedNode.id, file)}
        uploadStatus={uploadStatus?.nodeId === inspectedNode?.id ? uploadStatus : null}
      />

      {/* ── Canvas ── */}
      <div ref={canvasRef} style={{ flex: 1, position: 'relative', height: '100%', minWidth: 0 }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeClick}
          onNodeDragStart={onNodeDragStart}
          onPaneClick={() => { closeCtx(); setInspectedId(null); setShowShortcuts(false); }}
          onPaneContextMenu={onPaneCtx}
          onNodeContextMenu={onNodeCtx}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          onBeforeDelete={onBeforeDelete}
          // Figma-style navigation: two-finger scroll pans, pinch / ⌘-scroll
          // zooms, dragging empty canvas box-selects, Space/middle-drag pans.
          panOnScroll
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnDrag={[1]}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          snapToGrid snapGrid={[16, 16]}
          fitView fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{ type: 'default', animated: false }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="var(--ne-dots)" gap={24} size={1.5} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => n.type === 'endNode' ? 'var(--ne-end)' : n.type === 'situationNode' ? 'var(--ne-situation)' : 'var(--ne-question)'}
            nodeBorderRadius={6}
            maskColor="var(--ne-mask)"
          />

          {/* Toolbar */}
          <div className="nq-ne-card" style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 6, alignItems: 'center', padding: 5, borderRadius: 10 }}>
            <span className="nq-ne-eyebrow" style={{ padding: '0 4px 0 6px' }}>Add</span>
            {([
              ['normalNode', 'question', 'var(--ne-question)', 'Question'],
              ['situationNode', 'situation', 'var(--ne-situation)', 'Situation'],
              ['endNode', 'end', 'var(--ne-end)', 'End'],
            ] as const).map(([type, icon, color, label]) => (
              <button key={type} type="button" onClick={() => addNodeInView(type)} className="nq-ne-btn" title={`Add ${label} Node`}>
                <span style={{ color, display: 'flex' }}><NodeIcon name={icon} size={15} /></span>
                {label}
              </button>
            ))}
            <span style={{ width: 1, height: 20, background: 'var(--nq-line)', margin: '0 2px' }} />
            <button
              type="button"
              className="nq-ne-btn"
              aria-expanded={showShortcuts}
              onClick={() => setShowShortcuts(v => !v)}
              style={{ border: 'none', color: 'var(--nq-muted)' }}
            >
              Shortcuts
            </button>
          </div>

          {showShortcuts && (
            <div
              className="nq-ne-card"
              role="dialog"
              aria-label="Canvas shortcuts"
              style={{ position: 'absolute', top: 58, left: 12, zIndex: 11, width: 320, padding: '10px 14px', boxShadow: '0 6px 16px rgba(22,50,79,0.14)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--nq-ink)' }}>Shortcuts</span>
                <button type="button" onClick={() => setShowShortcuts(false)} aria-label="Close shortcuts"
                  style={{ border: 0, background: 'none', color: 'var(--nq-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 14px', fontSize: 12 }}>
                {SHORTCUTS.map(([action, keys]) => (
                  <div key={action} style={{ display: 'contents' }}>
                    <dt style={{ color: 'var(--nq-muted)' }}>{action}</dt>
                    <dd style={{ margin: 0, color: 'var(--nq-ink)', fontWeight: 500 }}>{keys}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Empty state */}
          {nodes.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
              <div style={{ textAlign: 'center', maxWidth: 300 }}>
                <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--nq-ink)' }}>This quiz has no nodes yet</p>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--nq-muted)', margin: 0 }}>Add a question from the toolbar to get started. Drag from a dot on one node to another to connect them.</p>
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
          canBeStart={nodes.find(n => n.id === ctxMenu.nodeId)?.type !== 'endNode'}
          onAddNormal={() => addNode('normalNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onAddSituation={() => addNode('situationNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onAddEnd={() => addNode('endNode', { x: ctxMenu.flowX!, y: ctxMenu.flowY! })}
          onEdit={() => ctxMenu.nodeId && setInspectedId(ctxMenu.nodeId)}
          onSetEntry={() => ctxMenu.nodeId && setAsEntry(ctxMenu.nodeId)}
          onDelete={() => ctxMenu.nodeId && deleteNode(ctxMenu.nodeId)}
          onClose={closeCtx}
        />
      )}
    </div>
  );
}
