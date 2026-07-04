import { Link } from 'react-router';
import { useTranslation } from '../contexts/I18nContext.tsx';

interface Props {
  statusCode: number;
  message: string;
  illustration: string;
}

/**
 * Generic error screen: emoji illustration, status code, message, and a
 * home link. Currently unwired/dead — the router imports its 404 page
 * from `NotFoundPage.tsx` instead (see plans/D37).
 */
export function ErrorPage({ statusCode, message, illustration }: Props) {
  const { t } = useTranslation();

  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center px-6 text-center'>
      <div className='text-8xl'>{illustration}</div>
      <h1 className='mt-4 text-4xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {statusCode}
      </h1>
      <p className='mt-2 text-lg' style={{ color: 'var(--text-secondary)' }}>{message}</p>
      <Link to='/' className='btn-primary mt-6'>{t('common.goHome')}</Link>
    </div>
  );
}

/** 404 variant of {@link ErrorPage}. Unwired/dead — the router uses `NotFoundPage.tsx` (see plans/D37). */
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

/** 500 variant of {@link ErrorPage}. Unwired/dead — nothing routes to it (see plans/D37). */
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

/** 403 variant of {@link ErrorPage}. Unwired/dead — nothing routes to it (see plans/D37). */
export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <ErrorPage
      statusCode={403}
      message={t('error.403')}
      illustration='🔒'
    />
  );
}
