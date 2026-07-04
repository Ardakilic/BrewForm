import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { createLogger } from '@/utils/logger.ts';

interface Props {
  recipeId: string;
  initialFavourited: boolean;
  initialCount: number;
}

const log = createLogger('FavouriteButton');

/**
 * Optimistic star/unstar toggle with count, submitted via fetcher form
 * to `/recipes/:id/favourite`; the UI reflects pending form data until
 * the action settles.
 */
export function FavouriteButton({ recipeId, initialFavourited, initialCount }: Props) {
  const fetcher = useFetcher();
  const optimisticFavourited = fetcher.formData
    ? fetcher.formData.get('favourited') === 'true'
    : null;
  const favourited = optimisticFavourited ?? initialFavourited;
  const pendingDelta = fetcher.formData
    ? (fetcher.formData.get('favourited') === 'true' ? 1 : -1)
    : 0;
  const count = (initialCount ?? 0) + pendingDelta;

  useEffect(() => {
    log.debug({ recipeId, state: fetcher.state }, 'fetcher state change');
  }, [fetcher.state, recipeId]);

  return (
    <fetcher.Form
      method='post'
      action={`/recipes/${recipeId}/favourite`}
      onSubmit={() => log.debug({ recipeId }, 'submit started')}
    >
      <input type='hidden' name='favourited' value={String(!favourited)} />
      <button
        type='submit'
        disabled={fetcher.state !== 'idle'}
        className='flex items-center gap-1 rounded px-3 py-1 text-sm transition-opacity hover:opacity-80'
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
