'use client';

import { memo, useState, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';

export type SituationNodeData = {
  question_text: string;
  media_type: string | null;
  media_url: string | null;
  media_path: string | null;
  is_entry_point: boolean;
};

const H_HEADER = 36;

export const SituationNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as SituationNodeData;
  const { updateNodeData } = useReactFlow();

  const totalH = H_HEADER + 52 + (d.media_url ? 80 : 0) + 28;

  return (
    <div
      style={{
        width: 220,
        borderRadius: 12,
        border: `2px solid ${selected ? '#8b5cf6' : 'rgba(139,92,246,0.3)'}`,
        boxShadow: selected
            ? '0 0 0 3px rgba(139,92,246,0.25), 0 8px 32px rgba(0,0,0,0.6)'
            : '0 4px 24px rgba(0,0,0,0.5)',
        position: 'relative',
      }}>

      {/* Target handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ top: H_HEADER / 2, width: 12, height: 12, background: '#8b5cf6', border: '2px solid #a78bfa' }}
      />

      {/* Single source handle (continue) */}
      <Handle
        type="source"
        position={Position.Right}
        id="continue"
        style={{ top: totalH / 2, width: 12, height: 12, background: '#8b5cf6', border: '2px solid #a78bfa66' }}
      />

      {/* Header */}
      <div style={{
        height: H_HEADER,
        background: 'rgba(139,92,246,0.2)',
        borderRadius: '10px 10px 0 0',
        borderBottom: '1px solid rgba(139,92,246,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11 }}>🎬</span>
          <span style={{ color: '#c4b5fd', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Situation
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
            }}>START</span>
          )}
        </div>
      </div>

      {/* Description */}
      <div style={{
        height: 52,
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

      {/* Media thumbnail */}
      {d.media_url && (
        <div style={{ height: 80, overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative', background: '#0d0d20' }}>
          {d.media_type === 'video' ? (
            <video src={d.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
          ) : (
            <img src={d.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          <span style={{ position: 'absolute', bottom: 3, right: 5, fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>
            {d.media_type === 'video' ? '🎬' : '🖼'}
          </span>
        </div>
      )}

      {/* Display-only badge */}
      <div style={{
        height: 28,
        background: 'rgba(139,92,246,0.08)',
        borderRadius: '0 0 10px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        fontSize: 10,
        color: '#7c3aed',
        borderTop: '1px solid rgba(139,92,246,0.15)',
      }}>
        <span>👁</span>
        <span style={{ color: '#a78bfa' }}>Display only · no choices</span>
      </div>
    </div>
  );
});

SituationNode.displayName = 'SituationNode';
