export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-gray-300 p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-gray-500 text-sm mb-4">Last updated: September 23, 2026 · Version 2026-09-23</p>
      <div className="rounded-xl p-4 mb-8 text-sm" style={{ background: 'rgba(59,91,212,0.15)', border: '1px solid rgba(59,91,212,0.4)' }}>
        <p className="font-semibold text-blue-300 mb-1">PDPA Compliance Notice</p>
        <p className="text-blue-200 text-xs leading-relaxed">
          This Privacy Policy complies with Thailand&apos;s Personal Data Protection Act B.E. 2562 (PDPA).
          NovarQuiz is the Data Controller for all personal data processed through this Service.
          Contact: <span className="font-medium">Novartis@novartis-decisionlab.firebaseapp.com</span>
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Personal Data We Collect</h2>
          <p><strong className="text-white">Account Data:</strong> Email address, display name, profile picture.</p>
          <p className="mt-1"><strong className="text-white">Usage Data:</strong> Quiz responses, scores, session participation, streak counts.</p>
          <p className="mt-1"><strong className="text-white">Technical Data:</strong> IP address (stored only in consent records for legal proof), browser type, session cookies.</p>
          <p className="mt-1"><strong className="text-white">Legal Basis:</strong> Your explicit consent given at registration (PDPA §19).</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. How We Use Your Data</h2>
          <p>We use your data to: (a) authenticate your identity; (b) calculate scores and leaderboards; (c) provide quiz history and statistics; (d) improve the Service through analytics; (e) comply with PDPA obligations.</p>
          <p className="mt-1">Accepting our Terms and Privacy Policy turns on Analytics &amp; Profiling: your choices in HCP or mixed-audience quizzes are also used to calculate clinical profiling vectors linked to your account. You can turn this off at any time in Profile settings; clinical profiling vectors will no longer be calculated, while quiz answers and scores remain available for quiz history and feedback.</p>
          <p className="mt-1">When a published quiz has no approved feedback summary, your selected answers, the answer key, and authored explanations may be sent to Google Gemini to draft feedback marked as awaiting review. Your name, email, account ID, scores, and clinical profile are not included in that request. The answer pattern and draft are stored without an account ID for review and reuse.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Who Can See Your Data</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong className="text-white">NovarQuiz administrators</strong> — can access all personal data we collect about you, including your email, display name, profile picture, quiz responses, scores and clinical profiling vectors.</li>
            <li><strong className="text-white">Other users and visitors</strong> — can see only your display name, profile picture and quiz results on session leaderboards (score, rank, correct answers, streak and completion time). They cannot see your email, individual quiz responses or clinical profiling data.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. Data Retention</h2>
          <p>Personal data is kept while your account is active. Upon deletion, data is permanently removed within 30 days. Consent records are retained for 3 years as required by PDPA for legal proof of consent.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Data Sharing &amp; International Transfers</h2>
          <p>We do not sell your data. Processors used (with possible cross-border transfers under PDPA Chapter 7):</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li><strong className="text-white">Google Firebase</strong> — Authentication, real-time database, file storage</li>
            <li><strong className="text-white">Neon / PostgreSQL</strong> — Quiz data and user profiles</li>
            <li><strong className="text-white">Google Gemini</strong> — Draft feedback from selected quiz answers and authored explanations</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Your Rights Under PDPA</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong className="text-white">Access</strong> — request a copy of your data</li>
            <li><strong className="text-white">Rectification</strong> — correct inaccurate data</li>
            <li><strong className="text-white">Erasure</strong> — request deletion (right to be forgotten)</li>
            <li><strong className="text-white">Portability</strong> — receive data in machine-readable format</li>
            <li><strong className="text-white">Restriction</strong> — limit how we process your data</li>
            <li><strong className="text-white">Objection</strong> — object to processing based on legitimate interests</li>
            <li><strong className="text-white">Withdraw Consent</strong> — via Profile → Delete Account, effective immediately</li>
          </ul>
          <p className="mt-2">Contact <span className="text-blue-400">Novartis@novartis-decisionlab.firebaseapp.com</span> to exercise these rights. We respond within 30 days.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Cookies</h2>
          <p>One essential cookie only: <code className="bg-gray-800 px-1 rounded">session</code> (HttpOnly, Secure, SameSite=Lax) for authentication. No advertising or tracking cookies.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Security</h2>
          <p>TLS encryption in transit, encryption at rest via Firebase and Neon, role-based access controls, HttpOnly session cookies. Passwords are never stored.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Children&apos;s Privacy</h2>
          <p>Not intended for children under 13. Contact us immediately if you believe a child has provided personal data.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">9. Policy Changes</h2>
          <p>We may update this Privacy Policy at any time without prior notice. Changes take effect when published.</p>
        </section>
      </div>
    </div>
  );
}
