import { useEffect } from 'react';
import { Link, useLoaderData } from 'react-router';
import { CollectionRecipeList } from '../../components/collections/CollectionRecipeList.tsx';
import { CollectionVisibilityBadge } from '../../components/collections/CollectionVisibilityBadge.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Breadcrumb } from '../../components/ui/Breadcrumb.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './CollectionDetailPage.data.ts';

const log = createLogger('CollectionDetailPage');

/**
 * Page component for `/collections/:id` — displays the collection header
 * (name, description, visibility badge, owner link), the reorderable recipe
 * list, and edit/delete buttons for the owner. The collection comes from the route loader
 * (`CollectionDetailPage.data.ts`); the list's remove and reorder submit to that module's
 * actions. Head rules: the title is `<name> | BrewForm`, and every collection that is not
 * `public` (`unlisted`, `private`, `draft`) gets `<meta name="robots" content="noindex,
 * nofollow">`, so link-only and owner-only collections are never indexed.
 */
export function CollectionDetailPage() {
  const { collection } = useLoaderData<typeof loader>();
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
    <PageContainer width="4xl">
      <SEOHead
        title={collection.name}
        description={collection.description ?? undefined}
        noIndex={collection.visibility !== 'public'}
      />
      <div className="mb-6">
        <div className="mb-2">
          <Breadcrumb
            items={[
              { label: t('collection.list.title'), to: '/collections' },
              { label: collection.name },
            ]}
          />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {collection.name}
          </h1>
          <CollectionVisibilityBadge
            visibility={collection.visibility}
            className="text-lg"
            title={collection.visibility}
          />
        </div>
        {collection.description && (
          <p className="mb-2" style={{ color: 'var(--text-secondary)' }}>
            {collection.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <Link to={`/u/${collection.author.username}`} className="hover:underline">
            {collection.author.displayName || collection.author.username}
          </Link>
          <span>
            {t('collection.detail.recipes')}: {collection.recipeCount}
          </span>
        </div>
      </div>

      {isOwner && (
        <div className="flex gap-2 mb-6">
          <Link to={`/collections/${collection.id}/edit`} className="btn-secondary">
            {t('collection.detail.edit')}
          </Link>
        </div>
      )}

      {collection.items.length === 0 ? (
        <EmptyState message={t('collection.detail.noRecipes')} />
      ) : (
        <CollectionRecipeList
          collectionId={collection.id}
          items={collection.items}
          isOwner={isOwner}
        />
      )}
    </PageContainer>
  );
}
