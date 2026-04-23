'use client';

import { memo, useState, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';

export type SituationNodeData = {
  question_text: string;
  media_type: string | null;
  media_url: string | null;
  is_entry_point: boolean;
};

const H_HEADER = 36;

export const SituationNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as SituationNodeData;
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

  const totalH = H_HEADER + 52 + (d.media_url ? 24 : 0) + 28;

  return (
    <div
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        width: 220,
        borderRadius: 12,
        border: `2px solid ${dragOver ? '#8b5cf6' : selected ? '#8b5cf6' : 'rgba(139,92,246,0.3)'}`,
        boxShadow: dragOver
          ? '0 0 0 4px rgba(139,92,246,0.4), 0 8px 32px rgba(0,0,0,0.6)'
          : selected
            ? '0 0 0 3px rgba(139,92,246,0.25), 0 8px 32px rgba(0,0,0,0.6)'
            : '0 4px 24px rgba(0,0,0,0.5)',
        position: 'relative',
      }}>
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20, borderRadius: 10,
          background: 'rgba(139,92,246,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ color: '#c4b5fd', fontSize: 11, fontWeight: 700 }}>Drop media here</span>
        </div>
      )}

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

      {/* Media indicator */}
      {d.media_url && (
        <div style={{
          background: '#0d0d20',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '4px 10px',
          fontSize: 10,
          color: '#6b7280',
        }}>
          {d.media_type === 'video' ? '🎬 Video' : '🖼 Image'}
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
