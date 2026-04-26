import { SEOHead } from '../components/seo/SEOHead';

export function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title="Terms of Service" description="BrewForm terms of service." />
      <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Terms of Service</h1>
      <div className="prose" style={{ color: 'var(--text-secondary)' }}>
        <p>Last updated: {new Date().toLocaleDateString()}</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>1. Acceptance</h2>
        <p>By using BrewForm, you agree to these terms. If you don't agree, please don't use the service.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>2. User Accounts</h2>
        <p>You are responsible for your account security. You must provide accurate information and keep your password confidential.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>3. Content</h2>
        <p>You retain ownership of your content. By posting, you grant BrewForm a license to display and distribute it within the platform. You must not post content that violates applicable laws.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>4. Conduct</h2>
        <p>You agree not to abuse the service, spam other users, or engage in harassment. We reserve the right to ban users who violate these terms.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>5. Disclaimers</h2>
        <p>BrewForm is provided "as is" without warranties. We don't guarantee uptime, accuracy, or fitness for any particular purpose.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>6. Changes</h2>
        <p>We may update these terms. Continued use after changes constitutes acceptance.</p>
      </div>
    </div>
  );
}