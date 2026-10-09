'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NodeIcon } from './NodeIcon';

// End nodes terminate a branch. They render an optional final message/media
// to the player, then finish the session. Target handle only — no outgoing
// edges. A session can have multiple end nodes (different endings).
export type EndNodeData = {
  node_name: string | null;
  question_text: string;
  media_type: string | null;
  media_url: string | null;
  media_explanation?: string | null;
  media_path: string | null;
  is_entry_point: boolean;
};

const H_HEADER = 36;

export const EndNode = memo(({ data, selected }: NodeProps) => {
  const d = data as EndNodeData;

  return (
    <div
      style={{
        width: 220,
        borderRadius: 10,
        border: `1.5px solid ${selected ? 'var(--ne-end)' : 'var(--nq-line)'}`,
        background: 'var(--nq-panel)',
        boxShadow: selected
          ? '0 0 0 3px color-mix(in srgb, var(--ne-end) 20%, transparent), var(--ne-node-shadow)'
          : 'var(--ne-node-shadow)',
        position: 'relative',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>

      {/* Target handle — terminal node, no source */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ top: H_HEADER / 2, width: 12, height: 12, background: 'var(--ne-end)', border: '2px solid var(--nq-panel)', boxShadow: '0 0 0 1px var(--ne-end)' }}
      />

      {/* Header */}
      <div style={{
        height: H_HEADER,
        background: 'color-mix(in srgb, var(--ne-end) 10%, var(--nq-panel))',
        borderRadius: '8px 8px 0 0',
        borderBottom: '1px solid var(--nq-line)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        color: 'var(--ne-end)',
      }}>
        <NodeIcon name="end" size={14} />
        <span style={{
          flex: 1, minWidth: 0,
          color: 'var(--nq-ink)', fontWeight: 700, fontSize: 12,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {d.node_name || 'End'}
        </span>
        {d.media_url && (
          <span title={d.media_type === 'video' ? 'Has video' : 'Has image'} style={{ color: 'var(--nq-muted)', display: 'flex' }}>
            <NodeIcon name={d.media_type === 'video' ? 'situation' : 'media'} size={13} />
          </span>
        )}
      </div>

      {d.media_explanation?.trim() && (
        <div style={{
          minHeight: 42,
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
          {d.media_explanation}
        </div>
      )}

      {/* Message */}
      <div style={{
        height: 52,
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
        {d.question_text || 'No final message'}
      </div>

      {/* Terminal badge */}
      <div style={{
        height: 28,
        background: 'color-mix(in srgb, var(--ne-end) 6%, var(--nq-panel))',
        borderRadius: '0 0 8px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--ne-end)',
      }}>
        Session ends here
      </div>
    </div>
  );
});

EndNode.displayName = 'EndNode';
