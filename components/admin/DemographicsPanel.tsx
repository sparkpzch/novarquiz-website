'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DemographicsReport,ChartBin } from '@/lib/onboarding/survey';
import styles from './report-charts.module.css';
import DemographicHistogram from './DemographicHistogram';

export function CountBars({items,th=false}:{items:ChartBin[];th?:boolean}) {
  const total=items.reduce((n,b)=>n+b.count,0);
  const translations:Record<string,string>={'Female':'หญิง','Male':'ชาย','Other':'อื่น ๆ','Not stated':'ไม่ระบุ','Low':'นั่งเป็นส่วนใหญ่','Moderate':'เคลื่อนไหวบ้าง','High':'เคลื่อนไหวเป็นประจำ','<18':'ต่ำกว่า 18 ปี','60+':'60 ปีขึ้นไป'};
  return <div className={styles.bars}>{items.map(bin=><div key={bin.label} className={styles.bar}><div className={styles.barLabel}><span>{th?translations[bin.label]??bin.label:bin.label}</span><strong>{bin.count} <small>({total?Math.round(bin.count/total*100):0}%)</small></strong></div><div className={styles.track}><span className={styles.fill} style={{width:`${total?bin.count/total*100:0}%`}}/></div></div>)}</div>;
}

const percent=(part:number,whole:number)=>whole?Math.round(part/whole*100):0;

function ChartSkeleton({label}:{label:string}) {
  return <div role="status" className={styles.chartGrid}>
    <span className="sr-only">{label}</span>
    {[0,1,2].map(k=><div key={k} aria-hidden="true" className={`${styles.chartCard} ${styles.skeleton}`}><div/><div/><div/></div>)}
  </div>;
}

export default function DemographicsPanel({sessionId,quizId,embedded=false}:{sessionId?:string;quizId?:string;embedded?:boolean}) {
  const {i18n}=useTranslation();const th=i18n.language.startsWith('th');const copy=(en:string,thai:string)=>th?thai:en;
  const [result,setResult]=useState<{key:string;data:DemographicsReport|null;error:boolean}|null>(null);const [retry,setRetry]=useState(0);
  const query=new URLSearchParams(sessionId?{session:sessionId}:quizId?{quiz:quizId}:{}).toString();const key=`${query}:${retry}`;const current=result?.key===key?result:null;
  useEffect(()=>{const abort=new AbortController();fetch(`/api/admin/demographics?${query}`,{signal:abort.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>setResult({key,data,error:false})).catch(()=>{if(!abort.signal.aborted)setResult({key,data:null,error:true});});return()=>abort.abort();},[query,key]);
  const data=current?.data;
  const scope=sessionId?copy('This session','เซสชันนี้'):quizId?copy('This quiz','แบบทดสอบนี้'):copy('All accounts','ทุกบัญชี');
  return <section className={embedded?styles.subsection:styles.audience} aria-label={copy('Participant demographics','ข้อมูลผู้เข้าร่วม')}>
    {embedded
      ? <div className={styles.heading}><div><h3>{copy('Participant information','ข้อมูลผู้เข้าร่วม')}</h3><p>{scope} · {copy('Each account is counted once.','นับผู้ใช้แต่ละคนครั้งเดียว')}</p></div></div>
      : <p className={styles.muted}>{scope} · {copy('Questionnaire results. Each account is counted once.','ข้อมูลจากแบบสอบถาม นับผู้ใช้แต่ละคนครั้งเดียว')}</p>}
    {!current?<ChartSkeleton label={copy('Loading questionnaire data…','กำลังโหลดข้อมูลแบบสอบถาม…')}/>:current.error?<div role="alert" className={styles.chartCard}><p>{copy('Questionnaire charts could not load.','โหลดกราฟแบบสอบถามไม่ได้')}</p><button className={styles.pill} onClick={()=>setRetry(n=>n+1)}>{copy('Try again','ลองอีกครั้ง')}</button></div>:data&&<>
      <dl className={styles.kpis}>
        <div><dt>{copy('Accounts','บัญชี')}</dt><dd>{data.total.toLocaleString()}</dd></div>
        <div><dt>{copy('Completed surveys','ตอบแบบสอบถามแล้ว')}</dt><dd>{data.completed.toLocaleString()}<small>{copy(`${percent(data.completed,data.total)}% of accounts`,`${percent(data.completed,data.total)}% ของบัญชี`)}</small></dd></div>
        <div><dt>{copy('Included with consent','ยินยอมให้วิเคราะห์')}</dt><dd>{data.consenting.toLocaleString()}<small>{copy(`${percent(data.consenting,data.completed)}% of surveys`,`${percent(data.consenting,data.completed)}% ของผู้ตอบ`)}</small></dd></div>
      </dl>
      {data.consenting===0?<p className={`${styles.chartCard} ${styles.muted}`}>{copy('No consented survey data yet. Charts will appear after participants opt in.','ยังไม่มีข้อมูลแบบสอบถามที่ได้รับความยินยอม กราฟจะแสดงเมื่อผู้ใช้เลือกยินยอม')}</p>:<>
        <div className={styles.chartGrid}>
          <div className={styles.chartCard}><DemographicHistogram data={data.histograms.age} title={copy('Age','อายุ')} unit={copy('years','ปี')} th={th}/></div>
          <div className={styles.chartCard}><h3>{copy('Gender','เพศ')}</h3><CountBars items={data.gender} th={th}/></div>
          <div className={styles.chartCard}><h3>{copy('Activity level','ระดับกิจกรรม')}</h3><CountBars items={data.activity} th={th}/></div>
        </div>
        <div className={`${styles.chartGrid} ${styles.chartGridTwo}`}>
          <div className={styles.chartCard}><DemographicHistogram data={data.histograms.weight} title={copy('Weight','น้ำหนัก')} unit={copy('kg','กก.')} th={th}/></div>
          <div className={styles.chartCard}><DemographicHistogram data={data.histograms.height} title={copy('Height','ส่วนสูง')} unit={copy('cm','ซม.')} th={th}/></div>
        </div>
      </>}
      <p className={styles.note}>{copy('Charts include only people who opted in. Missing answers are shown as “Not stated”. This describes the audience and does not assess anyone’s health.','กราฟใช้เฉพาะข้อมูลของผู้ที่ยินยอม ช่องที่ไม่ตอบแสดงเป็น “ไม่ระบุ” ข้อมูลนี้ใช้สรุปกลุ่มผู้เข้าร่วม ไม่ใช่การประเมินสุขภาพ')}</p>
    </>}
  </section>;
}
