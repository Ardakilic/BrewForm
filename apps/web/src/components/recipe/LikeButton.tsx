import { useFetcher } from 'react-router';

interface Props {
  recipeId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function LikeButton({ recipeId, initialLiked, initialCount }: Props) {
  const fetcher = useFetcher();

  const optimisticLiked = fetcher.formData ? fetcher.formData.get('liked') === 'true' : null;
  const liked = optimisticLiked ?? initialLiked;

  const pendingDelta = fetcher.formData ? (fetcher.formData.get('liked') === 'true' ? 1 : -1) : 0;
  const count = (initialCount ?? 0) + pendingDelta;

  return (
    <fetcher.Form method='post' action={`/recipes/${recipeId}/like`}>
      <input type='hidden' name='liked' value={String(!liked)} />
      <button
        type='submit'
        disabled={fetcher.state !== 'idle'}
        className='flex items-center gap-1 rounded px-3 py-1 text-sm transition-opacity hover:opacity-80'
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
