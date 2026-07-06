import { useCallback, useState } from 'react';
import { adminApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

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
 * Returns only the fallback — never leaks raw backend error messages.
 * The fallback should be a stable i18n key translated by the caller.
 */
function getErrorMessage(_err: unknown, fallback: string): string {
  return fallback;
}

/**
 * Owns the ban/unban state machine and the API calls against {@link adminApi}.
 * The parent supplies an `onSuccess` callback that is invoked after a
 * successful ban or unban so it can refresh its data source.
 */
export function useBanUser(
  onSuccess: (userId: string, isBanned: boolean) => void,
): UseBanUserReturn {
  const [banDialogUser, setBanDialogUser] = useState<BanDialogUser | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openBanDialog = useCallback(
    (user: BanDialogUser) => {
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
      setError(getErrorMessage(err, 'admin.users.banError'));
      setProcessing(false);
      log.error({ err, userId }, 'useBanUser confirmBan failed');
    }
  }, [banDialogUser, onSuccess]);

  const unban = useCallback(
    async (userId: string) => {
      if (processing) return;
      log.debug({ userId }, 'useBanUser unban started');
      setProcessing(true);
      try {
        await adminApi.unbanUser(userId);
        onSuccess(userId, false);
        setError(null);
        setProcessing(false);
        log.debug({ userId }, 'useBanUser unban completed');
      } catch (err) {
        setError(getErrorMessage(err, 'admin.users.unbanError'));
        setProcessing(false);
        log.error({ err, userId }, 'useBanUser unban failed');
      }
    },
    [onSuccess, processing],
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
