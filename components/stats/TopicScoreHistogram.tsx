'use client';
import type { TopicUnderstandingBreakdownProps } from '@/components/admin/AnalyticsBreakdownComponents';
import DemographicHistogram from '@/components/admin/DemographicHistogram';
import { topicHistogram } from '@/lib/analytics/topic-histogram';
import { learningTopic } from '@/lib/analytics/history-coaching';
import { useTranslation } from 'react-i18next';
import styles from '@/components/admin/report-charts.module.css';

export default function TopicScoreHistogram({ items, selectedTag, onToggleTag }: Pick<TopicUnderstandingBreakdownProps, 'items' | 'selectedTag' | 'onToggleTag'>) {
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const copy = (en: string, thai: string) => th ? thai : en;
  return <section className={styles.panel} aria-label={copy('Scores by topic', 'คะแนนแต่ละเรื่อง')}>
    <div className={styles.heading}><div><h2>{copy('Scores by topic', 'คะแนนแต่ละเรื่อง')}</h2><p>{copy('Points earned in each topic. Select a topic to view your answers.', 'คะแนนที่ได้ในแต่ละเรื่อง เลือกเรื่องเพื่อดูคำตอบ')}</p></div></div>
    {items.length ? <div className={styles.bars}>{items.map(item => {
      const title = learningTopic(item.tag, th ? 'th' : 'en')?.title ?? item.tag.replace(/^#/, '').replaceAll('_', ' ');
      const content = <><span className={styles.barLabel}><span>{title}</span><strong>{item.percentage === null ? copy('No score', 'ไม่มีคะแนน') : `${item.percentage}%`}</strong></span><span className={styles.track}><span className={styles.fill} style={{ width: `${item.percentage ?? 0}%` }} /></span><span className={styles.meta}>{item.percentage === null ? copy('No scored answers in this topic.', 'ยังไม่มีคำตอบที่ให้คะแนนในเรื่องนี้') : copy(`${item.earnedUtility} of ${item.maxUtility} points · ${item.responses} answers`, `ได้ ${item.earnedUtility} จาก ${item.maxUtility} คะแนน · ตอบ ${item.responses} ข้อ`)}</span></>;
      return onToggleTag ? <button type="button" key={item.tag} className={styles.bar} aria-pressed={selectedTag === item.tag} onClick={() => onToggleTag(item.tag)}>{content}</button> : <div className={styles.bar} key={item.tag}>{content}</div>;
    })}</div> : <p className={styles.muted}>{copy('No topic scores for this quiz. Your answers are listed below.', 'แบบทดสอบนี้ยังไม่มีคะแนนแยกตามเรื่อง ดูคำตอบได้ด้านล่าง')}</p>}
    {!!selectedTag && <p className={styles.note}>{copy('Select the same topic again to show all questions.', 'กดเรื่องที่เลือกอีกครั้งเพื่อดูคำถามทั้งหมด')}</p>}
    {!!items.length && <details className={styles.details}><summary>{copy('View score distribution', 'ดูการกระจายคะแนน')}</summary><p className={styles.note}>{copy('Each bar counts topics in a score interval, not questions or participants.', 'แท่งกราฟแสดงจำนวนเรื่องในแต่ละช่วงคะแนน ไม่ใช่จำนวนข้อหรือจำนวนผู้เล่น')}</p><div style={{ maxWidth: 640 }}><DemographicHistogram data={topicHistogram(items)} title={copy('Topic score distribution', 'ช่วงคะแนนของแต่ละเรื่อง')} unit="%" th={th} countLabel={copy('Topics', 'จำนวนเรื่อง')} finalInclusive /></div></details>}
  </section>;
}
