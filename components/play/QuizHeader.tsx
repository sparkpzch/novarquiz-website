import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { formatQuizTime } from '@/lib/analytics/leaderboard';
import styles from './quiz.module.css';

export default function QuizHeader({ elapsed, score, rank, userName, photoURL, lastDelta, leaderboardOpen, onLeaderboard, th }: {
  elapsed: number; score: number; rank: number | null; userName?: string | null; photoURL?: string | null;
  lastDelta: number | null; leaderboardOpen: boolean; onLeaderboard: () => void; th: boolean;
}) {
  const copy = (en: string, thai: string) => th ? thai : en;
  return <header className={styles.header}>
    <div className={styles.headerUser}><ProfileAvatar displayName={userName} photoURL={photoURL} size={36} /><strong>{userName || copy('Guest', 'ผู้เล่นรับเชิญ')}</strong></div>
    <div className={styles.headerStat}><small>{copy('Time', 'เวลา')}</small><strong>{formatQuizTime(elapsed * 1000)}</strong></div>
    <div className={styles.headerStat}><small>{copy('Rank', 'อันดับ')}</small><strong>{rank ? `#${rank}` : '—'}</strong></div>
    <div className={styles.headerStat}><small>{copy('Score', 'คะแนน')}</small><strong>{score.toLocaleString()}</strong>{lastDelta !== null && <span className={styles.scoreDelta}>{lastDelta > 0 ? '+' : ''}{lastDelta}</span>}</div>
    <button type="button" className={styles.leaderboardButton} aria-expanded={leaderboardOpen} aria-controls="play-leaderboard" onClick={onLeaderboard}>☷ {copy('Leaderboard', 'ตารางคะแนน')}</button>
  </header>;
}
