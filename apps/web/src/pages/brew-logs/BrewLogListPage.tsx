import { useEffect } from 'react';
import { Link, redirect, useLoaderData, useSearchParams } from 'react-router';
import { ApiError, brewLogApi } from '../../api/index.ts';
import type { BrewLogListItemOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { BrewLogCard } from '../../components/brew-log/BrewLogCard.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';

const log = createLogger('BrewLogListPage');

/** Loader payload for {@link BrewLogListPage}. */
export interface BrewLogListLoaderData {
  logsResponse: PaginatedResponse<BrewLogListItemOutput>;
}

/**
 * React Router data loader for `/brew-logs` — fetches the authenticated
 * user's brew journal for the requested `?page` (newest first, paginated).
 * Redirects to `/login` on a 401.
 */
export const loader = async (
  { request }: { request: Request },
): Promise<BrewLogListLoaderData> => {
  const page = Number(new URL(request.url).searchParams.get('page')) || 1;
  log.debug({ page }, 'BrewLogListPage loader started');
  try {
    const logsResponse = await brewLogApi.list({ page });
    log.debug({ page }, 'BrewLogListPage loader completed');
    return { logsResponse };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw redirect('/login');
    log.error({ err, page }, 'BrewLogListPage loader failed');
    throw err;
  }
};

/**
 * Page component for `/brew-logs` — the user's brew journal: a newest-first
 * list of brew-log cards with pagination and an empty state. New brews are
 * logged from a recipe page (the create route requires a `recipeId`).
 */
export function BrewLogListPage() {
  const { logsResponse } = useLoaderData() as BrewLogListLoaderData;
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    log.debug({}, 'BrewLogListPage mounted');
    return () => {
      log.debug({}, 'BrewLogListPage unmounted');
    };
  }, []);

  const { page, totalPages } = logsResponse.meta.pagination;

  function handlePageChange(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
  }

  return (
    <PageContainer width='4xl'>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('brewLog.list.title')}
        </h1>
        <p className='text-sm mt-1' style={{ color: 'var(--text-tertiary)' }}>
          {t('brewLog.list.newHint')}{' '}
          <Link
            to='/recipes'
            className='text-[color:var(--accent-primary)] hover:underline'
          >
            {t('brewLog.list.new')}
          </Link>
        </p>
      </div>

      {logsResponse.data.length === 0
        ? <EmptyState message={t('brewLog.list.empty')} />
        : (
          <div className='space-y-4'>
            {logsResponse.data.map((entry) => <BrewLogCard key={entry.id} log={entry} />)}
          </div>
        )}

      {totalPages > 1 && (
        <PaginationControls page={page} totalPages={totalPages} onPageChange={handlePageChange} />
      )}
    </PageContainer>
  );
}
