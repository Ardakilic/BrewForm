import { Link, useNavigate } from 'react-router';
import type { CollectionListItemOutput } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('CollectionCard');

/**
 * Author projection accepted by {@link CollectionCard} when `showAuthor` is set.
 * Mirrors `RecipeAuthorMiniSchema` (`{ username, displayName, avatarUrl }`) used
 * by {@link PublicCollectionListItemOutput}.
 */
export interface CollectionCardAuthor {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Props for {@link CollectionCard}. */
interface CollectionCardProps {
  collection: CollectionListItemOutput;
  /** When true (and `collection.author` is present), render an author link. */
  showAuthor?: boolean;
}

/**
 * Card component displaying a collection's name, visibility badge, and recipe
 * count. Links to the collection's detail page. When `showAuthor` is set and the
 * collection carries an `author` projection (e.g. from the public browse
 * endpoint), a "by @username" button is rendered below the description.
 *
 * Uses a `<button>` for the author link (with `useNavigate` + `stopPropagation`)
 * instead of a nested `<Link>` to avoid invalid nested `<a>` elements — the
 * same approach as {@link RecipeCard}.
 */
export function CollectionCard({ collection, showAuthor }: CollectionCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  log.debug({ collectionId: collection.id }, 'CollectionCard rendered');

  const visibilityBadge = collection.visibility === 'public'
    ? '🌐'
    : collection.visibility === 'unlisted'
    ? '🔗'
    : '🔒';

  // `author` is not part of `CollectionListItemOutput`; it is present on the
  // public-list payload (`PublicCollectionListItemOutput`). Read defensively.
  const author =
    (collection as CollectionListItemOutput & { author?: CollectionCardAuthor }).author;

  return (
    <Link
      to={`/collections/${collection.id}`}
      className='card hover:shadow-lg transition-shadow p-4 block'
    >
      <div className='flex items-center justify-between mb-2'>
        <h3 className='font-semibold truncate' style={{ color: 'var(--text-primary)' }}>
          {collection.name}
        </h3>
        <span className='text-lg' title={collection.visibility}>{visibilityBadge}</span>
      </div>
      {collection.description && (
        <p className='text-sm mb-2 line-clamp-2' style={{ color: 'var(--text-secondary)' }}>
          {collection.description}
        </p>
      )}
      {showAuthor && author && (
        <p className='text-xs mb-2' style={{ color: 'var(--text-secondary)' }}>
          by{' '}
          <button
            type='button'
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/u/${author.username}`);
            }}
            className='hover:underline'
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            {author.displayName || author.username}
          </button>
        </p>
      )}
      <p className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
        {collection.recipeCount} {t('collection.detail.recipes')}
      </p>
    </Link>
  );
}
