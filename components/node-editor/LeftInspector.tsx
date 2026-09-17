'use client';

/**
 * LeftInspector — Canvas-side inspector panel for the admin quiz editor.
 *
 * Layout:  [ LeftInspector (fixed, left) ] | [ ReactFlow canvas (fills rest) ]
 *
 * Trigger: Click any node on the canvas → selectedNode is set → panel populates.
 * Auto-save: Every field change fires onChange immediately (live, no debounce).
 *            A "Save to Canvas" button also exists for explicit confirmation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
import { useFFmpeg } from '@/lib/hooks/useFFmpeg';
import { useToast } from '@/components/ui/Toast';
import AutoPlayVideo from '@/components/ui/AutoPlayVideo';
import {
  ALLOWED_USAGE_OPTIONS,
  HCP_VECTOR_KEYS,
  REVIEW_STATUS_OPTIONS,
  AUDIENCE_OPTIONS,
} from '@/lib/analytics/hcp';
import type { NormalNodeData } from './NormalNode';
import type { SituationNodeData } from './SituationNode';
import type { EndNodeData } from './EndNode';

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeType = 'normalNode' | 'situationNode' | 'endNode';
type NodeData = NormalNodeData | SituationNodeData | EndNodeData;

export interface InspectorNode {
  id: string;
  type: NodeType;
  data: NodeData;
}

interface QuestionOption {
  id: string;
  label: string; // e.g. "Q1 – What did you eat?"
}

export interface LeftInspectorProps {
  /** The node currently selected in the canvas. null = nothing selected. */
  selectedNode: InspectorNode | null;
  /** All question nodes in the graph — used to populate routing dropdowns. */
  questionOptions: QuestionOption[];
  /** Fired on every field change. Parent applies data to the canvas node. */
  onChange: (id: string, data: NodeData) => void;
  /** Optional explicit save handler. If omitted, auto-save only. */
  onSave?: (id: string, data: NodeData) => void;
  /** Connection map: { choiceLabel → toQuestionId } for the selected node */
  connections: Record<string, string>;
  /** Fires when the user changes a routing target in the inspector */
  onConnectionChange: (choiceLabel: string, toQuestionId: string | null) => void;
  /** The session ID for uploading media to Firebase Storage */
  sessionId: string;
  /** Triggered when a file is picked in the inspector */
  onUpload: (file: File) => void;
  /** External upload status (from parent) */
  uploadStatus: { uploading: boolean; progress: number } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHOICE_COLORS: Record<string, string> = {
  A: '#ef4444', B: '#3b82f6', C: '#22c55e', D: '#f59e0b',
};

const SCORE_PRESETS = [
  { label: '+10', value: 10, color: '#34d399' },
  { label: '+5', value: 5, color: '#6ee7b7' },
  { label: '0', value: 0, color: '#6b7280' },
  { label: '-5', value: -5, color: '#fca5a5' },
  { label: '-10', value: -10, color: '#fb7185' },
];

function parseCommaSeparated(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatKeyValueLines(value: Record<string, string> | undefined) {
  return Object.entries(value ?? {})
    .map(([key, val]) => `${key}:${val}`)
    .join('\n');
}

function parseKeyValueLines(value: string) {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split(':');
        return [key?.trim() ?? '', rest.join(':').trim()];
      })
      .filter(([key, val]) => key && val),
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#35527e', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {children}
      </span>
      {hint && <span style={{ fontSize: 9, color: '#6b7f9e', marginLeft: 5 }}>{hint}</span>}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />;
}

