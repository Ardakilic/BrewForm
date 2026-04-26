import { SEOHead } from '../components/seo/SEOHead';

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title="Privacy Policy" description="BrewForm privacy policy." />
      <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Privacy Policy</h1>
      <div className="prose" style={{ color: 'var(--text-secondary)' }}>
        <p>Last updated: {new Date().toLocaleDateString()}</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>1. Information We Collect</h2>
        <p>We collect information you provide directly, including your email, username, display name, and any content you create on the platform (recipes, comments, etc.).</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>2. How We Use Your Information</h2>
        <p>We use your information to provide and improve the BrewForm service, send notifications you've opted into, and ensure the security of the platform.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>3. Information Sharing</h2>
        <p>We do not sell your personal information. We may share information with service providers who help operate the platform, or when required by law.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>4. Data Retention</h2>
        <p>You can delete your account at any time. When you delete your account, your personal data is removed. Public recipes and comments may be anonymized rather than deleted.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>5. Cookies</h2>
        <p>We use cookies for authentication, preferences, and analytics. You can manage cookie preferences through the consent banner.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>6. Contact</h2>
        <p>For privacy questions, please contact us through the platform.</p>
      </div>
    </div>
  );
}