'use client';

import { memo } from 'react';
import { Handle, Position, useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';

export type NormalNodeData = {
  node_name: string | null;
  question_text: string;
  // score_impact: signed integer for utility scoring (positive = healthy, negative = risk/danger).
  // explanation: narrative/medical feedback shown after the player picks this choice.
  choices: Array<{
    label: string;
    choice_text: string;
    score_impact: number;
    explanation: string;
  }>;
  media_type: string | null;
  media_url: string | null;
  media_path: string | null;
  is_entry_point: boolean;
  timer_override: number | null;
};

const CHOICE_CFG = {
  A: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  B: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  C: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  D: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
} as const;

const QUESTION_NODE_ACCENT = '#70A2F9';
const QUESTION_NODE_ACCENT_SOFT = '#92BFFF';
const QUESTION_NODE_HEADER_BG = 'rgba(112,162,249,0.2)';
const QUESTION_NODE_SURFACE_GLOW = 'rgba(112,162,249,0.18)';

const H_HEADER = 36;
const H_TEXT = 52;
const H_CHOICE = 32;

export const NormalNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as NormalNodeData;
  const { updateNodeData } = useReactFlow();
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

  const choiceAreaTop = H_HEADER + H_TEXT;

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
      style={{
        width: 248,
        borderRadius: 12,
        border: `2px solid ${selected ? QUESTION_NODE_ACCENT : 'rgba(112,162,249,0.24)'}`,
        background: 'rgba(251,253,255,0.96)',
        boxShadow: selected
            ? '0 0 0 3px rgba(112,162,249,0.24), 0 8px 32px rgba(0,0,0,0.6)'
            : '0 16px 32px rgba(82,114,164,0.18)',
        position: 'relative',
        overflow: 'hidden',
      }}>

      {/* Target handle (incoming) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          top: H_HEADER / 2,
          width: 12,
          height: 12,
          background: QUESTION_NODE_ACCENT,
          border: `2px solid ${QUESTION_NODE_ACCENT_SOFT}`,
          boxShadow: selected ? '0 0 0 3px rgba(112,162,249,0.3), 0 0 10px rgba(112,162,249,0.5)' : 'none',
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
        background: QUESTION_NODE_HEADER_BG,
        borderRadius: '10px 10px 0 0',
        borderBottom: '1px solid rgba(146,191,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, flexShrink: 0 }}>❓</span>
          <span style={{
            color: '#1e40af', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {d.node_name || 'Question'}
          </span>
          {d.media_url && (
            <span style={{ fontSize: 9, flexShrink: 0 }}>{d.media_type === 'video' ? '🎬' : '🖼'}</span>
          )}
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
              flexShrink: 0,
            }}>START</span>
          )}
        </div>
      </div>

      {/* Question text */}
      <div style={{
        height: H_TEXT,
        padding: '8px 10px',
        background: 'rgba(247,251,255,0.96)',
        borderBottom: '1px solid rgba(112,162,249,0.12)',
        color: d.question_text ? '#223a63' : '#8aa1c3',
        fontSize: 12,
        lineHeight: '1.5',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
      }}>
        {d.question_text || 'Double-click to edit…'}
      </div>

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
              color: c.choice_text ? '#35527e' : '#8aa1c3',
              fontSize: 11,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {c.choice_text || `Choice ${c.label}`}
            </span>
            {(() => {
              const s = c.score_impact ?? 0; return s !== 0 && (
                <span style={{
                  color: s > 0 ? '#34d399' : '#fb7185',
                  fontSize: 10, fontWeight: 700,
                }}>
                  {s > 0 ? `+${s}` : s}
                </span>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
});

NormalNode.displayName = 'NormalNode';
