import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { formatQuizTime } from '@/lib/analytics/leaderboard';
import type { PlayerScore } from '@/lib/firebase/rtdb';
import styles from './quiz.module.css';

export default function QuizHeader({ elapsed, score, streak, userName, photoURL, lastDelta, totalPlayers, topScores, currentUserId, th }: {
  elapsed: number; score: number; streak: number; userName?: string | null; photoURL?: string | null;
  lastDelta: number | null; totalPlayers: number; topScores: Array<PlayerScore & { uid: string }>;
  currentUserId?: string; th: boolean;
}) {
  const copy = (en: string, thai: string) => th ? thai : en;
  return <header className={styles.header}>
    <div className={styles.headerUser}><ProfileAvatar displayName={userName} photoURL={photoURL} size={36} /><div><small>{copy('YOUR QUIZ', 'แบบทดสอบของคุณ')}</small><strong>{userName || copy('Guest', 'ผู้เล่นรับเชิญ')}</strong></div></div>
    <div className={styles.headerStat}><small>{copy('Time', 'เวลา')}</small><strong>{formatQuizTime(elapsed * 1000)}</strong></div>
    <div className={styles.headerStat}><small>{copy('Score', 'คะแนน')}</small><strong>{score}</strong>{lastDelta !== null && <span className={styles.scoreDelta}>{lastDelta > 0 ? '+' : ''}{lastDelta}</span>}</div>
    {(topScores.length > 1 || streak > 1) && <div className={styles.liveLine}>
      {topScores.length > 1 && <><strong>{copy('Live scores', 'คะแนนสด')} · {totalPlayers} {copy('players', 'คน')}</strong>{topScores.slice(0, 3).map((player, index) => <span key={player.uid}>#{index + 1} {player.uid === currentUserId ? copy('You', 'คุณ') : player.displayName} · {player.score}</span>)}</>}
      {streak > 1 && <strong>{copy('Correct streak', 'ตอบถูกต่อเนื่อง')} · {streak}</strong>}
    </div>}
  </header>;
}
