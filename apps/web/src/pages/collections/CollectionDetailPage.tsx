import { useEffect } from 'react';
import { Link, useLoaderData } from 'react-router';
import { ApiError, collectionApi } from '../../api/index.ts';
import type { CollectionDetailOutput } from '@brewform/shared/schemas';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { CollectionRecipeList } from '../../components/collections/CollectionRecipeList.tsx';
import { CollectionVisibilityBadge } from '../../components/collections/CollectionVisibilityBadge.tsx';
import { Breadcrumb } from '../../components/ui/Breadcrumb.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';

const log = createLogger('CollectionDetailPage');

/** Loader payload for {@link CollectionDetailPage}. */
export interface CollectionDetailLoaderData {
  collection: CollectionDetailOutput;
}

/**
 * React Router data loader for `/collections/:id` — fetches the collection
 * by ID. A 404 from the API is mapped to `throw new Response('Not Found', { status: 404 })`.
 */
export const loader = async (
  { params }: { params: Record<string, string | undefined> },
): Promise<CollectionDetailLoaderData> => {
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });
  log.debug({ collectionId: id }, 'CollectionDetailPage loader started');
  let collection: CollectionDetailOutput;
  try {
    collection = await collectionApi.get(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Response('Not Found', { status: 404 });
    }
    log.error({ err, collectionId: id }, 'CollectionDetailPage loader failed');
    throw err;
  }
  log.debug({ collectionId: id }, 'CollectionDetailPage loader completed');
  return { collection };
};

/**
 * Page component for `/collections/:id` — displays the collection header
 * (name, description, visibility badge, owner link), the reorderable recipe
 * list, and edit/delete buttons for the owner.
 */
export function CollectionDetailPage() {
  const { collection } = useLoaderData() as CollectionDetailLoaderData;
  const { user } = useAuth();
  const { t } = useTranslation();
  const isOwner = user?.id === collection.userId;

  useEffect(() => {
    log.debug({ collectionId: collection.id }, 'CollectionDetailPage mounted');
    return () => {
      log.debug({ collectionId: collection.id }, 'CollectionDetailPage unmounted');
    };
  }, [collection.id]);

  return (
    <PageContainer width='4xl'>
      <div className='mb-6'>
        <div className='mb-2'>
          <Breadcrumb
            items={[
              { label: t('collection.list.title'), to: '/collections' },
              { label: collection.name },
            ]}
          />
        </div>
        <div className='flex items-center gap-3 mb-2'>
          <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
            {collection.name}
          </h1>
          <CollectionVisibilityBadge
            visibility={collection.visibility}
            className='text-lg'
            title={collection.visibility}
          />
        </div>
        {collection.description && (
          <p className='mb-2' style={{ color: 'var(--text-secondary)' }}>
            {collection.description}
          </p>
        )}
        <div className='flex items-center gap-4 text-sm' style={{ color: 'var(--text-secondary)' }}>
          <Link to={`/u/${collection.author.username}`} className='hover:underline'>
            {collection.author.displayName || collection.author.username}
          </Link>
          <span>{t('collection.detail.recipes')}: {collection.recipeCount}</span>
        </div>
      </div>

      {isOwner && (
        <div className='flex gap-2 mb-6'>
          <Link
            to={`/collections/${collection.id}/edit`}
            className='btn-secondary'
          >
            {t('collection.detail.edit')}
          </Link>
        </div>
      )}

      {collection.items.length === 0
        ? <EmptyState message={t('collection.detail.noRecipes')} />
        : (
          <CollectionRecipeList
            collectionId={collection.id}
            items={collection.items}
            isOwner={isOwner}
          />
        )}
    </PageContainer>
  );
}
