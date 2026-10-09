'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { NodeIcon } from './NodeIcon';

/**
 * Guards unsaved editor work against leaving the page:
 *  - reload / tab close → the browser's own "Leave site?" prompt
 *  - any in-app link (sidebar, back link, …) → a confirm dialog
 * Returns the dialog to render, plus `allowLeave` to call right before an
 * intentional navigation (e.g. after a successful save).
 */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const bypass = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bypass.current) return;
      e.preventDefault();
    };
    // Capture phase runs before Next's <Link> handler, so we can stop it.
    const onClick = (e: MouseEvent) => {
      if (bypass.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab/window
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  const allowLeave = useCallback(() => { bypass.current = true; }, []);

  const dialog = pendingHref ? (
    <LeaveDialog
      onStay={() => setPendingHref(null)}
      onLeave={() => {
        bypass.current = true;
        const href = pendingHref;
        setPendingHref(null);
        router.push(href);
      }}
    />
  ) : null;

  return { dialog, allowLeave };
}

function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onStay(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStay]);

  return (
    <div
      className="nq-node-editor"
      onClick={onStay}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(13,34,56,0.45)' }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-dialog-title"
        aria-describedby="leave-dialog-desc"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 400, background: 'var(--nq-panel)', border: '1px solid var(--nq-line)', borderRadius: 12, padding: 20 }}
      >
        <h2 id="leave-dialog-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--nq-ink)' }}>
          Leave without saving?
        </h2>
        <p id="leave-dialog-desc" style={{ margin: '6px 0 18px', fontSize: 14, lineHeight: 1.55, color: 'var(--nq-muted)' }}>
          You have changes to this quiz that haven&apos;t been saved. If you leave now, they&apos;ll be lost.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="nq-ne-btn nq-ne-btn-danger" onClick={onLeave}>Leave and discard</button>
          <button ref={stayRef} type="button" className="nq-ne-btn nq-ne-btn-primary" onClick={onStay}>Keep editing</button>
        </div>
      </div>
    </div>
  );
}

interface EditorHeaderProps {
  title: string;
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  published: boolean;
  onPublishedChange: (value: boolean) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  /** Disables editing and saving, e.g. while the graph failed to load. */
  disabled?: boolean;
  backHref: string;
}

export function EditorHeader({
  title, name, description, onNameChange, onDescriptionChange,
  published, onPublishedChange, onSave, saving, dirty, disabled, backHref,
}: EditorHeaderProps) {
  return (
    <header className="nq-node-editor nq-ne-card" style={{ padding: '12px 16px 14px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, minWidth: 0 }}>
          <Link href={backHref} className="nq-ne-back">
            <NodeIcon name="back" size={15} /> Quizzes Manager
          </Link>
          <span style={{ color: 'var(--nq-muted)' }}>/</span>
          <h1 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--nq-ink)', fontFamily: 'inherit' }}>{title}</h1>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span role="status" style={{ fontSize: 13, color: dirty ? 'var(--nq-ink)' : 'var(--nq-muted)' }}>
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'No changes'}
          </span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--nq-ink)', cursor: disabled ? 'not-allowed' : 'pointer' }}
            title="Published quizzes can be played. Drafts are only visible to admins.">
            <button
              type="button"
              role="switch"
              aria-checked={published}
              aria-label="Published"
              className="nq-ne-switch"
              disabled={disabled}
              onClick={() => onPublishedChange(!published)}
            />
            {published ? 'Published' : 'Draft'}
          </label>
          <Button onClick={onSave} loading={saving} disabled={disabled} size="sm">Save</Button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: 12 }}>
        <label>
          <span className="nq-ne-label">Quiz name</span>
          <input
            className="nq-ne-field nq-ne-field-lg"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Capital Cities"
            maxLength={200}
            disabled={disabled}
          />
        </label>
        <label>
          <span className="nq-ne-label">Description <small>(optional)</small></span>
          <input
            className="nq-ne-field nq-ne-field-lg"
            style={{ fontWeight: 400 }}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="What is this quiz about?"
            maxLength={2000}
            disabled={disabled}
          />
        </label>
      </div>
    </header>
  );
}
