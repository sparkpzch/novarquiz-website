"use client";

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { watchRoom, watchRealtimeConnection, type SessionRoom } from '@/lib/firebase/rtdb';
import { lobbyHeaders, readLobbyConnection } from '@/lib/client/lobby-connection';
import { lobbyStandings } from '@/lib/play/lobby-standings';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import type { Quiz } from '@/lib/types';
import Link from 'next/link';
import styles from '@/components/play/lobby.module.css';

export default function PlayerLobbyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const copy = (en: string, thai: string) => th ? thai : en;
  const [connected, setConnected] = useState<boolean | null>(null);
  const [room, setRoom] = useState<SessionRoom | null>(null);
  const [session, setSession] = useState<Quiz | null>(null);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/sessions/${sessionId}`, { signal: controller.signal, headers: user ? lobbyHeaders(sessionId, user.uid) : undefined }).then(async response => {
      if (!response.ok) throw new Error('Could not load quiz');
      setSession(await response.json());
    }).catch(error => { if (error.name !== 'AbortError') setError('Could not load the lobby. Please try again.'); });
    return () => controller.abort();
  }, [sessionId, user]);
  useEffect(() => {
    if (!user || !session?.id) return;
    const connection = readLobbyConnection(session.id, user.uid);
    return watchRoom(session.id, next => {
      setRoom(next);
      if (next?.status === 'started' && next.players?.[user.uid]?.connectionId === connection?.connectionId) {
        router.replace(`/play/${session.id}/question`);
      }
    });
  }, [router, session?.id, user]);
  useEffect(() => watchRealtimeConnection(setConnected), []);
  const leave = async () => {
    if (!user || !session || leaving) return;
    setLeaving(true); setError('');
    try {
      const response = await fetch(`/api/play/${session.id}/presence`, { method: 'DELETE', headers: lobbyHeaders(session.id, user.uid) });
      if (!response.ok) throw new Error('Leave failed');
      router.replace('/');
    } catch { setError(copy('Could not leave. Please try again.', 'ออกจากห้องไม่สำเร็จ กรุณาลองอีกครั้ง')); setLeaving(false); }
  };
  if (loading || !user) return null;
  if (!readLobbyConnection(sessionId, user.uid)) return <main className={styles.page}><section className={styles.panel}><h1>{copy('Invitation required', 'เข้าร่วมผ่านคำเชิญ')}</h1><p className={styles.muted}>{copy('Open the invitation link or scan the QR code to join.', 'เปิดลิงก์คำเชิญหรือสแกน QR เพื่อเข้าร่วม')}</p><Link className={styles.button} href="/">{copy('Back to home', 'กลับหน้าหลัก')}</Link></section></main>;
  const players = lobbyStandings(room);
  return <main className={styles.page}><div className={styles.container}>
    <header className={styles.panel}>
      <div className={styles.header}><div><p className={styles.eyebrow}>{copy('Private lobby', 'ห้องส่วนตัว')}</p><h1>{session?.name || copy('Loading quiz…', 'กำลังโหลดแบบทดสอบ…')}</h1></div>
        <button className={styles.button} onClick={() => dialog.current?.showModal()}>{copy('Leave lobby', 'ออกจากห้อง')}</button></div>
      <div className={styles.player}><ProfileAvatar displayName={user.displayName || 'Player'} photoURL={user.photoURL} size={40} /><div className={styles.name}>{user.displayName || 'Player'}<small>{copy('Joined with your account', 'เข้าร่วมด้วยบัญชีของคุณแล้ว')}</small></div></div>
      <div className={styles.waiting} role="status"><strong>{copy('Waiting for the host', 'รอผู้จัดเริ่มแบบทดสอบ')}</strong><p className={styles.muted}>{copy('The quiz will open here when the host starts. Keep this page open.', 'เมื่อผู้จัดเริ่ม คำถามจะเปิดที่หน้านี้ กรุณาเปิดหน้านี้ไว้')}</p></div>
      {connected === false && <p role="status" className={styles.muted}>{copy('Reconnecting to the lobby…', 'กำลังเชื่อมต่อห้องอีกครั้ง…')}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </header>
    <section className={styles.panel}><div className={styles.sectionHead}><h2>{copy('Players', 'ผู้เล่น')}</h2><span className={styles.muted}>{players.length} {copy('joined', 'คนเข้าร่วม')}</span></div>
      {players.length ? <div className={styles.players}>{players.map(player => <div key={player.uid} className={styles.player}><ProfileAvatar displayName={player.displayName} photoURL={player.photoURL} size={36} /><div className={styles.name}>{player.displayName}<small>{player.uid === user.uid ? copy('You', 'คุณ') : player.connected ? copy('Connected', 'เชื่อมต่ออยู่') : copy('Offline', 'ออฟไลน์')}</small></div></div>)}</div>
        : <p className={styles.empty}>{copy('Connecting to the lobby…', 'กำลังเชื่อมต่อห้อง…')}</p>}
    </section>
    <dialog ref={dialog} className={styles.dialog}><h2>{copy('Leave this lobby?', 'ออกจากห้องนี้หรือไม่?')}</h2><p className={styles.muted}>{copy('You can join again using the invitation link or QR code while the lobby is open.', 'คุณสามารถเข้าร่วมอีกครั้งด้วยลิงก์คำเชิญหรือ QR ขณะที่ห้องยังเปิดอยู่')}</p><div className={styles.actions}><button className={styles.button} disabled={leaving} onClick={() => dialog.current?.close()}>{copy('Stay', 'อยู่ต่อ')}</button><button className={styles.danger} disabled={leaving} onClick={leave}>{leaving ? copy('Leaving…', 'กำลังออก…') : copy('Leave lobby', 'ออกจากห้อง')}</button></div>{error && <p role="alert" className={styles.error}>{error}</p>}</dialog>
  </div></main>;
}
