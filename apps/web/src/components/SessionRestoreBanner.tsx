import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('SessionRestoreBanner');

/**
 * Renders a banner when the last session-restore attempt failed due to a
 * server or network error, with retry and dismiss actions. Returns null
 * when there is no error (the user is logged out cleanly or the session is
 * intact). The retry button calls `refreshUser()`; on success the
 * `refreshUser` try block sets `sessionError` to null and this component
 * unmounts via the early return. The dismiss button calls
 * `clearSessionError()` to clear the banner without retrying. The banner
 * uses `role='alert'` so screen readers announce it when it appears.
 */
export function SessionRestoreBanner() {
  const { sessionError, clearSessionError, refreshUser } = useAuth();
  const [retrying, setRetrying] = useState(false);

  if (!sessionError) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await refreshUser();
      // On success, refreshUser's try block sets sessionError to null and
      // this component unmounts.
    } catch (err) {
      // refreshUser never throws (it catches internally) — this is a
      // type-safety guard. Log defensively in case a future change makes
      // it rethrow.
      log.error({ err }, 'SessionRestoreBanner retry failed');
    } finally {
      setRetrying(false);
    }
  };

  const message = sessionError === 'network'
    ? "Couldn't reach the server. Check your connection and retry."
    : "Couldn't restore your session — the server had an error. Retry?";

  return (
    <div
      role='alert'
      className='flex items-center justify-center gap-2 px-4 py-2 text-sm'
      style={{ backgroundColor: 'var(--error)', color: 'white' }}
    >
      <span>{message}</span>
      <button
        type='button'
        onClick={handleRetry}
        disabled={retrying}
        className='underline font-medium'
      >
        {retrying ? 'Retrying...' : 'Retry'}
      </button>
      <button
        type='button'
        onClick={clearSessionError}
        className='underline font-medium'
      >
        Dismiss
      </button>
    </div>
  );
}
