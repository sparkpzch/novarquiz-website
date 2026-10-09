'use client';

/**
 * LeftInspector — Canvas-side inspector panel for the admin quiz editor.
 *
 * Layout:  [ LeftInspector (fixed, left) ] | [ ReactFlow canvas (fills rest) ]
 *
 * Trigger: Click any node on the canvas → selectedNode is set → panel populates.
 * Auto-apply: Every field change fires onChange immediately (live, no debounce).
 *             Persisting to the database is the page-level Save button.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getVideoSourceType } from '@/lib/video/source';
import VideoProcessingStatus from './VideoProcessingStatus';
import AutoPlayVideo from '@/components/ui/AutoPlayVideo';
import { NodeIcon } from './NodeIcon';
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
    <span className="nq-ne-label">
      {children}
      {hint && <> <small>{hint}</small></>}
    </span>
  );
}

function Section({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '14px 16px', borderBottom: '1px solid var(--nq-line)' }}>
      {title && <FieldLabel hint={hint}>{title}</FieldLabel>}
      {children}
    </section>
  );
}

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function ScoreButton({ value, active, onClick }: { value: number; active: boolean; onClick: () => void }) {
  const preset = SCORE_PRESETS.find(p => p.value === value);
  const color = preset?.color ?? (value > 0 ? '#34d399' : value < 0 ? '#fb7185' : '#6b7280');
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Set score impact to ${value}`}
      aria-pressed={active}
      style={{
        minWidth: 34,
        padding: '3px 7px',
        borderRadius: 7,
        border: `1px solid ${active ? color : 'var(--nq-line)'}`,
        background: active ? `${color}22` : 'var(--nq-panel)',
        color: active ? color : 'var(--nq-muted)',
        fontSize: 11, fontWeight: 700, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {value > 0 ? `+${value}` : value}
    </button>
  );
}

/**
 * Text buffer for a value that is stored parsed. Without it the field is
 * re-derived from the parsed value on every keystroke, which swallows
 * in-progress input such as a trailing comma or a lone minus sign.
 */
function useBufferedText<T>(value: T, format: (v: T) => string, equal: (text: string, v: T) => boolean) {
  const [text, setText] = useState(() => format(value));
  // Pick up changes made elsewhere (e.g. a score preset button).
  if (!equal(text, value)) {
    const next = format(value);
    if (next !== text) setText(next);
  }
  return [text, setText] as const;
}

function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const toNumber = (t: string) => Math.trunc(Number(t)) || 0;
  const [text, setText] = useBufferedText(value, String, (t, v) => toNumber(t) === v);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => {
        const t = e.target.value.replace(/[^\d-]/g, '');
        setText(t);
        onChange(toNumber(t));
      }}
      onBlur={() => setText(String(value))}
      title="Custom utility score"
      aria-label="Custom utility score"
      className="nq-ne-field"
      style={{
        width: 56, padding: '3px 6px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11,
        color: value > 0 ? 'var(--ne-start)' : value < 0 ? 'var(--ne-end)' : undefined,
      }}
    />
  );
}

function KeywordsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useBufferedText(value, v => v.join(', '),
    (t, v) => parseCommaSeparated(t).join('\u0000') === v.join('\u0000'));
  return (
    <input
      type="text"
      value={text}
      onChange={e => { setText(e.target.value); onChange(parseCommaSeparated(e.target.value)); }}
      onBlur={() => setText(value.join(', '))}
      placeholder="guideline, access, adherence"
      className="nq-ne-field"
      style={{ fontSize: 12 }}
    />
  );
}

const TYPE_META = {
  normalNode: { label: 'Question', icon: 'question', color: 'var(--ne-question)' },
  situationNode: { label: 'Situation', icon: 'situation', color: 'var(--ne-situation)' },
  endNode: { label: 'End', icon: 'end', color: 'var(--ne-end)' },
} as const;

// ─── Main Component ───────────────────────────────────────────────────────────

