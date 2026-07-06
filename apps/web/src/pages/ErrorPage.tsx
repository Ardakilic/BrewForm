import { Link } from 'react-router';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { SEOHead } from '../components/seo/SEOHead.tsx';

interface Props {
  statusCode: number;
  message: string;
  illustration: string;
}

/**
 * Internal helper: emoji illustration, status code, message, and a home link.
 * All variants get `<SEOHead noIndex />` so error pages are never indexed.
 */
function ErrorPage({ statusCode, message, illustration }: Props) {
  const { t } = useTranslation();

  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center px-6 text-center'>
      <SEOHead title={String(statusCode)} noIndex />
      <div className='text-8xl'>{illustration}</div>
      <h1 className='mt-4 text-4xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {statusCode}
      </h1>
      <p className='mt-2 text-lg' style={{ color: 'var(--text-secondary)' }}>{message}</p>
      <Link to='/' className='btn-primary mt-6'>{t('common.goHome')}</Link>
    </div>
  );
}

/** 404 page (noindex) with a home link; wired into the router's catch-all and the error boundary. */
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <ErrorPage
      statusCode={404}
      message={t('error.404')}
      illustration='🫥'
    />
  );
}

/** 500 page (noindex); rendered by the router's `RootErrorBoundary` for 5xx route errors. */
export function ServerErrorPage() {
  const { t } = useTranslation();
  return (
    <ErrorPage
      statusCode={500}
      message={t('error.500')}
      illustration='💔'
    />
  );
}
