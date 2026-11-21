import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { CollectionCard } from '../../components/collections/CollectionCard.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useListUrlState } from '../../hooks/useListUrlState.ts';
import { parsePageOnlyParams } from '../../utils/list-parsers.ts';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './CollectionsBrowsePage.data.ts';

const log = createLogger('CollectionsBrowsePage');

/**
 * Page component for `/collections/browse` — displays a grid of all public
 * collections (from the route loader in `CollectionsBrowsePage.data.ts`), each rendered via {@link CollectionCard} with the author link
 * enabled (the public-list payload includes a mini author projection), with URL
 * pagination (`?page`, omitted for page 1).
 */
export function CollectionsBrowsePage() {
  const { collectionsResponse } = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const { setPage } = useListUrlState(parsePageOnlyParams);
  const { page, totalPages } = collectionsResponse.meta.pagination;

  useEffect(() => {
    log.debug({}, 'CollectionsBrowsePage mounted');
    return () => {
      log.debug({}, 'CollectionsBrowsePage unmounted');
    };
  }, []);

  return (
    <PageContainer width="6xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('collection.browse.title')}
      </h1>

      {collectionsResponse.data.length === 0 ? (
        <EmptyState message={t('collection.browse.noResults')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collectionsResponse.data.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} showAuthor />
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </PageContainer>
  );
}
