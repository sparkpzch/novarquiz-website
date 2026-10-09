'use client';

import { memo } from 'react';
import { Handle, Position, useNodeConnections, type NodeProps } from '@xyflow/react';
import { DEFAULT_CHOICE_METADATA } from '@/lib/analytics/quiz-metadata';
import { NodeIcon } from './NodeIcon';

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
    behavior_meaning: string | null;
    clinical_tags: string[];
  }>;
  media_type: string | null;
  media_url: string | null;
  media_explanation?: string | null;
  media_path: string | null;
  is_entry_point: boolean;
  timer_override: number | null;
};

const CHOICE_CFG = {
  A: { color: '#ef4444', bg: 'rgba(239,68,68,0.07)' },
  B: { color: '#3b82f6', bg: 'rgba(59,130,246,0.07)' },
  C: { color: '#22c55e', bg: 'rgba(34,197,94,0.07)' },
  D: { color: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
} as const;

const H_HEADER = 36;
const H_TEXT = 52;
const H_MEDIA_EXPLANATION = 42;
const H_CHOICE = 32;

export const NormalNode = memo(({ data, selected }: NodeProps) => {
  const d = data as NormalNodeData;
  const choices = d.choices?.length
    ? d.choices
    : ['A', 'B', 'C', 'D'].map(l => ({ label: l, choice_text: '', score_impact: 0, explanation: '', ...DEFAULT_CHOICE_METADATA }));

  // Track which choice handles already have outgoing connections — used to hide the
  // "connect all" handle once every choice is wired up.
  const sourceConnections = useNodeConnections({ handleType: 'source' });
  const connectedChoices = new Set(
    sourceConnections.map(c => c.sourceHandle).filter((h): h is string => !!h)
  );
  const allChoicesConnected = choices.every(c => connectedChoices.has(c.label));

  const mediaExplanation = d.media_explanation?.trim() ?? '';
  const mediaExplanationHeight = mediaExplanation ? H_MEDIA_EXPLANATION : 0;
  const choiceAreaTop = H_HEADER + mediaExplanationHeight + H_TEXT;

  const choiceHandleStyle = (color: string, idx: number): React.CSSProperties => ({
    top: choiceAreaTop + idx * H_CHOICE + H_CHOICE / 2,
    width: 10,
    height: 10,
    background: color,
    border: '2px solid var(--nq-panel)',
    boxShadow: `0 0 0 1px ${color}`,
  });

  return (
    <div
      style={{
        width: 248,
        borderRadius: 10,
        border: `1.5px solid ${selected ? 'var(--ne-question)' : 'var(--nq-line)'}`,
        background: 'var(--nq-panel)',
        boxShadow: selected
          ? '0 0 0 3px color-mix(in srgb, var(--ne-question) 20%, transparent), var(--ne-node-shadow)'
          : 'var(--ne-node-shadow)',
        position: 'relative',
        transition: 'border-color 0.15s, box-shadow 0.15s',
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
          background: 'var(--ne-question)',
          border: '2px solid var(--nq-panel)',
          boxShadow: '0 0 0 1px var(--ne-question)',
        }}
      />

      {/*
        "Connect All" handle — positioned just above choice A.
        Drag from this to connect ALL choices to the target node at once.
        Hidden when every choice is already connected, since the action would
        be a no-op.
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
            background: 'var(--nq-panel)',
            border: '2.5px solid var(--ne-question)',
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
        boxSizing: 'border-box',
        background: 'color-mix(in srgb, var(--ne-question) 10%, var(--nq-panel))',
        borderRadius: '8px 8px 0 0',
        borderBottom: '1px solid var(--nq-line)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 6,
        color: 'var(--ne-question)',
      }}>
        <NodeIcon name="question" size={14} />
        <span style={{
          flex: 1, minWidth: 0,
          color: 'var(--nq-ink)', fontWeight: 700, fontSize: 12,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {d.node_name || 'Question'}
        </span>
        {d.media_url && (
          <span title={d.media_type === 'video' ? 'Has video' : 'Has image'} style={{ color: 'var(--nq-muted)', display: 'flex' }}>
            <NodeIcon name={d.media_type === 'video' ? 'situation' : 'media'} size={13} />
          </span>
        )}
        {d.is_entry_point && <StartBadge />}
      </div>

      {mediaExplanation && (
        <div style={{
          height: H_MEDIA_EXPLANATION,
          boxSizing: 'border-box',
          padding: '6px 10px',
          background: 'var(--nq-inset)',
          borderBottom: '1px solid var(--nq-line)',
          color: 'var(--nq-muted)',
          fontSize: 10,
          lineHeight: '1.45',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
        }}>
          <span style={{ fontWeight: 700 }}>Media: </span>
          {mediaExplanation}
        </div>
      )}

      {/* Question text */}
      <div style={{
        height: H_TEXT,
        boxSizing: 'border-box',
        padding: '8px 10px',
        borderBottom: '1px solid var(--nq-line)',
        color: d.question_text ? 'var(--nq-ink)' : 'var(--nq-muted)',
        fontSize: 12,
        fontWeight: 500,
        lineHeight: '1.5',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
      }}>
        {d.question_text || 'No question yet'}
      </div>

      {/* Choice rows */}
      {choices.map((c, idx) => {
        const cfg = CHOICE_CFG[c.label as keyof typeof CHOICE_CFG] ?? CHOICE_CFG.A;
        const s = c.score_impact ?? 0;
        return (
          <div key={c.label} style={{
            height: H_CHOICE,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px 0 10px',
            gap: 7,
            background: cfg.bg,
            borderBottom: idx < choices.length - 1 ? '1px solid var(--nq-line)' : 'none',
            borderRadius: idx === choices.length - 1 ? '0 0 8px 8px' : 0,
          }}>
            <span style={{
              width: 17, height: 17,
              borderRadius: 6,
              background: cfg.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 9, flexShrink: 0,
            }}>{c.label}</span>
            <span style={{
              flex: 1,
              color: c.choice_text ? 'var(--nq-ink)' : 'var(--nq-muted)',
              fontSize: 11,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {c.choice_text || `Choice ${c.label}`}
            </span>
            {s !== 0 && (
              <span style={{ color: s > 0 ? 'var(--ne-start)' : 'var(--ne-end)', fontSize: 10, fontWeight: 800 }}>
                {s > 0 ? `+${s}` : s}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

export function StartBadge() {
  return (
    <span style={{
      background: 'color-mix(in srgb, var(--ne-start) 14%, transparent)',
      color: 'var(--ne-start)',
      borderRadius: 4,
      padding: '1px 6px',
      fontSize: 10,
      fontWeight: 700,
      flexShrink: 0,
    }}>Start</span>
  );
}

NormalNode.displayName = 'NormalNode';
