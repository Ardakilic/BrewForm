import { useEffect } from 'react';
import { Link, useLoaderData } from 'react-router';
import { BrewLogCard } from '../../components/brew-log/BrewLogCard.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useListUrlState } from '../../hooks/useListUrlState.ts';
import { parsePageOnlyParams } from '../../utils/list-parsers.ts';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './BrewLogListPage.data.ts';

const log = createLogger('BrewLogListPage');

/**
 * Page component for `/brew-logs` — the user's brew journal, rendered from the route loader
 * (`BrewLogListPage.data.ts`): a newest-first list of brew-log cards with pagination and an
 * empty state. New brews are logged from a recipe page (the create route requires a
 * `recipeId`).
 */
export function BrewLogListPage() {
  const { logsResponse } = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const { setPage } = useListUrlState(parsePageOnlyParams);

  useEffect(() => {
    log.debug({}, 'BrewLogListPage mounted');
    return () => {
      log.debug({}, 'BrewLogListPage unmounted');
    };
  }, []);

  const { page, totalPages } = logsResponse.meta.pagination;

  /** Goes to `nextPage`; page 1 is omitted from the URL. */
  function handlePageChange(nextPage: number) {
    setPage(nextPage);
  }

  return (
    <PageContainer width="4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('brewLog.list.title')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          {t('brewLog.list.newHint')}{' '}
          <Link to="/recipes" className="text-[color:var(--accent-primary)] hover:underline">
            {t('brewLog.list.new')}
          </Link>
        </p>
      </div>

      {logsResponse.data.length === 0 ? (
        <EmptyState message={t('brewLog.list.empty')} />
      ) : (
        <div className="space-y-4">
          {logsResponse.data.map((entry) => (
            <BrewLogCard key={entry.id} log={entry} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <PaginationControls page={page} totalPages={totalPages} onPageChange={handlePageChange} />
      )}
    </PageContainer>
  );
}
