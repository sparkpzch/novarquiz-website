'use client';

import { memo, useState, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';

// End nodes terminate a branch. They render an optional final message/media
// to the player, then finish the session. Target handle only — no outgoing
// edges. A session can have multiple end nodes (different endings).
export type EndNodeData = {
  node_name: string | null;
  question_text: string;
  media_type: string | null;
  media_url: string | null;
  media_path: string | null;
  is_entry_point: boolean;
};

const H_HEADER = 36;

export const EndNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as EndNodeData;
  const { updateNodeData } = useReactFlow();

  const totalH = H_HEADER + 52 + 28;

  return (
    <div
      style={{
        width: 220,
        borderRadius: 12,
        border: `2px solid ${selected ? '#f43f5e' : 'rgba(244,63,94,0.3)'}`,
        boxShadow: selected
            ? '0 0 0 3px rgba(244,63,94,0.25), 0 8px 32px rgba(0,0,0,0.6)'
            : '0 4px 24px rgba(0,0,0,0.5)',
        position: 'relative',
      }}>

      {/* Target handle — terminal node, no source */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ top: H_HEADER / 2, width: 12, height: 12, background: '#f43f5e', border: '2px solid #fb7185' }}
      />

      {/* Header */}
      <div style={{
        height: H_HEADER,
        background: 'rgba(244,63,94,0.2)',
        borderRadius: '10px 10px 0 0',
        borderBottom: '1px solid rgba(244,63,94,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, flexShrink: 0 }}>🏁</span>
          <span style={{
            color: '#9f1239', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {d.node_name || 'End'}
          </span>
          {d.media_url && (
            <span style={{ fontSize: 9, flexShrink: 0 }}>{d.media_type === 'video' ? '🎬' : '🖼'}</span>
          )}
        </div>
      </div>

      {/* Message */}
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
        {d.question_text || 'Final message (optional)…'}
      </div>

      {/* Terminal badge */}
      <div style={{
        height: 28,
        background: 'rgba(244,63,94,0.08)',
        borderRadius: '0 0 10px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        fontSize: 10,
        color: '#f43f5e',
        borderTop: '1px solid rgba(244,63,94,0.15)',
      }}>
        <span>🏁</span>
        <span style={{ color: '#fb7185' }}>Session ends here</span>
      </div>

      {/* Invisible spacer so total height calc matches situation card */}
      <div style={{ height: 0, marginTop: totalH - totalH }} />
    </div>
  );
});

EndNode.displayName = 'EndNode';
