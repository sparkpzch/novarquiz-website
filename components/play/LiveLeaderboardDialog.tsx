'use client';

import { useEffect, useRef } from 'react';
import styles from './quiz.module.css';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

export type LiveLeaderboardPlayer = { uid: string; displayName?: string; photoURL?: string | null; score: number };

export default function LiveLeaderboardDialog({ open, players, currentUserId, onClose, th }: {
  open: boolean;
  players: LiveLeaderboardPlayer[];
  currentUserId?: string;
  onClose: () => void;
  th: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const copy = (en: string, thai: string) => th ? thai : en;

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);

  return <dialog id="play-leaderboard" className={styles.leaderboardDialog} ref={dialog} aria-labelledby="live-leaderboard-title" onClose={onClose} onClick={(event) => {
    if (event.target === dialog.current) onClose();
  }}>
    <div className={styles.leaderboardDialogHead}>
      <h2 id="live-leaderboard-title">{copy('Live leaderboard', 'ตารางคะแนนสด')}</h2>
      <button type="button" className={styles.leaderboardClose} aria-label={copy('Close leaderboard', 'ปิดตารางคะแนน')} onClick={onClose}>×</button>
    </div>
    {players.length ? <ol className={styles.leaderboardDialogList}>{players.map((player, index) => <li key={player.uid} className={player.uid === currentUserId ? styles.leaderboardDialogMe : ''}>
      <strong className={styles.leaderboardDialogRank}>#{index + 1}</strong>
      <div className={styles.livePlayerIdentity}><ProfileAvatar displayName={player.displayName} photoURL={player.photoURL} size={32} /><span title={player.displayName}>{player.displayName || copy('Player', 'ผู้เล่น')}{player.uid === currentUserId && <small> · {copy('You', 'คุณ')}</small>}</span></div>
      <b>{player.score.toLocaleString()}</b>
    </li>)}</ol> : <p className={styles.leaderboardDialogEmpty}>{copy('No scores yet.', 'ยังไม่มีคะแนน')}</p>}
  </dialog>;
}
