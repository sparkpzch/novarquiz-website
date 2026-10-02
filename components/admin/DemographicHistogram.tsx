'use client';

import { useId } from 'react';
import type { HistogramData } from '@/lib/onboarding/survey';
import styles from './report-charts.module.css';

export default function DemographicHistogram({ data, title, unit, th = false, countLabel, finalInclusive = false }: {
  data: HistogramData; title: string; unit: string; th?: boolean; countLabel?: string; finalInclusive?: boolean;
}) {
  const id = useId();
  const copy = (en: string, thai: string) => th ? thai : en;
  const frequency = countLabel ?? copy('Participants', 'จำนวนผู้ใช้');
  const max = Math.max(1, ...data.bins.map(bin => bin.count));
  const magnitude = 10 ** Math.floor(Math.log10(max / 4 || 1));
  const step = Math.max(1, [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= max / 4) ?? magnitude * 10);
  const ceiling = Math.ceil(max / step) * step;
  const left = 42, top = 28, width = 294, height = 150, bottom = top + height;
  const barWidth = width / Math.max(1, data.bins.length);
  const tickStride = Math.max(1, Math.ceil(data.bins.length / 5));
  return <figure className={styles.histogram}>
    <h3>{title}</h3>
    <p className={styles.histogramMeta}>{copy(`${data.answered} ${countLabel ?? "responses"} · ${data.binWidth} ${unit} per interval`, `${countLabel ?? "คำตอบ"}: ${data.answered} · ช่วงละ ${data.binWidth} ${unit}`)}</p>
    {data.answered > 0 ? <>
      <svg viewBox="0 0 360 235" className={styles.histogramSvg} role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-description`}>{`${frequency}: ${copy('equal-width intervals', 'แบ่งช่วงข้อมูลเท่ากัน')}`} {data.bins.map(bin => `${bin.label} ${unit}: ${bin.count}`).join('; ')}</desc>
        <text x={left} y={15} className={styles.histogramAxis}>{frequency}</text>
        {Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => {
          const count = i * step, y = bottom - count / ceiling * height;
          return <g key={count}><line x1={left} x2={left + width} y1={y} y2={y} className={styles.histogramGrid} /><text x={left - 8} y={y + 4} textAnchor="end" className={styles.histogramAxis}>{count}</text></g>;
        })}
        {data.bins.map((bin, index) => {
          const barHeight = bin.count / ceiling * height;
          return <g key={bin.start}>
            <rect x={left + index * barWidth} y={bottom - barHeight} width={barWidth} height={barHeight} className={styles.histogramBar}>
              <title>{`${frequency}: ${bin.count} (${bin.label} ${unit})`}</title>
            </rect>
            {data.bins.length <= 8 && bin.count > 0 && <text x={left + (index + .5) * barWidth} y={bottom - barHeight - 7} textAnchor="middle" className={styles.histogramCount}>{bin.count}</text>}
            {index % tickStride === 0 && <text x={left + index * barWidth} y={bottom + 19} textAnchor="middle" className={styles.histogramAxis}>{bin.start}</text>}
          </g>;
        })}
        <line x1={left} x2={left + width} y1={bottom} y2={bottom} className={styles.histogramBaseline} />
        <text x={left + width} y={bottom + 19} textAnchor="end" className={styles.histogramAxis}>{data.bins.at(-1)?.end}</text>
        <text x={left + width / 2} y={225} textAnchor="middle" className={styles.histogramAxis}>{title} ({unit})</text>
      </svg>
      <details className={styles.histogramValues}><summary>{copy('View interval counts', 'ดูจำนวนในแต่ละช่วง')}</summary><table><caption>{finalInclusive ? copy('Intervals include the lower boundary. Only the final interval includes the upper boundary.', 'แต่ละช่วงรวมค่าขอบล่าง เฉพาะช่วงสุดท้ายรวมค่าขอบบนด้วย') : copy('Each interval includes its lower boundary and excludes its upper boundary.', 'แต่ละช่วงรวมค่าขอบล่าง แต่ไม่รวมค่าขอบบน')}</caption><thead><tr><th scope="col">{copy('Interval', 'ช่วงข้อมูล')} ({unit})</th><th scope="col">{frequency}</th></tr></thead><tbody>{data.bins.map(bin => <tr key={bin.start}><th scope="row">{bin.label}</th><td>{bin.count}</td></tr>)}</tbody></table></details>
    </> : <p className={styles.note}>{copy('No data yet.', 'ยังไม่มีข้อมูล')}</p>}
    <p className={styles.histogramMeta}>{copy(`Not stated: ${data.missing} · excluded from this histogram`, `ไม่มีข้อมูล: ${data.missing} · ไม่นับรวมในกราฟ`)}</p>
  </figure>;
}
