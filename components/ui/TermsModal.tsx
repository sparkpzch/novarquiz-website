'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '@/lib/hooks/useTheme';

export const TOS_VERSION = '2026-05-27';
export const PRIVACY_VERSION = '2026-05-27';
export const ANALYTICS_NOTICE_VERSION = '2026-05-25';
export const PROFILING_NOTICE_VERSION = '2026-05-27';

type Tab = 'terms' | 'privacy';

interface TermsModalProps {
  initialTab?: Tab;
  onClose: () => void;
  onAccept?: () => void;
}

/* ── dark / light palette ─────────────────────────────────────── */
const palette = {
  light: {
    bg: '#ffffff',
    handle: '#e5e7eb',
    title: '#111827',
    muted: '#6b7280',
    body: '#4b5563',
    subtle: '#9ca3af',
    tabBg: '#f3f4f6',
    tabPill: '#ffffff',
    tabPillShadow: '0 1px 3px rgba(0,0,0,0.10)',
    border: '#f3f4f6',
    borderBtn: '#e5e7eb',
    hoverBg: 'rgba(0,0,0,0.03)',
    noticeBg: '#eff6ff',
    noticeBorder: '#bfdbfe',
    noticeTitle: '#1e40af',
    noticeBody: '#1d4ed8',
    codeBg: '#f3f4f6',
    shadow: '0 -8px 40px rgba(0,0,0,0.18)',
  },
  dark: {
    bg: '#111b30',
    handle: 'rgba(255,255,255,0.15)',
    title: '#d4e3f5',
    muted: '#7a9abf',
    body: '#94a9c5',
    subtle: '#5a7a9a',
    tabBg: 'rgba(255,255,255,0.06)',
    tabPill: 'rgba(255,255,255,0.10)',
    tabPillShadow: '0 1px 3px rgba(0,0,0,0.30)',
    border: 'rgba(255,255,255,0.08)',
    borderBtn: 'rgba(255,255,255,0.12)',
    hoverBg: 'rgba(255,255,255,0.06)',
    noticeBg: 'rgba(59,91,212,0.12)',
    noticeBorder: 'rgba(59,91,212,0.25)',
    noticeTitle: '#93b4ff',
    noticeBody: '#7ba6f7',
    codeBg: 'rgba(255,255,255,0.08)',
    shadow: '0 -8px 40px rgba(0,0,0,0.45)',
  },
} as const;

