export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-gray-300 p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>
      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Information We Collect</h2>
          <p><strong>Account Information:</strong> When you create an account, we collect your name, email address, and profile picture. <strong>Usage Data:</strong> We collect information about how you use the Service, including quiz responses, scores, and session participation.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. How We Use Your Information</h2>
          <p>We use the information to: (a) provide and maintain the Service; (b) authenticate your identity; (c) calculate scores and maintain leaderboards; (d) improve the Service; (e) communicate with you about updates or changes.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. Data Storage &amp; Security</h2>
          <p>Your data is stored securely using Firebase (Google Cloud) and PostgreSQL databases. We implement appropriate security measures including encryption in transit and at rest.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Data Sharing</h2>
          <p>We do not sell, trade, or otherwise transfer your personal information to third parties. Your quiz scores and display name may be visible to other users via leaderboards.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Your Rights</h2>
          <p>You have the right to: (a) access your personal data; (b) correct inaccurate data; (c) delete your account and associated data; (d) export your data; (e) opt out of non-essential communications.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Cookies</h2>
          <p>We use essential cookies for authentication and session management. We do not use tracking cookies for advertising purposes.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Children&apos;s Privacy</h2>
          <p>The Service is not intended for children under 13. We do not knowingly collect personal information from children under 13 years of age.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>
        </section>
        <p className="text-gray-500 mt-8">Last updated: April 2026</p>
      </div>
    </div>
  );
}
