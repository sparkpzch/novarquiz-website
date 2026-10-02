'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { buildAnswerGraph } from '@/lib/analytics/answer-graph';
import { firstInsightSentence } from '@/lib/analytics/insight-preview';
import type { PlayerInsightReport } from '@/lib/analytics/player-insight';
import styles from './player-insight.module.css';

type AnswerFilter = 'all' | 'revisit' | 'source';
const PAGE_SIZE = 4;

function JourneyIcon({ kind }: { kind: 'graph' | 'sparkle' | 'check' | 'revisit' | 'other' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'graph' ? <><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="18" cy="12" r="3" /><path d="m7 7 8 4M7 17l8-4" /></>
      : kind === 'sparkle' ? <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6ZM20 3v4M18 5h4" />
        : kind === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>
          : kind === 'revisit' ? <><path d="M4 11a8 8 0 1 1 2 7M4 5v6h6M12 8v4l3 2" /></>
            : <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>}
  </svg>;
}

export default function AnswerGraphDialog({ report, playerName, th, onClose }: {
  report: PlayerInsightReport; playerName: string; th: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const detailPanel = useRef<HTMLElement>(null);
  const arrowId = useId().replaceAll(':', '');
  const nodes = buildAnswerGraph(report.answers, report.sourceContext);
  const [selected, setSelected] = useState(() => nodes.find(node => node.group === 'focus')?.index ?? 0);
  const [filter, setFilter] = useState<AnswerFilter>('all');
  const [page, setPage] = useState(() => Math.floor(selected / PAGE_SIZE));
  const copy = (en: string, thai: string) => th ? thai : en;
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => { node?.close(); }; }, []);
  const filtered = nodes.filter(node => filter === 'all' || (filter === 'revisit' ? !node.answer.selectedAligned : node.usedForSummary));
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const groups = [...new Set(visible.map(node => node.group))];
  const evidence = nodes[selected];
  const height = visible.length <= 3 ? 340 : 420;
  const rowY = (index: number, count: number) => count <= 1 ? height / 2 : 90 + index * (height - 180) / (count - 1);
  const groupY = (group: typeof groups[number]) => rowY(groups.indexOf(group), groups.length);
  const sourceCount = nodes.filter(node => node.usedForSummary).length;
  const reviewed = report.state === 'approved';
  const labels = {
    focus: report.sourceContext?.learningFocus?.topic ?? copy('Learning focus', 'ประเด็นที่ควรเรียนรู้'),
    strength: copy('What went well', 'สิ่งที่ทำได้ดี'),
    revisit: copy('Worth revisiting', 'ควรทบทวน'),
    additional: copy('Additional answer', 'คำตอบเพิ่มเติม'),
  };
  const changeFilter = (next: AnswerFilter) => {
    setFilter(next); setPage(0);
    const first = nodes.find(node => next === 'all' || (next === 'revisit' ? !node.answer.selectedAligned : node.usedForSummary));
    if (first) setSelected(first.index);
  };
  const changePage = (next: number) => { setPage(next); const first = filtered[next * PAGE_SIZE]; if (first) setSelected(first.index); };
  const selectFromMobile = (index: number) => { setFilter('all'); setSelected(index); setPage(Math.floor(index / PAGE_SIZE)); };
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={onClose}>
    <div className={styles.dialogHeader}>
      <div className={styles.journeyHeading}><span className={styles.headingIcon}><JourneyIcon kind="graph" /></span><div><p className={styles.eyebrow}>{playerName} · {copy('ANSWER INSIGHTS', 'ข้อมูลเชิงลึกจากคำตอบ')}</p><h2 id={titleId}>{copy('Answers used in this summary', 'คำตอบที่ใช้สร้างสรุป')}</h2><p className={styles.muted}>{copy('Selected answers and the resulting AI summary.', 'คำตอบที่เลือกและสรุปจาก AI ที่ได้')}</p></div></div>
      <button type="button" className={styles.close} aria-label={copy('Close answer graph', 'ปิดกราฟคำตอบ')} onClick={onClose}>×</button>
    </div>
    <div className={styles.journeyBody}>
      <div className={styles.journeyToolbar}>
        <div className={styles.filters} role="group" aria-label={copy('Filter answers', 'กรองคำตอบ')}>
          {(['all', 'revisit', 'source'] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? styles.activeFilter : ''} onClick={() => changeFilter(value)}>{value === 'all' ? copy('All answers', 'ทั้งหมด') : value === 'revisit' ? copy('To revisit', 'ควรทบทวน') : copy('Summary source', 'ต้นทางสรุป')}<span>{nodes.filter(node => value === 'all' || (value === 'revisit' ? !node.answer.selectedAligned : node.usedForSummary)).length}</span></button>)}
        </div>
        <p className={styles.exploreHint}><JourneyIcon kind="graph" />{copy('Select a card to trace its path', 'เลือกการ์ดเพื่อดูเส้นทาง')}</p>
      </div>
      <label className={styles.mobileSelector}>{copy('Explore an answer', 'เลือกคำตอบที่ต้องการดู')}<select disabled={!nodes.length} value={selected} onChange={event => selectFromMobile(Number(event.target.value))}>{nodes.map(node => <option key={node.answer.id} value={node.index}>{copy('Question', 'คำถาม')} {node.index + 1} · {node.answer.selected}</option>)}</select></label>
      {visible.length === 0 ? <div className={styles.emptyGraph}><JourneyIcon kind="check" /><h3>{copy('No answers in this view', 'ไม่มีคำตอบในมุมมองนี้')}</h3><p>{copy('Try All answers to explore the complete record.', 'เลือกทั้งหมดเพื่อดูคำตอบที่บันทึกไว้')}</p><button type="button" className={styles.graphButton} onClick={() => changeFilter('all')}>{copy('Show all answers', 'ดูคำตอบทั้งหมด')}</button></div> : <>
        <div className={styles.layerHeadings} aria-hidden="true"><span><b>01</b>{copy('Chosen answer', 'คำตอบที่เลือก')}</span><span><b>02</b>{copy('Learning focus', 'ประเด็นที่เรียนรู้')}</span><span><b>03</b>{copy('AI summary', 'สรุปจาก AI')}</span></div>
        <div className={styles.journeyStage} style={{ height }} role="group" aria-label={copy('Answer graph', 'กราฟคำตอบ')}>
          <svg className={styles.connections} viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
            {visible.map((node, index) => <path key={`edge-${node.index}`} className={`${styles.edge} ${!node.usedForSummary ? styles.additionalEdge : ''} ${selected === node.index ? styles.activeEdge : ''}`} d={`M 340 ${rowY(index, visible.length)} C 362 ${rowY(index, visible.length)}, 367 ${groupY(node.group)}, 390 ${groupY(node.group)}`} markerEnd={`url(#${arrowId})`} />)}
            {groups.filter(group => group !== 'additional').map(group => <path key={group} className={`${styles.edge} ${evidence?.group === group ? styles.activeEdge : ''}`} d={`M 610 ${groupY(group)} C 635 ${groupY(group)}, 637 ${height / 2}, 660 ${height / 2}`} markerEnd={`url(#${arrowId})`} />)}
          </svg>
          {visible.map((node, index) => <button type="button" key={node.answer.id} className={`${styles.answerCard} ${node.answer.selectedAligned ? styles.correctCard : styles.revisitCard} ${!node.usedForSummary ? styles.additionalCard : ''} ${selected === node.index ? styles.selectedCard : ''}`} style={{ top: rowY(index, visible.length) }} aria-pressed={selected === node.index} aria-label={`${copy('Question', 'คำถาม')} ${node.index + 1}: ${node.answer.question}. ${copy('Selected', 'เลือก')}: ${node.answer.selected}`} onClick={() => setSelected(node.index)}>
            <span className={styles.questionNumber}>Q{node.index + 1}</span><span className={styles.answerCardText}><span className={styles.answerTitle}>{node.answer.selected}</span><span className={styles.answerStatus}>{!node.usedForSummary ? copy('Outside saved source', 'นอกต้นทางสรุป') : node.answer.selectedAligned ? copy('Correct choice', 'คำตอบถูกต้อง') : copy('To revisit', 'ควรทบทวน')}</span></span><span className={styles.answerIcon}><JourneyIcon kind={node.answer.selectedAligned ? 'check' : 'revisit'} /></span>
          </button>)}
          {groups.map(group => <div key={group} className={`${styles.focusCard} ${evidence?.group === group ? styles.activeFocus : ''} ${group === 'additional' ? styles.additionalFocus : ''}`} style={{ top: groupY(group) }}>
            <span className={styles.focusIcon}><JourneyIcon kind={group === 'strength' ? 'check' : group === 'additional' ? 'other' : 'sparkle'} /></span><strong>{labels[group]}</strong><span>{group === 'additional' ? copy('Not linked to this summary', 'ไม่เชื่อมกับสรุปนี้') : copy('Saved answer evidence', 'คำตอบต้นทางที่บันทึกไว้')}</span>
          </div>)}
          <div className={`${styles.summaryCard} ${evidence?.usedForSummary ? styles.activeSummary : ''}`}>
            <span className={styles.summaryIcon}><JourneyIcon kind="sparkle" /></span><p className={styles.eyebrow}>{copy('PERSONAL AI SUMMARY', 'สรุปจาก AI รายบุคคล')}</p><h3>{report.summary?.headline}</h3><p className={styles.summarySentence}>{report.summary && firstInsightSentence(report.summary.body, report.locale)}</p><span className={`${styles.badge} ${reviewed ? styles.approved : ''}`}>{reviewed ? copy('Admin reviewed', 'ผ่านการตรวจสอบแล้ว') : copy('Not yet reviewed', 'ยังไม่ผ่านการตรวจสอบ')}</span><div className={styles.sourceCount}>{copy(`${sourceCount} of ${nodes.length} answers match the saved source`, `ตรงกับต้นทางสรุป ${sourceCount} จาก ${nodes.length} คำตอบ`)}</div>
          </div>
        </div>
        <div className={styles.graphFooter}><button type="button" className={styles.detailsButton} onClick={() => { detailPanel.current?.scrollIntoView({ block: 'nearest' }); detailPanel.current?.focus({ preventScroll: true }); }}>{copy(`Q${selected + 1} · View answer details ↓`, `ข้อ ${selected + 1} · ดูรายละเอียดคำตอบ ↓`)}</button><div className={styles.legend}><span><i className={styles.correctDot} />{copy('Correct', 'ถูกต้อง')}</span><span><i className={styles.revisitDot} />{copy('Revisit', 'ทบทวน')}</span><span><i className={styles.otherDot} />{copy('Outside saved source', 'นอกต้นทางสรุป')}</span></div>{pageCount > 1 && <nav className={styles.pagination} aria-label={copy('Answer pages', 'หน้าคำตอบ')}><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}</span><button type="button" disabled={page === 0} aria-label={copy('Previous answers', 'คำตอบก่อนหน้า')} onClick={() => changePage(page - 1)}>‹</button><button type="button" disabled={page + 1 >= pageCount} aria-label={copy('Next answers', 'คำตอบถัดไป')} onClick={() => changePage(page + 1)}>›</button></nav>}</div>
      </>}
      {evidence && visible.length > 0 && <section ref={detailPanel} tabIndex={-1} className={styles.evidence} aria-live="polite" aria-label={copy('Selected answer details', 'รายละเอียดคำตอบที่เลือก')}>
        <div className={styles.evidenceHeading}><div><p className={styles.eyebrow}>{copy('QUESTION', 'คำถาม')} {selected + 1}</p><h3>{evidence.answer.question}</h3></div><span className={styles.sourcePill}><JourneyIcon kind={evidence.usedForSummary ? 'graph' : 'other'} />{evidence.usedForSummary ? copy('Linked to summary', 'เชื่อมกับสรุป') : copy('Recorded only', 'บันทึกไว้เท่านั้น')}</span></div>
        <div className={styles.evidenceColumns}><div><p className={styles.detailLabel}>{copy('Selected answer', 'คำตอบที่เลือก')}</p><strong>{evidence.answer.selected}</strong>{evidence.answer.selectedExplanation && <p>{evidence.answer.selectedExplanation}</p>}</div><div><p className={styles.detailLabel}>{copy('Quiz answer key', 'เฉลยจากแบบทดสอบ')}</p>{evidence.answer.alignedChoices.length ? evidence.answer.alignedChoices.map((choice, index) => <div key={index}><strong>{choice.text}</strong>{choice.explanation && <p>{choice.explanation}</p>}</div>) : <p>{copy('No answer key recorded.', 'ไม่ได้บันทึกเฉลยไว้')}</p>}</div></div>
      </section>}
      <p className={styles.evidenceNote}>{copy('Connections show recorded answer evidence, not the AI’s internal reasoning or confidence.', 'เส้นเชื่อมแสดงคำตอบต้นทางที่บันทึกไว้ ไม่ใช่กระบวนการคิดหรือค่าความมั่นใจภายในของ AI')}</p>
    </div>
  </dialog>;
}
