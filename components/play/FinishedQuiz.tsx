'use client';
import type { LeaderboardEntry } from '@/lib/types';
import { rankLeaderboard } from '@/lib/analytics/leaderboard';
import LeaderboardStandings from './LeaderboardStandings';
import { ResultInsightCard, ResultScoreCard } from './QuizResultCards';
import styles from './quiz.module.css';

export default function FinishedQuiz({ uid, sessionId, score, elapsed, quizName, leaderboard, error, saving, guest, onRetry, onHome, onLeaderboard, onSummary, th }: {
  uid: string | null; sessionId: string; score: number; elapsed: number; quizName?: string; leaderboard: LeaderboardEntry[] | null;
  error: string | null; saving: boolean; guest: boolean; th: boolean;
  onRetry: () => void; onHome: () => void; onLeaderboard: () => void; onSummary: () => void;
}) {
  const copy = (en: string, thai: string) => th ? thai : en;
  const board = rankLeaderboard(leaderboard || []);
  const index = board.findIndex((entry) => entry.is_me);
  const me = board[index];
  return <main className={`${styles.screen} ${styles.resultScreen}`}><div className={`${styles.container} ${styles.resultContainer}`}>
    <div className={styles.brandLine}><strong>NOVARQUIZ</strong><span>{quizName}</span></div>
    <div className={styles.resultsGrid}>
      <ResultScoreCard score={score} elapsedMs={me?.total_time_ms ?? elapsed * 1000} rank={me ? index + 1 : null} saving={saving} th={th} />
      <ResultInsightCard uid={uid} sessionId={sessionId} saving={saving} guest={guest} th={th} onSummary={onSummary} />
      <section className={`${styles.surface} ${styles.standingsPanel}`} aria-label={copy('Completed standings', 'อันดับหลังจบแบบทดสอบ')}>
        {error && <div className={styles.error} role="alert">{copy('Could not refresh rankings.', 'อัปเดตอันดับไม่สำเร็จ')} <button type="button" className={styles.secondaryButton} onClick={onRetry}>{copy('Try again', 'ลองอีกครั้ง')}</button></div>}
        {leaderboard !== null ? <LeaderboardStandings entries={leaderboard} th={th} preview compact /> : !error && <div className={styles.loading} role="status"><span className={styles.spinner} /><span>{copy('Loading results…', 'กำลังโหลดผล…')}</span></div>}
        <div className={styles.actions}>{!guest && <button type="button" className={styles.secondaryButton} onClick={onLeaderboard} disabled={saving}>{copy('All rankings', 'อันดับทั้งหมด')}</button>}<button type="button" className={styles.primaryButton} onClick={onHome} disabled={saving}>{guest ? copy('Sign in', 'เข้าสู่ระบบ') : copy('Back to home', 'กลับหน้าหลัก')}</button></div>
      </section>
    </div>
  </div></main>;
}
