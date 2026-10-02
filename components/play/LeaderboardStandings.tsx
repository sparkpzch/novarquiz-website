'use client';

import { useId, useState } from 'react';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { formatQuizTime, rankLeaderboard } from '@/lib/analytics/leaderboard';
import type { LeaderboardEntry } from '@/lib/types';
import styles from './quiz.module.css';

export function TrophyIcon() {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M20 12h24v14c0 9-5 16-12 16s-12-7-12-16V12Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="2.5" /><path d="M20 16H11v6c0 7 4 11 12 11m21-17h9v6c0 7-4 11-12 11M32 42v10m-10 4h20M27 52h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><path d="m32 18 2.5 5 5.5.8-4 4 .9 5.4-4.9-2.5-4.9 2.5.9-5.4-4-4 5.5-.8 2.5-5Z" fill="currentColor" /></svg>;
}

export default function LeaderboardStandings({ entries, th, preview = false, compact = false }: { entries: readonly LeaderboardEntry[]; th: boolean; preview?: boolean; compact?: boolean }) {
  const [visibleCount, setVisibleCount] = useState(compact ? 5 : 20);
  const [showTopPlayers, setShowTopPlayers] = useState(false);
  const rankingId = useId();
  const copy = (en: string, thai: string) => th ? thai : en;
  const board = rankLeaderboard(entries);
  const top = board.slice(0, 3);
  const podium = top.length === 3 ? [{ entry: top[1], rank: 2 }, { entry: top[0], rank: 1 }, { entry: top[2], rank: 3 }] : top.map((entry, index) => ({ entry, rank: index + 1 }));
  const meIndex = board.findIndex((entry) => entry.is_me);
  const visible = board.slice(0, preview ? 3 : visibleCount);
  if (!board.length) return <div className={styles.empty}><TrophyIcon /><h3>{copy('Waiting for completed results', 'รอผลจากผู้ที่ทำแบบทดสอบเสร็จ')}</h3><p>{copy('Completed scores will appear here. Players still answering are not ranked yet.', 'คะแนนจะแสดงเมื่อผู้เล่นทำเสร็จ ผู้ที่กำลังตอบยังไม่ถูกจัดอันดับ')}</p></div>;
  const mobilePreview = compact && preview && meIndex >= 0;
  return <div className={`${compact ? styles.compactStandings : ''} ${mobilePreview ? styles.previewStandings : ''}`}>
    <div className={styles.standingsTitle}><h2>{copy('Leaderboard', 'อันดับผู้เล่น')}</h2><span>{board.length} {copy('completed', 'คนทำเสร็จแล้ว')}</span></div>
    {!compact && <div className={styles.podium} aria-label={copy('Top three players', 'ผู้เล่นสามอันดับแรก')}>
      {podium.map(({ entry, rank }) => <div className={`${styles.podiumPlayer} ${rank === 1 ? styles.firstPlace : ''}`} key={entry.user_id}>
        {rank === 1 && <span className={styles.winnerLabel}><TrophyIcon />{copy('Top score', 'คะแนนสูงสุด')}</span>}
        <ProfileAvatar displayName={entry.user_display_name} photoURL={entry.user_photo_url} size={rank === 1 ? 68 : 54} />
        <p title={entry.user_display_name}>{entry.is_me ? copy('You', 'คุณ') : entry.user_display_name || copy('Participant', 'ผู้เล่น')}</p>
        <span className={styles.podiumScore}>{entry.total_score} <small>{copy('pts', 'คะแนน')}</small></span>
        <div className={`${styles.podiumStep} ${rank === 1 ? styles.gold : rank === 2 ? styles.silver : styles.bronze}`}><span>{String(rank).padStart(2, '0')}</span></div>
      </div>)}
    </div>}
    {mobilePreview && <button type="button" className={styles.mobileRankingToggle} aria-expanded={showTopPlayers} aria-controls={rankingId} onClick={() => setShowTopPlayers(value => !value)}>{showTopPlayers ? copy('Hide top players', 'ซ่อนผู้เล่นอันดับต้น') : copy('Show top 3 players', 'ดูผู้เล่น 3 อันดับแรก')} <span aria-hidden="true">{showTopPlayers ? '−' : '+'}</span></button>}
    <div className={styles.rankingTable}>
      <div className={styles.rankingHeading}><span>{copy('Rank', 'อันดับ')}</span><span>{copy('Player', 'ผู้เล่น')}</span><span>{copy('Score', 'คะแนน')}</span></div>
      <ol id={rankingId} className={showTopPlayers ? styles.expandedRankings : undefined} tabIndex={compact && !preview ? 0 : undefined} aria-label={copy('Player rankings', 'อันดับผู้เล่น')}>{visible.map((entry, index) => <li className={`${styles.rankingRow} ${entry.is_me ? styles.myRow : ''}`} key={entry.user_id}>
        <span className={`${styles.rankNumber} ${compact && index < 3 ? styles.topRank : ''}`}>{index + 1}</span><ProfileAvatar displayName={entry.user_display_name} photoURL={entry.user_photo_url} size={36} />
        <div className={styles.playerName}><strong>{entry.user_display_name || copy('Participant', 'ผู้เล่น')}{entry.is_me && <small>{copy('You', 'คุณ')}</small>}</strong><span>{formatQuizTime(entry.total_time_ms)} · {entry.correct_count} {copy('correct', 'ข้อถูก')}</span></div>
        <strong className={styles.playerScore}>{entry.total_score}<small>{copy('pts', 'คะแนน')}</small></strong>
      </li>)}</ol>
      {(mobilePreview || meIndex >= visible.length) && <>{meIndex >= visible.length && <div className={styles.rankingGap}>···</div>}<div className={`${styles.rankingRow} ${styles.myRow} ${mobilePreview && meIndex < visible.length ? styles.mobileOwnRow : ''}`}><span className={styles.rankNumber}>{meIndex + 1}</span><ProfileAvatar displayName={board[meIndex].user_display_name} photoURL={board[meIndex].user_photo_url} size={36} /><div className={styles.playerName}><strong>{copy('Your result', 'ผลของคุณ')}</strong><span>{formatQuizTime(board[meIndex].total_time_ms)}</span></div><strong className={styles.playerScore}>{board[meIndex].total_score}<small>{copy('pts', 'คะแนน')}</small></strong></div></>}
    </div>
    {!preview && visibleCount < board.length && <button type="button" className={styles.secondaryButton} onClick={() => setVisibleCount((count) => count + (compact ? 10 : 20))}>{copy('Show more players', 'แสดงผู้เล่นเพิ่ม')}</button>}
    <p className={styles.rankingNote}>{copy('Completed results, ranked by score, then time taken.', 'จัดอันดับผู้ที่ทำเสร็จแล้วตามคะแนน และเวลาที่ใช้')}</p>
  </div>;
}
