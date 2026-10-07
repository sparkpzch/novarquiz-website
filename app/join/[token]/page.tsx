'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { saveLobbyConnection } from '@/lib/client/lobby-connection';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import Link from 'next/link';
import styles from '@/components/play/lobby.module.css';

type InvitationQuiz = {
  id: string; name: string; description: string | null; cover_image_url?: string | null;
  question_count?: number; is_private?: boolean;
};

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const copy = (en: string, thai: string) => th ? thai : en;
  const [quiz, setQuiz] = useState<InvitationQuiz | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);
  useEffect(() => {
    if (!loading && (!user || user.isAnonymous)) {
      const next = window.location.pathname + window.location.search;
      router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, router]);
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const controller = new AbortController();
    fetch(`/api/join/${encodeURIComponent(token)}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Invitation unavailable');
      setQuiz(await response.json());
    }).catch(error => { if (error.name !== 'AbortError') setUnavailable(true); });
    return () => controller.abort();
  }, [token, user]);
  const join = async () => {
    if (!quiz || !user || joining) return;
    setJoining(true); setJoinFailed(false);
    try {
      const response = await fetch(`/api/sessions/${quiz.id}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitationToken: token }),
      });
      if (!response.ok) throw new Error('Could not join');
      const data = await response.json();
      saveLobbyConnection(data.sessionId, user.uid, { token: data.token, connectionId: data.connectionId });
      router.replace(`/play/${data.sessionId}/${data.roomStatus === 'started' ? 'question' : 'lobby'}`);
    } catch { setJoining(false); setJoinFailed(true); }
  };
  return <main className={styles.page}><section className={styles.panel} style={{ width: '100%', maxWidth: 600 }}>
    {loading || !user || user.isAnonymous ? <p role="status" className={styles.muted}>{copy('Checking your account…', 'กำลังตรวจสอบบัญชี…')}</p>
      : unavailable ? <><p className={styles.eyebrow}>NovarQuiz</p><h1>{copy('Invitation unavailable', 'คำเชิญนี้ใช้งานไม่ได้')}</h1><p role="alert" className={styles.muted}>{copy('The lobby may be closed or the link has expired. Ask the host for a new invitation.', 'ห้องอาจปิดแล้วหรือลิงก์หมดอายุ กรุณาขอคำเชิญใหม่จากผู้จัด')}</p><Link className={styles.button} href="/">{copy('Back to home', 'กลับหน้าหลัก')}</Link></>
      : !quiz ? <p role="status" className={styles.muted}>{copy('Loading invitation…', 'กำลังโหลดคำเชิญ…')}</p>
      : <>
        {quiz.cover_image_url && <img src={quiz.cover_image_url} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 12, marginBottom: 20 }} />}
        <p className={styles.eyebrow}>{copy('Quiz invitation', 'คำเชิญเข้าร่วมแบบทดสอบ')}</p><h1>{quiz.name}</h1>
        {quiz.description && <p className={styles.muted}>{quiz.description}</p>}
        <p className={styles.muted}>{copy('Join the quiz with your account. If the host has not started yet, you will wait in the lobby.', 'เข้าร่วมด้วยบัญชีของคุณ หากผู้จัดยังไม่เริ่ม คุณจะรอในห้องรับรอง')}</p>
        <div className={styles.player}><ProfileAvatar displayName={user.displayName || 'Player'} photoURL={user.photoURL} size={40} /><div className={styles.name}>{user.displayName || 'Player'}<small>{copy('Joining with this account', 'เข้าร่วมด้วยบัญชีนี้')}</small></div></div>
        <button className={styles.primary} style={{ width: '100%', marginTop: 20 }} disabled={joining} onClick={join}>{joining ? <><span className={styles.spinner} />{copy('Joining…', 'กำลังเข้าร่วม…')}</> : copy('Join quiz', 'เข้าร่วมแบบทดสอบ')}</button>
        {joinFailed && <p className={styles.error} role="alert">{copy('Could not join. Check your connection or ask the host for a new invitation, then try again.', 'เข้าร่วมไม่สำเร็จ ตรวจสอบการเชื่อมต่อหรือขอคำเชิญใหม่จากผู้จัด แล้วลองอีกครั้ง')}</p>}
      </>}
  </section></main>;
}
