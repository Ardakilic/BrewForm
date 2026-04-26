import { useState } from 'react';
import { api } from '../../api/client';

interface Props {
  recipeId: string;
  initialFavourited: boolean;
  initialCount: number;
}

export function FavouriteButton({ recipeId, initialFavourited, initialCount }: Props) {
  const [favourited, setFavourited] = useState(initialFavourited);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      if (favourited) {
        await api.delete(`/recipes/${recipeId}/favourite`);
        setCount((c) => c - 1);
      } else {
        await api.post(`/recipes/${recipeId}/favourite`, {});
        setCount((c) => c + 1);
      }
      setFavourited(!favourited);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="flex items-center gap-1 rounded px-3 py-1 text-sm transition-opacity hover:opacity-80"
      style={{
        backgroundColor: favourited ? 'var(--warning)' : 'var(--bg-tertiary)',
        color: favourited ? 'var(--bg-primary)' : 'var(--text-primary)',
      }}
    >
      ⭐ {count}
    </button>
  );
}