import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import type { favouriteAction } from '../../routes/favourite.ts';

interface Props {
  recipeId: string;
  initialFavourited: boolean;
  initialCount: number;
}

const log = createLogger('FavouriteButton');

/**
 * Optimistic star/unstar toggle with count, submitted via a fetcher form to
 * `/recipes/:id/favourite` with `defaultShouldRevalidate={false}`, so starring never re-runs
 * the recipe detail loader. While pending the UI shows the submitted value; once settled it
 * shows the `favourited` state the action returned, whether or not `ok` is true (a failure
 * carries the pre-click state, so the button falls back to the last confirmed value; the
 * loader's values only when no state came back). A failure toasts `recipe.favourite.error`
 * (`error.unauthorized` for an expired session) through `useActionFeedback`. The fetcher is
 * keyed by recipe.
 */
export function FavouriteButton({ recipeId, initialFavourited, initialCount }: Props) {
  const fetcher = useFetcher<typeof favouriteAction>({ key: `favourite-${recipeId}` });
  const baseCount = initialCount ?? 0;

  const optimisticFavourited = fetcher.formData
    ? fetcher.formData.get('favourited') === 'true'
    : null;
  const settled = fetcher.data;
  const settledFavourited = typeof settled?.favourited === 'boolean' ? settled.favourited : null;
  const favourited = optimisticFavourited ?? settledFavourited ?? initialFavourited;

  // The loader's count already includes `initialFavourited`; adjust it only when the shown
  // state differs from it.
  const count = baseCount + (favourited === initialFavourited ? 0 : favourited ? 1 : -1);

  useActionFeedback(fetcher, { errorKey: 'recipe.favourite.error' });

  useEffect(() => {
    log.debug({ recipeId, state: fetcher.state }, 'fetcher state change');
  }, [fetcher.state, recipeId]);

  return (
    <fetcher.Form
      method="post"
      action={`/recipes/${recipeId}/favourite`}
      defaultShouldRevalidate={false}
      onSubmit={() => log.debug({ recipeId }, 'submit started')}
    >
      <input type="hidden" name="favourited" value={String(!favourited)} />
      <button
        type="submit"
        disabled={fetcher.state !== 'idle'}
        className="flex items-center gap-1 rounded px-3 py-1 text-sm transition-opacity hover:opacity-80"
        style={{
          backgroundColor: favourited ? 'var(--warning)' : 'var(--bg-tertiary)',
          color: favourited ? 'var(--bg-primary)' : 'var(--text-primary)',
        }}
      >
        {favourited ? '⭐' : '☆'} {count}
      </button>
    </fetcher.Form>
  );
}
