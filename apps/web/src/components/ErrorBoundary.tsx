import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { NotFoundPage, ServerErrorPage } from '../pages/ErrorPage.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('ErrorBoundary');

/**
 * Router-level error boundary: logs the caught error and renders a
 * full-page fallback — delegating 404 to `NotFoundPage` and 5xx to
 * `ServerErrorPage` from the canonical error-page module, with a
 * generic fallback (Go Home + Reload Page) for non-route errors.
 */
export function RootErrorBoundary() {
  const error = useRouteError();
  const { t } = useTranslation();

  log.error(
    { err: error, componentStack: error instanceof Error ? error.stack : undefined },
    'ErrorBoundary caught render error',
  );

  function handleReset() {
    log.info({}, 'ErrorBoundary reset triggered');
    globalThis.location.reload();
  }

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) return <NotFoundPage />;
    if (error.status >= 500) return <ServerErrorPage />;
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

  return (
    <div
      className='flex min-h-screen flex-col items-center justify-center px-6 text-center'
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <h1 className='text-6xl font-bold' style={{ color: 'var(--accent-primary)' }}>
        {t('error.boundary.oops')}
      </h1>
      <p className='mt-4 text-lg' style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
      {import.meta.env.DEV && error instanceof Error && error.stack && (
        <pre
          className='mt-4 max-w-2xl overflow-auto rounded-lg p-4 text-left text-xs'
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          {error.stack}
        </pre>
      )}
      <div className='mt-6 flex gap-4'>
        <Link to='/' className='btn-primary'>
          {t('common.goHome')}
        </Link>
        <button
          type='button'
          className='btn-primary'
          onClick={handleReset}
        >
          {t('error.boundary.reload')}
        </button>
      </div>
    </div>
  );
}
