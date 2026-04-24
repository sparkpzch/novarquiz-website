'use client';

import { memo, useState, useCallback } from 'react';
import { Handle, Position, useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';

export type NormalNodeData = {
  question_text: string;
  // score_impact: signed integer for utility scoring (positive = healthy, negative = risk/danger).
  // explanation: narrative/medical feedback shown after the player picks this choice.
  choices: Array<{
    label: string;
    choice_text: string;
    /** @deprecated use score_impact */
    points?: number;
    score_impact: number;
    explanation: string;
  }>;
  media_type: string | null;
  media_url: string | null;
  is_entry_point: boolean;
  timer_override: number | null;
};

const CHOICE_CFG = {
  A: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  B: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  C: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  D: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
} as const;

const H_HEADER = 36;
const H_TEXT = 52;
const H_CHOICE = 32;
const H_MEDIA = 22; // height of media indicator row when present

export const NormalNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as NormalNodeData;
  const { updateNodeData } = useReactFlow();
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) return;
      const { url } = await res.json();
      updateNodeData(id, { media_type: file.type.startsWith('video/') ? 'video' : 'image', media_url: url });
    } catch { /* non-fatal */ }
  }, [id, updateNodeData]);

  const choices = d.choices?.length
    ? d.choices
    : ['A', 'B', 'C', 'D'].map(l => ({ label: l, choice_text: '', score_impact: 0, explanation: '' }));

  // Track which choice handles already have outgoing connections — used to hide the
  // white "connect all" handle once every choice is wired up.
  const sourceConnections = useNodeConnections({ handleType: 'source' });
  const connectedChoices = new Set(
    sourceConnections.map(c => c.sourceHandle).filter((h): h is string => !!h)
  );
  const allChoicesConnected = ['A', 'B', 'C', 'D'].every(l => connectedChoices.has(l));

  // Top of choice area depends on whether media row is present
  const choiceAreaTop = H_HEADER + H_TEXT + (d.media_url ? H_MEDIA : 0);

  const choiceHandleStyle = (color: string, idx: number): React.CSSProperties => ({
    top: choiceAreaTop + idx * H_CHOICE + H_CHOICE / 2,
    width: 10,
    height: 10,
    background: color,
    border: `2px solid ${color}88`,
    boxShadow: selected ? `0 0 0 3px ${color}30, 0 0 10px ${color}60` : 'none',
    transition: 'box-shadow 0.15s',
  });

  return (
    <div
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        width: 248,
        borderRadius: 12,
        border: `2px solid ${dragOver ? '#6366f1' : selected ? '#6366f1' : 'rgba(255,255,255,0.12)'}`,
        boxShadow: dragOver
          ? '0 0 0 4px rgba(99,102,241,0.4), 0 8px 32px rgba(0,0,0,0.6)'
          : selected
            ? '0 0 0 3px rgba(99,102,241,0.25), 0 8px 32px rgba(0,0,0,0.6)'
            : '0 4px 24px rgba(0,0,0,0.5)',
        position: 'relative',
      }}>
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20, borderRadius: 10,
          background: 'rgba(99,102,241,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 700 }}>Drop media here</span>
        </div>
      )}

      {/* Target handle (incoming) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          top: H_HEADER / 2,
          width: 12,
          height: 12,
          background: '#6366f1',
          border: '2px solid #818cf8',
          boxShadow: selected ? '0 0 0 3px rgba(99,102,241,0.3), 0 0 10px rgba(99,102,241,0.5)' : 'none',
          transition: 'box-shadow 0.15s',
        }}
      />

      {/*
        "Connect All" handle — white dot positioned just above choice A.
        Drag from this to connect ALL 4 choices to the target node at once.
        Styled like Unreal Engine's exec pin. Hidden when every choice is
        already connected, since the action would be a no-op.
      */}
      {!allChoicesConnected && (
        <Handle
          type="source"
          position={Position.Right}
          id="all"
          title="Drag to connect all choices to a node"
          style={{
            top: choiceAreaTop - 9,
            width: 13,
            height: 13,
            background: '#ffffff',
            border: '2px solid rgba(255,255,255,0.55)',
            boxShadow: selected
              ? '0 0 0 3px rgba(255,255,255,0.2), 0 0 12px rgba(255,255,255,0.6)'
              : '0 0 5px rgba(255,255,255,0.25)',
            transition: 'box-shadow 0.15s',
            zIndex: 10,
          }}
        />
      )}

      {/* Source handles — one per choice, aligned with each row */}
      {choices.map((c, idx) => {
        const cfg = CHOICE_CFG[c.label as keyof typeof CHOICE_CFG] ?? CHOICE_CFG.A;
        return (
          <Handle
            key={c.label}
            type="source"
            position={Position.Right}
            id={c.label}
            style={choiceHandleStyle(cfg.color, idx)}
          />
        );
      })}

      {/* Header */}
      <div style={{
        height: H_HEADER,
        background: 'rgba(99,102,241,0.18)',
        borderRadius: '10px 10px 0 0',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11 }}>❓</span>
          <span style={{ color: '#a5b4fc', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Question
          </span>
          {d.is_entry_point && (
            <span style={{
              background: 'rgba(16,185,129,0.18)',
              color: '#34d399',
              border: '1px solid rgba(52,211,153,0.35)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}>START</span>
          )}
        </div>
        {d.timer_override && (
          <span style={{ color: '#fbbf24', fontSize: 10 }}>⏱ {d.timer_override}s</span>
        )}
      </div>

      {/* Question text */}
      <div style={{
        height: H_TEXT,
        padding: '8px 10px',
        background: '#0d0d20',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        color: d.question_text ? '#e2e8f0' : '#4b5563',
        fontSize: 12,
        lineHeight: '1.5',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
      }}>
        {d.question_text || 'Double-click to edit…'}
      </div>

      {/* Media indicator */}
      {d.media_url && (
        <div style={{
          background: '#0d0d20',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '4px 10px',
          fontSize: 10,
          color: '#6b7280',
        }}>
          {d.media_type === 'video' ? '🎬 Video attached' : '🖼 Image attached'}
        </div>
      )}

      {/* Choice rows */}
      {choices.map((c, idx) => {
        const cfg = CHOICE_CFG[c.label as keyof typeof CHOICE_CFG] ?? CHOICE_CFG.A;
        return (
          <div key={c.label} style={{
            height: H_CHOICE,
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            gap: 6,
            background: cfg.bg,
            borderBottom: idx < choices.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            borderRadius: idx === choices.length - 1 ? '0 0 10px 10px' : 0,
          }}>
            <span style={{
              width: 16, height: 16,
              borderRadius: '50%',
              background: cfg.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 9, flexShrink: 0,
            }}>{c.label}</span>
            <span style={{
              flex: 1,
              color: c.choice_text ? '#d1d5db' : '#4b5563',
              fontSize: 11,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {c.choice_text || `Choice ${c.label}`}
            </span>
            {/* Score impact badge — uses score_impact; falls back to legacy points */}
            {(() => { const s = c.score_impact ?? c.points ?? 0; return s !== 0 && (
              <span style={{
                color: s > 0 ? '#34d399' : '#fb7185',
                fontSize: 10, fontWeight: 700,
              }}>
                {s > 0 ? `+${s}` : s}
              </span>
            ); })()}
          </div>
        );
      })}
    </div>
  );
});

NormalNode.displayName = 'NormalNode';
