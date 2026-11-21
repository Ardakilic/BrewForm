import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
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
 * action returned, whether or not `ok` is true (a failure carries the pre-click state, so the
 * button falls back to the last confirmed value and the next click sends the right method; the
 * loader's `initialFollowing` only when no state came back). Labels are `follow.follow` and
 * `follow.followingState`; a failure toasts `follow.error` (`error.unauthorized` for an expired
 * session) through `useActionFeedback`. Calls `onToggle` when the mutation settles successfully
 * (the parent adjusts any counts it shows) and `onToggleRollback` with the returned pre-click
 * state when the action returns an error.
 */
export function FollowButton({ userId, initialFollowing, onToggle, onToggleRollback }: Props) {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof followAction>({ key: `follow-${userId}` });
  const optimistic = fetcher.formData ? fetcher.formData.get('following') === 'true' : null;
  const settled = fetcher.data;
  const settledFollowing = typeof settled?.following === 'boolean' ? settled.following : null;
  const following = optimistic ?? settledFollowing ?? initialFollowing;
  useActionFeedback(fetcher, { errorKey: 'follow.error' });

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
      onToggleRollback?.(fetcher.data.following ?? initialFollowing);
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
      {isLoading ? '...' : following ? t('follow.followingState') : t('follow.follow')}
    </button>
  );
}
