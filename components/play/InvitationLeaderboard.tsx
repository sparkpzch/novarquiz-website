import ProfileAvatar from '@/components/ui/ProfileAvatar';
import styles from './lobby.module.css';

export type InvitationStanding = {
  user_id: string;
  user_display_name: string;
  user_photo_url: string | null;
  total_score: number;
  rank: number;
  is_me?: boolean;
};

export default function InvitationLeaderboard({ entries, th, refreshFailed }: {
  entries: readonly InvitationStanding[]; th: boolean; refreshFailed: boolean;
}) {
  const copy = (en: string, thai: string) => th ? thai : en;
  const top = entries.slice(0, 3);
  const podium = top.length === 3 ? [top[1], top[0], top[2]] : top;
  return <section className={`${styles.panel} ${styles.invitationBoard}`} aria-labelledby="invitation-leaderboard-title">
    <div className={styles.sectionHead}>
      <div><p className={styles.eyebrow}>{copy('Live session scores', 'คะแนนของห้องปัจจุบัน')}</p><h2 id="invitation-leaderboard-title">{copy('Leaderboard', 'อันดับผู้เล่น')}</h2></div>
      <span className={styles.eyebrow}>{entries.length} {copy('players', 'ผู้เล่น')}</span>
    </div>
    {refreshFailed && <p role="status" className={styles.error}>{copy('Could not refresh scores. Retrying…', 'อัปเดตคะแนนไม่สำเร็จ กำลังลองอีกครั้ง…')}</p>}
    {entries.length ? <>
      <div className={styles.invitationPodium} aria-label={copy('Top three players', 'ผู้เล่นสามอันดับแรก')}>
        {podium.map((entry, index) => <div className={styles.invitationPodiumPlayer} key={entry.user_id}>
          <ProfileAvatar displayName={entry.user_display_name} photoURL={entry.user_photo_url} size={index === (top.length === 3 ? 1 : 0) ? 64 : 48} />
          <strong title={entry.user_display_name}>{entry.user_display_name}</strong>
          <span>{entry.total_score.toLocaleString(th ? 'th-TH' : 'en-US')} <small>{copy('pts', 'คะแนน')}</small></span>
          <div className={`${styles.invitationPodiumStep} ${index === (top.length === 3 ? 1 : 0) ? styles.invitationWinner : ''}`}>#{entry.rank}</div>
        </div>)}
      </div>
      <div className={styles.invitationRankings} tabIndex={0} aria-label={copy('Player rankings', 'อันดับผู้เล่น')}>
        <table className={styles.invitationTable}>
          <thead><tr><th scope="col">{copy('Rank', 'อันดับ')}</th><th scope="col">{copy('Player', 'ผู้เล่น')}</th><th scope="col">{copy('Score', 'คะแนน')}</th></tr></thead>
          <tbody>{entries.map(entry => <tr key={entry.user_id}>
            <td>{entry.rank}</td>
            <td><div className={styles.identity}><ProfileAvatar displayName={entry.user_display_name} photoURL={entry.user_photo_url} size={36} /><span className={styles.invitationPlayerName}>{entry.user_display_name}{entry.is_me && <small> · {copy('You', 'คุณ')}</small>}</span></div></td>
            <td>{entry.total_score.toLocaleString(th ? 'th-TH' : 'en-US')}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </> : <div className={styles.empty}><p>{copy('Waiting for players', 'กำลังรอผู้เล่น')}</p><p>{copy('Player profiles and scores will appear here when they join. Scores update as they answer.', 'รูปโปรไฟล์และคะแนนจะแสดงเมื่อผู้เล่นเข้าร่วม คะแนนจะอัปเดตระหว่างทำแบบทดสอบ')}</p></div>}
  </section>;
}
