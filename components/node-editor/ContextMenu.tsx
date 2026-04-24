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
  <div style={{ height: 1, background: 'rgba(112,162,249,0.16)', margin: '4px 0' }} />
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
      color: danger ? '#c2415b' : '#223a63',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      borderRadius: 6,
      transition: 'background 0.1s',
      textAlign: 'left',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = danger ? 'rgba(244,63,94,0.1)' : 'rgba(112,162,249,0.12)'; }}
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
        background: 'linear-gradient(180deg, rgba(246,250,255,0.98) 0%, rgba(232,240,255,0.96) 100%)',
        border: '1px solid rgba(112,162,249,0.2)',
        borderRadius: 10,
        boxShadow: '0 16px 32px rgba(82,114,164,0.2)',
        backdropFilter: 'blur(18px)',
        padding: '6px',
        minWidth: 180,
        userSelect: 'none',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {mode === 'canvas' ? (
        <>
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: '#5f7699', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>
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
