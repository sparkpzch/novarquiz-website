import { legalSections, legalTitles, legalIntro, type LegalLanguage, type LegalDocument } from '@/lib/privacy/documents';
import { TOS_VERSION, PRIVACY_VERSION } from '@/lib/privacy/versions';
import styles from './legal.module.css';

export function LegalLanguageSwitch({ language, onChange }: { language: LegalLanguage; onChange: (language: LegalLanguage) => void }) {
  return <div className={styles.languageSwitch} role="group" aria-label={language === 'th' ? 'ภาษาเอกสาร' : 'Document language'}>{(['th', 'en'] as const).map(value => <button type="button" key={value} lang={value} aria-pressed={language === value} onClick={() => onChange(value)}>{value === 'th' ? 'ไทย' : 'English'}</button>)}</div>;
}

export default function LegalDocumentContent({ document, language, compact = false }: { document: LegalDocument; language: LegalLanguage; compact?: boolean }) {
  const version = document === 'terms' ? TOS_VERSION : PRIVACY_VERSION;
  const date = document === 'terms' ? (language === 'th' ? '17 กันยายน 2569' : '17 September 2026') : (language === 'th' ? '3 ตุลาคม 2569' : '3 October 2026');
  const Heading = compact ? 'h3' : 'h2';
  return <article className={styles.content} lang={language} aria-label={legalTitles[document][language]}>
    <p className={styles.meta}>{language === 'th' ? 'ปรับปรุงล่าสุด' : 'Last updated'}: {date} · {language === 'th' ? 'ฉบับ' : 'Version'} {version}</p>
    <p className={styles.intro}>{legalIntro[document][language]}</p>
    {legalSections[document].map((section, index) => <section key={section.id} className={styles.section}>
      <Heading>{index + 1}. {section.title[language]}</Heading>
      {section.paragraphs?.map((paragraph, i) => <p key={i}>{paragraph[language]}</p>)}
      {section.bullets && <ul>{section.bullets.map((bullet, i) => <li key={i}>{bullet[language]}</li>)}</ul>}
    </section>)}
  </article>;
}
