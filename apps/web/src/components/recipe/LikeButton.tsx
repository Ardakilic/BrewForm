import { useState } from 'react';
import { api } from '../../api/client.ts';

interface Props {
  recipeId: string;
  initialLiked: boolean;
  initialCount?: number;
}

export function LikeButton({ recipeId, initialLiked, initialCount }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState<number | undefined>(initialCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      // The API uses a toggle endpoint (POST) — one call to like, another to unlike.
      const result = await api.post<{ liked: boolean }>(`/recipes/${recipeId}/like`, {});
      const nowLiked = (result as { liked: boolean }).liked;
      setLiked(nowLiked);
      setCount((c) => nowLiked ? c + 1 : c - 1);
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
        backgroundColor: liked ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
        color: liked ? 'var(--bg-primary)' : 'var(--text-primary)',
      }}
    >
      ❤️ {count !== undefined && count}
    </button>
  );
}
