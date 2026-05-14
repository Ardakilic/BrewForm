import { useState } from 'react';
import { api } from '../../api/client';

interface Props {
  userId: string;
  initialFollowing: boolean;
  onToggle?: (following: boolean) => void;
}

export function FollowButton({ userId, initialFollowing, onToggle }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      if (following) {
        await api.delete(`/follow/${userId}`);
      } else {
        await api.post(`/follow/${userId}`, {});
      }
      setFollowing(!following);
      onToggle?.(!following);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type='button'
        onClick={toggle}
        disabled={loading}
        className='btn-secondary text-sm'
        style={following
          ? { backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' }
          : {}}
      >
        {loading ? '...' : following ? 'Following' : 'Follow'}
      </button>
      {error && <p className='text-sm' style={{ color: 'var(--color-error, red)' }}>{error}</p>}
    </>
  );
}
