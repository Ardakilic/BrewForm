import { Link } from 'react-router';
import type { CollectionListItemOutput } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('CollectionCard');

/** Props for {@link CollectionCard}. */
interface CollectionCardProps {
  collection: CollectionListItemOutput;
}

/**
 * Card component displaying a collection's name, visibility badge, and recipe count.
 * Links to the collection's detail page.
 */
export function CollectionCard({ collection }: CollectionCardProps) {
  const { t } = useTranslation();
  log.debug({ collectionId: collection.id }, 'CollectionCard rendered');

  const visibilityBadge = collection.visibility === 'public'
    ? '🌐'
    : collection.visibility === 'unlisted'
    ? '🔗'
    : '🔒';

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
      <p className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
        {collection.recipeCount} {t('collection.detail.recipes')}
      </p>
    </Link>
  );
}
