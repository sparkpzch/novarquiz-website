'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/lib/hooks/useTheme';
import { MIN_CELL, PROVINCE_FILTER_KEYS, type LscvdSummary } from '@/lib/analytics/lscvd';
import { provinceCsv } from '@/lib/analytics/lscvd-export';
import type { ProvinceActivity } from '@/lib/db/lscvd-analytics';
import { PROVINCES, REGION_LABELS } from '@/lib/onboarding/provinces';
import DemographicsPanel from '@/components/admin/DemographicsPanel';
import { PairedBars, RiskGroups, Trend } from './DetailCharts';
import styles from './province-detail.module.css';

type Detail = { code: string; summary: LscvdSummary; national: LscvdSummary; activity: ProvinceActivity | null };

const share = (part: number | undefined, whole: number | undefined) => (part !== undefined && whole ? Math.round((part / whole) * 1000) / 10 : null);
const AGE: Record<string, [string, string]> = { under18: ['Under 18', 'ต่ำกว่า 18 ปี'], '18_29': ['18–29', '18–29 ปี'], '30_44': ['30–44', '30–44 ปี'], '45_59': ['45–59', '45–59 ปี'], '60plus': ['60+', '60 ปีขึ้นไป'] };
const GENDER: Record<string, [string, string]> = { female: ['Female', 'หญิง'], male: ['Male', 'ชาย'], other: ['Other', 'อื่น ๆ'] };

