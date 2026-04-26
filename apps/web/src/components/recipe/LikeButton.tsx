import { useState } from 'react';
import { api } from '../../api/client';

interface Props {
  recipeId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function LikeButton({ recipeId, initialLiked, initialCount }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      if (liked) {
        await api.delete(`/recipes/${recipeId}/like`);
        setCount((c) => c - 1);
      } else {
        await api.post(`/recipes/${recipeId}/like`, {});
        setCount((c) => c + 1);
      }
      setLiked(!liked);
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
        backgroundColor: liked ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
        color: liked ? 'var(--bg-primary)' : 'var(--text-primary)',
      }}
    >
      ❤️ {count}
    </button>
  );
}