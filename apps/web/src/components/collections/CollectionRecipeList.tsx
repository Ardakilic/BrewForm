// deno-lint-ignore-file no-explicit-any
import { useEffect, useMemo, useState } from 'react';
import type { CollectionItemOutput } from '@brewform/shared/schemas';
import { BREW_METHODS_LIST } from '@brewform/shared/constants';
import { collectionApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { RecipeCard } from '../recipe-list/RecipeCard.tsx';

const log = createLogger('CollectionRecipeList');

/** Lookup from brew-method value → human label (built once from {@link BREW_METHODS_LIST}). */
const BREW_METHOD_LABELS: Map<string, string> = new Map(
  BREW_METHODS_LIST.map((m) => [m.value, m.label]),
);

/** Props for {@link CollectionRecipeList}. */
interface CollectionRecipeListProps {
  collectionId: string;
  items: CollectionItemOutput[];
  isOwner: boolean;
}

/** A group of collection items sharing the same brew method (or null). */
interface BrewMethodGroup {
  /** The brew-method value, or `null` for recipes without a version. */
  brewMethod: string | null;
  /** Human-readable label for the section heading. */
  label: string;
  /** Items in this group, in their current sort order. */
  items: CollectionItemOutput[];
}

/**
 * Groups collection items by their recipe's `brewMethod`. Items with a known
 * brew method come first (in `BREW_METHODS_LIST` order), followed by any
 * unrecognised brew-method strings, and finally the `null` group ("Other") at
 * the end. Within each group the original item order is preserved.
 *
 * @param items - The collection items to group.
 * @param otherLabel - The label to use for the `null` brew-method group.
 * @returns An ordered array of {@link BrewMethodGroup}s.
 */
function groupByBrewMethod(items: CollectionItemOutput[], otherLabel: string): BrewMethodGroup[] {
  const buckets = new Map<string | null, CollectionItemOutput[]>();
  for (const item of items) {
    const key = item.recipe.brewMethod;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(key, [item]);
    }
  }

  // Order: known BREW_METHODS_LIST values first (in declared order), then any
  // leftover non-null strings, then the null group last.
  const orderedKeys: (string | null)[] = [];
  for (const m of BREW_METHODS_LIST) {
    if (buckets.has(m.value)) orderedKeys.push(m.value);
  }
  for (const key of buckets.keys()) {
    if (key !== null && !BREW_METHOD_LABELS.has(key)) orderedKeys.push(key);
  }
  if (buckets.has(null)) orderedKeys.push(null);

  return orderedKeys.map((key) => ({
    brewMethod: key,
    label: key === null ? otherLabel : (BREW_METHOD_LABELS.get(key) ?? key),
    items: buckets.get(key)!,
  }));
}

/**
 * Reorderable, brew-method-grouped list of recipes in a collection. Each group
 * is rendered as a section with a heading and a grid of {@link RecipeCard}s.
 * The owner sees small up/down/remove buttons below each card; reordering is
 * optimistic — the local array is swapped immediately and a PATCH is fired in
 * the background, with a rollback on error.
 *
 * Reordering is global across all groups (the `sortOrder` field is shared), so
 * moving an item up/down may move it across a group boundary.
 */
export function CollectionRecipeList({ collectionId, items, isOwner }: CollectionRecipeListProps) {
  const { t } = useTranslation();
  const [localItems, setLocalItems] = useState(items);

  // Sync localItems when the items prop changes (e.g. navigating to a different collection)
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  log.debug({ collectionId, itemCount: localItems.length }, 'CollectionRecipeList rendered');

  const groups = useMemo(
    () => groupByBrewMethod(localItems, t('collection.detail.otherBrewMethod')),
    [localItems, t],
  );

  // Build a flat index lookup so owner buttons can find the item's global index
  // (needed for up/down disabled-state and for the swap target).
  const flatIndex = new Map<string, number>();
  localItems.forEach((item, index) => flatIndex.set(item.id, index));

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
    <div className='space-y-8'>
      {groups.map((group) => (
        <section key={group.brewMethod ?? '__other'} aria-label={group.label}>
          <h2
            className='mb-3 text-lg font-semibold'
            style={{ color: 'var(--text-primary)' }}
          >
            {group.label}
          </h2>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
            {group.items.map((item) => {
              const index = flatIndex.get(item.id)!;
              return (
                <div key={item.id} className='flex flex-col gap-2'>
                  <RecipeCard recipe={item.recipe} />
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
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
