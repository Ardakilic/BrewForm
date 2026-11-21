import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import type { followAction } from '../../routes/follow.ts';

interface Props {
  userId: string;
  initialFollowing: boolean;
  onToggle?: (next: boolean) => void;
  onToggleRollback?: (previous: boolean) => void;
}

const log = createLogger('FollowButton');

/**
 * Optimistic follow/unfollow toggle backed by a fetcher (keyed by user) to `/follow/:userId`,
 * submitted with `defaultShouldRevalidate: false` so a follow does not re-run the page loader.
 * While pending it shows the submitted value; once settled it shows the `following` state the
 * action returned (`{ ok: true, following }`), or the loader's `initialFollowing` after
 * `{ ok: false }`. Calls `onToggle` when the mutation settles successfully (the parent adjusts
 * any counts it shows) and `onToggleRollback` when the action returns an error.
 */
export function FollowButton({ userId, initialFollowing, onToggle, onToggleRollback }: Props) {
  const fetcher = useFetcher<typeof followAction>({ key: `follow-${userId}` });
  const optimistic = fetcher.formData ? fetcher.formData.get('following') === 'true' : null;
  const settled = fetcher.data;
  const settledFollowing =
    settled?.ok && typeof settled.following === 'boolean' ? settled.following : null;
  const following = optimistic ?? settledFollowing ?? initialFollowing;

  const pendingNextRef = useRef<boolean | null>(null);
  const wasSettledRef = useRef<boolean>(true);

  const handleClick = () => {
    const next = !following;
    pendingNextRef.current = next;
    wasSettledRef.current = false;
    log.debug({ userId }, 'handleClick submit started');
    fetcher.submit(
      { following: String(next) },
      {
        method: next ? 'post' : 'delete',
        action: `/follow/${userId}`,
        encType: 'application/x-www-form-urlencoded',
        defaultShouldRevalidate: false,
      },
    );
  };

  useEffect(() => {
    if (fetcher.state !== 'idle') {
      log.debug({ userId, state: fetcher.state }, 'fetcher pending');
      return;
    }
    if (wasSettledRef.current) return;
    wasSettledRef.current = true;
    const next = pendingNextRef.current;
    pendingNextRef.current = null;
    if (fetcher.data && !fetcher.data.ok) {
      log.debug({ userId }, 'fetcher settled with error');
      onToggleRollback?.(initialFollowing);
      return;
    }
    if (next !== null) {
      log.debug({ userId, next }, 'fetcher settled successfully');
      onToggle?.(next);
    }
  }, [fetcher.state, fetcher.data, userId, initialFollowing, onToggle, onToggleRollback]);

  const isLoading = fetcher.state !== 'idle';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className="btn-secondary text-sm"
      style={
        following ? { backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' } : {}
      }
    >
      {isLoading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}
