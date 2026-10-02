'use client';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CountBars } from './DemographicsPanel';
import styles from './report-charts.module.css';

type Question={questionText:string;errorRatePercent:number;sampleSize:number;avgTimeSeconds:number};
export default function ReportOverviewGraphs({accuracy,players,questions,name,showDistribution=true,averageTime,children}:{accuracy:number|null;players:{accuracy:number}[];questions:Question[];name?:string;showDistribution?:boolean;averageTime?:number|null;children?:ReactNode}) {
  const {i18n}=useTranslation();const th=i18n.language.startsWith('th');const copy=(en:string,thai:string)=>th?thai:en;
  const pct=accuracy===null?null:Math.min(100,Math.max(0,accuracy));
  const answered=questions.filter(q=>q.sampleSize>0);
  const reviews=[...answered].sort((a,b)=>b.errorRatePercent-a.errorRatePercent).slice(0,5);
  const responses=answered.reduce((n,q)=>n+q.sampleSize,0);
  const avg=averageTime ?? (responses?answered.reduce((n,q)=>n+q.avgTimeSeconds*q.sampleSize,0)/responses:null);
  const distribution=[{label:copy('Below 50%','ต่ำกว่า 50%'),count:players.filter(p=>p.accuracy<50).length},{label:'50–74%',count:players.filter(p=>p.accuracy>=50&&p.accuracy<75).length},{label:'75–100%',count:players.filter(p=>p.accuracy>=75).length}];
  return <section className={styles.panel} aria-label={copy('Quiz results','ภาพรวมผลแบบทดสอบ')}>
    <div className={styles.heading}><div><h2>{copy('Quiz results','ภาพรวมผลแบบทดสอบ')}</h2><p>{name?copy(`Showing recorded answers for ${name}.`,`แสดงคำตอบที่บันทึกของ ${name}`):copy('Scores, response times and answers.','คะแนน เวลาที่ใช้ และผลการตอบคำถาม')}</p></div><span className={styles.pill}>{copy(`${responses} recorded answers`,`${responses} คำตอบที่บันทึก`)}</span></div>
    <div className={styles.grid}><div><h3>{copy('Correct answers','คำตอบที่ถูกต้อง')}</h3><div className={styles.overview}><div className={styles.ring} style={{background:`conic-gradient(var(--chart-accent) ${(pct??0)*3.6}deg, var(--chart-track) 0deg)`}}><div className={styles.ringCenter}><strong>{pct===null?'—':`${pct}%`}</strong><small>{copy('correct','ตอบถูก')}</small></div></div><div><p className={styles.muted}>{copy('Average response time','เวลาเฉลี่ยต่อคำตอบ')}</p><strong>{avg===null?'—':`${avg.toFixed(1)} ${copy('sec','วินาที')}`}</strong><p className={styles.note}>{copy('Based on recorded quiz answers.','อ้างอิงจากคำตอบในแบบทดสอบ')}</p></div></div></div>{showDistribution&&<div><h3>{copy('Participants by correct-answer rate','จำนวนผู้เข้าร่วมตามสัดส่วนคำตอบถูก')}</h3>{players.length?<CountBars items={distribution}/>:<p className={styles.note}>{copy('No participant answers yet.','ยังไม่มีคำตอบจากผู้เรียน')}</p>}</div>}<div style={{gridColumn:'1 / -1'}}><h3>{copy('Most missed questions','คำถามที่ตอบผิดมากที่สุด')}</h3>{reviews.length?<div className={styles.bars}>{reviews.map((q,i)=><div className={styles.bar} key={`${q.questionText}:${i}`}><div className={styles.barLabel}><span>{q.questionText}</span><strong>{q.errorRatePercent}%</strong></div><div className={styles.track}><span className={styles.fill} style={{width:`${Math.max(0,Math.min(100,q.errorRatePercent))}%`}}/></div><span className={styles.meta}>{copy(`${q.sampleSize} answers · percentage incorrect`,`${q.sampleSize} คำตอบ · สัดส่วนที่ตอบผิด`)}</span></div>)}</div>:<p className={styles.note}>{copy('No recorded answers yet.','ยังไม่มีคำตอบที่บันทึก')}</p>}</div></div>
    {children}
  </section>;
}
