import { BREW_METHODS_LIST } from '@brewform/shared/constants';
import type { CollectionItemOutput } from '@brewform/shared/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import type { action as collectionAction } from '../../pages/collections/CollectionDetailPage.data.ts';
import type { reorderAction } from '../../routes/resources/collections.ts';
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
 * The owner sees small up/down/remove buttons below each card.
 *
 * Reordering is optimistic: the local array is swapped immediately and the new `itemIds`
 * order is PATCHed through a fetcher to the `collections/:id/reorder` resource action
 * (without revalidating the page loader). The arrows stay disabled while that fetcher is
 * pending, so reorders are serialised, and a `{ ok: false }` result rolls the order back and
 * shows an error toast. Remove submits a `remove` intent to the `/collections/:id` route action
 * (which revalidates the page, so the recipe count follows) and toasts on failure.
 *
 * Reordering is global across all groups (the `sortOrder` field is shared), so
 * moving an item up/down may move it across a group boundary.
 */
export function CollectionRecipeList({ collectionId, items, isOwner }: CollectionRecipeListProps) {
  const { t } = useTranslation();
  const [localItems, setLocalItems] = useState(items);
  const reorderFetcher = useFetcher<typeof reorderAction>();
  const removeFetcher = useFetcher<typeof collectionAction>();
  /** The order before the pending reorder, restored if the action fails. */
  const rollbackItems = useRef<CollectionItemOutput[] | null>(null);
  const reordering = reorderFetcher.state !== 'idle';
  const removing = removeFetcher.state !== 'idle';

  // Sync localItems when the items prop changes (e.g. navigating to a different collection,
  // or the loader revalidating after a removal)
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  useActionFeedback(reorderFetcher, {
    errorKey: 'collection.error.reorder',
    onSuccess: () => {
      log.debug({ collectionId }, 'CollectionRecipeList reorder saved');
      rollbackItems.current = null;
    },
    onError: () => {
      if (rollbackItems.current) setLocalItems(rollbackItems.current);
      rollbackItems.current = null;
    },
  });
  useActionFeedback(removeFetcher, {
    errorKey: 'collection.error.remove',
    onSuccess: (data) => {
      if (data.ok) setLocalItems((current) => current.filter((i) => i.recipeId !== data.recipeId));
    },
  });

  log.debug({ collectionId, itemCount: localItems.length }, 'CollectionRecipeList rendered');

  const groups = useMemo(
    () => groupByBrewMethod(localItems, t('collection.detail.otherBrewMethod')),
    [localItems, t],
  );

  // Build a flat index lookup so owner buttons can find the item's global index
  // (needed for up/down disabled-state and for the swap target).
  const flatIndex = new Map<string, number>();
  localItems.forEach((item, index) => {
    flatIndex.set(item.id, index);
  });

  /** Swaps the item with its neighbour, then PATCHes the new order (no-op while one is pending). */
  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (reordering) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === localItems.length - 1) return;
    const newItems = [...localItems];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
    rollbackItems.current = localItems;
    setLocalItems(newItems);
    reorderFetcher.submit(
      { itemIds: newItems.map((i) => i.id) },
      {
        method: 'patch',
        action: `/collections/${collectionId}/reorder`,
        encType: 'application/json',
        defaultShouldRevalidate: false,
      },
    );
  };

  /** Submits the `remove` intent for one recipe to the collection route action. */
  const handleRemove = (recipeId: string) => {
    removeFetcher.submit(
      { intent: 'remove', recipeId },
      { method: 'post', action: `/collections/${collectionId}` },
    );
  };

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.brewMethod ?? '__other'} aria-label={group.label}>
          <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {group.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.items.map((item) => {
              const index = flatIndex.get(item.id)!;
              return (
                <div key={item.id} className="flex flex-col gap-2">
                  <RecipeCard recipe={item.recipe} />
                  {isOwner && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveItem(index, 'up')}
                        disabled={reordering || index === 0}
                        className="btn-secondary text-xs px-2 py-1 disabled:opacity-30"
                        aria-label={t('collection.moveUp')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(index, 'down')}
                        disabled={reordering || index === localItems.length - 1}
                        className="btn-secondary text-xs px-2 py-1 disabled:opacity-30"
                        aria-label={t('collection.moveDown')}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.recipeId)}
                        disabled={removing}
                        className="btn-secondary text-xs px-2 py-1 text-red-600"
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
