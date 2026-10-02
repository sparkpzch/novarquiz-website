'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DemographicsReport,ChartBin } from '@/lib/onboarding/survey';
import styles from './report-charts.module.css';

export function CountBars({items,th=false}:{items:ChartBin[];th?:boolean}) {
  const total=items.reduce((n,b)=>n+b.count,0);
  const translations:Record<string,string>={'Female':'หญิง','Male':'ชาย','Other':'อื่น ๆ','Not stated':'ไม่ระบุ','Low':'นั่งเป็นส่วนใหญ่','Moderate':'เคลื่อนไหวบ้าง','High':'เคลื่อนไหวเป็นประจำ','<18':'ต่ำกว่า 18 ปี','60+':'60 ปีขึ้นไป'};
  return <div className={styles.bars}>{items.map(bin=><div key={bin.label} className={styles.bar}><div className={styles.barLabel}><span>{th?translations[bin.label]??bin.label:bin.label}</span><strong>{bin.count} <small>({total?Math.round(bin.count/total*100):0}%)</small></strong></div><div className={styles.track}><span className={styles.fill} style={{width:`${total?bin.count/total*100:0}%`}}/></div></div>)}</div>;
}
export default function DemographicsPanel({sessionId,quizId}:{sessionId?:string;quizId?:string}) {
  const {i18n}=useTranslation();const th=i18n.language.startsWith('th');const copy=(en:string,thai:string)=>th?thai:en;
  const [result,setResult]=useState<{key:string;data:DemographicsReport|null;error:boolean}|null>(null);const [retry,setRetry]=useState(0);
  const query=new URLSearchParams(sessionId?{session:sessionId}:quizId?{quiz:quizId}:{}).toString();const key=`${query}:${retry}`;const current=result?.key===key?result:null;
  useEffect(()=>{const abort=new AbortController();fetch(`/api/admin/demographics?${query}`,{signal:abort.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>setResult({key,data,error:false})).catch(()=>{if(!abort.signal.aborted)setResult({key,data:null,error:true});});return()=>abort.abort();},[query,key]);
  const data=current?.data;
  return <section className={styles.panel} aria-label={copy('Participant demographics','ข้อมูลภาพรวมผู้ใช้')}>
    <div className={styles.heading}><div><h2>{copy('Who is learning?','ผู้เรียนของเราเป็นใคร')}</h2><p>{copy('Questionnaire insights for this audience, counting each account once.','ภาพรวมจากแบบสอบถาม นับแต่ละบัญชีเพียงครั้งเดียว')}</p></div><span className={styles.pill}>{sessionId?copy('This session','เซสชันนี้'):quizId?copy('This quiz','แบบทดสอบนี้'):copy('All accounts','ทุกบัญชี')}</span></div>
    {!current?<p role="status">{copy('Loading questionnaire data…','กำลังโหลดข้อมูลแบบสอบถาม…')}</p>:current.error?<div role="alert"><p>{copy('Questionnaire charts could not load.','โหลดกราฟแบบสอบถามไม่ได้')}</p><button className={styles.pill} onClick={()=>setRetry(n=>n+1)}>{copy('Try again','ลองอีกครั้ง')}</button></div>:data&&<>
      <div className={styles.stats}>{[{label:copy('Accounts','บัญชี'),value:data.total},{label:copy('Completed surveys','ตอบแบบสอบถามแล้ว'),value:data.completed},{label:copy('Included with consent','ยินยอมให้วิเคราะห์'),value:data.consenting}].map(s=><div className={styles.stat} key={s.label}><span>{s.label}</span><strong>{s.value}</strong></div>)}</div>
      {data.consenting===0?<p className={styles.muted}>{copy('No consented survey data yet. Charts will appear after participants opt in.','ยังไม่มีข้อมูลแบบสอบถามที่ได้รับความยินยอม กราฟจะแสดงเมื่อผู้ใช้เลือกยินยอม')}</p>:<><div className={styles.grid}><div><h3>{copy('Age groups','ช่วงอายุ')}</h3><CountBars items={data.age} th={th}/></div><div><h3>{copy('Gender','เพศ')}</h3><CountBars items={data.gender} th={th}/></div><div><h3>{copy('Activity level','ระดับกิจกรรม')}</h3><CountBars items={data.activity} th={th}/></div></div><details className={styles.details}><summary>{copy('View weight & height distributions','ดูการกระจายของน้ำหนักและส่วนสูง')}</summary><div className={styles.grid}><div><h3>{copy('Weight','น้ำหนัก')}</h3><CountBars items={data.weight} th={th}/></div><div><h3>{copy('Height','ส่วนสูง')}</h3><CountBars items={data.height} th={th}/></div></div></details></>}
      <p className={styles.note}>{copy('Charts include only people who opted in. Missing answers are shown as “Not stated”. This describes the audience and does not assess anyone’s health.','กราฟใช้เฉพาะข้อมูลของผู้ที่ยินยอม ช่องที่ไม่ตอบแสดงเป็น “ไม่ระบุ” ข้อมูลนี้ใช้ทำความเข้าใจกลุ่มผู้เรียน ไม่ใช่การประเมินสุขภาพ')}</p>
    </>}
  </section>;
}
