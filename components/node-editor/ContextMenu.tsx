'use client';

import { useEffect, useRef } from 'react';
import { NodeIcon, type NodeIconName } from './NodeIcon';

interface ContextMenuProps {
  x: number;
  y: number;
  mode: 'canvas' | 'node';
  isEntryPoint?: boolean;
  /** End nodes can never be the start node. */
  canBeStart?: boolean;
  onAddNormal: () => void;
  onAddSituation: () => void;
  onAddEnd: () => void;
  onEdit: () => void;
  onSetEntry: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const Divider = () => (
  <div style={{ height: 1, background: 'var(--nq-line)', margin: '4px 2px' }} />
);

const MenuItem = ({
  icon, label, danger, color, onClick,
}: { icon: NodeIconName; label: string; danger?: boolean; color?: string; onClick: () => void }) => (
  <button type="button" role="menuitem" onClick={onClick} className="nq-ne-menu-item" data-danger={danger ? 'true' : undefined}>
    <span style={{ display: 'flex', color: danger ? 'inherit' : color ?? 'var(--nq-muted)' }}>
      <NodeIcon name={icon} size={15} />
    </span>
    {label}
  </button>
);

export function ContextMenu({
  x, y, mode, isEntryPoint, canBeStart = true,
  onAddNormal, onAddSituation, onAddEnd, onEdit, onSetEntry, onDelete, onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="nq-node-editor"
      style={{
        position: 'fixed',
        // Keep the menu on screen when opened near the right/bottom edge.
        left: Math.min(x, (typeof window === 'undefined' ? x : window.innerWidth) - 200),
        top: Math.min(y, (typeof window === 'undefined' ? y : window.innerHeight) - 170),
        zIndex: 1000,
        background: 'var(--nq-panel)',
        border: '1px solid var(--nq-line)',
        borderRadius: 10,
        boxShadow: '0 6px 16px rgba(22,50,79,0.14)',
        padding: 4,
        minWidth: 170,
        userSelect: 'none',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {mode === 'canvas' ? (
        <>
          <div className="nq-ne-eyebrow" style={{ padding: '4px 10px' }}>
            Add here
          </div>
          <MenuItem icon="question" color="var(--ne-question)" label="Question" onClick={() => { onAddNormal(); onClose(); }} />
          <MenuItem icon="situation" color="var(--ne-situation)" label="Situation" onClick={() => { onAddSituation(); onClose(); }} />
          <MenuItem icon="end" color="var(--ne-end)" label="End" onClick={() => { onAddEnd(); onClose(); }} />
        </>
      ) : (
        <>
          <MenuItem icon="edit" label="Edit" onClick={() => { onEdit(); onClose(); }} />
          {!isEntryPoint && canBeStart && (
            <MenuItem icon="start" color="var(--ne-start)" label="Set as start" onClick={() => { onSetEntry(); onClose(); }} />
          )}
          <Divider />
          <MenuItem icon="trash" label="Delete" danger onClick={() => { onDelete(); onClose(); }} />
        </>
      )}
    </div>
  );
}
