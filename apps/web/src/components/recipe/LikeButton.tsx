import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import type { likeAction } from '../../routes/like.ts';

interface Props {
  recipeId: string;
  initialLiked: boolean;
  initialCount: number;
}

const log = createLogger('LikeButton');

/**
 * Optimistic like/unlike toggle with count, submitted via a fetcher form to
 * `/recipes/:id/like` with `defaultShouldRevalidate={false}`, so a like never re-runs the
 * recipe detail loader (one HTTP request per click). While pending the UI shows the submitted
 * value; once settled it shows the `liked` state the action returned, whether or not `ok` is
 * true: a success carries the server's new state and a failure the pre-click state, so the
 * button falls back to the last confirmed value (the loader's `initialLiked` only when the
 * action returned no state). A failure toasts `recipe.like.error` (`error.unauthorized` for an
 * expired session) through `useActionFeedback`. The fetcher is keyed by recipe, so another
 * recipe's page never inherits this result.
 */
export function LikeButton({ recipeId, initialLiked, initialCount }: Props) {
  const fetcher = useFetcher<typeof likeAction>({ key: `like-${recipeId}` });
  const baseCount = initialCount ?? 0;

  const optimisticLiked = fetcher.formData ? fetcher.formData.get('liked') === 'true' : null;
  const settled = fetcher.data;
  const settledLiked = typeof settled?.liked === 'boolean' ? settled.liked : null;
  const liked = optimisticLiked ?? settledLiked ?? initialLiked;

  // The loader's count already includes `initialLiked`; adjust it only when the shown state
  // differs from it.
  const count = baseCount + (liked === initialLiked ? 0 : liked ? 1 : -1);

  useActionFeedback(fetcher, { errorKey: 'recipe.like.error' });

  useEffect(() => {
    log.debug({ recipeId, state: fetcher.state }, 'fetcher state change');
  }, [fetcher.state, recipeId]);

  return (
    <fetcher.Form
      method="post"
      action={`/recipes/${recipeId}/like`}
      defaultShouldRevalidate={false}
      onSubmit={() => log.debug({ recipeId }, 'submit started')}
    >
      <input type="hidden" name="liked" value={String(!liked)} />
      <button
        type="submit"
        disabled={fetcher.state !== 'idle'}
        className="flex items-center gap-1 rounded px-3 py-1 text-sm transition-opacity hover:opacity-80"
        style={{
          backgroundColor: liked ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
          color: liked ? 'var(--bg-primary)' : 'var(--text-primary)',
        }}
      >
        ❤️ {count}
      </button>
    </fetcher.Form>
  );
}
