'use client';
import styles from './province-detail.module.css';

export type PairRow = { label: string; hint?: string; province: number | null; national: number | null };

/** Province vs Thailand as two thin bars per row, 0–100%, labelled at the end. */
export function PairedBars({ groups, provinceLabel, nationalLabel }: {
  groups: Array<{ title?: string; rows: PairRow[] }>; provinceLabel: string; nationalLabel: string;
}) {
  // The bar is a share of its own track, so lengths stay proportional; the value sits in a fixed column.
  const bar = (value: number | null, series: 'province' | 'national') => <div className={styles.barRow}>
    <span className={styles.track}>{value !== null && <span className={styles.bar} style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: `var(--d-${series})` }} />}</span>
    <span className={styles.barValue} data-national={series === 'national' || undefined}>{value === null ? '–' : `${value}%`}</span>
  </div>;
  return <>
    <ul className={styles.legend}>
      <li><span className={styles.key} style={{ background: 'var(--d-province)' }} />{provinceLabel}</li>
      <li><span className={styles.key} style={{ background: 'var(--d-national)' }} />{nationalLabel}</li>
    </ul>
    <div className={styles.pairs}>{groups.map((g, gi) => <div key={gi} className={styles.pairs}>
      {g.title && <h3>{g.title}</h3>}
      {g.rows.map(r => <div key={r.label} className={styles.pair} role="group" aria-label={`${r.label}: ${provinceLabel} ${r.province ?? '–'}%, ${nationalLabel} ${r.national ?? '–'}%`}>
        <span className={styles.pairLabel}>{r.label}{r.hint && <small>{r.hint}</small>}</span>
        <div className={styles.bars} aria-hidden="true">{bar(r.province, 'province')}{bar(r.national, 'national')}</div>
      </div>)}
    </div>)}</div>
  </>;
}

/** Share of people with 0, 1, 2, 3+ risk factors as one 100% bar per area. */
export function RiskGroups({ rows, labels }: { rows: Array<{ label: string; groups: [number, number, number, number] | null }>; labels: [string, string, string, string] }) {
  return <>
    <ul className={styles.legend}>{labels.map((l, i) => <li key={l}><span className={styles.key} style={{ background: `var(--d-ramp-${i})` }} />{l}</li>)}</ul>
    {rows.map(row => {
      const total = row.groups?.reduce((a, b) => a + b, 0) ?? 0;
      return <div key={row.label} className={styles.stackRow}>
        <span>{row.label}</span>
        {row.groups && total ? <div className={styles.stack} role="img" aria-label={`${row.label}: ${row.groups.map((n, i) => `${labels[i]} ${Math.round((n / total) * 100)}%`).join(', ')}`}>
          {row.groups.map((n, i) => n > 0 && <span key={i} data-step={i} style={{ width: `${(n / total) * 100}%`, background: `var(--d-ramp-${i})` }}>{n / total >= 0.08 ? `${Math.round((n / total) * 100)}%` : ''}</span>)}
        </div> : <span className={styles.sub}>–</span>}
      </div>;
    })}
  </>;
}

const W = 320, H = 150, PAD = { l: 30, r: 10, t: 16, b: 22 };
/** One measure per chart: monthly people as columns, accuracy as a line. */
export function Trend({ points, peopleLabel, accuracyLabel, monthLabel }: {
  points: Array<{ month: string; people: number; accuracy: number }>; peopleLabel: string; accuracyLabel: string; monthLabel: (m: string) => string;
}) {
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const step = iw / Math.max(points.length, 1);
  const maxPeople = Math.max(...points.map(p => p.people), 1);
  const x = (i: number) => PAD.l + step * i + step / 2;
  const yPeople = (v: number) => PAD.t + ih - (v / maxPeople) * ih;
  const yPct = (v: number) => PAD.t + ih - (v / 100) * ih;
  const axisX = points.map((p, i) => (points.length <= 6 || (points.length - 1 - i) % 2 === 0) && <text key={p.month} className={styles.axis} x={x(i)} y={H - 6} textAnchor="middle">{monthLabel(p.month)}</text>);
  const last = points.length - 1;
  return <div className={styles.trend}>
    <figure>
      <figcaption>{peopleLabel}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${peopleLabel}: ${points.map(p => `${monthLabel(p.month)} ${p.people}`).join(', ')}`}>
        <line className={styles.gridLine} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} />
        <text className={styles.axis} x={PAD.l - 6} y={PAD.t + 4} textAnchor="end">{maxPeople}</text>
        {points.map((p, i) => { const bw = Math.min(24, step * 0.6); const y = yPeople(p.people); const r = Math.min(4, (PAD.t + ih - y) / 2); return <path key={p.month} className={styles.col}
          d={`M${x(i) - bw / 2} ${PAD.t + ih}V${y + r}q0 -${r} ${r} -${r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${PAD.t + ih}Z`}><title>{`${monthLabel(p.month)}: ${p.people}`}</title></path>; })}
        {last >= 0 && <text className={styles.pointLabel} x={x(last)} y={yPeople(points[last].people) - 6} textAnchor="middle">{points[last].people}</text>}
        {axisX}
      </svg>
    </figure>
    <figure>
      <figcaption>{accuracyLabel}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${accuracyLabel}: ${points.map(p => `${monthLabel(p.month)} ${p.accuracy}%`).join(', ')}`}>
        {[0, 50, 100].map(v => <g key={v}><line className={styles.gridLine} x1={PAD.l} x2={W - PAD.r} y1={yPct(v)} y2={yPct(v)} /><text className={styles.axis} x={PAD.l - 6} y={yPct(v) + 3} textAnchor="end">{v}%</text></g>)}
        {points.length > 1 && <polyline className={styles.line} points={points.map((p, i) => `${x(i)},${yPct(p.accuracy)}`).join(' ')} />}
        {points.map((p, i) => <circle key={p.month} className={styles.dot} cx={x(i)} cy={yPct(p.accuracy)} r={4}><title>{`${monthLabel(p.month)}: ${p.accuracy}%`}</title></circle>)}
        {last >= 0 && <text className={styles.pointLabel} x={x(last)} y={yPct(points[last].accuracy) - 9} textAnchor="middle">{points[last].accuracy}%</text>}
        {axisX}
      </svg>
    </figure>
  </div>;
}