export default function TermsModal({ initialTab = 'terms', onClose, onAccept }: TermsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const c = palette[theme] ?? palette.light;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="relative w-full md:max-w-lg md:rounded-[24px]"
          style={{
            backgroundColor: c.bg,
            borderRadius: '24px 24px 0 0',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: c.shadow,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile only) */}
          <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-9 h-1 rounded-full" style={{ backgroundColor: c.handle }} />
          </div>

          {/* Header */}
          <div className="flex-shrink-0" style={{ padding: '16px 20px 0' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: c.title }}>Legal Documents</h2>
              <button
                onClick={onClose}
                className="flex items-center justify-center rounded-full transition-colors"
                style={{ width: 32, height: 32 }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" style={{ color: c.muted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tab switcher */}
            <div
              className="flex relative"
              style={{ backgroundColor: c.tabBg, borderRadius: '10px', padding: '3px', gap: '2px' }}
            >
              {(['terms', 'privacy'] as Tab[]).map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className="relative flex-1 z-10 text-center transition-colors"
                    style={{
                      borderRadius: '8px',
                      padding: '7px 0',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? c.title : c.muted,
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="terms-tab-pill"
                        className="absolute inset-0"
                        style={{
                          backgroundColor: c.tabPill,
                          borderRadius: '8px',
                          boxShadow: c.tabPillShadow,
                          zIndex: -1,
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      />
                    )}
                    {tab === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px' }}
          >
            {activeTab === 'terms' ? <TermsContent c={c} /> : <PrivacyContent c={c} />}
          </div>

          {/* Footer */}
          <div
            className="flex-shrink-0"
            style={{ borderTop: `1px solid ${c.border}`, padding: '12px 20px 20px' }}
          >
            {onAccept ? (
              <>
                <p className="text-xs mb-3 text-center" style={{ color: c.muted }}>
                  By continuing, you agree to our Terms of Service and consent to personal data
                  processing under PDPA.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                    style={{ border: `1px solid ${c.borderBtn}`, color: c.body }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={onAccept}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm transition-opacity hover:opacity-90 active:opacity-80"
                    style={{ background: '#3b5fd4' }}
                  >
                    Accept &amp; Continue
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl font-semibold text-white text-sm transition-opacity hover:opacity-90 active:opacity-80"
                style={{ background: '#3b5fd4' }}
              >
                Close
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── shared palette type ──────────────────────────────────────── */
type Palette = typeof palette.light;

function Section({ title, children, c }: { title: string; children: React.ReactNode; c: Palette }) {
  return (
    <section className="mb-5">
      <h3 className="text-sm font-semibold mb-1.5" style={{ color: c.title }}>{title}</h3>
      <div className="text-xs leading-relaxed space-y-1" style={{ color: c.body }}>{children}</div>
    </section>
  );
}

function TermsContent({ c }: { c: Palette }) {
  return (
    <div>
      <p className="text-xs mb-4" style={{ color: c.subtle }}>Last updated: May 27, 2026 · Version {TOS_VERSION}</p>

      <Section title="1. Acceptance of Terms" c={c}>
        <p>
          By creating an account or using NovarQuiz (&quot;the Service&quot;), you confirm that you have
          read, understood, and agree to be bound by these Terms. If you do not agree, please do not
          use the Service.
        </p>
      </Section>

      <Section title="2. Description of Service" c={c}>
        <p>
          NovarQuiz is an interactive quiz platform allowing users to participate in quiz sessions
          created by administrators, including scoring and leaderboards.
        </p>
      </Section>

      <Section title="3. User Accounts" c={c}>
        <p>
          You must be at least 13 years old to use this Service. You are responsible for keeping
          your credentials confidential and for all activity under your account.
        </p>
      </Section>

      <Section title="4. Acceptable Use" c={c}>
        <p>You agree not to:</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li>Use the Service for any unlawful purpose</li>
          <li>Attempt unauthorized access to any part of the Service</li>
          <li>Interfere with or disrupt the Service or its infrastructure</li>
          <li>Upload malicious content or exploit vulnerabilities</li>
          <li>Impersonate any person or entity</li>
          <li>Submit false or misleading information</li>
        </ul>
      </Section>

      <Section title="5. Intellectual Property" c={c}>
        <p>
          All content, features, and functionality are owned by NovarQuiz and protected by applicable
          intellectual property laws. Reproduction without written permission is prohibited.
        </p>
      </Section>

      <Section title="6. Personal Data &amp; PDPA" c={c}>
        <p>
          We collect and process personal data in accordance with Thailand&apos;s Personal Data
          Protection Act B.E. 2562 (PDPA) and our Privacy Policy. By registering, you explicitly
          consent to this processing. You may withdraw consent at any time by deleting your account.
        </p>
      </Section>

      <Section title="7. Disclaimer of Warranties" c={c}>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. We do not warrant
          uninterrupted or error-free operation.
        </p>
      </Section>

      <Section title="8. Limitation of Liability" c={c}>
        <p>
          To the maximum extent permitted by law, NovarQuiz shall not be liable for indirect,
          incidental, special, consequential, or punitive damages arising from your use of the
          Service.
        </p>
      </Section>

      <Section title="9. Modifications" c={c}>
        <p>
          We may update these Terms at any time. We will notify registered users of material changes
          with at least 30 days&apos; notice. Continued use after changes constitutes acceptance.
        </p>
      </Section>

      <Section title="10. Governing Law" c={c}>
        <p>These Terms are governed by the laws of Thailand.</p>
      </Section>
    </div>
  );
}

// ⚠ LEGAL COPY — requires review by a qualified privacy officer before merge.
function PrivacyContent({ c }: { c: Palette }) {
  return (
    <div>
      <p className="text-xs mb-4" style={{ color: c.subtle }}>Last updated: May 27, 2026 · Version {PRIVACY_VERSION}</p>

      <div
        className="rounded-xl p-3 mb-4 text-xs"
        style={{ backgroundColor: c.noticeBg, border: `1px solid ${c.noticeBorder}` }}
      >
        <p className="font-semibold mb-0.5" style={{ color: c.noticeTitle }}>PDPA Compliance Notice</p>
        <p style={{ color: c.noticeBody }}>
          This Privacy Policy complies with Thailand&apos;s Personal Data Protection Act B.E. 2562
          (PDPA). NovarQuiz is the Data Controller. Consent for each processing purpose is
          collected separately; only Platform Account is required to use the Service.
        </p>
      </div>

      <Section title="1. Data Controller" c={c}>
        <p>
          <strong>NovarQuiz</strong> is the Data Controller for your personal data.
          Contact: <span className="font-medium">Novartis@novartis-decisionlab.firebaseapp.com</span>
        </p>
      </Section>

      <Section title="2. Personal Data We Collect" c={c}>
        <p><strong>Account Data:</strong> Email address, display name, profile picture.</p>
        <p><strong>Usage Data:</strong> Quiz responses, scores, session participation, streaks.</p>
        <p>
          <strong>Technical Data:</strong> IP address (stored only in consent records as legal
          proof of consent), browser type, session cookies.
        </p>
        <p>
          <strong>Clinical Profiling Data (HCP/mixed audience, opt-in only):</strong> Anonymised
          behavioural signals from quiz choices, mapped to six practice-pattern vectors —
          Guideline Adherence, Innovation Adoption, Patient Centricity, Diagnostic Proactivity,
          Therapy Escalation, and Evidence Depth. No patient-identifiable data is collected.
        </p>
        <p>
          <strong>Legal Basis:</strong> Explicit, unbundled consent (PDPA §19) collected
          separately for each processing purpose at registration and manageable at any time
          via Profile → Manage Consents.
        </p>
      </Section>

      <Section title="3. How We Use Your Data" c={c}>
        <p>Processing is split by consent purpose — you may opt in or out of each independently:</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li>
            <strong>Platform Account</strong> (required): authenticate identity, maintain account,
            calculate scores, leaderboards, quiz history.
          </li>
          <li>
            <strong>Analytics &amp; Profiling</strong> (optional): aggregate performance analytics
            to improve the Service.
          </li>
          <li>
            <strong>CRM Linkage</strong> (optional): link account data with CRM systems for
            product-related communications from authorised partners.
          </li>
          <li>
            <strong>Marketing Follow-Up</strong> (optional): product updates and promotional
            communications.
          </li>
        </ul>
        <p className="mt-1">
          Clinical profiling vector processing applies only when you have selected an HCP or mixed
          audience and opted in to the relevant vectors.
        </p>
      </Section>

      <Section title="Unbundled Consent" c={c}>
        <p>
          Under PDPA §19, each processing purpose requires a separate, freely given consent.
          Only <strong>Platform Account</strong> is required to use the Service; all other
          purposes are optional.
        </p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li><strong>Platform Account</strong> — required; withdrawal requires account deletion</li>
          <li><strong>Analytics &amp; Profiling</strong> — optional</li>
          <li><strong>CRM Linkage</strong> — optional</li>
          <li><strong>Marketing Follow-Up</strong> — optional</li>
        </ul>
        <p className="mt-1">
          Users identifying as healthcare professionals (HCP or mixed audience) may separately
          opt in to six clinical profiling vectors: Guideline Adherence, Innovation Adoption,
          Patient Centricity, Diagnostic Proactivity, Therapy Escalation, and Evidence Depth.
        </p>
        <p className="mt-1">
          You may update or withdraw any optional consent at any time via Profile → Manage
          Consents. Withdrawal is effective immediately and does not affect the lawfulness of
          prior processing.
        </p>
      </Section>

      <Section title="4. Data Retention" c={c}>
        <p>
          Personal data is retained while your account is active. Upon deletion, data is permanently
          removed within 30 days. Consent records are retained for 3 years as required for legal
          proof of consent under PDPA.
        </p>
      </Section>

      <Section title="5. Data Sharing &amp; International Transfers" c={c}>
        <p>
          We do not sell your data. We use the following processors, which may involve
          cross-border data transfers under PDPA Chapter 7:
        </p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li><strong>Google Firebase</strong> — Authentication, real-time database, file storage</li>
          <li><strong>Neon / PostgreSQL</strong> — Quiz data and user profiles</li>
        </ul>
        <p className="mt-1">All processors operate under appropriate data protection agreements.</p>
      </Section>

      <Section title="6. Your Rights Under PDPA" c={c}>
        <p>Under Thailand&apos;s PDPA, you have the right to:</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li><strong>Access</strong> — request a copy of your personal data</li>
          <li><strong>Rectification</strong> — correct inaccurate data</li>
          <li><strong>Erasure</strong> — request deletion (&quot;right to be forgotten&quot;)</li>
          <li><strong>Portability</strong> — receive data in a machine-readable format</li>
          <li><strong>Restriction</strong> — limit processing of your data</li>
          <li><strong>Objection</strong> — object to processing based on legitimate interests</li>
          <li>
            <strong>Withdraw Consent</strong> — optional purposes via Profile → Manage Consents;
            all processing via Profile → Delete Account. Effective immediately.
          </li>
        </ul>
        <p className="mt-1">
          Exercise rights by contacting{' '}
          <span className="font-medium">Novartis@novartis-decisionlab.firebaseapp.com</span> or through Profile settings.
        </p>
      </Section>

      <Section title="7. Cookies" c={c}>
        <p>
          We use only one essential cookie: <code className="px-1 rounded" style={{ backgroundColor: c.codeBg }}>session</code>
          {' '}(HttpOnly, Secure, SameSite=Lax) for authentication. No advertising or tracking
          cookies are used.
        </p>
      </Section>

      <Section title="8. Children&apos;s Privacy" c={c}>
        <p>
          The Service is not intended for children under 13. If you believe a child has provided us
          personal data, contact us immediately for deletion.
        </p>
      </Section>

      <Section title="9. Security Measures" c={c}>
        <p>
          We apply TLS encryption in transit, encryption at rest via Firebase and Neon, and
          role-based access controls. Passwords are never stored — Firebase handles authentication.
        </p>
      </Section>

      <Section title="10. Policy Changes" c={c}>
        <p>
          Material changes will be notified via email or in-app notice at least 30 days in advance,
          as required by PDPA. Archived versions are available on request.
        </p>
      </Section>
    </div>
  );
}
