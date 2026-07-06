import { useEffect } from 'react';
import { SEOHead } from '../components/seo/SEOHead.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('TermsPage');

/** Static terms-of-service page. */
export function TermsPage() {
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'TermsPage mounted');
    return () => {
      log.debug({}, 'TermsPage unmounted');
    };
  }, []);

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead title={t('legal.terms.title')} description={t('legal.terms.description')} />
      <h1 className='text-3xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('legal.terms.title')}
      </h1>
      <div className='prose' style={{ color: 'var(--text-secondary)' }}>
        <p>{t('legal.notice')}</p>
        <p>{t('legal.lastUpdated')} {new Date().toLocaleDateString()}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s1.title')}
        </h2>
        <p>
          By using BrewForm, you agree to these terms. If you don't agree, please don't use the
          service.
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s2.title')}
        </h2>
        <p>
          You are responsible for your account security. You must provide accurate information and
          keep your password confidential.
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s3.title')}
        </h2>
        <p>
          You retain ownership of your content. By posting, you grant BrewForm a license to display
          and distribute it within the platform. You must not post content that violates applicable
          laws.
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s4.title')}
        </h2>
        <p>
          You agree not to abuse the service, spam other users, or engage in harassment. We reserve
          the right to ban users who violate these terms.
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s5.title')}
        </h2>
        <p>
          BrewForm is provided "as is" without warranties. We don't guarantee uptime, accuracy, or
          fitness for any particular purpose.
        </p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s6.title')}
        </h2>
        <p>We may update these terms. Continued use after changes constitutes acceptance.</p>
      </div>
    </div>
  );
}
