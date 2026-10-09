// Line icons for the node editor, matching the stroke icons used elsewhere in
// the dashboard (emoji rendered differently on every OS).
const PATHS = {
  question: 'M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3m.1 4h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
  situation: 'M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  end: 'M3 21V4m0 0h13l-2 4 2 4H3',
  edit: 'M15.2 5.2l3.6 3.6M4 20l4.5-1 10-10a2.5 2.5 0 00-3.5-3.5l-10 10L4 20z',
  start: 'M5 3l14 9-14 9V3z',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  media: 'M4 16l4.6-4.6a2 2 0 012.8 0L16 16m-2-2l1.6-1.6a2 2 0 012.8 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  back: 'M15 19l-7-7 7-7',
} as const;

export type NodeIconName = keyof typeof PATHS;

export function NodeIcon({ name, size = 16, strokeWidth = 2 }: { name: NodeIconName; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={PATHS[name]} />
    </svg>
  );
}