export default function ProvinceDetail({ code }: { code: string }) {
  const { i18n } = useTranslation(); const th = i18n.language.startsWith('th');
  const copy = (en: string, thai: string) => (th ? thai : en);
  const { theme, toggleTheme } = useTheme();
  const params = useSearchParams();
  const province = PROVINCES.find(p => p.code === code);
  const serverQuery = useMemo(() => { const q = new URLSearchParams(); for (const k of PROVINCE_FILTER_KEYS) if (params.get(k)) q.set(k, params.get(k)!); return q.toString(); }, [params]);

  const [result, setResult] = useState<{ key: string; data: Detail | null; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [quizNames, setQuizNames] = useState<Record<string, string>>({});
  const key = `${code}?${serverQuery}:${retry}`;
  useEffect(() => {
    if (!province) return;
    const abort = new AbortController();
    fetch(`/api/admin/analytics/provinces/${code}${serverQuery ? `?${serverQuery}` : ''}`, { signal: abort.signal, cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setResult({ key, data, error: false }))
      .catch(() => { if (!abort.signal.aborted) setResult({ key, data: null, error: true }); });
    return () => abort.abort();
  }, [code, serverQuery, key, province]);
  useEffect(() => {
    if (!params.get('quiz')) return;
    fetch('/api/quizzes?all=true').then(r => (r.ok ? r.json() : [])).then((list: Array<{ id: string; name: string }>) => setQuizNames(Object.fromEntries((Array.isArray(list) ? list : []).map(q => [q.id, q.name])))).catch(() => {});
  }, [params]);
  const current = result?.key === key ? result : null;

  if (!province) return <div className={styles.root}><p className={styles.note}>{copy('Unknown province.', 'ไม่พบจังหวัดนี้')} <Link href="/admin/analytics">{copy('Back to map', 'กลับไปที่แผนที่')}</Link></p></div>;
  const region = REGION_LABELS.find(r => r.region === province.region)!;
  const provinceName = th ? province.th : province.en;
  const nationalName = copy('Thailand', 'ทั้งประเทศ');
  const filterChips = [
    params.get('from') && `${copy('From', 'ตั้งแต่')} ${params.get('from')}`,
    params.get('to') && `${copy('To', 'ถึง')} ${params.get('to')}`,
    params.get('quiz') && `${copy('Quiz', 'แบบทดสอบ')}: ${quizNames[params.get('quiz')!] ?? '…'}`,
    params.get('age') && AGE[params.get('age')!] && `${copy('Age', 'อายุ')} ${AGE[params.get('age')!][th ? 1 : 0]}`,
    params.get('gender') && GENDER[params.get('gender')!] && `${copy('Gender', 'เพศ')}: ${GENDER[params.get('gender')!][th ? 1 : 0]}`,
  ].filter(Boolean) as string[];
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(th ? 'th-TH' : 'en-GB', { month: 'short', year: '2-digit' });

  const exportCsv = (d: Detail) => {
    const csv = provinceCsv({ provinceName: `${province.th} (${province.en})`, generatedAt: new Date().toISOString(), filters: serverQuery, minCell: MIN_CELL, summary: d.summary, national: d.national, activity: d.activity });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `lscvd-${code}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const versus = (value: number | null, national: number | null, unit = '%') => {
    if (value === null) return <small>{copy('Not enough data', 'ข้อมูลไม่พอ')}</small>;
    if (national === null) return null;
    const diff = Math.round((value - national) * 10) / 10;
    return <small>{nationalName} {national}{unit} · {diff === 0 ? copy('same', 'เท่ากัน') : diff > 0 ? copy(`▲ ${diff} pts higher`, `▲ สูงกว่า ${diff} จุด`) : copy(`▼ ${-diff} pts lower`, `▼ ต่ำกว่า ${-diff} จุด`)}</small>;
  };

  return <div className={styles.root}>
    <div className={styles.panel}>
      <div className={styles.top}>
        <div>
          <Link className={styles.back} href={`/admin/analytics${params.size ? `?${params}` : ''}`}>← {copy('Back to map', 'กลับไปที่แผนที่')}</Link>
          <h1>{provinceName}</h1>
          <p className={styles.sub}>{th ? province.en : province.th} · {th ? region.th : region.en}</p>
        </div>
        <div className={styles.actions}>
          {current?.data && <button type="button" className={styles.button} onClick={() => exportCsv(current.data!)}>{copy('Export CSV', 'ส่งออก CSV')}</button>}
          <button type="button" className={styles.button} onClick={toggleTheme} aria-label={copy('Switch light or dark mode', 'สลับโหมดสว่างหรือมืด')}>{theme === 'dark' ? copy('Light mode', 'โหมดสว่าง') : copy('Dark mode', 'โหมดมืด')}</button>
        </div>
      </div>
      {filterChips.length > 0 && <div className={styles.filters} aria-label={copy('Active filters', 'filter ที่ใช้อยู่')}>{filterChips.map(c => <span key={c}>{c}</span>)}</div>}
    </div>

    {!current ? <div className={styles.skeleton} role="status" aria-label={copy('Loading…', 'กำลังโหลด…')} />
      : current.error || !current.data ? <div role="alert" className={styles.panel}><p>{copy('Province details could not load.', 'โหลดข้อมูลจังหวัดไม่ได้')}</p><button type="button" className={styles.button} onClick={() => setRetry(n => n + 1)}>{copy('Try again', 'ลองอีกครั้ง')}</button></div>
      : (() => {
        const { summary: s, national: n, activity } = current.data;
        if (s.participants === 0 && s.healthResponders === 0) return <p className={styles.note}>{copy('No participants from this province yet for these filters.', 'ยังไม่มีผู้เข้าร่วมจากจังหวัดนี้ในเงื่อนไขที่เลือก')}</p>;
        const atGoal = share(s.cascade?.atTarget, s.cascade?.treated), atGoalN = share(n.cascade?.atTarget, n.cascade?.treated);
        const healthNote = s.healthSuppressed && <p className={styles.note}>{copy(`Health figures appear once at least ${MIN_CELL} people here share health answers (now ${s.healthResponders}).`, `ข้อมูลสุขภาพจะแสดงเมื่อมีผู้ตอบในจังหวัดนี้อย่างน้อย ${MIN_CELL} คน (ตอนนี้ ${s.healthResponders} คน)`)}</p>;
        const prevalence = (key: keyof NonNullable<LscvdSummary['prevalence']>, en: string, thai: string) => ({ label: th ? thai : en, hint: s.prevalence ? `n=${s.prevalence[key].base}` : undefined, province: s.prevalence?.[key].pct ?? null, national: n.prevalence?.[key].pct ?? null });
        return <>
          <dl className={`${styles.panel} ${styles.kpis}`}>
            <div><dt>{copy('Participants', 'ผู้เข้าร่วม')}</dt><dd>{s.participants.toLocaleString()}<small>{copy(`${s.healthResponders} shared health answers`, `ตอบข้อมูลสุขภาพ ${s.healthResponders} คน`)}</small></dd></div>
            <div><dt>{copy('Knowledge score', 'คะแนนความรู้')}</dt><dd>{s.knowledgeScore ?? '–'}{s.knowledgeScore !== null && '%'}{versus(s.knowledgeScore, n.knowledgeScore)}</dd></div>
            <div><dt>{copy('Lipid test in 5 years', 'ตรวจไขมันภายใน 5 ปี')}</dt><dd>{s.screened?.pct ?? '–'}{s.screened?.pct != null && '%'}{versus(s.screened?.pct ?? null, n.screened?.pct ?? null)}</dd></div>
            <div><dt>{copy('High risk', 'เสี่ยงสูง')}</dt><dd>{s.highRisk?.pct ?? '–'}{s.highRisk?.pct != null && '%'}{versus(s.highRisk?.pct ?? null, n.highRisk?.pct ?? null)}</dd></div>
            <div><dt>{copy('LDL at goal on treatment', 'LDL ถึงเป้าในผู้ที่ได้ยา')}</dt><dd>{atGoal ?? '–'}{atGoal !== null && '%'}{versus(atGoal, atGoalN)}</dd></div>
          </dl>
          {s.suppressed && <p className={styles.note}>{copy(`Knowledge and activity figures appear once at least ${MIN_CELL} people here consent to analytics (now ${s.participants}).`, `คะแนนความรู้และกิจกรรมจะแสดงเมื่อมีผู้ยินยอมให้วิเคราะห์ในจังหวัดนี้อย่างน้อย ${MIN_CELL} คน (ตอนนี้ ${s.participants} คน)`)}</p>}

          <div className={styles.grid}>
            <section className={styles.panel} aria-labelledby="cascade-title">
              <h2 id="cascade-title">{copy('Lipid screening and treatment', 'การคัดกรองและการรักษาไขมัน')}</h2>
              <p>{copy('Where people drop off, from testing to reaching the LDL goal.', 'ดูว่าหลุดที่ขั้นไหน ตั้งแต่การตรวจจนถึง LDL ถึงเป้า')}</p>
              {healthNote || <PairedBars provinceLabel={provinceName} nationalLabel={nationalName} groups={[
                { title: copy('Of people who shared health answers', 'จากผู้ตอบข้อมูลสุขภาพ'), rows: [
                  { label: copy('Lipid test within 5 years', 'ตรวจไขมันภายใน 5 ปี'), province: s.screened?.pct ?? null, national: n.screened?.pct ?? null },
                  { label: copy('Knows own LDL', 'รู้ค่า LDL ของตัวเอง'), province: s.knowsLdl?.pct ?? null, national: n.knowsLdl?.pct ?? null },
                ] },
                { title: copy('Of people told they have high cholesterol', 'จากผู้ที่แพทย์บอกว่าไขมันสูง'), rows: [
                  { label: copy('Taking medicine', 'ได้รับยาลดไขมัน'), hint: `n=${s.cascade?.diagnosed ?? 0}`, province: share(s.cascade?.treated, s.cascade?.diagnosed), national: share(n.cascade?.treated, n.cascade?.diagnosed) },
                  { label: copy('LDL at goal', 'LDL ถึงเป้า'), hint: `n=${s.cascade?.diagnosed ?? 0}`, province: share(s.cascade?.atTarget, s.cascade?.diagnosed), national: share(n.cascade?.atTarget, n.cascade?.diagnosed) },
                ] },
              ]} />}
            </section>
            <section className={styles.panel} aria-labelledby="risk-title">
              <h2 id="risk-title">{copy('Risk factors', 'ปัจจัยเสี่ยง')}</h2>
              <p>{copy('Self-reported. Percentages leave out "not sure" answers.', 'จากการตอบของผู้เข้าร่วม % ไม่นับคำตอบ "ไม่แน่ใจ"')}</p>
              {healthNote || <PairedBars provinceLabel={provinceName} nationalLabel={nationalName} groups={[{ rows: [
                prevalence('smoking', 'Current smoking', 'สูบบุหรี่'), prevalence('hypertension', 'High blood pressure', 'ความดันโลหิตสูง'),
                prevalence('diabetes', 'Diabetes', 'เบาหวาน'), prevalence('highCholesterol', 'High cholesterol', 'ไขมันในเลือดสูง'),
                prevalence('overweight', 'BMI 25 or above', 'BMI ตั้งแต่ 25'), prevalence('centralObesity', 'Central obesity', 'อ้วนลงพุง'),
                prevalence('familyHistory', 'Family history', 'ประวัติครอบครัว'), prevalence('priorEvent', 'Previous heart attack or stroke', 'เคยเป็นโรคหัวใจหรือสโตรก'),
              ] }]} />}
            </section>
            <section className={styles.panel} aria-labelledby="groups-title">
              <h2 id="groups-title">{copy('Number of risk factors', 'จำนวนปัจจัยเสี่ยงต่อคน')}</h2>
              <p>{copy('Smoking, high blood pressure, diabetes, high cholesterol, family history and BMI 25+.', 'นับจาก บุหรี่ ความดันสูง เบาหวาน ไขมันสูง ประวัติครอบครัว และ BMI ตั้งแต่ 25')}</p>
              {healthNote || <RiskGroups labels={th ? ['ไม่มี', '1 ข้อ', '2 ข้อ', '3 ข้อขึ้นไป'] : ['None', '1', '2', '3 or more']} rows={[{ label: provinceName, groups: s.riskGroups }, { label: nationalName, groups: n.riskGroups }]} />}
            </section>
            <section className={styles.panel} aria-labelledby="learning-title">
              <h2 id="learning-title">{copy('Learning', 'ผลการเรียนรู้')}</h2>
              <p>{copy('Questions answered more than once: first answer compared with the latest.', 'ข้อที่ตอบมากกว่า 1 ครั้ง เทียบคำตอบครั้งแรกกับครั้งล่าสุด')}</p>
              {activity?.retake
                ? <PairedBars provinceLabel={copy('First answer', 'ครั้งแรก')} nationalLabel={copy('Latest answer', 'ครั้งล่าสุด')} groups={[{ rows: [{ label: copy('Answered correctly', 'ตอบถูก'), hint: copy(`${activity.retake.people} people · ${activity.retake.questions} answers`, `${activity.retake.people} คน · ${activity.retake.questions} ข้อ`), province: activity.retake.firstAccuracy, national: activity.retake.latestAccuracy }] }]} />
                : <p className={styles.note}>{copy(`Shown once at least ${MIN_CELL} people here have retaken questions.`, `จะแสดงเมื่อมีผู้ตอบซ้ำในจังหวัดนี้อย่างน้อย ${MIN_CELL} คน`)}</p>}
              {activity && activity.topQuizzes.length > 0 && <table className={styles.table}>
                <caption className={styles.sub} style={{ textAlign: 'left' }}>{copy('Most played quizzes', 'แบบทดสอบที่เล่นมากที่สุด')}</caption>
                <thead><tr><th>{copy('Quiz', 'แบบทดสอบ')}</th><th className={styles.num}>{copy('People', 'คน')}</th><th className={styles.num}>{copy('Correct', 'ตอบถูก')}</th></tr></thead>
                <tbody>{activity.topQuizzes.map(q => <tr key={q.id}><td><Link href={`/admin/quizzes/${q.id}/analytics`}>{q.name}</Link></td><td className={styles.num}>{q.people}</td><td className={styles.num}>{q.accuracy}%</td></tr>)}</tbody>
              </table>}
            </section>
          </div>

          {activity && <section className={styles.panel} aria-labelledby="trend-title">
            <h2 id="trend-title">{copy('Monthly activity', 'กิจกรรมรายเดือน')}</h2>
            <p>{copy(`Months with fewer than ${MIN_CELL} people are left out.`, `ไม่แสดงเดือนที่มีผู้เล่นน้อยกว่า ${MIN_CELL} คน`)}</p>
            {activity.trend.length ? <Trend points={activity.trend} monthLabel={monthLabel} peopleLabel={copy('People who answered', 'จำนวนคนที่ตอบ')} accuracyLabel={copy('Answered correctly', 'ตอบถูก (%)')} />
              : <p className={styles.note}>{copy('No month has enough people yet.', 'ยังไม่มีเดือนที่มีผู้เล่นมากพอ')}</p>}
          </section>}

          <section className={styles.panel} aria-label={copy('Participant information', 'ข้อมูลผู้เข้าร่วม')}>
            <DemographicsPanel province={code} minCell={MIN_CELL} embedded />
          </section>
        </>;
      })()}
  </div>;
}
