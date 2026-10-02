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
  return <section className={styles.panel} aria-label={copy('Topic score distribution', 'การกระจายคะแนนรายหัวข้อ')}>
    <div className={styles.heading}><div><h2>{copy('Topic scores', 'คะแนนรายหัวข้อ')}</h2><p>{copy('Number of topics in each score interval.', 'จำนวนหัวข้อในแต่ละช่วงคะแนน')}</p></div></div>
    <div style={{ maxWidth: 640 }}><DemographicHistogram data={topicHistogram(items)} title={copy('Score distribution', 'การกระจายคะแนน')} unit="%" th={th} countLabel={copy('Topics', 'จำนวนหัวข้อ')} finalInclusive /></div>
    {!!items.length && <div className={styles.topicFilters} role="group" aria-label={copy('Filter questions by topic', 'กรองคำถามตามหัวข้อ')}>
      {items.map(item => <button type="button" key={item.tag} className={styles.pill} aria-pressed={selectedTag === item.tag} onClick={() => onToggleTag?.(item.tag)}>{learningTopic(item.tag, th ? 'th' : 'en')?.title ?? item.tag.replace(/^#/, '').replaceAll('_', ' ')} · {item.percentage === null ? '—' : `${item.percentage}%`}</button>)}
    </div>}
    {!!items.length && <p className={styles.note}>{copy('Select a topic to view its questions. Select it again to clear the filter.', 'เลือกหัวข้อเพื่อดูคำถาม กดซ้ำเพื่อแสดงทั้งหมด')}</p>}
  </section>;
}
