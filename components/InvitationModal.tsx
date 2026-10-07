import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'react-qr-code';
import { useTranslation } from 'react-i18next';
import styles from '@/components/play/lobby.module.css';

interface InvitationModalProps {
  isOpen: boolean; onClose: () => void; sessionName: string; joinToken: string | null;
}

export default function InvitationModal({ isOpen, onClose, sessionName, joinToken }: InvitationModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const [copyError, setCopyError] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (isOpen && !dialog.current?.open) dialog.current?.showModal();
    if (!isOpen) { dialog.current?.close(); }
  }, [isOpen]);
  if (typeof document === 'undefined') return null;
  const joinUrl = joinToken ? `${window.location.origin}/join/${joinToken}` : '';
  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby="invitation-title" onCancel={onClose} onClose={onClose} style={{ width: 'min(560px, calc(100% - 32px))' }}>
    <div className={styles.sectionHead}><h2 id="invitation-title">{th ? 'เข้าร่วมแบบทดสอบ' : 'Join the quiz'}</h2><button className={styles.button} onClick={() => { setCopied(false); setCopyError(false); onClose(); }}>{th ? 'ปิด' : 'Close'}</button></div>
    <p className={styles.muted}>{sessionName}</p>
    <div className={styles.qr}>{joinUrl ? <div className={styles.qrPaper}><QRCode value={joinUrl} size={300} level="M" style={{ width: '100%', maxWidth: 300, height: 'auto' }} /></div> : <p className={styles.muted}>{th ? 'ไม่มีลิงก์คำเชิญที่ใช้งานได้' : 'No active invitation link'}</p>}</div>
    <p className={styles.muted}>{th ? 'สแกน QR หรือเปิดลิงก์นี้เพื่อเข้าร่วม' : 'Scan the QR code or open this link to join.'}</p>
    {joinUrl && <div className={styles.link}><code>{joinUrl}</code><button className={styles.button} onClick={async () => {
      try { await navigator.clipboard.writeText(joinUrl); setCopied(true); setCopyError(false); }
      catch { setCopied(false); setCopyError(true); }
    }}>{copied ? (th ? 'คัดลอกแล้ว' : 'Copied') : (th ? 'คัดลอกลิงก์' : 'Copy link')}</button></div>}
    {copyError && <p role="alert" className={styles.error}>{th ? 'คัดลอกไม่สำเร็จ เลือกลิงก์เพื่อคัดลอก' : 'Could not copy. Select the link to copy it.'}</p>}
  </dialog>, document.body);
}
