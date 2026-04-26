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

  async function toggle() {
    if (loading) return;
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="btn-secondary text-sm"
      style={following ? { backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' } : {}}
    >
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}