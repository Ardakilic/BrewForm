import { useState } from 'react';
import { api } from '../../api/client.ts';

interface Props {
  recipeId: string;
  initialFavourited: boolean;
  initialCount?: number;
}

export function FavouriteButton({ recipeId, initialFavourited, initialCount }: Props) {
  const [favourited, setFavourited] = useState(initialFavourited);
  const [count, setCount] = useState<number | undefined>(initialCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      // The API uses a toggle endpoint (POST) — one call to favourite, another to unfavourite.
      const result = await api.post<{ favourited: boolean }>(`/recipes/${recipeId}/favourite`, {});
      const nowFavourited = (result as { favourited: boolean }).favourited;
      setFavourited(nowFavourited);
      setCount((c) => nowFavourited ? c + 1 : c - 1);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type='button'
      onClick={toggle}
      disabled={loading}
      className='flex items-center gap-1 rounded px-3 py-1 text-sm transition-opacity hover:opacity-80'
      style={{
        backgroundColor: favourited ? 'var(--warning)' : 'var(--bg-tertiary)',
        color: favourited ? 'var(--bg-primary)' : 'var(--text-primary)',
      }}
    >
      ⭐ {count !== undefined && count}
    </button>
  );
}
