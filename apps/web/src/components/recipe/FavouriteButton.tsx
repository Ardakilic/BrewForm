import { useFetcher } from 'react-router';

interface Props {
  recipeId: string;
  initialFavourited: boolean;
  initialCount: number;
}

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

  return (
    <fetcher.Form method='post' action={`/recipes/${recipeId}/favourite`}>
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
