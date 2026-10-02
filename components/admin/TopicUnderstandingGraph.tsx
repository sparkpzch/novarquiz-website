'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { learningTopic } from '@/lib/analytics/history-coaching';
import type { TopicUnderstandingBreakdownProps } from './AnalyticsBreakdownComponents';
import styles from './report-charts.module.css';

export default function TopicUnderstandingGraph({items,description,selectedTag,onToggleTag,emptyMessage,readingStyle,selectedPlayerName,selectedCompareLabel}:TopicUnderstandingBreakdownProps) {
  const {i18n}=useTranslation();const th=i18n.language.startsWith('th');const locale=th?'th':'en';
  const copy=(en:string,thai:string)=>th?thai:en;
  const [sort,setSort]=useState('lowest');
  const sorted=[...items].sort((a,b)=>sort==='name'?a.tag.localeCompare(b.tag):(sort==='highest'?-1:1)*((a.percentage??-1)-(b.percentage??-1)));
  return <section className={styles.panel} aria-label={copy('Understanding by topic','ความเข้าใจแยกตามหัวข้อ')}>
    <div className={styles.heading}><div><h2>{copy('Understanding by topic','ความเข้าใจแยกตามหัวข้อ')}</h2><p>{description}</p>{selectedPlayerName&&<p>{selectedPlayerName}</p>}</div><select className={styles.select} aria-label={copy('Sort topics','เรียงหัวข้อ')} value={sort} onChange={e=>setSort(e.target.value)}><option value="lowest">{copy('Lowest first','น้อยไปมาก')}</option><option value="highest">{copy('Highest first','มากไปน้อย')}</option><option value="name">{copy('Topic name','ชื่อหัวข้อ')}</option></select></div>
    {sorted.length?<div className={styles.bars}>{sorted.map(item=>{
      const title=readingStyle==='everyday'?(learningTopic(item.tag,locale)?.title??copy('Other quiz topics','เรื่องอื่น ๆ ในแบบทดสอบ')):item.tag.replace(/^#/,'').replaceAll('_',' ');
      const pct=item.percentage===null?null:Math.min(100,Math.max(0,item.percentage));
      const content=<><span className={styles.barLabel}><span>{title}</span><strong>{pct===null?'—':`${pct}%`}</strong></span><span className={styles.track}><span className={styles.fill} style={{width:`${pct??0}%`}}/>{item.benchmarkPercentage!=null&&<span className={styles.benchmark} style={{left:`${Math.min(100,Math.max(0,item.benchmarkPercentage))}%`}}/>}</span><span className={styles.meta}>{pct===null?copy('No scored answers yet','ยังไม่มีคำตอบที่ให้คะแนน'):copy(`${item.earnedUtility} of ${item.maxUtility} points · ${item.responses} answers`,`${item.earnedUtility} จาก ${item.maxUtility} คะแนน · ${item.responses} คำตอบ`)}{item.benchmarkPercentage!=null&&` · ${selectedCompareLabel??copy('Comparison','เปรียบเทียบ')}: ${item.benchmarkPercentage}%`}</span></>;
      return onToggleTag?<button key={item.tag} type="button" className={styles.bar} aria-pressed={selectedTag===item.tag} onClick={()=>onToggleTag(item.tag)}>{content}</button>:<div key={item.tag} className={styles.bar}>{content}</div>;
    })}</div>:<p className={styles.muted}>{emptyMessage??copy('No topic data yet.','ยังไม่มีข้อมูลหัวข้อ')}</p>}
    {!!onToggleTag&&!!items.length&&<p className={styles.note}>{copy('Select a bar to filter the questions. Select it again to show all topics.','กดแท่งกราฟเพื่อกรองคำถาม กดอีกครั้งเพื่อดูทุกหัวข้อ')}</p>}
  </section>;
}
