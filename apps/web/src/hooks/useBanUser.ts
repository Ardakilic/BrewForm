import { useCallback, useState } from 'react';
import { adminApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('useBanUser');

/**
 * Return shape of the {@link useBanUser} hook. Exposes the ban dialog state
 * machine plus the actions for banning and unbanning users.
 */
interface UseBanUserReturn {
  banDialogUser: { id: string; username: string; displayName: string | null } | null;
  processing: boolean;
  error: string | null;
  openBanDialog: (user: { id: string; username: string; displayName: string | null }) => void;
  confirmBan: (reason: string) => Promise<void>;
  unban: (userId: string) => Promise<void>;
  clearError: () => void;
  closeDialog: () => void;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return (err as { message?: string })?.message || fallback;
}

/**
 * Owns the ban/unban state machine and the API calls against {@link adminApi}.
 * The parent supplies an `onSuccess` callback that is invoked after a
 * successful ban or unban so it can refresh its data source.
 */
export function useBanUser(
  onSuccess: (userId: string, isBanned: boolean) => void,
): UseBanUserReturn {
  const [banDialogUser, setBanDialogUser] = useState<
    { id: string; username: string; displayName: string | null } | null
  >(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openBanDialog = useCallback(
    (user: { id: string; username: string; displayName: string | null }) => {
      setBanDialogUser(user);
      setError(null);
      setProcessing(false);
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setBanDialogUser(null);
    setError(null);
    setProcessing(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const confirmBan = useCallback(async (reason: string) => {
    if (!banDialogUser || !reason.trim()) return;
    const userId = banDialogUser.id;
    log.debug({ userId }, 'useBanUser confirmBan started');
    setProcessing(true);
    try {
      await adminApi.banUser(banDialogUser.id, reason);
      onSuccess(banDialogUser.id, true);
      setBanDialogUser(null);
      setError(null);
      setProcessing(false);
      log.debug({ userId }, 'useBanUser confirmBan completed');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to ban user.'));
      setProcessing(false);
      log.error({ err, userId }, 'useBanUser confirmBan failed');
    }
  }, [banDialogUser, onSuccess]);

  const unban = useCallback(
    async (userId: string) => {
      log.debug({ userId }, 'useBanUser unban started');
      try {
        await adminApi.unbanUser(userId);
        onSuccess(userId, false);
        setError(null);
        log.debug({ userId }, 'useBanUser unban completed');
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to unban user.'));
        log.error({ err, userId }, 'useBanUser unban failed');
      }
    },
    [onSuccess],
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