export function LeftInspector({
  selectedNode,
  questionOptions,
  onChange,
  connections,
  onConnectionChange,
  onUpload,
  uploadStatus,
}: LeftInspectorProps) {
  const [draft, setDraft] = useState<NodeData | null>(null);
  const [panelWidth, setPanelWidth] = useState(340);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [imgLoadError, setImgLoadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (file: File) => {
    if (file && selectedNode) onUpload(file);
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
    const next = { ...draft, media_type: null, media_url: null, media_path: null } as NodeData;
    setDraft(next);
    onChange(selectedNode.id, next);
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setPanelWidth(Math.max(280, Math.min(640, startWidth + deltaX)));
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

  const resizeHandle = (
    <div
      onMouseDown={startResizing}
      title="Drag to resize"
      style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 50 }}
    />
  );

  // ── Render: empty state ────────────────────────────────────────────────────
  if (!selectedNode || !draft) {
    return (
      <aside style={{ ...panelStyle, width: panelWidth, minWidth: panelWidth }}>
        <div style={emptyStateStyle}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--nq-ink)', margin: '0 0 4px' }}>No node selected</p>
          <p style={{ fontSize: 13, color: 'var(--nq-muted)', textAlign: 'center', lineHeight: 1.6, margin: 0, maxWidth: 230 }}>
            Select a node on the canvas to edit it here.
          </p>
        </div>
        {resizeHandle}
      </aside>
    );
  }

  const { type } = selectedNode;
  const isNormal = type === 'normalNode';
  const isEnd = type === 'endNode';
  const nd = isNormal ? draft as NormalNodeData : null;
  const meta = TYPE_META[type];
  const processingId = draft.media_path?.match(/^quiz-media\/original-([a-f0-9-]+)\.(mp4|mov)$/)?.[1];

  // ── Render: inspector ──────────────────────────────────────────────────────
  return (
    <aside style={{ ...panelStyle, width: panelWidth, minWidth: panelWidth }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--nq-line)', flexShrink: 0 }}>
        <span style={{ display: 'flex', color: meta.color }}>
          <NodeIcon name={meta.icon} size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--nq-ink)' }}>{meta.label}</div>
          <div title={selectedNode.id} style={{ fontSize: 10, color: 'var(--nq-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedNode.id}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── Node Name ── */}
        <Section title="Name" hint="(shown on the canvas)">
          <input
            type="text"
            value={draft.node_name ?? ''}
            onChange={e => patch({ node_name: e.target.value || null })}
            placeholder="Untitled"
            className="nq-ne-field"
          />
        </Section>

        {/* ── Question / Scene text ── */}
        <Section
          title={isNormal ? 'Question' : isEnd ? 'Final message' : 'Description'}
          hint={isEnd ? '(optional)' : !isNormal && draft.media_url ? '(shown below the media)' : undefined}
        >
          <textarea
            rows={3}
            value={!isNormal && !isEnd ? (draft.media_explanation ?? draft.question_text ?? '') : (draft.question_text ?? '')}
            onChange={e => patch(!isNormal && !isEnd
              ? { media_explanation: e.target.value, question_text: e.target.value }
              : { question_text: e.target.value })}
            ref={autoGrow}
            onInput={e => autoGrow(e.currentTarget)}
            placeholder={isNormal ? 'Type the question here…' : isEnd ? 'Message shown at end of path…' : 'Explain what the player should notice in the media…'}
            className="nq-ne-field"
          />
        </Section>

        {/* ── Media ── */}
        <div
          style={{ position: 'relative' }}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
        >
        <Section title="Media" hint="(optional)">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
          />

          {!draft.media_url && !uploadStatus?.uploading && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', padding: '20px 12px', borderRadius: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                border: `1.5px dashed ${isDraggingOver ? 'var(--nq-primary)' : 'var(--nq-line)'}`,
                background: isDraggingOver ? 'var(--nq-accent-soft)' : 'var(--nq-inset)',
                color: isDraggingOver ? 'var(--nq-accent-text)' : 'var(--nq-muted)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <NodeIcon name="media" size={20} />
              {isDraggingOver ? 'Drop to upload' : 'Upload image or video'}
              <span style={{ fontSize: 11, fontWeight: 400 }}>or drop a file here</span>
            </button>
          )}

          {processingId && <VideoProcessingStatus id={processingId} />}

          {uploadStatus?.uploading && (
            <div style={{ padding: 12, borderRadius: 12, background: 'var(--nq-inset)', border: '1px solid var(--nq-line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--nq-ink)', marginBottom: 8, fontWeight: 600 }}>
                <span>Uploading…</span><span>{uploadStatus.progress}%</span>
              </div>
              <div style={{ height: 5, background: 'var(--nq-line)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${uploadStatus.progress}%`, background: 'var(--nq-primary)', transition: 'width 0.2s' }} />
              </div>
            </div>
          )}

          {draft.media_url && !uploadStatus?.uploading && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              opacity: isDraggingOver ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}>
              {isDraggingOver && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'color-mix(in srgb, var(--nq-primary) 12%, transparent)', borderRadius: 12,
                  fontWeight: 700, color: 'var(--nq-accent-text)', fontSize: 12,
                }}>
                  Drop to replace
                </div>
              )}
              {draft.media_type !== 'video' ? (
                imgLoadError ? (
                  <div style={{
                    width: '100%', height: 120, borderRadius: 12,
                    background: 'var(--nq-inset)', border: '1px dashed var(--nq-line)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 4, color: 'var(--nq-muted)', fontSize: 11,
                  }}>
                    <NodeIcon name="media" size={20} />
                    <span>Cannot load preview</span>
                    <span style={{ fontSize: 9, maxWidth: '80%', textAlign: 'center', wordBreak: 'break-all' }}>
                      {draft.media_url}
                    </span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.media_url ?? ''}
                    alt=""
                    onError={() => setImgLoadError(true)}
                    onLoad={() => setImgLoadError(false)}
                    style={{ width: '100%', borderRadius: 12, objectFit: 'cover', border: '1px solid var(--nq-line)', display: 'block', minHeight: 80, background: 'var(--nq-inset)' }}
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
                  style={{ width: '100%', borderRadius: 12, border: '1px solid var(--nq-line)' }}
                />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="nq-ne-btn" style={{ flex: 1 }}>
                  Replace
                </button>
                <button type="button" onClick={handleRemoveMedia} className="nq-ne-btn nq-ne-btn-danger" style={{ flex: 1 }}>
                  Remove
                </button>
              </div>
            </div>
          )}

          <label style={{ display: 'block', marginTop: 12 }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--nq-muted)', marginBottom: 4 }}>
              Or paste an HLS video link (.m3u8)
            </span>
            <input type="url" placeholder="https://cdn.example.com/video/master.m3u8"
              defaultValue={getVideoSourceType(draft.media_url ?? '') === 'application/vnd.apple.mpegurl' ? draft.media_url ?? '' : ''}
              key={`${selectedNode.id}-${draft.media_url}`}
              className="nq-ne-field"
              style={{ fontSize: 12 }}
              onBlur={(event) => {
                const url = event.currentTarget.value.trim();
                if (!url || url === draft.media_url) return;
                let valid = false;
                try { valid = new URL(url).protocol === 'https:' && getVideoSourceType(url) === 'application/vnd.apple.mpegurl'; } catch { /* invalid URL */ }
                if (!valid) { event.currentTarget.setCustomValidity('Enter an HTTPS .m3u8 playlist URL'); event.currentTarget.reportValidity(); return; }
                event.currentTarget.setCustomValidity('');
                const next = { ...draft, media_type: 'video', media_url: url, media_path: null } as NodeData;
                setDraft(next);
                onChange(selectedNode.id, next);
              }}
              onInput={(event) => event.currentTarget.setCustomValidity('')}
            />
          </label>

          {draft.media_url && (isNormal || isEnd) && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel hint="(shown below the media)">Caption</FieldLabel>
              <textarea
                rows={3}
                value={draft.media_explanation ?? ''}
                onChange={e => patch({ media_explanation: e.target.value })}
                ref={autoGrow}
                onInput={e => autoGrow(e.currentTarget)}
                placeholder="Add context or a caption for the media…"
                className="nq-ne-field"
              />
            </div>
          )}
        </Section>
        </div>

        {/* ── Entry point toggle ── */}
        {!isEnd && (
          <Section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nq-ink)' }}>Start here</div>
                <div style={{ fontSize: 12, color: 'var(--nq-muted)' }}>Players see this node first. Only one node can be the start.</div>
              </div>
              <button
                type="button"
                onClick={() => patch({ is_entry_point: !draft.is_entry_point })}
                role="switch"
                aria-checked={draft.is_entry_point}
                aria-label="Start node"
                className="nq-ne-switch"
              />
            </div>
          </Section>
        )}

        {/* ── Normal-node: choices ── */}
        {nd && (
          <Section title="Choices">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                      background: 'var(--nq-panel)',
                      border: '1px solid var(--nq-line)',
                      borderLeft: `3px solid ${color}`,
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}
                  >
                    {/* Choice header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: 6,
                        background: color, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: '#fff', fontSize: 11,
                        fontWeight: 800, flexShrink: 0, marginTop: 3,
                      }}>{c.label}</span>
                      <textarea
                        rows={1}
                        value={c.choice_text ?? ''}
                        onChange={e => updateChoice({ choice_text: e.target.value })}
                        ref={autoGrow}
                        onInput={e => autoGrow(e.currentTarget)}
                        placeholder={`Choice ${c.label} text…`}
                        aria-label={`Choice ${c.label} text`}
                        className="nq-ne-field"
                        style={{ fontWeight: 600 }}
                      />
                    </div>

                    {/* Score impact */}
                    <div>
                      <span className="nq-ne-label" style={{ fontSize: 12 }}>Score</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        {SCORE_PRESETS.map(p => (
                          <ScoreButton
                            key={p.value}
                            value={p.value}
                            active={score === p.value}
                            onClick={() => updateChoice({ score_impact: p.value })}
                          />
                        ))}
                        <ScoreInput value={score} onChange={v => updateChoice({ score_impact: v })} />
                      </div>
                    </div>

                    {/* Explanation */}
                    <div>
                      <span className="nq-ne-label" style={{ fontSize: 12 }}>Feedback <small>(shown after answering)</small></span>
                      <textarea
                        rows={2}
                        value={c.explanation ?? ''}
                        onChange={e => updateChoice({ explanation: e.target.value })}
                        ref={autoGrow}
                        onInput={e => autoGrow(e.currentTarget)}
                        placeholder="Why is this the right or wrong choice?"
                        className="nq-ne-field"
                        style={{ fontSize: 12 }}
                      />
                    </div>

                    <div>
                      <span className="nq-ne-label" style={{ fontSize: 12 }}>What this choice means <small>(for reports)</small></span>
                      <textarea
                        rows={2}
                        value={c.behavior_meaning ?? ''}
                        onChange={e => updateChoice({ behavior_meaning: e.target.value || null })}
                        ref={autoGrow}
                        onInput={e => autoGrow(e.currentTarget)}
                        placeholder="What does this choice represent clinically or behaviorally?"
                        className="nq-ne-field"
                        style={{ fontSize: 12 }}
                      />
                    </div>

                    <div>
                      <span className="nq-ne-label" style={{ fontSize: 12 }}>Keywords <small>(comma separated)</small></span>
                      <KeywordsInput value={c.clinical_tags ?? []} onChange={tags => updateChoice({ clinical_tags: tags })} />
                    </div>

                    {/* Routing */}
                    <div>
                      <span className="nq-ne-label" style={{ fontSize: 12 }}>Goes to</span>
                      <select
                        value={connections[c.label] ?? ''}
                        onChange={e => onConnectionChange(c.label, e.target.value || null)}
                        className="nq-ne-field"
                        style={{ fontSize: 12 }}
                      >
                        <option value="">Not connected</option>
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
          </Section>
        )}

      </div>

      {resizeHandle}
    </aside>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  background: 'var(--nq-panel)',
  borderRight: '1px solid var(--nq-line)',
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
