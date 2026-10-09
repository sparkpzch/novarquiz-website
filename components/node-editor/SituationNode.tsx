'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NodeIcon } from './NodeIcon';
import { StartBadge } from './NormalNode';

export type SituationNodeData = {
  node_name: string | null;
  question_text: string;
  media_type: string | null;
  media_url: string | null;
  media_explanation?: string | null;
  media_path: string | null;
  is_entry_point: boolean;
};

const H_HEADER = 36;
const H_BODY = 52;
const H_FOOTER = 28;

export const SituationNode = memo(({ data, selected }: NodeProps) => {
  const d = data as SituationNodeData;
  const description = d.media_explanation ?? d.question_text;

  const totalH = H_HEADER + H_BODY + H_FOOTER;

  return (
    <div
      style={{
        width: 220,
        borderRadius: 10,
        border: `1.5px solid ${selected ? 'var(--ne-situation)' : 'var(--nq-line)'}`,
        background: 'var(--nq-panel)',
        boxShadow: selected
          ? '0 0 0 3px color-mix(in srgb, var(--ne-situation) 20%, transparent), var(--ne-node-shadow)'
          : 'var(--ne-node-shadow)',
        position: 'relative',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>

      {/* Target handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ top: H_HEADER / 2, width: 12, height: 12, background: 'var(--ne-situation)', border: '2px solid var(--nq-panel)', boxShadow: '0 0 0 1px var(--ne-situation)' }}
      />

      {/* Single source handle (continue) */}
      <Handle
        type="source"
        position={Position.Right}
        id="continue"
        style={{ top: totalH / 2, width: 12, height: 12, background: 'var(--ne-situation)', border: '2px solid var(--nq-panel)', boxShadow: '0 0 0 1px var(--ne-situation)' }}
      />

      {/* Header */}
      <div style={{
        height: H_HEADER,
        background: 'color-mix(in srgb, var(--ne-situation) 10%, var(--nq-panel))',
        borderRadius: '8px 8px 0 0',
        borderBottom: '1px solid var(--nq-line)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        color: 'var(--ne-situation)',
      }}>
        <NodeIcon name="situation" size={14} />
        <span style={{
          flex: 1, minWidth: 0,
          color: 'var(--nq-ink)', fontWeight: 700, fontSize: 12,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {d.node_name || 'Situation'}
        </span>
        {d.media_url && (
          <span title={d.media_type === 'video' ? 'Has video' : 'Has image'} style={{ color: 'var(--nq-muted)', display: 'flex' }}>
            <NodeIcon name={d.media_type === 'video' ? 'situation' : 'media'} size={13} />
          </span>
        )}
        {d.is_entry_point && <StartBadge />}
      </div>

      {/* Description */}
      <div style={{
        height: H_BODY,
        padding: '8px 10px',
        borderBottom: '1px solid var(--nq-line)',
        color: description ? 'var(--nq-ink)' : 'var(--nq-muted)',
        fontSize: 12,
        fontWeight: 500,
        lineHeight: '1.5',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
      }}>
        {description || 'No description yet'}
      </div>

      {/* Display-only badge */}
      <div style={{
        height: H_FOOTER,
        background: 'color-mix(in srgb, var(--ne-situation) 6%, var(--nq-panel))',
        borderRadius: '0 0 8px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--ne-situation)',
      }}>
        Shows media, then continues
      </div>
    </div>
  );
});

SituationNode.displayName = 'SituationNode';
