'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { personalLscvd, type PersonalFactor } from '@/lib/analytics/lscvd';
import type { HealthInput, SurveyRecord } from '@/lib/onboarding/survey';

const FACTORS: Array<[PersonalFactor, string, string]> = [
  ['smoking', 'Smoking', 'สูบบุหรี่'],
  ['hypertension', 'High blood pressure', 'ความดันโลหิตสูง'],
  ['diabetes', 'Diabetes', 'เบาหวาน'],
  ['highCholesterol', 'High blood cholesterol', 'ไขมันในเลือดสูง'],
  ['familyHistory', 'Early heart disease in family', 'คนในครอบครัวเป็นโรคหัวใจตั้งแต่อายุน้อย'],
  ['overweight', 'BMI 25 or above', 'ดัชนีมวลกาย 25 ขึ้นไป'],
];
const LDL: Record<HealthInput['ldlRange'], string> = { lt70: '< 70', '70_99': '70–99', '100_129': '100–129', '130_159': '130–159', '160_189': '160–189', gte190: '≥ 190', unknown: '' };

/** The player's own heart-health (LSCVD) answers, read with the admin map's cut-offs. */
export default function PersonalLscvdCard({ locale }: { locale: 'en' | 'th' }) {
  const copy = (en: string, th: string) => (locale === 'th' ? th : en);
  const [state, setState] = useState<{ survey: SurveyRecord | null } | 'error' | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/onboarding', { signal: abort.signal, cache: 'no-store' })
      .then(async (res) => { if (!res.ok) throw new Error('Survey unavailable'); return res.json() as Promise<{ survey: SurveyRecord | null }>; })
      .then((data) => setState({ survey: data.survey }))
      .catch(() => { if (!abort.signal.aborted) setState('error'); });
    return () => abort.abort();
  }, []);

  if (state === null || state === 'error') return null;
  const survey = state.survey;
  const heading = <div className="history-card-heading"><h2 id="lscvd-title">{copy('Your heart health', 'สุขภาพหัวใจของคุณ')}</h2><span className="history-card-meta">LSCVD</span></div>;

  if (!survey?.healthConsent || !survey.health) {
    return <section className="history-card lscvd-card" aria-labelledby="lscvd-title">
      {heading}
      <p className="lscvd-note">{copy('Answer the optional heart-health questions to see your reported risk factors and blood-lipid status here.', 'ตอบแบบสอบถามสุขภาพหัวใจ (ไม่บังคับ) เพื่อดูปัจจัยเสี่ยงและสถานะไขมันในเลือดของคุณที่นี่')}</p>
      <Link href="/profile" className="history-secondary">{copy('Answer in Profile', 'ไปตอบที่หน้าโปรไฟล์')}</Link>
    </section>;
  }

  const me = personalLscvd({ gender: survey.gender, weightKg: survey.weightKg, heightCm: survey.heightCm, health: survey.health });
  const h = survey.health;
  const status = (value: boolean | null) => value === null ? copy('Not answered', 'ไม่ได้ระบุ') : value ? copy('Yes', 'มี') : copy('No', 'ไม่มี');
  const lipidCheck: Record<HealthInput['lipidCheck'], string> = {
    within_1y: copy('Within 1 year', 'ภายใน 1 ปี'), within_5y: copy('1–5 years ago', '1–5 ปีก่อน'),
    over_5y: copy('Over 5 years ago', 'นานกว่า 5 ปี'), never: copy('Never', 'ไม่เคยตรวจ'), unknown: copy('Don’t remember', 'จำไม่ได้'),
  };

  return <section className="history-card lscvd-card" aria-labelledby="lscvd-title">
    {heading}
    <div className="lscvd-summary" data-risk={me.highRisk || undefined}>
      <strong>{me.riskCount}<small>/{FACTORS.length}</small></strong>
      <p>{me.highRisk
        ? copy('You reported several risk factors or a previous heart attack or stroke. Consider talking to a doctor about your heart risk.', 'คุณรายงานปัจจัยเสี่ยงหลายข้อ หรือเคยเป็นโรคหัวใจ/หลอดเลือดสมอง ควรปรึกษาแพทย์เพื่อประเมินความเสี่ยงโรคหัวใจ')
        : me.riskCount > 0
          ? copy('Risk factors you reported. Keeping these in check lowers heart disease risk.', 'ปัจจัยเสี่ยงที่คุณรายงาน การดูแลปัจจัยเหล่านี้ช่วยลดความเสี่ยงโรคหัวใจ')
          : copy('You reported none of the common risk factors.', 'คุณไม่ได้รายงานปัจจัยเสี่ยงที่พบบ่อย')}</p>
    </div>
    <ul className="lscvd-factors">
      {FACTORS.map(([key, en, th]) => <li key={key} data-state={me.factors[key] === null ? 'unknown' : me.factors[key] ? 'yes' : 'no'}>
        <span>{copy(en, th)}{key === 'overweight' && me.bmi !== null && <small> · BMI {me.bmi}</small>}</span><strong>{status(me.factors[key])}</strong>
      </li>)}
    </ul>
    <dl className="lscvd-lipids">
      <div><dt>{copy('Last cholesterol test', 'ตรวจไขมันล่าสุด')}</dt><dd>{lipidCheck[h.lipidCheck]}{me.screening === 'overdue' && <small>{copy('Due for a check', 'ควรตรวจใหม่')}</small>}</dd></div>
      <div><dt>{copy('Latest LDL (mg/dL)', 'ค่า LDL ล่าสุด (มก./ดล.)')}</dt><dd>{LDL[h.ldlRange] || copy('Don’t know', 'ไม่ทราบ')}{me.ldlAtTarget !== null && <small>{me.ldlAtTarget ? copy('Within your goal', 'อยู่ในเป้าหมาย') : copy(`Above your goal (${h.priorEvent === 'yes' || h.diabetes === 'yes' ? '< 70' : '< 100'})`, `สูงกว่าเป้าหมาย (${h.priorEvent === 'yes' || h.diabetes === 'yes' ? '< 70' : '< 100'})`)}</small>}</dd></div>
      <div><dt>{copy('Cholesterol medicine', 'ยาลดไขมัน')}</dt><dd>{h.lipidMedication === 'yes' ? copy('Taking', 'กินอยู่') : h.lipidMedication === 'no' ? copy('Not taking', 'ไม่ได้กิน') : copy('Not sure', 'ไม่แน่ใจ')}</dd></div>
    </dl>
    <p className="lscvd-note">{copy('Based only on what you answered in the questionnaire. This is not a diagnosis.', 'สรุปจากคำตอบในแบบสอบถามของคุณเท่านั้น ไม่ใช่การวินิจฉัยโรค')} <Link href="/profile">{copy('Update answers', 'แก้ไขคำตอบ')}</Link></p>
  </section>;
}
