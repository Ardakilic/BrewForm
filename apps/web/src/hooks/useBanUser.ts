import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import type { AdminUserActionResult } from '../pages/admin/AdminUserDetailPage.data.ts';

const log = createLogger('useBanUser');

interface BanDialogUser {
  id: string;
  username: string;
  displayName: string | null;
}

/**
 * Return shape of the {@link useBanUser} hook. Exposes the ban dialog state
 * machine plus the actions for banning and unbanning users.
 */
interface UseBanUserReturn {
  banDialogUser: BanDialogUser | null;
  processing: boolean;
  error: string | null;
  openBanDialog: (user: BanDialogUser) => void;
  confirmBan: (reason: string) => Promise<void>;
  unban: (userId: string) => Promise<void>;
  clearError: () => void;
  closeDialog: () => void;
}

/**
 * The submission in flight: what it was, for whom, whether the fetcher was seen busy with it,
 * and the fetcher data from before it (a new result object also marks it settled).
 */
interface PendingSubmission {
  kind: 'ban' | 'unban';
  userId: string;
  started: boolean;
  previousData: AdminUserActionResult | undefined;
}

/**
 * Owns the ban/unban state machine. Requests go to the `/admin/users/:id` route action
 * (`AdminUserDetailPage.data.ts`) through `useFetcher().submit()` with the form fields
 * `intent` (`ban` | `unban`) and `reason`, and `defaultShouldRevalidate: false`, so a ban
 * patches the caller's local state through `onSuccess(userId, isBanned)` without re-fetching.
 * The hook never imports the API client. Failures set `error` to a stable i18n key
 * (`admin.users.banError` / `admin.users.unbanError`; raw server text is never surfaced) and
 * are logged; a failed ban keeps the dialog open.
 */
export function useBanUser(
  onSuccess: (userId: string, isBanned: boolean) => void,
): UseBanUserReturn {
  const fetcher = useFetcher<AdminUserActionResult>();
  const [banDialogUser, setBanDialogUser] = useState<BanDialogUser | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<PendingSubmission | null>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  // Mirror `processing` in a ref so async guards read the freshest value even
  // when a stale `useCallback` closure is still referenced (e.g. a second
  // `unban` call issued before React re-renders). Without this, the
  // `if (processing) return` guard in `unban` can read a stale `false` and
  // allow duplicate concurrent calls.
  const processingRef = useRef(false);
  const setProcessingBoth = useCallback((next: boolean) => {
    processingRef.current = next;
    setProcessing(next);
  }, []);

  // Apply the action result once the fetcher has picked up and settled our submission.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (fetcher.state !== 'idle') {
      pending.started = true;
      return;
    }
    if (!fetcher.data || (!pending.started && fetcher.data === pending.previousData)) return;
    pendingRef.current = null;
    const { kind, userId } = pending;
    const result = fetcher.data;
    if (result.ok) {
      onSuccessRef.current(userId, kind === 'ban');
      if (kind === 'ban') setBanDialogUser(null);
      setError(null);
      setProcessingBoth(false);
      log.debug({ userId }, `useBanUser ${kind === 'ban' ? 'confirmBan' : 'unban'} completed`);
    } else {
      setError(kind === 'ban' ? 'admin.users.banError' : 'admin.users.unbanError');
      setProcessingBoth(false);
      log.error(
        { err: result.error, userId },
        `useBanUser ${kind === 'ban' ? 'confirmBan' : 'unban'} failed`,
      );
    }
  }, [fetcher.state, fetcher.data, setProcessingBoth]);

  const openBanDialog = useCallback(
    (user: BanDialogUser) => {
      setBanDialogUser(user);
      setError(null);
      setProcessingBoth(false);
    },
    [setProcessingBoth],
  );

  const closeDialog = useCallback(() => {
    setBanDialogUser(null);
    setError(null);
    setProcessingBoth(false);
  }, [setProcessingBoth]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const { submit } = fetcher;

  const confirmBan = useCallback(
    async (reason: string) => {
      if (!banDialogUser || !reason.trim()) return;
      const userId = banDialogUser.id;
      log.debug({ userId }, 'useBanUser confirmBan started');
      setProcessingBoth(true);
      pendingRef.current = { kind: 'ban', userId, started: false, previousData: fetcher.data };
      await submit(
        { intent: 'ban', reason },
        { method: 'post', action: `/admin/users/${userId}`, defaultShouldRevalidate: false },
      );
    },
    [banDialogUser, fetcher.data, setProcessingBoth, submit],
  );

  const unban = useCallback(
    async (userId: string) => {
      if (processingRef.current) return;
      log.debug({ userId }, 'useBanUser unban started');
      setProcessingBoth(true);
      pendingRef.current = { kind: 'unban', userId, started: false, previousData: fetcher.data };
      await submit(
        { intent: 'unban' },
        { method: 'post', action: `/admin/users/${userId}`, defaultShouldRevalidate: false },
      );
    },
    [fetcher.data, setProcessingBoth, submit],
  );

  return {
    banDialogUser,
    processing,
    error,
    openBanDialog,
    confirmBan,
    unban,
    clearError,
    closeDialog,
  };
}
