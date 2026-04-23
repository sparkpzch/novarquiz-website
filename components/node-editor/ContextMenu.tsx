'use client';

import { useEffect, useRef } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  mode: 'canvas' | 'node';
  isEntryPoint?: boolean;
  onAddNormal: () => void;
  onAddSituation: () => void;
  onAddEnd: () => void;
  onEdit: () => void;
  onSetEntry: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const Divider = () => (
  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
);

const MenuItem = ({
  icon, label, danger, onClick,
}: { icon: string; label: string; danger?: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: '7px 12px',
      background: 'none',
      border: 'none',
      color: danger ? '#f87171' : '#e2e8f0',
      fontSize: 13,
      cursor: 'pointer',
      borderRadius: 6,
      transition: 'background 0.1s',
      textAlign: 'left',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.08)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
  >
    <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{icon}</span>
    {label}
  </button>
);

export function ContextMenu({
  x, y, mode, isEntryPoint,
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
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 1000,
        background: '#13132b',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        padding: '6px',
        minWidth: 180,
        userSelect: 'none',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {mode === 'canvas' ? (
        <>
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Add Node
          </div>
          <MenuItem icon="❓" label="Question Node" onClick={() => { onAddNormal(); onClose(); }} />
          <MenuItem icon="🎬" label="Situation Node" onClick={() => { onAddSituation(); onClose(); }} />
          <MenuItem icon="🏁" label="End Node" onClick={() => { onAddEnd(); onClose(); }} />
        </>
      ) : (
        <>
          <MenuItem icon="✏️" label="Edit Node" onClick={() => { onEdit(); onClose(); }} />
          {!isEntryPoint && (
            <MenuItem icon="🚩" label="Set as Start" onClick={() => { onSetEntry(); onClose(); }} />
          )}
          <Divider />
          <MenuItem icon="🗑" label="Delete Node" danger onClick={() => { onDelete(); onClose(); }} />
        </>
      )}
    </div>
  );
}
