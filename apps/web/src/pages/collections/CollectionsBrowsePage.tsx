import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import type { PaginatedResponse, PublicCollectionListItemOutput } from '@brewform/shared/schemas';
import { collectionApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { CollectionCard } from '../../components/collections/CollectionCard.tsx';

const log = createLogger('CollectionsBrowsePage');

/** Loader payload for {@link CollectionsBrowsePage}. */
export interface CollectionsBrowseLoaderData {
  collectionsResponse: PaginatedResponse<PublicCollectionListItemOutput>;
}

/**
 * React Router data loader for `/collections/browse` — fetches all public
 * collections (paginated) for the global browse view.
 */
export const loader = async (): Promise<CollectionsBrowseLoaderData> => {
  log.debug({}, 'CollectionsBrowsePage loader started');
  try {
    const collectionsResponse = await collectionApi.listPublic();
    log.debug({}, 'CollectionsBrowsePage loader completed');
    return { collectionsResponse };
  } catch (err) {
    log.error({ err }, 'CollectionsBrowsePage loader failed');
    throw err;
  }
};

/**
 * Page component for `/collections/browse` — displays a grid of all public
 * collections, each rendered via {@link CollectionCard} with the author link
 * enabled (the public-list payload includes a mini author projection).
 */
export function CollectionsBrowsePage() {
  const { collectionsResponse } = useLoaderData() as CollectionsBrowseLoaderData;
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'CollectionsBrowsePage mounted');
    return () => {
      log.debug({}, 'CollectionsBrowsePage unmounted');
    };
  }, []);

  return (
    <div className='container mx-auto px-4 py-8'>
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('collection.browse.title')}
      </h1>

      {collectionsResponse.data.length === 0
        ? (
          <p className='text-center py-12' style={{ color: 'var(--text-secondary)' }}>
            {t('collection.browse.noResults')}
          </p>
        )
        : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
            {collectionsResponse.data.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} showAuthor />
            ))}
          </div>
        )}
    </div>
  );
}
