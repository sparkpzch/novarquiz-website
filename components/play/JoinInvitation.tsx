'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { saveLobbyConnection } from '@/lib/client/lobby-connection';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import Link from 'next/link';
import styles from '@/components/play/lobby.module.css';
import InvitationLeaderboard, { type InvitationStanding } from '@/components/play/InvitationLeaderboard';

type InvitationQuiz = {
  id: string; name: string; description: string | null; cover_image_url?: string | null;
  question_count?: number; timer_seconds?: number | null; is_private?: boolean;
  leaderboard: InvitationStanding[];
};

const subscribeNothing = () => () => {};

// Invitation modal shown over a dashboard page (Home when opened from a link).
export default function JoinInvitation({ token }: { token: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const copy = (en: string, thai: string) => th ? thai : en;
  const [quiz, setQuiz] = useState<InvitationQuiz | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  useEffect(() => {
    if (!loading && (!user || user.isAnonymous)) {
      const next = window.location.pathname + window.location.search;
      router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, router]);
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let loaded = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/join/${encodeURIComponent(token)}`, { signal: controller.signal, cache: 'no-store' });
        if (controller.signal.aborted) return;
        if (response.status === 404 || response.status === 401 || response.status === 403) {
          setUnavailable(true);
          return;
        }
        if (!response.ok) throw new Error('Invitation unavailable');
        const invitation = await response.json();
        if (controller.signal.aborted) return;
        setQuiz(invitation);
        setUnavailable(false);
        setRefreshFailed(false);
        loaded = true;
      } catch {
        if (controller.signal.aborted) return;
        if (!loaded) setUnavailable(true);
        else setRefreshFailed(true);
      }
      // Serialize refreshes and stay below the invitation API's rate limit.
      if (!controller.signal.aborted) timer = setTimeout(refresh, 5000);
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
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
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const goBack = () => {
    if (joining) return;
    if (window.history.length > 1) router.back();
    else router.replace('/');
  };
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') goBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  // Portal to <body> so the modal stacks above the dashboard header and nav
  // even when it renders inside the page's animated (transformed) container.
  if (!mounted) return null;
  return createPortal(<div className={`${styles.page} ${styles.invitationPage}`} role="dialog" aria-modal="true" aria-label={copy('Quiz invitation', 'คำเชิญเข้าร่วมแบบทดสอบ')}>
    <button type="button" className={styles.invitationBackdrop} onClick={goBack} disabled={joining}
      aria-label={copy('Back to previous page', 'ย้อนกลับหน้าก่อนหน้า')} />
    <button type="button" className={styles.invitationClose} onClick={goBack} disabled={joining}
      aria-label={copy('Close', 'ปิด')}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
    <div className={quiz && !unavailable && user && !loading && !user.isAnonymous ? styles.invitationLayout : styles.invitationStatus}>
    <section className={`${styles.panel} ${styles.invitationInfo}`}>
    {loading || !user || user.isAnonymous ? <p role="status" className={styles.muted}>{copy('Checking your account…', 'กำลังตรวจสอบบัญชี…')}</p>
      : unavailable ? <><p className={styles.eyebrow}>NovarQuiz</p><h1>{copy('Invitation unavailable', 'คำเชิญนี้ใช้งานไม่ได้')}</h1><p role="alert" className={styles.muted}>{copy('The lobby may be closed or the link has expired. Ask the host for a new invitation.', 'ห้องอาจปิดแล้วหรือลิงก์หมดอายุ กรุณาขอคำเชิญใหม่จากผู้จัด')}</p><Link className={styles.button} href="/">{copy('Back to home', 'กลับหน้าหลัก')}</Link></>
      : !quiz ? <p role="status" className={styles.muted}>{copy('Loading invitation…', 'กำลังโหลดคำเชิญ…')}</p>
      : <>
        <div className={styles.invitationCover}>
          {quiz.cover_image_url && <img src={quiz.cover_image_url} alt="" />}
          <div className={styles.invitationCoverText}><p>{copy('Quiz invitation', 'คำเชิญเข้าร่วมแบบทดสอบ')}</p><h1>{quiz.name}</h1></div>
        </div>
        <div className={styles.invitationDetails}>
        {quiz.description && <p className={styles.muted}>{quiz.description}</p>}
        <div className={styles.invitationFacts}>
          {typeof quiz.question_count === 'number' && <span>{quiz.question_count} {copy('questions', 'คำถาม')}</span>}
          {typeof quiz.timer_seconds === 'number' && quiz.timer_seconds > 0 && <span>{quiz.timer_seconds} {copy('seconds per question', 'วินาทีต่อข้อ')}</span>}
        </div>
        <p className={styles.muted}>{copy('Join the quiz with your account. If the host has not started yet, you will wait in the lobby.', 'เข้าร่วมด้วยบัญชีของคุณ หากผู้จัดยังไม่เริ่ม คุณจะรอในห้องรับรอง')}</p>
        <div className={styles.player}><ProfileAvatar displayName={user.displayName || 'Player'} photoURL={user.photoURL} size={40} /><div className={styles.name}>{user.displayName || 'Player'}<small>{copy('Joining with this account', 'เข้าร่วมด้วยบัญชีนี้')}</small></div></div>
        <button className={styles.primary} style={{ width: '100%', marginTop: 20 }} disabled={joining} onClick={join}>{joining ? <><span className={styles.spinner} />{copy('Joining…', 'กำลังเข้าร่วม…')}</> : copy('Join quiz', 'เข้าร่วมแบบทดสอบ')}</button>
        {joinFailed && <p className={styles.error} role="alert">{copy('Could not join. Check your connection or ask the host for a new invitation, then try again.', 'เข้าร่วมไม่สำเร็จ ตรวจสอบการเชื่อมต่อหรือขอคำเชิญใหม่จากผู้จัด แล้วลองอีกครั้ง')}</p>}
        </div>
      </>}
    </section>
    {quiz && !unavailable && user && !loading && !user.isAnonymous && <InvitationLeaderboard entries={quiz.leaderboard ?? []} th={th} refreshFailed={refreshFailed} />}
  </div></div>, document.body);
}
