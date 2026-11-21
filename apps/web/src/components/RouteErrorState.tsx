import { useEffect } from 'react';
import { isRouteErrorResponse, useRevalidator, useRouteError } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { NotFoundPage } from '../pages/ErrorPage.tsx';
import { ErrorState } from './ui/ErrorState.tsx';

const log = createLogger('RouteErrorState');

/**
 * Route-level `errorElement` for child routes: renders inside the parent layout's `<Outlet />`
 * (so the app shell or `AdminLayout` sidebar stays visible) instead of replacing the whole
 * screen. A 404 renders the not-found page; any other loader/action failure renders an error
 * banner with a Retry button that re-runs the route's loaders. A failed load is never shown
 * as an empty or "no results" state.
 */
export function RouteErrorState() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const { t } = useTranslation();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (notFound) {
      log.debug({ status: 404 }, 'RouteErrorState rendering not-found');
    } else {
      log.error({ err: error }, 'RouteErrorState caught a route error');
    }
  }, [error, notFound]);

  if (notFound) return <NotFoundPage />;

  return (
    <div className="mx-auto max-w-xl px-6 py-12 text-center">
      <ErrorState message={t('error.route.loadFailed')} className="mb-4" />
      <button
        type="button"
        className="btn-primary"
        disabled={revalidator.state === 'loading'}
        onClick={() => revalidator.revalidate()}
      >
        {t('common.retry')}
      </button>
    </div>
  );
}
