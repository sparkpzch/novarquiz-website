'use client';

import { useId, useState } from 'react';
import type { HistogramData } from '@/lib/onboarding/survey';
import styles from './report-charts.module.css';

/** Column top with a 4px rounded data-end and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export default function DemographicHistogram({ data, title, unit, th = false, countLabel, finalInclusive = false }: {
  data: HistogramData; title: string; unit: string; th?: boolean; countLabel?: string; finalInclusive?: boolean;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const copy = (en: string, thai: string) => th ? thai : en;
  const frequency = countLabel ?? copy('Participants', 'จำนวนผู้ใช้');
  const max = Math.max(1, ...data.bins.map(bin => bin.count));
  const magnitude = 10 ** Math.floor(Math.log10(max / 4 || 1));
  const step = Math.max(1, [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= max / 4) ?? magnitude * 10);
  const ceiling = Math.ceil(max / step) * step;
  const left = 32, top = 16, width = 316, height = 160, bottom = top + height, viewWidth = 360, viewHeight = 206;
  const slot = width / Math.max(1, data.bins.length);
  const gap = 2;
  const tickStride = Math.max(1, Math.ceil(data.bins.length / 6));
  const peak = data.bins.reduce((best, bin, index) => bin.count > data.bins[best].count ? index : best, 0);
  const labelAll = data.bins.length <= 6;
  const activeBin = active === null ? null : data.bins[active];
  return <figure className={styles.histogram}>
    <figcaption className={styles.histogramHead}>
      <h3>{title}</h3>
      <span>{copy(`${data.answered} ${countLabel?.toLowerCase() ?? 'responses'}`, `${data.answered} ${countLabel ?? 'คำตอบ'}`)}</span>
    </figcaption>
    {data.answered > 0 ? <>
      <div className={styles.histogramPlot} onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className={styles.histogramSvg} role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>{title}</title>
          <desc id={`${id}-description`}>{`${frequency}: ${copy('equal-width intervals', 'แบ่งช่วงข้อมูลเท่ากัน')}`} {data.bins.map(bin => `${bin.label} ${unit}: ${bin.count}`).join('; ')}</desc>
          {Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => {
            const count = i * step, y = bottom - count / ceiling * height;
            return <g key={count}>{i > 0 && <line x1={left} x2={left + width} y1={y} y2={y} className={styles.histogramGrid} />}<text x={left - 8} y={y + 4} textAnchor="end" className={styles.histogramAxis}>{count}</text></g>;
          })}
          {data.bins.map((bin, index) => {
            const barHeight = bin.count / ceiling * height;
            const x = left + index * slot + gap / 2;
            const dimmed = active !== null && active !== index;
            const showLabel = bin.count > 0 && (labelAll || index === peak);
            return <g key={bin.start}>
              {barHeight > 0 && <path d={columnPath(x, bottom - barHeight, slot - gap, barHeight)} className={styles.histogramBar} data-dimmed={dimmed || undefined} />}
              {showLabel && <text x={x + (slot - gap) / 2} y={bottom - barHeight - 6} textAnchor="middle" className={styles.histogramCount}>{bin.count}</text>}
              {index % tickStride === 0 && <text x={left + index * slot} y={bottom + 18} textAnchor="middle" className={styles.histogramAxis}>{bin.start}</text>}
              <rect x={left + index * slot} y={top} width={slot} height={height} fill="transparent" onMouseEnter={() => setActive(index)} />
            </g>;
          })}
          <line x1={left} x2={left + width} y1={bottom} y2={bottom} className={styles.histogramBaseline} />
          <text x={left + width} y={bottom + 18} textAnchor="end" className={styles.histogramAxis}>{data.bins.at(-1)?.end}</text>
        </svg>
        {activeBin && active !== null && <div className={styles.histogramTip} role="status" style={{ left: `${((left + (active + .5) * slot) / viewWidth) * 100}%`, top: `${((bottom - activeBin.count / ceiling * height) / viewHeight) * 100}%` }}>
          <strong>{activeBin.count}</strong> {frequency.toLowerCase()}<span>{activeBin.label} {unit}</span>
        </div>}
      </div>
      <details className={styles.histogramValues}><summary>{copy('View as table', 'ดูเป็นตาราง')}</summary><table><caption>{finalInclusive ? copy('Intervals include the lower boundary. Only the final interval includes the upper boundary.', 'แต่ละช่วงรวมค่าขอบล่าง เฉพาะช่วงสุดท้ายรวมค่าขอบบนด้วย') : copy('Each interval includes its lower boundary and excludes its upper boundary.', 'แต่ละช่วงรวมค่าขอบล่าง แต่ไม่รวมค่าขอบบน')}</caption><thead><tr><th scope="col">{copy('Interval', 'ช่วงข้อมูล')} ({unit})</th><th scope="col">{frequency}</th></tr></thead><tbody>{data.bins.map(bin => <tr key={bin.start}><th scope="row">{bin.label}</th><td>{bin.count}</td></tr>)}</tbody></table></details>
    </> : <p className={styles.note}>{copy('No data yet.', 'ยังไม่มีข้อมูล')}</p>}
    <p className={styles.histogramMeta}>{copy(`${title} (${unit}) · ${data.binWidth} ${unit} per interval`, `${title} (${unit}) · ช่วงละ ${data.binWidth} ${unit}`)}{data.missing > 0 && copy(` · ${data.missing} not stated`, ` · ไม่ระบุ ${data.missing}`)}</p>
  </figure>;
}
