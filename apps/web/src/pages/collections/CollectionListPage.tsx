import { useEffect } from 'react';
import { Link, useLoaderData } from 'react-router';
import { collectionApi } from '../../api/index.ts';
import type { CollectionListItemOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { CollectionCard } from '../../components/collections/CollectionCard.tsx';

const log = createLogger('CollectionListPage');

/** Loader payload for {@link CollectionListPage}. */
export interface CollectionListLoaderData {
  collectionsResponse: PaginatedResponse<CollectionListItemOutput>;
}

/**
 * React Router data loader for `/collections` — fetches the authenticated
 * user's collections (all visibilities), paginated.
 */
export const loader = async (): Promise<CollectionListLoaderData> => {
  log.debug({}, 'CollectionListPage loader started');
  try {
    const collectionsResponse = await collectionApi.list();
    log.debug({}, 'CollectionListPage loader completed');
    return { collectionsResponse };
  } catch (err) {
    log.error({ err }, 'CollectionListPage loader failed');
    throw err;
  }
};

/**
 * Page component for `/collections` — displays a grid of the user's
 * collections with a "Create Collection" button.
 */
export function CollectionListPage() {
  const { collectionsResponse } = useLoaderData() as CollectionListLoaderData;
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'CollectionListPage mounted');
    return () => {
      log.debug({}, 'CollectionListPage unmounted');
    };
  }, []);

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('collection.list.title')}
        </h1>
        <Link to='/collections/new' className='btn-primary text-sm min-h-11 px-4'>
          {t('collection.list.create')}
        </Link>
      </div>

      {collectionsResponse.data.length === 0
        ? (
          <p className='text-center py-12' style={{ color: 'var(--text-secondary)' }}>
            {t('collection.list.noResults')}
          </p>
        )
        : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
            {collectionsResponse.data.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}
          </div>
        )}
    </div>
  );
}
