import { useEffect } from 'react';
import { SEOHead } from '../components/seo/SEOHead.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('PrivacyPage');

/** Static privacy-policy page. */
export function PrivacyPage() {
  const { t, locale } = useTranslation();

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
        <p>{t('legal.lastUpdated')} {new Date().toLocaleDateString(locale)}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s1.title')}
        </h2>
        <p>{t('legal.privacy.s1.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s2.title')}
        </h2>
        <p>{t('legal.privacy.s2.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s3.title')}
        </h2>
        <p>{t('legal.privacy.s3.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s4.title')}
        </h2>
        <p>{t('legal.privacy.s4.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s5.title')}
        </h2>
        <p>{t('legal.privacy.s5.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.privacy.s6.title')}
        </h2>
        <p>{t('legal.privacy.s6.body')}</p>
      </div>
    </div>
  );
}
