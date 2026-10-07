"use client";

import { use, useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { maintainSessionPresence, watchLobbyMembership } from '@/lib/firebase/rtdb';
import { readLobbyConnection, lobbyHeaders } from '@/lib/client/lobby-connection';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import Link from 'next/link';
import styles from '@/components/play/lobby.module.css';

export default function PlaySessionLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const { user, loading } = useAuth();
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const connection = hydrated && user ? readLobbyConnection(sessionId, user.uid) : null;
  useEffect(() => {
    if (!loading && user && !connection) return maintainSessionPresence(user.uid, sessionId);
  }, [loading, user, sessionId, connection?.connectionId]);
  if (loading || !hydrated) return <LobbyConnectionNotice state="checking" th={th} />;
  if (!user || !connection) return children;
  return <ManagedLobby key={`${sessionId}:${user.uid}:${connection.connectionId}`} sessionId={sessionId} uid={user.uid} connectionId={connection.connectionId} th={th}>{children}</ManagedLobby>;
}

function ManagedLobby({ children, sessionId, uid, connectionId, th }: {
  children: React.ReactNode; sessionId: string; uid: string; connectionId: string; th: boolean;
}) {
  const [state, setState] = useState<'checking' | 'ready' | 'replaced' | 'closed' | 'error'>('checking');
  useEffect(() => {
    let stopPresence: (() => void) | undefined;
    let stopped = false;
    let revision = 0;
    const stopRoom = watchLobbyMembership(sessionId, uid, room => {
      if (stopped) return;
      const member = room.member;
      const next = !room.status || room.status === 'ended' || !room.joinToken || member?.left ? 'closed'
        : member?.connectionId !== connectionId || member.roundId !== room.roundId ? 'replaced' : 'ready';
      const currentRevision = ++revision;
      if (next === 'ready') {
        setState('ready');
        if (!stopPresence) stopPresence = maintainSessionPresence(uid, sessionId);
        return;
      }
      // An existing Firebase client may emit a cached owner/round immediately
      // after a successful join. Confirm mismatches with the server before
      // cutting off the newest device; old requests are already server-gated.
      setState('checking'); stopPresence?.(); stopPresence = undefined;
      void fetch(`/api/play/${sessionId}/presence`, {method:'POST',headers:lobbyHeaders(sessionId,uid,{'Content-Type':'application/json'}),body:'{}',signal:AbortSignal.timeout(10_000)})
        .then(async response => {
          if (stopped || currentRevision !== revision) return;
          if (response.ok) { setState('ready'); stopPresence = maintainSessionPresence(uid,sessionId); return; }
          const error = await response.json().catch(()=>({}));
          if (stopped || currentRevision !== revision) return;
          stopped = true; stopRoom();
          setState(error.code==='session_replaced'?'replaced':response.status===403?'closed':'error');
        }).catch(() => { if (!stopped && currentRevision === revision) setState('error'); });
    });
    return () => { stopped = true; stopRoom(); stopPresence?.(); };
  }, [sessionId, uid, connectionId]);
  return state === 'ready' ? children : <LobbyConnectionNotice state={state} th={th} />;
}

function LobbyConnectionNotice({ state, th }: { state: 'checking' | 'replaced' | 'closed' | 'error'; th: boolean }) {
  return <main className={styles.page}><section className={styles.panel} style={{ maxWidth: 520 }}>
    {state === 'checking' ? <p role="status" className={styles.muted}>{th ? 'กำลังตรวจสอบห้อง…' : 'Checking your connection…'}</p> : <>
      <p className={styles.eyebrow}>NovarQuiz</p>
      <h1>{state === 'error' ? (th ? 'ตรวจสอบการเชื่อมต่อไม่สำเร็จ' : 'Could not check your connection') : state === 'replaced' ? (th ? 'บัญชีนี้ใช้งานบนอุปกรณ์อื่น' : 'Playing on another device') : (th ? 'ห้องนี้ปิดแล้ว' : 'This lobby is closed')}</h1>
      <p role="alert" className={styles.muted}>{state === 'error' ? (th ? 'ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง' : 'Check your connection and try again.') : state === 'replaced'
        ? (th ? 'อุปกรณ์ที่เข้าร่วมล่าสุดเป็นอุปกรณ์หลักแล้ว หากต้องการเล่นต่อที่นี่ ให้เปิดลิงก์คำเชิญแล้วเข้าร่วมอีกครั้ง' : 'Your latest device is now active. To continue here, open the invitation and join again.')
        : (th ? 'หากต้องการเข้าร่วมอีกครั้ง ขอ QR หรือลิงก์ใหม่จากผู้จัด' : 'Ask the host for a new QR code or invitation link.')}</p>
      {state === 'error' && <button className={styles.primary} onClick={() => window.location.reload()}>{th ? 'ลองอีกครั้ง' : 'Try again'}</button>}
      <Link className={styles.button} href="/">{th ? 'กลับหน้าหลัก' : 'Back to home'}</Link>
    </>}
  </section></main>;
}
