"use client";

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { watchRoom, watchRealtimeConnection, type SessionRoom } from '@/lib/firebase/rtdb';
import { lobbyStandings } from '@/lib/play/lobby-standings';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import QRCode from 'react-qr-code';
import InvitationModal from '@/components/InvitationModal';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import type { Session } from '@/lib/types';
import styles from '@/components/play/lobby.module.css';

export default function HostLobbyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const copy = (en: string, thai: string) => th ? thai : en;
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<SessionRoom | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean | null>(null);
  const [loadedRoom, setLoadedRoom] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [, refreshTime] = useState(0);
  const closeDialog = useRef<HTMLDialogElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { if (!loading && !isAdmin) router.replace('/'); }, [loading, isAdmin, router]);
  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    fetch(`/api/sessions/${sessionId}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load quiz');
      setSession(await response.json());
    }).catch(error => { if (error.name !== 'AbortError') setError('Could not load the lobby. Please refresh.'); });
    return () => controller.abort();
  }, [isAdmin, sessionId]);
  useEffect(() => {
    if (!session?.id) return;
    let stopped = false;
    let polling: ReturnType<typeof setInterval> | undefined;
    let fetching = false;
    const fetchRoom = async () => {
      if (fetching || stopped) return;
      fetching = true;
      try {
        const response = await fetch(`/api/admin/sessions/${session.id}/lobby`, {cache:'no-store'});
        if (!response.ok) throw new Error('Could not load the lobby');
        const data = await response.json();
        if (!stopped) {setRoom(data);setLoadedRoom(true);}
      } catch { if (!stopped) setError('Could not refresh the lobby. Please check your connection.'); }
      finally { fetching = false; }
    };
    const stop = watchRoom(session.id, next => {
      if (stopped) return;
      if (next) {setRoom(next);setLoadedRoom(true);clearInterval(polling);polling=undefined;}
      else if (!polling) {void fetchRoom();polling=setInterval(() => void fetchRoom(),10000);}
    });
    const timer = setInterval(() => refreshTime(value => value + 1), 10_000);
    return () => { stopped=true;stop();clearInterval(timer);clearInterval(polling); };
  }, [session?.id]);
  useEffect(() => { if (isAdmin) return watchRealtimeConnection(setRealtimeConnected); }, [isAdmin]);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  useEffect(() => { if (session?.name) document.title = `${session.name} | Private lobby`; }, [session?.name]);
  const players = lobbyStandings(room);
  const connected = players.filter(player => player.connected).length;
  const finished = players.filter(player => player.finished).length;
  const status = room?.status ?? 'waiting';
  const shareLink = typeof window !== 'undefined' && room?.joinToken ? `${window.location.origin}/join/${room.joinToken}` : '';
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); clearTimeout(copiedTimer.current); copiedTimer.current = setTimeout(() => setCopied(false), 2000); }
    catch { showToast(copy('Could not copy. Select the link to copy it.', 'คัดลอกไม่สำเร็จ เลือกลิงก์เพื่อคัดลอก'), 'error'); }
  };
  const changeLobby = async (action: 'start' | 'close') => {
    if (!session || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/sessions/${session.id}/lobby`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not update lobby');
      closeDialog.current?.close();
      showToast(action === 'start' ? copy('Quiz started', 'เริ่มแบบทดสอบแล้ว') : copy('Lobby closed', 'ปิดห้องแล้ว'), 'success');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not update lobby'); }
    finally { setBusy(false); }
  };
  if (loading || !isAdmin) return null;
  return <div className={styles.admin}>
    <header className={styles.panel}><div className={styles.header}><div><p className={styles.eyebrow}>{copy('Private lobby', 'ห้องส่วนตัว')}</p><h1>{session?.name || copy('Loading quiz…', 'กำลังโหลดแบบทดสอบ…')}</h1>
      <div className={styles.actions}><span className={`${styles.status} ${status === 'ended' ? styles.closed : ''}`}>{status === 'started' ? copy('Quiz in progress', 'กำลังเล่น') : status === 'ended' ? copy('Closed', 'ปิดแล้ว') : copy('Waiting for players', 'รอผู้เล่น')}</span><span className={styles.muted}>{connected} {copy('connected', 'คนเชื่อมต่อ')} · {session?.question_count ?? '—'} {copy('questions', 'ข้อ')}</span></div>
    </div><div className={styles.actions}>
      {status === 'waiting' && <button className={styles.primary} disabled={busy || !connected || !shareLink} onClick={() => changeLobby('start')}>{busy ? copy('Starting…', 'กำลังเริ่ม…') : copy('Start quiz', 'เริ่มแบบทดสอบ')}</button>}
      {status !== 'ended' && <button className={styles.danger} disabled={busy || !room} onClick={() => closeDialog.current?.showModal()}>{status === 'started' ? copy('End quiz', 'จบแบบทดสอบ') : copy('Close lobby', 'ปิดห้อง')}</button>}
      <button className={styles.button} disabled={!session} onClick={() => router.push(`/admin/sessions/${session?.id}/analytics`)}>{copy('View results', 'ดูผลลัพธ์')}</button>
    </div></div>{error && <p className={styles.error} role="alert">{error}</p>}</header>
    {loadedRoom && !room && <section className={styles.panel}><p className={styles.error}>{copy('This lobby is unavailable. Open it from the quiz manager.', 'ไม่พบห้องนี้ กรุณาเปิดห้องจากหน้าจัดการแบบทดสอบ')}</p><a href="/admin?tab=quizzes-manager" className={styles.button}>{copy('Quiz manager', 'จัดการแบบทดสอบ')}</a></section>}
    {realtimeConnected === false && <p role="status" className={styles.muted}>{copy('Reconnecting… Scores may be out of date until the connection returns.', 'กำลังเชื่อมต่อใหม่… คะแนนอาจยังไม่อัปเดตจนกว่าจะเชื่อมต่อสำเร็จ')}</p>}
    <div className={styles.columns}><div className={styles.stack}>
      <section className={styles.panel}><h2>{copy('Invite players', 'เชิญผู้เล่น')}</h2><p className={styles.muted}>{copy('Players join using this QR code or invitation link.', 'ผู้เล่นเข้าร่วมผ่าน QR หรือลิงก์คำเชิญนี้')}</p>
        {shareLink ? <><div className={styles.qr}><div className={styles.qrPaper}><QRCode value={shareLink} size={168} level="M" /></div><button className={styles.button} onClick={() => setShowQR(true)}>{copy('Show QR code', 'ขยาย QR')}</button></div><div className={styles.link}><code>{shareLink}</code><button className={styles.button} onClick={copyLink}>{copied ? copy('Copied', 'คัดลอกแล้ว') : copy('Copy link', 'คัดลอกลิงก์')}</button></div></>
        : <p className={styles.empty}>{status === 'ended' ? copy('This invitation has expired.', 'คำเชิญนี้หมดอายุแล้ว') : loadedRoom ? copy('No active invitation. Reopen the lobby from the quiz manager.', 'ไม่มีคำเชิญที่ใช้งานได้ กรุณาเปิดห้องใหม่จากหน้าจัดการแบบทดสอบ') : copy('Loading invitation…', 'กำลังโหลดคำเชิญ…')}</p>}
      </section>
      <section className={styles.panel}><div className={styles.sectionHead}><h2>{copy('Players', 'ผู้เล่น')}</h2><span className={styles.muted}>{players.length} {copy('joined', 'คนเข้าร่วม')}</span></div>
        {players.length ? <div className={styles.players}>{players.map(player => <div key={player.uid} className={styles.player}><ProfileAvatar displayName={player.displayName} photoURL={player.photoURL} size={32} /><div className={styles.name}>{player.displayName}<small>{player.finished ? copy('Finished', 'เล่นจบแล้ว') : status === 'ended' ? copy('Not finished', 'ยังเล่นไม่จบ') : player.connected ? copy('Connected', 'เชื่อมต่ออยู่') : copy('Offline', 'ออฟไลน์')}</small></div></div>)}</div>
        : <p className={styles.empty}>{copy('No players yet. Share the invitation to get started.', 'ยังไม่มีผู้เล่น แชร์คำเชิญเพื่อให้ผู้เล่นเข้าร่วม')}</p>}
      </section>
    </div><section className={styles.panel}><div className={styles.sectionHead}><div><h2>{status === 'ended' ? copy('Final standings', 'อันดับสุดท้าย') : copy('Live leaderboard', 'อันดับคะแนนสด')}</h2><p className={styles.muted}>{copy('Current lobby scores', 'คะแนนของห้องรอบนี้')} · {finished}/{players.length} {copy('finished', 'คนเล่นจบแล้ว')}</p></div><span className={styles.eyebrow}>{status === 'started' ? copy('Updates automatically', 'อัปเดตอัตโนมัติ') : copy('This round', 'รอบนี้')}</span></div>
      {players.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">{copy('Rank', 'อันดับ')}</th><th scope="col">{copy('Player', 'ผู้เล่น')}</th><th scope="col">{copy('Progress', 'สถานะ')}</th><th scope="col">{copy('Score', 'คะแนน')}</th></tr></thead><tbody>{players.map(player => <tr key={player.uid}><td>{status === 'waiting' ? '—' : player.rank}</td><td><div className={styles.identity}><ProfileAvatar displayName={player.displayName} photoURL={player.photoURL} size={32} /><span className={styles.name} title={player.displayName}>{player.displayName}</span></div></td><td className={styles.progress}>{player.finished ? copy('Finished', 'เล่นจบแล้ว') : status === 'ended' ? copy('Not finished', 'ยังเล่นไม่จบ') : !player.connected ? copy('Offline', 'ออฟไลน์') : status === 'waiting' ? copy('Ready', 'พร้อมเล่น') : player.currentQuestionLabel || copy('Starting', 'กำลังเริ่ม')}</td><td><strong>{player.score.toLocaleString()}</strong></td></tr>)}</tbody></table></div>
      : <p className={styles.empty}>{copy('Players and scores will appear here after they join.', 'รายชื่อและคะแนนจะแสดงเมื่อมีผู้เล่นเข้าร่วม')}</p>}
    </section></div>
    <InvitationModal isOpen={showQR} onClose={() => setShowQR(false)} sessionName={session?.name ?? 'Quiz'} joinToken={room?.joinToken ?? null} />
    <dialog ref={closeDialog} className={styles.dialog}><h2>{status === 'started' ? copy('End this quiz?', 'จบแบบทดสอบนี้หรือไม่?') : copy('Close this lobby?', 'ปิดห้องนี้หรือไม่?')}</h2><p className={styles.muted}>{copy('Players will stop playing and the invitation link will expire. Saved answers will remain available in results.', 'ผู้เล่นจะหยุดเล่นและลิงก์คำเชิญจะหมดอายุ คำตอบที่บันทึกแล้วจะยังอยู่ในผลลัพธ์')}</p><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => closeDialog.current?.close()}>{copy('Cancel', 'ยกเลิก')}</button><button className={styles.danger} disabled={busy} onClick={() => changeLobby('close')}>{busy ? copy('Closing…', 'กำลังปิด…') : status === 'started' ? copy('End quiz', 'จบแบบทดสอบ') : copy('Close lobby', 'ปิดห้อง')}</button></div>{error && <p className={styles.error} role="alert">{error}</p>}</dialog>
  </div>;
}