function ScoreButton({ value, active, onClick }: { value: number; active: boolean; onClick: () => void }) {
  const preset = SCORE_PRESETS.find(p => p.value === value);
  const color = preset?.color ?? (value > 0 ? '#34d399' : value < 0 ? '#fb7185' : '#6b7280');
  return (
    <button
      onClick={onClick}
      title={`Set score impact to ${value}`}
      style={{
        padding: '2px 7px',
        borderRadius: 5,
        border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
        background: active ? `${color}25` : 'transparent',
        color: active ? color : '#6b7280',
        fontSize: 10, fontWeight: 700, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {value > 0 ? `+${value}` : value}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LeftInspector({
  selectedNode,
  questionOptions,
  onChange,
  onSave,
  connections,
  onConnectionChange,
  onUpload,
  uploadStatus,
}: LeftInspectorProps) {
  const [draft, setDraft] = useState<NodeData | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [panelWidth, setPanelWidth] = useState(340);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [imgLoadError, setImgLoadError] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { load: loadFFmpeg, progress: ffmpegProgress, compressVideo } = useFFmpeg();
  const { showToast } = useToast();

  const handleFileUpload = async (file: File) => {
    if (!file || !selectedNode) return;

    if (file.type.startsWith('video/')) {
      setCompressing(true);
      try {
        await loadFFmpeg();
        const blob = await compressVideo(file);
        onUpload(new File([blob], file.name.replace(/\.[^.]+$/, '.mp4'), { type: 'video/mp4' }));
      } catch {
        // Falling back to the raw file uploads a video that was never run
        // through `-movflags +faststart`, so its moov atom may sit at the end
        // of the container. Safari then spends extra round trips seeking the
        // tail before it can start playback. Upload it anyway — blocking the
        // admin is worse — but never let this pass silently.
        showToast(
          'Video compression failed — uploading the original. It may load slowly on Safari; consider compressing it before upload.',
          'error',
        );
        onUpload(file);
      } finally {
        setCompressing(false);
      }
      return;
    }

    onUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (!selectedNode) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleRemoveMedia = async () => {
    if (!draft || !selectedNode) return;
    setImgLoadError(false);
    const path = draft.media_path;
    const next = { ...draft, media_type: null, media_url: null, media_path: null } as NodeData;
    setDraft(next);
    onChange(selectedNode.id, next);

    if (path) {
      deleteObject(ref(storage, path)).catch(() => {});
    }
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setPanelWidth(Math.max(200, Math.min(800, startWidth + deltaX)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);

  // Sync draft whenever selected node changes
  useEffect(() => {
    if (selectedNode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(structuredClone(selectedNode.data));
      setImgLoadError(false);
    } else {
      setDraft(null);
    }
  }, [selectedNode]);

  // Auto-propagate every draft change up to the canvas
  const patch = useCallback((partial: Partial<NodeData>) => {
    if (!selectedNode || !draft) return;
    const next = { ...draft, ...partial } as NodeData;
    setDraft(next);
    onChange(selectedNode.id, next);
  }, [selectedNode, draft, onChange]);

  const handleSave = () => {
    if (!selectedNode || !draft) return;
    onSave?.(selectedNode.id, draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  // ── Render: empty state ────────────────────────────────────────────────────
  if (!selectedNode || !draft) {
    return (
      <div style={{ ...panelStyle, width: panelWidth, minWidth: panelWidth, position: 'relative' }}>
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>🖱</div>
          <p style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', lineHeight: 1.6 }}>
            Click any node on the canvas to inspect and edit it here.
          </p>
        </div>
      </div>
    );
  }

  const { type } = selectedNode;
  const isNormal = type === 'normalNode';
  const isEnd = type === 'endNode';
  const nd = isNormal ? draft as NormalNodeData : null;

  const iconLabel = isNormal ? '❓ Question Node' : isEnd ? '🏁 End Node' : '🎬 Situation Node';
  const iconColor = isNormal ? '#bfdbfe' : isEnd ? '#fb7185' : '#c084fc';

  // ── Render: inspector ──────────────────────────────────────────────────────
  return (
    <div style={{ ...panelStyle, width: panelWidth, minWidth: panelWidth, position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: iconColor, letterSpacing: '0.05em', marginBottom: 2 }}>
          {iconLabel}
        </div>
        <div style={{ fontSize: 9, color: '#5f7699', fontFamily: 'monospace' }}>
          id: {selectedNode.id.slice(0, 16)}…
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

        {/* ── Node Name ── */}
        <div style={{ marginBottom: 12 }}>
          <FieldLabel hint="Shown on canvas">Node Name</FieldLabel>
          <input
            type="text"
            value={draft.node_name ?? ''}
            onChange={e => patch({ node_name: e.target.value || null })}
            placeholder="Untitled"
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, marginTop: 4,
              border: '1px solid rgba(112,162,249,0.24)', background: 'rgba(255,255,255,0.55)',
              color: '#223a63', fontSize: 12, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <Divider />

        {/* ── Media ── */}
        <div 
          style={{ marginBottom: 12, position: 'relative' }}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
        >
          <FieldLabel hint="Optional">Media</FieldLabel>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
          />

          {!draft.media_url && !uploadStatus?.uploading && !compressing && (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', padding: '24px 0', borderRadius: 8, marginTop: 6,
                border: isDraggingOver ? '2px dashed #4f82e8' : '1px dashed rgba(112,162,249,0.24)', 
                background: isDraggingOver ? 'rgba(79,130,232,0.08)' : 'rgba(255,255,255,0.55)',
                color: '#35527e', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                transform: isDraggingOver ? 'scale(1.02)' : 'none',
              }}
            >
              {isDraggingOver ? 'Drop to upload!' : '+ Upload Image or Video'}
            </button>
          )}

          {compressing && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(112,162,249,0.18)', marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#35527e', marginBottom: 6, fontWeight: 600 }}>
                <span>{ffmpegProgress === 0 ? 'Loading FFmpeg…' : 'Compressing…'}</span>
                <span>{ffmpegProgress > 0 ? `${ffmpegProgress}%` : ''}</span>
              </div>
              <div style={{ height: 4, background: 'rgba(112,162,249,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${ffmpegProgress}%`, background: '#22c55e', transition: 'width 0.2s' }} />
              </div>
            </div>
          )}

          {uploadStatus?.uploading && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(112,162,249,0.18)', marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#35527e', marginBottom: 6, fontWeight: 600 }}>
                <span>Uploading…</span><span>{uploadStatus.progress}%</span>
              </div>
              <div style={{ height: 4, background: 'rgba(112,162,249,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${uploadStatus.progress}%`, background: '#4f82e8', transition: 'width 0.2s' }} />
              </div>
            </div>
          )}

          {draft.media_url && !uploadStatus?.uploading && (
            <div style={{ 
              display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6,
              opacity: isDraggingOver ? 0.6 : 1,
              transform: isDraggingOver ? 'scale(0.98)' : 'none',
              transition: 'all 0.2s',
            }}>
              {isDraggingOver && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 10, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(79,130,232,0.12)', borderRadius: 8,
                  fontWeight: 700, color: '#4f82e8', fontSize: 12
                }}>
                  Drop to replace
                </div>
              )}
              {draft.media_type !== 'video' ? (
                imgLoadError ? (
                  <div style={{
                    width: '100%', height: 120, borderRadius: 8, marginTop: 4,
                    background: 'rgba(112,162,249,0.06)', border: '1px dashed rgba(112,162,249,0.3)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 4, color: '#6b7280', fontSize: 11,
                  }}>
                    <span style={{ fontSize: 22 }}>🖼</span>
                    <span>Cannot load preview</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', maxWidth: '80%', textAlign: 'center', wordBreak: 'break-all' }}>
                      {draft.media_url}
                    </span>
                  </div>
                ) : (
                  <img
                    src={draft.media_url ?? ''}
                    alt=""
                    onError={() => setImgLoadError(true)}
                    onLoad={() => setImgLoadError(false)}
                    style={{ width: '100%', borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(112,162,249,0.18)', display: 'block', minHeight: 80, background: 'rgba(112,162,249,0.04)' }}
                  />
                )
              ) : (
                <AutoPlayVideo
                  key={draft.media_url ?? ''}
                  src={draft.media_url ?? ''}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(112,162,249,0.18)' }}
                />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ ...ghostBtnStyle, flex: 1, padding: '6px 0', fontSize: 11 }}
                >Replace</button>
                <button
                  onClick={handleRemoveMedia}
                  style={{ ...ghostBtnStyle, flex: 1, padding: '6px 0', fontSize: 11, color: '#fb7185', borderColor: 'rgba(251,113,133,0.3)', background: 'rgba(251,113,133,0.1)' }}
                >Remove</button>
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* ── Question / Scene text ── */}
        <div style={{ marginBottom: 12 }}>
          <FieldLabel hint={isNormal ? 'Shown to player' : undefined}>
            {isNormal ? 'Question Text' : isEnd ? 'Final Message' : 'Scene Description'}
          </FieldLabel>
          <textarea
            rows={3}
            value={draft.question_text ?? ''}
            onChange={e => patch({ question_text: e.target.value })}
            ref={el => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = `${t.scrollHeight}px`;
            }}
            placeholder={isNormal ? 'Type the question here…' : isEnd ? 'Message shown at end of path…' : 'Describe the scene…'}
            style={{ ...textareaStyle, resize: 'none', overflow: 'hidden' }}
          />
        </div>

        <Divider />

        {/* ── Advanced Settings Trigger ── */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: 'rgba(112,162,249,0.08)', border: '1px solid rgba(112,162,249,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', color: '#35527e', fontSize: 11, fontWeight: 700,
          }}
        >
          <span>Advanced / Novartis Settings</span>
          <span style={{ transition: 'transform 0.2s', transform: showAdvanced ? 'rotate(180deg)' : 'none' }}>▼</span>
        </button>

        {showAdvanced && (
          <div style={{ padding: '0 4px 12px', borderBottom: '1px solid rgba(112,162,249,0.1)', marginBottom: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <FieldLabel hint="Public vs HCP audience">Intended Audience</FieldLabel>
              <select
                value={draft.intended_audience ?? 'public'}
                onChange={e => patch({ intended_audience: e.target.value as NodeData['intended_audience'] })}
                style={selectStyle}
              >
                {AUDIENCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <FieldLabel hint="Optional">Reading Level</FieldLabel>
              <input
                type="text"
                value={draft.reading_level ?? ''}
                onChange={e => patch({ reading_level: e.target.value || null })}
                placeholder="e.g. general public / clinician"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <FieldLabel hint="Comma separated">Jurisdiction Tags</FieldLabel>
              <input
                type="text"
                value={(draft.jurisdiction_tags ?? []).join(', ')}
                onChange={e => patch({ jurisdiction_tags: parseCommaSeparated(e.target.value) })}
                placeholder="GLOBAL, TH"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <FieldLabel hint="Required for HCP/distinct content">Medical Review Version</FieldLabel>
              <input
                type="text"
                value={draft.medical_review_version ?? ''}
                onChange={e => patch({ medical_review_version: e.target.value || null })}
                placeholder="e.g. med-2026-01"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 0 }}>
              <FieldLabel hint="One per line: doc:version">Legal Document Versions</FieldLabel>
              <textarea
                rows={3}
                value={formatKeyValueLines(draft.legal_document_versions_required)}
                onChange={e => patch({ legal_document_versions_required: parseKeyValueLines(e.target.value) })}
                placeholder={'terms:2026-05-19\nprivacy:2026-05-19'}
                style={{ ...textareaStyle, fontSize: 10 }}
              />
            </div>
          </div>
        )}

        {/* ── Entry point toggle ── */}
        {!isEnd && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <FieldLabel>Start Node</FieldLabel>
            <div
              onClick={() => patch({ is_entry_point: !draft.is_entry_point })}
              role="switch"
              aria-checked={draft.is_entry_point}
              style={{
                width: 34, height: 18, borderRadius: 9, cursor: 'pointer',
                background: draft.is_entry_point ? '#10b981' : 'rgba(112,162,249,0.18)',
                display: 'flex', alignItems: 'center', padding: '0 2px',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                transition: 'transform 0.2s',
                transform: draft.is_entry_point ? 'translateX(16px)' : 'translateX(0)',
              }} />
            </div>
          </div>
        )}

        {/* ── Normal-node: choices ── */}
        {nd && (
          <>
            <Divider />
            <FieldLabel hint="auto-saved">Answer Choices</FieldLabel>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
              {(nd.choices ?? []).map((c, idx) => {
                const color = CHOICE_COLORS[c.label] ?? '#6366f1';
                const score = c.score_impact ?? 0;

                const updateChoice = (patch: Partial<typeof c>) => {
                  const choices = [...(nd.choices ?? [])];
                  choices[idx] = { ...choices[idx], ...patch };

                  // Compute next state synchronously outside the updater callback
                  const next = { ...draft, choices } as NormalNodeData;
                  setDraft(next);
                  onChange(selectedNode.id, next);
                };

                return (
                  <div
                    key={c.label}
                    style={{
                      background: `${color}10`,
                      border: `1px solid ${color}30`,
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                  >
                    {/* Choice header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: color, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: '#fff', fontSize: 10,
                        fontWeight: 800, flexShrink: 0, marginTop: 2
                      }}>{c.label}</span>
                      <textarea
                        rows={2}
                        value={c.choice_text ?? ''}
                        onChange={e => updateChoice({ choice_text: e.target.value })}
                        ref={el => {
                          if (el) {
                            el.style.height = 'auto';
                            el.style.height = `${el.scrollHeight}px`;
                          }
                        }}
                        onInput={e => {
                          const t = e.target as HTMLTextAreaElement;
                          t.style.height = 'auto';
                          t.style.height = `${t.scrollHeight}px`;
                        }}
                        placeholder={`Choice ${c.label} text…`}
                        style={{ ...textareaStyle, fontSize: 10, resize: 'none', overflow: 'hidden' }}
                      />
                    </div>


                    {/* Score impact - Only shown for Public or Mixed audiences */}
                    {(draft.intended_audience === 'public' || draft.intended_audience === 'mixed') && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#5f7699', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Utility Score
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          {SCORE_PRESETS.map(p => (
                            <ScoreButton
                              key={p.value}
                              value={p.value}
                              active={score === p.value}
                              onClick={() => updateChoice({ score_impact: p.value })}
                            />
                          ))}
                          <input
                            type="number"
                            step={1}
                            value={score}
                            onChange={e => updateChoice({ score_impact: Math.trunc(Number(e.target.value)) || 0 })}
                            title="Custom utility score"
                            style={{
                              width: 48, height: 22, borderRadius: 5,
                              border: `1px solid ${score > 0 ? '#34d39940' : score < 0 ? '#fb718540' : 'rgba(255,255,255,0.1)'}`,
                              background: score > 0 ? 'rgba(52,211,153,0.1)' : score < 0 ? 'rgba(251,113,133,0.1)' : 'rgba(255,255,255,0.05)',
                              color: score > 0 ? '#34d399' : score < 0 ? '#fb7185' : '#9ca3af',
                              fontSize: 10, textAlign: 'center', outline: 'none', fontFamily: 'monospace',
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Explanation */}
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#5f7699', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Explanation / Feedback
                      </div>
                      <textarea
                        rows={2}
                        value={c.explanation ?? ''}
                        onChange={e => updateChoice({ explanation: e.target.value })}
                        ref={el => {
                          if (el) {
                            el.style.height = 'auto';
                            el.style.height = `${el.scrollHeight}px`;
                          }
                        }}
                        onInput={e => {
                          const t = e.target as HTMLTextAreaElement;
                          t.style.height = 'auto';
                          t.style.height = `${t.scrollHeight}px`;
                        }}
                        placeholder="Why does this choice matter? (Thai or English)"
                        style={{ ...textareaStyle, fontSize: 10, resize: 'none', overflow: 'hidden' }}
                      />
                    </div>

                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#5f7699', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Choice Analysis
                      </div>
                      <textarea
                        rows={2}
                        value={c.behavior_meaning ?? ''}
                        onChange={e => updateChoice({ behavior_meaning: e.target.value || null })}
                        placeholder="What does this choice represent clinically or behaviorally?"
                        style={{ ...textareaStyle, fontSize: 10 }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 9, color: '#5f7699', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Data Privacy Mode
                        </div>
                        <select
                          value={c.allowed_usage ?? 'aggregate_only'}
                          onChange={e => updateChoice({ allowed_usage: e.target.value as typeof c.allowed_usage })}
                          style={selectStyle}
                        >
                          {ALLOWED_USAGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: '#5f7699', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Review Status
                        </div>
                        <select
                          value={c.review_status ?? 'draft'}
                          onChange={e => updateChoice({ review_status: e.target.value as typeof c.review_status })}
                          style={selectStyle}
                        >
                          {REVIEW_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 9, color: '#5f7699', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Insight Impact (0-3)
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={3}
                          step={0.1}
                          value={c.confidence_weight ?? 1}
                          onChange={e => updateChoice({ confidence_weight: Number(e.target.value) || 0 })}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'end' }}>
                        {/* Only show "Requires HCP version" for Mixed audience */}
                        {draft.intended_audience === 'mixed' && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#35527e', fontSize: 10, fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(c.requires_hcp_version)}
                              onChange={e => updateChoice({ requires_hcp_version: e.target.checked })}
                            />
                            Requires HCP version
                          </label>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#5f7699', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Keywords
                      </div>
                      <input
                        type="text"
                        value={(c.clinical_tags ?? []).join(', ')}
                        onChange={e => updateChoice({ clinical_tags: parseCommaSeparated(e.target.value) })}
                        placeholder="guideline, access, adherence"
                        style={inputStyle}
                      />
                    </div>

                    {/* Behavioral Insights - Only shown for HCP or Mixed audiences */}
                    {(draft.intended_audience === 'hcp' || draft.intended_audience === 'mixed') && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#5f7699', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Doctor Behavioral Insights
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {HCP_VECTOR_KEYS.map((key) => (
                            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontSize: 9, color: '#35527e', fontWeight: 700 }}>{key}</span>
                              <input
                                type="number"
                                step={0.1}
                                value={c.vector_deltas?.[key] ?? 0}
                                onChange={e => updateChoice({
                                  vector_deltas: {
                                    ...(c.vector_deltas ?? {}),
                                    [key]: Number(e.target.value) || 0,
                                  },
                                })}
                                style={inputStyle}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Routing */}
                    <div>
                      <div style={{ fontSize: 9, color: '#5f7699', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Routes to →
                      </div>
                      <select
                        value={connections[c.label] ?? ''}
                        onChange={e => onConnectionChange(c.label, e.target.value || null)}
                        style={selectStyle}
                      >
                        <option value="">— no connection —</option>
                        {questionOptions
                          .filter(q => q.id !== selectedNode.id) // can't route to self
                          .map(q => (
                            <option key={q.id} value={q.id}>{q.label}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

          </>
        )}

      </div>

      {/* Footer — Save button */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(112,162,249,0.16)', flexShrink: 0 }}>
        <button
          id="inspector-save-btn"
          onClick={handleSave}
          style={{
            width: '100%', padding: '8px 0',
            borderRadius: 8, border: 'none', cursor: 'pointer',
            background: savedFlash ? 'rgba(52,211,153,0.24)' : 'rgba(79,130,232,0.18)',
            color: savedFlash ? '#047857' : '#223a63',
            fontSize: 11, fontWeight: 700,
            transition: 'background 0.2s, color 0.2s',
            letterSpacing: '0.05em',
          }}
        >
          {savedFlash ? '✓ Saved' : 'Update Node'}
        </button>
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={startResizing}
        style={{
          position: 'absolute',
          top: 0,
          right: -3,
          width: 6,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 50,
        }}
      />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  width: 272,
  minWidth: 272,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'linear-gradient(180deg, rgba(242,247,255,0.94) 0%, rgba(232,240,255,0.92) 100%)',
  borderRight: '1px solid rgba(112,162,249,0.2)',
  boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.35)',
  backdropFilter: 'blur(18px)',
  overflow: 'hidden',
};

const emptyStateStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.8)',
  border: '1px solid rgba(112,162,249,0.18)',
  borderRadius: 6,
  padding: '5px 8px',
  color: '#223a63',
  fontSize: 11,
  outline: 'none',
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical' as const,
  fontFamily: 'inherit',
  lineHeight: 1.5,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'auto',
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'rgba(112,162,249,0.14)',
  border: '1px solid rgba(112,162,249,0.26)',
  borderRadius: 5,
  color: '#4e78b8',
  cursor: 'pointer',
  fontSize: 10,
  padding: '3px 10px',
};
