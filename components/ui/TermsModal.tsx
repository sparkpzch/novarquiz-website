'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export const TOS_VERSION = '2026-05-19';
export const PRIVACY_VERSION = '2026-05-19';
export const ANALYTICS_NOTICE_VERSION = '2026-05-25';
export const PROFILING_NOTICE_VERSION = '2026-05-25';

type Tab = 'terms' | 'privacy';

interface TermsModalProps {
  initialTab?: Tab;
  onClose: () => void;
  onAccept?: () => void;
}

export default function TermsModal({ initialTab = 'terms', onClose, onAccept }: TermsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const scrollRef = useRef<HTMLDivElement>(null);

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
          className="relative bg-white w-full md:max-w-lg md:rounded-[24px]"
          style={{
            borderRadius: '24px 24px 0 0',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile only) */}
          <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-9 h-1 rounded-full bg-gray-200" />
          </div>

          {/* Header */}
          <div className="flex-shrink-0" style={{ padding: '16px 20px 0' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Legal Documents</h2>
              <button
                onClick={onClose}
                className="flex items-center justify-center rounded-full transition-colors hover:bg-gray-100"
                style={{ width: 32, height: 32 }}
                aria-label="Close"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tab switcher */}
            <div
              className="flex relative"
              style={{ background: '#f3f4f6', borderRadius: '10px', padding: '3px', gap: '2px' }}
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
                      color: isActive ? '#111827' : '#6b7280',
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="terms-tab-pill"
                        className="absolute inset-0"
                        style={{
                          background: '#fff',
                          borderRadius: '8px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
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
            {activeTab === 'terms' ? <TermsContent /> : <PrivacyContent />}
          </div>

          {/* Footer */}
          <div
            className="flex-shrink-0"
            style={{ padding: '12px 20px 20px', borderTop: '1px solid #f3f4f6' }}
          >
            {onAccept ? (
              <>
                <p className="text-xs text-gray-500 mb-3 text-center">
                  By continuing, you agree to our Terms of Service and consent to personal data
                  processing under PDPA.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{title}</h3>
      <div className="text-xs text-gray-600 leading-relaxed space-y-1">{children}</div>
    </section>
  );
}

function TermsContent() {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-4">Last updated: May 19, 2026 · Version {TOS_VERSION}</p>

      <Section title="1. Acceptance of Terms">
        <p>
          By creating an account or using NovarQuiz (&quot;the Service&quot;), you confirm that you have
          read, understood, and agree to be bound by these Terms. If you do not agree, please do not
          use the Service.
        </p>
      </Section>

      <Section title="2. Description of Service">
        <p>
          NovarQuiz is an interactive quiz platform allowing users to participate in quiz sessions
          created by administrators, including scoring and leaderboards.
        </p>
      </Section>

      <Section title="3. User Accounts">
        <p>
          You must be at least 13 years old to use this Service. You are responsible for keeping
          your credentials confidential and for all activity under your account.
        </p>
      </Section>

      <Section title="4. Acceptable Use">
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

      <Section title="5. Intellectual Property">
        <p>
          All content, features, and functionality are owned by NovarQuiz and protected by applicable
          intellectual property laws. Reproduction without written permission is prohibited.
        </p>
      </Section>

      <Section title="6. Personal Data &amp; PDPA">
        <p>
          We collect and process personal data in accordance with Thailand&apos;s Personal Data
          Protection Act B.E. 2562 (PDPA) and our Privacy Policy. By registering, you explicitly
          consent to this processing. You may withdraw consent at any time by deleting your account.
        </p>
      </Section>

      <Section title="7. Disclaimer of Warranties">
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. We do not warrant
          uninterrupted or error-free operation.
        </p>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, NovarQuiz shall not be liable for indirect,
          incidental, special, consequential, or punitive damages arising from your use of the
          Service.
        </p>
      </Section>

      <Section title="9. Modifications">
        <p>
          We may update these Terms at any time. We will notify registered users of material changes
          with at least 30 days&apos; notice. Continued use after changes constitutes acceptance.
        </p>
      </Section>

      <Section title="10. Governing Law">
        <p>These Terms are governed by the laws of Thailand.</p>
      </Section>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-4">Last updated: May 19, 2026 · Version {PRIVACY_VERSION}</p>

      <div
        className="rounded-xl p-3 mb-4 text-xs"
        style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
      >
        <p className="font-semibold text-blue-800 mb-0.5">PDPA Compliance Notice</p>
        <p className="text-blue-700">
          This Privacy Policy complies with Thailand&apos;s Personal Data Protection Act B.E. 2562
          (PDPA). NovarQuiz is the Data Controller for personal data processed through this Service.
        </p>
      </div>

      <Section title="1. Data Controller">
        <p>
          <strong>NovarQuiz</strong> is the Data Controller for your personal data.
          Contact: <span className="font-medium">privacy@novarquiz.com</span>
        </p>
      </Section>

      <Section title="2. Personal Data We Collect">
        <p><strong>Account Data:</strong> Email address, display name, profile picture.</p>
        <p><strong>Usage Data:</strong> Quiz responses, scores, session participation, streaks.</p>
        <p>
          <strong>Technical Data:</strong> IP address (stored only in consent records for legal
          proof), browser type, session cookies.
        </p>
        <p><strong>Legal Basis:</strong> Your explicit consent given at registration (PDPA §19).</p>
      </Section>

      <Section title="3. How We Use Your Data">
        <ul className="list-disc list-inside space-y-0.5">
          <li>Authenticate your identity and maintain your account</li>
          <li>Calculate scores and display leaderboards</li>
          <li>Provide personalized quiz history and statistics</li>
          <li>Improve the Service through aggregate analytics</li>
          <li>Comply with legal obligations under PDPA</li>
        </ul>
      </Section>

      <Section title="4. Data Retention">
        <p>
          Personal data is retained while your account is active. Upon deletion, data is permanently
          removed within 30 days. Consent records are retained for 3 years as required for legal
          proof of consent under PDPA.
        </p>
      </Section>

      <Section title="5. Data Sharing &amp; International Transfers">
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

      <Section title="6. Your Rights Under PDPA">
        <p>Under Thailand&apos;s PDPA, you have the right to:</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li><strong>Access</strong> — request a copy of your personal data</li>
          <li><strong>Rectification</strong> — correct inaccurate data</li>
          <li><strong>Erasure</strong> — request deletion (&quot;right to be forgotten&quot;)</li>
          <li><strong>Portability</strong> — receive data in a machine-readable format</li>
          <li><strong>Restriction</strong> — limit processing of your data</li>
          <li><strong>Objection</strong> — object to processing based on legitimate interests</li>
          <li><strong>Withdraw Consent</strong> — via Profile → Delete Account, effective immediately</li>
        </ul>
        <p className="mt-1">
          Exercise rights by contacting{' '}
          <span className="font-medium">privacy@novarquiz.com</span> or through Profile settings.
        </p>
      </Section>

      <Section title="7. Cookies">
        <p>
          We use only one essential cookie: <code className="bg-gray-100 px-1 rounded">session</code>
          {' '}(HttpOnly, Secure, SameSite=Lax) for authentication. No advertising or tracking
          cookies are used.
        </p>
      </Section>

      <Section title="8. Children&apos;s Privacy">
        <p>
          The Service is not intended for children under 13. If you believe a child has provided us
          personal data, contact us immediately for deletion.
        </p>
      </Section>

      <Section title="9. Security Measures">
        <p>
          We apply TLS encryption in transit, encryption at rest via Firebase and Neon, and
          role-based access controls. Passwords are never stored — Firebase handles authentication.
        </p>
      </Section>

      <Section title="10. Policy Changes">
        <p>
          Material changes will be notified via email or in-app notice at least 30 days in advance,
          as required by PDPA. Archived versions are available on request.
        </p>
      </Section>
    </div>
  );
}
