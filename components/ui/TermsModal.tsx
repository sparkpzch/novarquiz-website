'use client';

import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import LegalDocumentContent, { LegalLanguageSwitch } from '@/components/legal/LegalDocumentContent';
import { legalTitles, type LegalDocument, type LegalLanguage } from '@/lib/privacy/documents';
import styles from '@/components/legal/legal.module.css';
export { TOS_VERSION, PRIVACY_VERSION } from '@/lib/privacy/versions';

const subscribeToClient = () => () => {};
interface TermsModalProps { initialTab?: LegalDocument; onClose: () => void; onAccept?: () => void | Promise<void>; }

export default function TermsModal({ initialTab = 'terms', onClose, onAccept }: TermsModalProps) {
  const [activeTab, setActiveTab] = useState<LegalDocument>(initialTab);
  const [choice, setChoice] = useState<LegalLanguage | null>(null);
  const [busy, setBusy] = useState(false);
  const { i18n } = useTranslation();
  const language = choice ?? (i18n.language.startsWith('th') ? 'th' : 'en');
  const copy = (en: string, th: string) => language === 'th' ? th : en;
  const ready = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!ready || !element) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!element.open) element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [ready]);
  if (!ready) return null;
  const close = () => { if (!busy) onClose(); };
  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby="legal-dialog-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.dialogInner}>
      <header className={styles.dialogHeader}>
        <div className={styles.dialogHeading}><h2 id="legal-dialog-title">{copy('Terms and privacy', 'ข้อกำหนดและความเป็นส่วนตัว')}</h2><button type="button" className={styles.close} aria-label={copy('Close', 'ปิด')} disabled={busy} onClick={close}>×</button></div>
        <div className={styles.dialogToolbar}><div className={styles.tabs} role="group" aria-label={copy('Document', 'เอกสาร')}>{(['terms', 'privacy'] as const).map(tab => <button type="button" key={tab} aria-pressed={activeTab === tab} onClick={() => { setActiveTab(tab); scroll.current?.scrollTo({ top: 0 }); }}>{legalTitles[tab][language]}</button>)}</div><LegalLanguageSwitch language={language} onChange={value => { setChoice(value); scroll.current?.scrollTo({ top: 0 }); }} /></div>
      </header>
      <div ref={scroll} className={styles.scroll}><LegalDocumentContent document={activeTab} language={language} compact /></div>
      <footer className={styles.footer}>
        {onAccept ? <><p>{copy('Accept to agree to the terms and the account data processing described in the privacy policy. Questionnaire analytics and marketing consent are optional.', 'กดยอมรับเพื่อยอมรับข้อกำหนดและการใช้ข้อมูลเพื่อให้บริการบัญชีตามนโยบายความเป็นส่วนตัว ส่วนการวิเคราะห์แบบสอบถามและการตลาดเป็นทางเลือก')}</p><div className={styles.actions}><button type="button" className={styles.secondary} disabled={busy} onClick={close}>{copy('Decline', 'ไม่ยอมรับ')}</button><button type="button" className={styles.primary} disabled={busy} onClick={async () => { setBusy(true); try { await onAccept(); } finally { setBusy(false); } }}>{busy ? copy('Saving…', 'กำลังบันทึก…') : copy('Accept and continue', 'ยอมรับและดำเนินการต่อ')}</button></div></> : <div className={styles.actions}><button type="button" className={styles.primary} onClick={close}>{copy('Close', 'ปิด')}</button></div>}
      </footer>
    </div>
  </dialog>, document.body);
}
