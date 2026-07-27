import { useEffect } from 'react';
import { SEOHead } from '../components/seo/SEOHead.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';
import { formatDate } from '../utils/format.ts';

const log = createLogger('TermsPage');

/** Static terms-of-service page. */
export function TermsPage() {
  const { t, locale } = useTranslation();

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
        <p>{t('legal.lastUpdated')} {formatDate(new Date(), locale)}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s1.title')}
        </h2>
        <p>{t('legal.terms.s1.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s2.title')}
        </h2>
        <p>{t('legal.terms.s2.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s3.title')}
        </h2>
        <p>{t('legal.terms.s3.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s4.title')}
        </h2>
        <p>{t('legal.terms.s4.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s5.title')}
        </h2>
        <p>{t('legal.terms.s5.body')}</p>

        <h2 className='text-xl font-semibold mt-6 mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('legal.terms.s6.title')}
        </h2>
        <p>{t('legal.terms.s6.body')}</p>
      </div>
    </div>
  );
}
