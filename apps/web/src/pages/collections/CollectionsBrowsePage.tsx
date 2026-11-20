import type { PaginatedResponse, PublicCollectionListItemOutput } from '@brewform/shared/schemas';
import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { collectionApi } from '../../api/index.ts';
import { CollectionCard } from '../../components/collections/CollectionCard.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useListUrlState } from '../../hooks/useListUrlState.ts';
import { parsePageOnlyParams } from '../../utils/list-parsers.ts';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('CollectionsBrowsePage');

/** Public collections per page on `/collections/browse`. */
const PER_PAGE = 20;

/** Loader payload for {@link CollectionsBrowsePage}. */
export interface CollectionsBrowseLoaderData {
  collectionsResponse: PaginatedResponse<PublicCollectionListItemOutput>;
}

/**
 * React Router data loader for `/collections/browse` — fetches the requested
 * `?page` of public collections for the global browse view.
 */
export const loader = async ({
  request,
}: {
  request: Request;
}): Promise<CollectionsBrowseLoaderData> => {
  const { page } = parsePageOnlyParams(new URL(request.url).searchParams);
  log.debug({ page }, 'CollectionsBrowsePage loader started');
  try {
    const collectionsResponse = await collectionApi.listPublic({
      page: String(page),
      perPage: String(PER_PAGE),
    });
    log.debug({ page }, 'CollectionsBrowsePage loader completed');
    return { collectionsResponse };
  } catch (err) {
    log.error({ err, page }, 'CollectionsBrowsePage loader failed');
    throw err;
  }
};

/**
 * Page component for `/collections/browse` — displays a grid of all public
 * collections, each rendered via {@link CollectionCard} with the author link
 * enabled (the public-list payload includes a mini author projection), with URL
 * pagination (`?page`, omitted for page 1).
 */
export function CollectionsBrowsePage() {
  const { collectionsResponse } = useLoaderData() as CollectionsBrowseLoaderData;
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
