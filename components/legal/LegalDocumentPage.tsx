'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { legalTitles, type LegalDocument, type LegalLanguage } from '@/lib/privacy/documents';
import LegalDocumentContent, { LegalLanguageSwitch } from './LegalDocumentContent';
import styles from './legal.module.css';

export default function LegalDocumentPage({ document }: { document: LegalDocument }) {
  const { i18n } = useTranslation();
  const [choice, setChoice] = useState<LegalLanguage | null>(null);
  const language = choice ?? (i18n.language.startsWith('th') ? 'th' : 'en');
  return <main className={styles.page}><div className={styles.pageWrap}>
    <Link href="/" className={styles.back}>{language === 'th' ? '← หน้าหลัก' : '← Home'}</Link>
    <header className={styles.pageHeader}><h1 lang={language}>{legalTitles[document][language]}</h1><LegalLanguageSwitch language={language} onChange={setChoice} /></header>
    <nav className={styles.tabs} aria-label={language === 'th' ? 'เอกสารการใช้งาน' : 'Legal documents'}>{(['terms', 'privacy'] as const).map(tab => <Link key={tab} href={`/${tab}`} aria-current={document === tab ? 'page' : undefined}>{legalTitles[tab][language]}</Link>)}</nav>
    <div className={styles.pageCard}><LegalDocumentContent document={document} language={language} /></div>
  </div></main>;
}
