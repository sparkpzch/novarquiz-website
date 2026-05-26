'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { IntendedAudience } from '@/lib/analytics/hcp';

export type SituationNodeData = {
  node_name: string | null;
  question_text: string;
  intended_audience: IntendedAudience;
  presentation_mode?: string;
  reading_level: string | null;
  jurisdiction_tags: string[];
  medical_review_version: string | null;
  legal_document_versions_required: Record<string, string>;
  media_type: string | null;
  media_url: string | null;
  media_path: string | null;
  is_entry_point: boolean;
};

const H_HEADER = 36;

export const SituationNode = memo(({ data, selected }: NodeProps) => {
  const d = data as SituationNodeData;

  const totalH = H_HEADER + 52 + 28;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, flexShrink: 0 }}>🎬</span>
          <span style={{
            color: '#5b21b6', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {d.node_name || 'Situation'}
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
              flexShrink: 0,
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
