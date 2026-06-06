import { useFetcher } from 'react-router';

interface Props {
  userId: string;
  initialFollowing: boolean;
  onToggle?: (next: boolean) => void;
}

export function FollowButton({ userId, initialFollowing, onToggle }: Props) {
  const fetcher = useFetcher();
  const optimistic = fetcher.formData ? fetcher.formData.get('following') === 'true' : null;
  const following = optimistic ?? initialFollowing;

  const handleClick = () => {
    const next = !following;
    fetcher.submit(
      { following: String(next) },
      {
        method: next ? 'post' : 'delete',
        action: `/follow/${userId}`,
        encType: 'application/x-www-form-urlencoded',
      },
    );
    onToggle?.(next);
  };

  const isLoading = fetcher.state !== 'idle';

  return (
    <button
      type='button'
      onClick={handleClick}
      disabled={isLoading}
      className='btn-secondary text-sm'
      style={following
        ? { backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' }
        : {}}
    >
      {isLoading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}
