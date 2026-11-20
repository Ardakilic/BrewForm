import type { CollectionListItemOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { useEffect } from 'react';
import { Link, useLoaderData } from 'react-router';
import { collectionApi } from '../../api/index.ts';
import { CollectionCard } from '../../components/collections/CollectionCard.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useListUrlState } from '../../hooks/useListUrlState.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { parsePageOnlyParams } from '../../utils/list-parsers.ts';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('CollectionListPage');

/** Collections per page on `/collections`. */
const PER_PAGE = 20;

/** Loader payload for {@link CollectionListPage}. */
export interface CollectionListLoaderData {
  collectionsResponse: PaginatedResponse<CollectionListItemOutput>;
}

/**
 * React Router data loader for `/collections` — fetches the authenticated
 * user's collections (all visibilities) for the requested `?page`. Wrapped in
 * `requireAuth`, so a final 401 redirects to `/login?next=…`.
 */
export const loader = requireAuth(
  async ({ request }: { request: Request }): Promise<CollectionListLoaderData> => {
    const { page } = parsePageOnlyParams(new URL(request.url).searchParams);
    log.debug({ page }, 'CollectionListPage loader started');
    try {
      const collectionsResponse = await collectionApi.list({
        page: String(page),
        perPage: String(PER_PAGE),
      });
      log.debug({ page }, 'CollectionListPage loader completed');
      return { collectionsResponse };
    } catch (err) {
      log.error({ err, page }, 'CollectionListPage loader failed');
      throw err;
    }
  },
);

/**
 * Page component for `/collections` — displays a grid of the user's
 * collections with a "Create Collection" button and URL pagination
 * (`?page`, omitted for page 1).
 */
export function CollectionListPage() {
  const { collectionsResponse } = useLoaderData() as CollectionListLoaderData;
  const { t } = useTranslation();
  const { setPage } = useListUrlState(parsePageOnlyParams);
  const { page, totalPages } = collectionsResponse.meta.pagination;

  useEffect(() => {
    log.debug({}, 'CollectionListPage mounted');
    return () => {
      log.debug({}, 'CollectionListPage unmounted');
    };
  }, []);

  return (
    <PageContainer width="4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('collection.list.title')}
        </h1>
        <Link to="/collections/new" className="btn-primary">
          {t('collection.list.create')}
        </Link>
      </div>

      {collectionsResponse.data.length === 0 ? (
        <EmptyState message={t('collection.list.noResults')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collectionsResponse.data.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </PageContainer>
  );
}
