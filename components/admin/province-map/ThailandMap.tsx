'use client';
import { useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { MAP_HEIGHT, MAP_WIDTH, PROVINCE_SHAPES } from '@/lib/maps/thailand-provinces';
import { PROVINCES } from '@/lib/onboarding/provinces';
import styles from './province-map.module.css';

/** How long the pointer must rest on a province before its summary appears. */
export const HOVER_DELAY_MS = 1500;
const CARD_WIDTH = 300;
const CARD_HEIGHT = 300;

type Box = [number, number, number, number];
type Card = { code: string; left: number; top: number; interactive: boolean };

const BANGKOK_METRO = PROVINCES.filter(p => p.region === 'bangkok_metro').map(p => p.code);
const union = (codes: string[], pad: number): Box => {
  const boxes = codes.map(c => PROVINCE_SHAPES[c].box);
  const x = Math.min(...boxes.map(b => b[0])) - pad, y = Math.min(...boxes.map(b => b[1])) - pad;
  const w = Math.max(...boxes.map(b => b[0] + b[2])) + pad - x, h = Math.max(...boxes.map(b => b[1] + b[3])) + pad - y;
  // Never zoom in so far that a small province fills the screen.
  const min = 140;
  return w < min || h < min ? [x - Math.max(0, min - w) / 2, y - Math.max(0, min - h) / 2, Math.max(w, min), Math.max(h, min)] : [x, y, w, h];
};
const FULL: Box = [0, 0, MAP_WIDTH, MAP_HEIGHT];
const centerOf = (el: Element) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] as const; };
/** Card position inside the map, beside the point and kept within the map. */
function placeCard(wrap: HTMLDivElement, clientX: number, clientY: number) {
  const r = wrap.getBoundingClientRect();
  const x = clientX - r.left, y = clientY - r.top;
  return { left: x + 16 + CARD_WIDTH > r.width ? Math.max(8, x - 16 - CARD_WIDTH) : x + 16, top: Math.max(8, Math.min(y + 16, r.height - CARD_HEIGHT)) };
}
const INSET: Box = union(BANGKOK_METRO, 6);

export default function ThailandMap({ fills, dimmed, active, zoomTo, pinned, labelFor, renderCard, onOpen, insetTitle }: {
  fills: Record<string, string>;
  dimmed: Set<string>;
  active: string | null;
  /** Provinces to zoom to; empty shows the whole country. */
  zoomTo: string[];
  /** Province whose card stays open (picked in search). */
  pinned: string | null;
  labelFor: (code: string) => string;
  renderCard: (code: string, style: CSSProperties, interactive: boolean) => ReactNode;
  onOpen: (code: string) => void;
  insetTitle: string;
}) {
  const hatchId = `map-hatch-${useId().replace(/:/g, '')}`;
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef<string | null>(null);
  const pointer = useRef({ x: 0, y: 0, type: 'mouse' });
  const [card, setCard] = useState<Card | null>(null);
  const [viewBox, setViewBox] = useState<Box>(FULL);
  const view = useRef<Box>(FULL);

  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clearTimer, []);

  // Zoom to the selected provinces, animated unless reduced motion is preferred.
  const zoomKey = zoomTo.join(',');
  useEffect(() => {
    const target = zoomKey ? union(zoomKey.split(','), 30) : FULL;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = view.current;
    let start: number | null = null, frame = 0;
    const step = (now: number) => {
      start ??= now;
      const t = reduce ? 1 : Math.min(1, (now - start) / 300);
      const ease = 1 - (1 - t) ** 3;
      view.current = from.map((v, i) => v + (target[i] - v) * ease) as Box;
      setViewBox(view.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [zoomKey]);

  const place = (clientX: number, clientY: number) => placeCard(wrap.current!, clientX, clientY);
  const show = (code: string, clientX: number, clientY: number, interactive: boolean) => setCard({ code, ...place(clientX, clientY), interactive });

  // Re-anchor the pinned card after zooming so it stays next to its province.
  const [pinnedCard, setPinnedCard] = useState<Omit<Card, 'interactive'> | null>(null);
  useEffect(() => {
    if (!pinned) return;
    const id = setTimeout(() => {
      const el = wrap.current?.querySelector(`[data-code="${pinned}"]`);
      if (el && wrap.current) setPinnedCard({ code: pinned, ...placeCard(wrap.current, ...centerOf(el)) });
    }, 320);
    return () => clearTimeout(id);
  }, [pinned, zoomKey]);
  const displayed: Card | null = card ?? (pinned && pinnedCard?.code === pinned ? { ...pinnedCard, interactive: true } : null);

  const codeAt = (target: EventTarget) => (target as Element).closest?.('[data-code]')?.getAttribute('data-code') ?? null;
  const onPointerMove = (e: PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY, type: e.pointerType };
    const code = codeAt(e.target);
    if (code !== hovered.current) {
      hovered.current = code;
      clearTimer();
      setCard(c => (c && !c.interactive ? null : c));
      if (code && e.pointerType !== 'touch') timer.current = setTimeout(() => show(code, pointer.current.x, pointer.current.y, false), HOVER_DELAY_MS);
    } else if (code && card && !card.interactive && card.code === code) {
      show(code, e.clientX, e.clientY, false);
    }
  };
  const onPointerLeave = () => { hovered.current = null; clearTimer(); setCard(c => (c && !c.interactive ? null : c)); };
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest?.('[data-card]')) return;
    const el = (e.target as Element).closest?.('[data-code]');
    const code = el?.getAttribute('data-code');
    if (!el || !code) { setCard(null); return; }
    // On touch, the first tap shows the summary; its button opens the details.
    if (pointer.current.type === 'touch' && !(displayed?.interactive && displayed.code === code)) { show(code, ...centerOf(el), true); return; }
    onOpen(code);
  };

  const shape = (code: string, focusable: boolean) => <path
    key={code} data-code={code} d={PROVINCE_SHAPES[code].d} className={styles.shape}
    fill={fills[code] === 'hatch' ? `url(#${hatchId})` : fills[code]}
    data-dim={dimmed.has(code) || undefined} data-active={active === code || displayed?.code === code || undefined}
    {...(focusable ? {
      tabIndex: 0, role: 'link', 'aria-label': labelFor(code),
      onFocus: (e: FocusEvent<SVGPathElement>) => show(code, ...centerOf(e.currentTarget), false),
      onBlur: () => setCard(c => (c?.code === code && !c.interactive ? null : c)),
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(code); } },
    } : {})}
  />;

  return <div ref={wrap} className={styles.mapWrap} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerDown={e => { pointer.current.type = e.pointerType; }} onClick={onClick}>
    <svg className={styles.map} viewBox={viewBox.join(' ')} preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="var(--map-empty)" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--map-hatch)" strokeWidth="2" />
        </pattern>
      </defs>
      {PROVINCES.map(p => shape(p.code, true))}
    </svg>
    {!zoomKey && <div className={styles.inset} aria-hidden="true">
      <p>{insetTitle}</p>
      <svg viewBox={INSET.join(' ')}>{BANGKOK_METRO.map(code => shape(code, false))}</svg>
    </div>}
    {displayed && <div data-card>{renderCard(displayed.code, { left: displayed.left, top: displayed.top }, displayed.interactive)}</div>}
  </div>;
}
