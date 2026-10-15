'use client';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { PROVINCE_FILTER_KEYS, type ProvinceReport } from '@/lib/analytics/lscvd';
import { CLASS_COUNT, METRICS, classBreaks, classOf, formatMetric, isSuppressed, metricByKey, type ScaleMode } from '@/lib/analytics/lscvd-metrics';
import { MAP_ATTRIBUTION } from '@/lib/maps/thailand-provinces';
import { PROVINCES, REGION_LABELS, type ThaiRegion } from '@/lib/onboarding/provinces';
import ThailandMap from './ThailandMap';
import ProvinceCard from './ProvinceCard';
import styles from './province-map.module.css';

/** Filters that change who is counted; everything else is applied in the browser. */
const SERVER_KEYS = PROVINCE_FILTER_KEYS;
const CLIENT_KEYS = ['color', 'scale', 'region', 'min', 'top', 'sel'] as const;
const AGE_OPTIONS: Array<[string, string, string]> = [['under18', 'Under 18', 'ต่ำกว่า 18 ปี'], ['18_29', '18–29', '18–29 ปี'], ['30_44', '30–44', '30–44 ปี'], ['45_59', '45–59', '45–59 ปี'], ['60plus', '60+', '60 ปีขึ้นไป']];
const name = (code: string, th: boolean) => { const p = PROVINCES.find(x => x.code === code)!; return th ? p.th : p.en; };

