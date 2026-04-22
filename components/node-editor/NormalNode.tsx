'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export type NormalNodeData = {
  question_text: string;
  choices: Array<{ label: string; choice_text: string; is_correct: boolean }>;
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

// Fixed layout heights for handle positioning
const H_HEADER = 36;
const H_TEXT = 52;
const H_CHOICE = 32;

export const NormalNode = memo(({ data, selected }: NodeProps) => {
  const d = data as NormalNodeData;
  const choices = d.choices?.length
    ? d.choices
    : ['A', 'B', 'C', 'D'].map(l => ({ label: l, choice_text: '', is_correct: false }));

  return (
    <div style={{
      width: 248,
      borderRadius: 12,
      border: `2px solid ${selected ? '#6366f1' : 'rgba(255,255,255,0.12)'}`,
      boxShadow: selected
        ? '0 0 0 3px rgba(99,102,241,0.25), 0 8px 32px rgba(0,0,0,0.6)'
        : '0 4px 24px rgba(0,0,0,0.5)',
      position: 'relative',
    }}>
      {/* Target handle (incoming) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ top: H_HEADER / 2, width: 12, height: 12, background: '#6366f1', border: '2px solid #818cf8' }}
      />

      {/* Source handles — one per choice, positioned to align with each row */}
      {choices.map((c, idx) => {
        const cfg = CHOICE_CFG[c.label as keyof typeof CHOICE_CFG] ?? CHOICE_CFG.A;
        return (
          <Handle
            key={c.label}
            type="source"
            position={Position.Right}
            id={c.label}
            style={{
              top: H_HEADER + H_TEXT + idx * H_CHOICE + H_CHOICE / 2,
              width: 10,
              height: 10,
              background: cfg.color,
              border: `2px solid ${cfg.color}66`,
            }}
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
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: cfg.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 9,
              flexShrink: 0,
            }}>{c.label}</span>
            <span style={{
              flex: 1,
              color: c.choice_text ? '#d1d5db' : '#4b5563',
              fontSize: 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {c.choice_text || `Choice ${c.label}`}
            </span>
            {c.is_correct && (
              <span style={{ color: '#34d399', fontSize: 10, fontWeight: 700 }}>✓</span>
            )}
          </div>
        );
      })}
    </div>
  );
});

NormalNode.displayName = 'NormalNode';
