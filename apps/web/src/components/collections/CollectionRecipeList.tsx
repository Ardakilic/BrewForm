import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { CollectionItemOutput } from '@brewform/shared/schemas';
import { collectionApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('CollectionRecipeList');

/** Props for {@link CollectionRecipeList}. */
interface CollectionRecipeListProps {
  collectionId: string;
  items: CollectionItemOutput[];
  isOwner: boolean;
}

/**
 * Reorderable list of recipes in a collection. Owner can reorder via
 * up/down buttons and remove recipes. Reordering is optimistic — the
 * local array is swapped immediately and a PATCH is fired in the background.
 */
export function CollectionRecipeList({ collectionId, items, isOwner }: CollectionRecipeListProps) {
  const { t } = useTranslation();
  const [localItems, setLocalItems] = useState(items);

  // Sync localItems when the items prop changes (e.g. navigating to a different collection)
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  log.debug({ collectionId, itemCount: localItems.length }, 'CollectionRecipeList rendered');

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === localItems.length - 1) return;
    const newItems = [...localItems];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
    // Optimistic update
    const previousItems = localItems;
    setLocalItems(newItems);
    try {
      const itemIds = newItems.map((i) => i.id);
      await collectionApi.reorder(collectionId, itemIds);
      log.debug({ collectionId }, 'Collection reordered');
    } catch (err) {
      // Rollback on error
      setLocalItems(previousItems);
      log.error({ err, collectionId }, 'Failed to reorder collection');
    }
  };

  const handleRemove = async (itemId: string, recipeId: string) => {
    try {
      await collectionApi.removeRecipe(collectionId, recipeId);
      setLocalItems(localItems.filter((i) => i.id !== itemId));
      log.debug({ collectionId, recipeId }, 'Recipe removed from collection');
    } catch (err) {
      log.error({ err }, 'Failed to remove recipe from collection');
    }
  };

  return (
    <div className='space-y-2'>
      {localItems.map((item, index) => (
        <div
          key={item.id}
          className='flex items-center justify-between p-3 rounded border'
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <Link
            to={`/recipes/${item.recipe.slug}`}
            className='font-medium hover:underline flex-1'
            style={{ color: 'var(--text-primary)' }}
          >
            {item.recipe.title}
          </Link>
          {isOwner && (
            <div className='flex items-center gap-1'>
              <button
                type='button'
                onClick={() => moveItem(index, 'up')}
                disabled={index === 0}
                className='btn-secondary text-xs px-2 py-1 disabled:opacity-30'
                aria-label={t('collection.moveUp')}
              >
                ↑
              </button>
              <button
                type='button'
                onClick={() => moveItem(index, 'down')}
                disabled={index === localItems.length - 1}
                className='btn-secondary text-xs px-2 py-1 disabled:opacity-30'
                aria-label={t('collection.moveDown')}
              >
                ↓
              </button>
              <button
                type='button'
                onClick={() => handleRemove(item.id, item.recipeId)}
                className='btn-secondary text-xs px-2 py-1 text-red-600'
                aria-label={t('collection.detail.removeFromCollection')}
              >
                ×
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