export default function ProvinceExplorer() {
  const { i18n } = useTranslation(); const th = i18n.language.startsWith('th');
  const copy = (en: string, thai: string) => (th ? thai : en);
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();

  const get = (key: string) => params.get(key) ?? '';
  const metric = metricByKey(get('color'));
  const scale: ScaleMode = get('scale') === 'equal' ? 'equal' : 'quantile';
  const region = get('region') as ThaiRegion | '';
  const min = Math.max(0, Number(get('min')) || 0);
  const top = Math.max(0, Number(get('top')) || 0);
  const selected = useMemo(() => get('sel').split(',').filter(c => PROVINCES.some(p => p.code === c)), [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const serverQuery = useMemo(() => { const q = new URLSearchParams(); for (const k of SERVER_KEYS) if (params.get(k)) q.set(k, params.get(k)!); return q.toString(); }, [params]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  const [result, setResult] = useState<{ key: string; data: ProvinceReport | null; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const fetchKey = `${serverQuery}:${retry}`;
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/admin/analytics/provinces${serverQuery ? `?${serverQuery}` : ''}`, { signal: abort.signal, cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setResult({ key: fetchKey, data, error: false }))
      .catch(() => { if (!abort.signal.aborted) setResult({ key: fetchKey, data: null, error: true }); });
    return () => abort.abort();
  }, [serverQuery, fetchKey]);
  const current = result?.key === fetchKey ? result : null;
  const report = current?.data ?? null;

  const [quizzes, setQuizzes] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => { fetch('/api/quizzes?all=true').then(r => (r.ok ? r.json() : [])).then(list => setQuizzes(Array.isArray(list) ? list : [])).catch(() => {}); }, []);

  // Which provinces pass the region / minimum / top-N filters, and how each is coloured.
  const view = useMemo(() => {
    if (!report) return null;
    const inRegion = PROVINCES.filter(p => !region || p.region === region);
    const passing = inRegion.filter(p => report.provinces[p.code].participants >= min);
    const valued = passing.map(p => ({ code: p.code, value: isSuppressed(metric, report.provinces[p.code]) ? null : metric.value(report.provinces[p.code]) }));
    const ranked = valued.filter(v => v.value !== null).sort((a, b) => b.value! - a.value!);
    const visible = new Set((top ? ranked.slice(0, top) : valued).map(v => v.code));
    const breaks = classBreaks(ranked.map(v => v.value!), scale);
    const fills: Record<string, string> = {};
    for (const p of PROVINCES) {
      const s = report.provinces[p.code];
      const value = metric.value(s);
      fills[p.code] = s.participants === 0 ? 'var(--map-empty)' : isSuppressed(metric, s) ? 'hatch' : value === null ? 'var(--map-empty)' : `var(--map-ramp-${classOf(value, breaks)})`;
    }
    const dimmed = new Set(PROVINCES.map(p => p.code).filter(c => !visible.has(c) || (selected.length > 0 && !selected.includes(c))));
    return { fills, dimmed, breaks, rows: [...visible] };
  }, [report, region, min, top, metric, scale, selected]);

  const [sort, setSort] = useState<{ key: 'name' | 'region' | 'participants' | 'metric'; desc: boolean }>({ key: 'metric', desc: true });
  const [active, setActive] = useState<string | null>(null);
  const rows = useMemo(() => {
    if (!report || !view) return [];
    const list = (selected.length ? view.rows.filter(c => selected.includes(c)) : view.rows).map(code => {
      const p = PROVINCES.find(x => x.code === code)!; const s = report.provinces[code];
      return { code, p, s, value: isSuppressed(metric, s) ? null : metric.value(s) };
    });
    const dir = sort.desc ? -1 : 1;
    const cmp = {
      name: (a: typeof list[0], b: typeof list[0]) => (th ? a.p.th.localeCompare(b.p.th, 'th') : a.p.en.localeCompare(b.p.en)) * dir,
      region: (a: typeof list[0], b: typeof list[0]) => (REGION_LABELS.findIndex(r => r.region === a.p.region) - REGION_LABELS.findIndex(r => r.region === b.p.region)) * dir,
      participants: (a: typeof list[0], b: typeof list[0]) => (a.s.participants - b.s.participants) * dir,
      metric: (a: typeof list[0], b: typeof list[0]) => (a.value === null ? 1 : b.value === null ? -1 : (a.value - b.value) * dir),
    }[sort.key];
    return list.sort(cmp);
  }, [report, view, selected, metric, sort, th]);

  // The full query travels along so "back to map" restores every filter.
  const detailHref = (code: string) => `/admin/analytics/province/${code}${params.size ? `?${params}` : ''}`;
  const open = (code: string) => router.push(detailHref(code));

  // Province search with keyboard-navigable suggestions.
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);
  const matches = term.trim() ? PROVINCES.filter(p => !selected.includes(p.code) && (p.th.includes(term.trim()) || p.en.toLowerCase().includes(term.trim().toLowerCase()))).slice(0, 8) : [];
  const pick = (code: string) => { update({ sel: [...selected, code].join(',') }); setTerm(''); setCursor(0); };
  const hasFilters = [...SERVER_KEYS, ...CLIENT_KEYS].some(k => params.get(k));
  const sortHeader = (key: typeof sort.key, label: string, num = false) => <th className={num ? styles.num : undefined} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
    <button type="button" onClick={() => setSort(s => ({ key, desc: s.key === key ? !s.desc : key !== 'name' && key !== 'region' }))}>{label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}</button>
  </th>;

  return <section className={styles.root} aria-label={copy('Province map', 'แผนที่รายจังหวัด')}>
    <div className={`${styles.panel} ${styles.filters}`}>
      <div className={styles.heading}>
        <div>
          <h2>{copy('Heart and lipid health by province', 'สุขภาพหัวใจและไขมันรายจังหวัด')}</h2>
          <p>{copy('Rest the pointer on a province for its summary, or click for details.', 'ชี้ค้างที่จังหวัดเพื่อดูสรุป หรือคลิกเพื่อดูรายละเอียด')}</p>
        </div>
      </div>
      <div className={styles.filterRow}>
        <div className={styles.search}>
          <label htmlFor="province-search">{copy('Find a province', 'ค้นหาจังหวัด')}</label>
          <input id="province-search" role="combobox" aria-expanded={matches.length > 0} aria-controls="province-options" aria-autocomplete="list"
            aria-activedescendant={matches[cursor] ? `province-option-${matches[cursor].code}` : undefined}
            placeholder={copy('Type a name, e.g. Chiang', 'พิมพ์ชื่อ เช่น เชียง')} value={term}
            onChange={e => { setTerm(e.target.value); setCursor(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, matches.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
              if (e.key === 'Enter' && matches[cursor]) { e.preventDefault(); pick(matches[cursor].code); }
              if (e.key === 'Escape') setTerm('');
            }} />
          {matches.length > 0 && <ul id="province-options" role="listbox" className={styles.options}>
            {matches.map((p, i) => <li key={p.code} id={`province-option-${p.code}`} role="option" aria-selected={i === cursor} onMouseDown={e => { e.preventDefault(); pick(p.code); }}>{th ? p.th : p.en}<small>{th ? p.en : p.th}</small></li>)}
          </ul>}
        </div>
        <label className={`${styles.field} ${styles.grow}`}>{copy('Colour by', 'ระบายสีตาม')}
          <select value={metric.key} onChange={e => update({ color: e.target.value === 'participants' ? null : e.target.value })}>
            {METRICS.map(m => <option key={m.key} value={m.key}>{th ? m.th : m.en}</option>)}
          </select>
        </label>
        <label className={styles.field}>{copy('Region', 'ภาค')}
          <select value={region} onChange={e => update({ region: e.target.value || null })}>
            <option value="">{copy('All regions', 'ทุกภาค')}</option>
            {REGION_LABELS.map(r => <option key={r.region} value={r.region}>{th ? r.th : r.en}</option>)}
          </select>
        </label>
        <label className={styles.field}>{copy(`At least ${min} participants`, `ผู้ใช้อย่างน้อย ${min} คน`)}
          <input type="range" min={0} max={100} step={5} value={Math.min(min, 100)} onChange={e => update({ min: e.target.value === '0' ? null : e.target.value })} />
        </label>
        <label className={styles.field}>{copy('Show', 'แสดง')}
          <select value={top} onChange={e => update({ top: e.target.value === '0' ? null : e.target.value })}>
            <option value={0}>{copy('All provinces', 'ทุกจังหวัด')}</option>
            {[5, 10, 20].map(n => <option key={n} value={n}>{copy(`Top ${n}`, `${n} อันดับแรก`)}</option>)}
          </select>
        </label>
      </div>
      <div className={styles.filterRow}>
        <label className={styles.field}>{copy('From', 'ตั้งแต่')}<input type="date" value={get('from')} max={get('to') || undefined} onChange={e => update({ from: e.target.value || null })} /></label>
        <label className={styles.field}>{copy('To', 'ถึง')}<input type="date" value={get('to')} min={get('from') || undefined} onChange={e => update({ to: e.target.value || null })} /></label>
        <label className={`${styles.field} ${styles.grow}`}>{copy('Quiz', 'แบบทดสอบ')}
          <select value={get('quiz')} onChange={e => update({ quiz: e.target.value || null })}>
            <option value="">{copy('All quizzes', 'ทุกแบบทดสอบ')}</option>
            {quizzes.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
        </label>
        <label className={styles.field}>{copy('Age', 'อายุ')}
          <select value={get('age')} onChange={e => update({ age: e.target.value || null })}>
            <option value="">{copy('All ages', 'ทุกช่วงอายุ')}</option>
            {AGE_OPTIONS.map(([v, en, thai]) => <option key={v} value={v}>{th ? thai : en}</option>)}
          </select>
        </label>
        <label className={styles.field}>{copy('Gender', 'เพศ')}
          <select value={get('gender')} onChange={e => update({ gender: e.target.value || null })}>
            <option value="">{copy('All', 'ทั้งหมด')}</option>
            <option value="female">{copy('Female', 'หญิง')}</option><option value="male">{copy('Male', 'ชาย')}</option><option value="other">{copy('Other', 'อื่น ๆ')}</option>
          </select>
        </label>
        {hasFilters && <button type="button" className={styles.button} onClick={() => router.replace(pathname, { scroll: false })}>{copy('Clear filters', 'ล้าง filter')}</button>}
      </div>
      {selected.length > 0 && <div className={styles.chips} aria-label={copy('Selected provinces', 'จังหวัดที่เลือก')}>
        {selected.map(code => <span key={code} className={styles.chip}>{name(code, th)}
          <button type="button" aria-label={copy(`Remove ${name(code, false)}`, `เอา${name(code, true)}ออก`)} onClick={() => update({ sel: selected.filter(c => c !== code).join(',') || null })}>×</button>
        </span>)}
      </div>}
    </div>

    {!current ? <div className={styles.skeleton} role="status" aria-label={copy('Loading map…', 'กำลังโหลดแผนที่…')} />
      : current.error || !report || !view ? <div role="alert" className={styles.panel}>
        <p>{copy('The province map could not load.', 'โหลดแผนที่รายจังหวัดไม่ได้')}</p>
        <button type="button" className={styles.button} onClick={() => setRetry(n => n + 1)}>{copy('Try again', 'ลองอีกครั้ง')}</button>
      </div>
      : <div className={styles.layout}>
        <div className={styles.panel}>
          <ThailandMap
            fills={view.fills} dimmed={view.dimmed} active={active} zoomTo={selected}
            pinned={selected.at(-1) ?? null}
            labelFor={code => `${name(code, th)}: ${formatMetric(metric, report.provinces[code], th)}`}
            insetTitle={copy('Bangkok and vicinity', 'กรุงเทพฯ และปริมณฑล')}
            onOpen={open}
            renderCard={(code, style: CSSProperties, interactive) => <ProvinceCard
              code={code} summary={report.provinces[code]} national={report.national} metric={metric}
              minCell={report.minCell} th={th} style={style} interactive={interactive} onOpen={() => open(code)} />}
          />
          <div className={styles.legend}>
            <span className={styles.legendScale}>
              <span>{copy('Less', 'น้อย')}</span>
              <ol aria-hidden="true">{Array.from({ length: CLASS_COUNT }, (_, i) => <li key={i} style={{ background: `var(--map-ramp-${i})` }} />)}</ol>
              <span>{copy('More', 'มาก')} = {th ? metric.strongTh : metric.strongEn}</span>
            </span>
            <span><span className={styles.swatch} style={{ background: 'repeating-linear-gradient(45deg, var(--map-hatch) 0 2px, var(--map-empty) 2px 5px)' }} />{report.minCell > 1 ? copy(`Fewer than ${report.minCell} people`, `ข้อมูลไม่พอ (น้อยกว่า ${report.minCell} คน)`) : copy('No answers for this measure', 'ยังไม่มีผู้ตอบตัวชี้วัดนี้')}</span>
            <span><span className={styles.swatch} style={{ background: 'var(--map-empty)' }} />{copy('No data', 'ไม่มีข้อมูล')}</span>
            <button type="button" className={styles.button} aria-pressed={scale === 'equal'} onClick={() => update({ scale: scale === 'equal' ? null : 'equal' })}>
              {copy('Equal intervals', 'ช่วงเท่ากัน')}
            </button>
          </div>
          <p className={styles.attribution}>{MAP_ATTRIBUTION}</p>
        </div>

        <div className={styles.tableCol}><div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{copy(`${rows.length} provinces · Thailand: ${formatMetric(metric, report.national, false)}`, `${rows.length} จังหวัด · ทั้งประเทศ: ${formatMetric(metric, report.national, true)}`)}</caption>
            <thead><tr>
              {sortHeader('name', copy('Province', 'จังหวัด'))}
              {sortHeader('region', copy('Region', 'ภาค'))}
              {sortHeader('participants', copy('Participants', 'ผู้เข้าร่วม'), true)}
              {metric.key !== 'participants' && sortHeader('metric', th ? metric.th : metric.en, true)}
            </tr></thead>
            <tbody>{rows.map(({ code, p, s }) => <tr key={code} data-active={active === code || undefined}
              onMouseEnter={() => setActive(code)} onMouseLeave={() => setActive(a => (a === code ? null : a))} onClick={() => open(code)}>
              <td><a href={detailHref(code)} onClick={e => { e.preventDefault(); e.stopPropagation(); open(code); }} onFocus={() => setActive(code)} onBlur={() => setActive(null)}>{th ? p.th : p.en}</a></td>
              <td className={styles.muted}>{th ? REGION_LABELS.find(r => r.region === p.region)!.th : REGION_LABELS.find(r => r.region === p.region)!.en}</td>
              <td className={styles.num}>{s.participants.toLocaleString()}</td>
              {metric.key !== 'participants' && <td className={styles.num}>{formatMetric(metric, s, th)}</td>}
            </tr>)}</tbody>
          </table>
        </div></div>
      </div>}
  </section>;
}
