'use client';
import type { LeaderboardEntry } from '@/lib/types';
import { formatQuizTime, rankLeaderboard } from '@/lib/analytics/leaderboard';
import LeaderboardStandings, { TrophyIcon } from './LeaderboardStandings';
import styles from './quiz.module.css';

export default function FinishedQuiz({ score, elapsed, quizName, leaderboard, error, saving, guest, onRetry, onHome, onLeaderboard, onSummary, th }: {
  score: number; elapsed: number; quizName?: string; leaderboard: LeaderboardEntry[] | null;
  error: string | null; saving: boolean; guest: boolean; th: boolean;
  onRetry: () => void; onHome: () => void; onLeaderboard: () => void; onSummary: () => void;
}) {
  const copy = (en: string, thai: string) => th ? thai : en;
  const board = rankLeaderboard(leaderboard || []);
  const index = board.findIndex((entry) => entry.is_me);
  const me = board[index];
  return <main className={styles.screen}><div className={styles.container}>
    <div className={styles.brandLine}><strong>NOVARQUIZ</strong><span>{quizName}</span></div>
    <section className={`${styles.surface} ${styles.finishedHero}`} aria-labelledby="finished-title">
      <div className={styles.trophy}><TrophyIcon /></div><span className={styles.eyebrow}>{copy('YOUR RESULT', 'ผลของคุณ')}</span>
      <h1 id="finished-title">{copy('Your quiz is complete', 'ทำแบบทดสอบเสร็จแล้ว')}</h1>
      <p className={styles.heroDescription}>{saving ? copy('Saving your completed result…', 'กำลังบันทึกผลแบบทดสอบ…') : copy('Here is your result. Keep exploring what your answers mean.', 'ดูผลของคุณ แล้วไปทำความเข้าใจคำตอบให้มากขึ้นกัน')}</p>
      <div className={styles.resultStats}>
        <div className={styles.resultStat}><strong>{score}</strong><small>{copy('Total points', 'คะแนนรวม')}</small></div>
        <div className={styles.resultStat}><strong>{me ? `#${index + 1}` : '—'}</strong><small>{copy('Your rank', 'อันดับของคุณ')}</small></div>
        <div className={styles.resultStat}><strong>{formatQuizTime(me?.total_time_ms ?? elapsed * 1000)}</strong><small>{copy('Time taken', 'เวลาที่ใช้')}</small></div>
      </div>
      <div className={styles.summaryCallout}><span className={styles.summaryIcon} aria-hidden="true">✧</span><div><strong>{copy('Understand your answers with AI', 'เข้าใจคำตอบของคุณมากขึ้นด้วย AI')}</strong>
        <p>{guest ? copy('Sign in to save your history and receive AI summaries in future quizzes.', 'เข้าสู่ระบบเพื่อเก็บประวัติและรับ AI Summary ในแบบทดสอบครั้งถัดไป') : copy('Open your recap to generate an AI summary from your answers. Summaries awaiting review are clearly labelled.', 'เปิดสรุปผลเพื่อให้ AI วิเคราะห์คำตอบของคุณ ข้อความที่รอตรวจสอบจะมีป้ายกำกับชัดเจน')}</p>
        <button type="button" className={styles.primaryButton} onClick={onSummary} disabled={saving}>{guest ? copy('Sign in', 'เข้าสู่ระบบ') : copy('View my answer summary', 'ดูสรุปจากคำตอบของฉัน')}<span aria-hidden="true">→</span></button>
      </div></div>
    </section>
    <section className={styles.surface} aria-label={copy('Completed standings', 'อันดับหลังจบแบบทดสอบ')}>
      {error && <div className={styles.error} role="alert">{guest ? copy('Could not load the leaderboard. Your score is shown above.', 'โหลดอันดับไม่สำเร็จ คุณยังดูคะแนนได้ด้านบน') : copy('Could not refresh the leaderboard. Your quiz result has been saved.', 'อัปเดตอันดับไม่สำเร็จ ผลแบบทดสอบของคุณบันทึกแล้ว')} <button type="button" className={styles.secondaryButton} onClick={onRetry}>{copy('Try again', 'ลองอีกครั้ง')}</button></div>}
      {leaderboard !== null ? <LeaderboardStandings entries={leaderboard} th={th} preview /> : !error && <div className={styles.loading} role="status"><span className={styles.spinner} /><span>{copy('Loading completed results…', 'กำลังโหลดผลและอันดับ…')}</span></div>}
      <div className={styles.actions}>{!guest && <button type="button" className={styles.secondaryButton} onClick={onLeaderboard} disabled={saving}>{copy('View all rankings', 'ดูอันดับทั้งหมด')}</button>}<button type="button" className={styles.secondaryButton} onClick={onHome} disabled={saving}>{guest ? copy('Sign in to continue', 'เข้าสู่ระบบเพื่อไปต่อ') : copy('Back to home', 'กลับหน้าหลัก')}</button></div>
    </section>
  </div></main>;
}
