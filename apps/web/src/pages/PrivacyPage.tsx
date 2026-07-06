import { useEffect } from 'react';
import { SEOHead } from '../components/seo/SEOHead.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('PrivacyPage');

/** Static privacy-policy page. */
export function PrivacyPage() {
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'PrivacyPage mounted');
    return () => {
      log.debug({}, 'PrivacyPage unmounted');
    };
  }, []);

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead title={t('legal.privacy.title')} description={t('legal.privacy.description')} />
      <h1 className='text-3xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('legal.privacy.title')}
      </h1>
      <div className='prose' style={{ color: 'var(--text-secondary)' }}>
        <p>{t('legal.notice')}</p>
        <p>{t('legal.lastUpdated')} {new Date().toLocaleDateString()}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s1.title')}
        </h2>
        <p>
          We collect information you provide directly, including your email, username, display name,
          and any content you create on the platform (recipes, comments, etc.).
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s2.title')}
        </h2>
        <p>
          We use your information to provide and improve the BrewForm service, send notifications
          you've opted into, and ensure the security of the platform.
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s3.title')}
        </h2>
        <p>
          We do not sell your personal information. We may share information with service providers
          who help operate the platform, or when required by law.
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s4.title')}
        </h2>
        <p>
          You can delete your account at any time. When you delete your account, your personal data
          is removed. Public recipes and comments may be anonymized rather than deleted.
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s5.title')}
        </h2>
        <p>
          We use cookies for authentication, preferences, and analytics. You can manage cookie
          preferences through the consent banner.
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s6.title')}
        </h2>
        <p>For privacy questions, please contact us through the platform.</p>
      </div>
    </div>
  );
}
