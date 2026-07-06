import { useCallback, useState } from 'react';
import { adminApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('useBanUser');

/**
 * Return shape of the {@link useBanUser} hook. Exposes the ban dialog state
 * machine plus the actions for banning and unbanning users.
 */
interface UseBanUserReturn {
  /** The user currently targeted by the open ban dialog, or null when closed. */
  banDialogUser: { id: string; username: string; displayName: string | null } | null;
  /** The current reason text entered in the dialog. */
  reason: string;
  /** True while a ban/unban API call is in flight. */
  processing: boolean;
  /** Last error message produced by a ban/unban call, or null. */
  error: string | null;
  /** Open the ban dialog for the given user, resetting dialog state. */
  openBanDialog: (user: { id: string; username: string; displayName: string | null }) => void;
  /** Update the reason textarea value. */
  setReason: (reason: string) => void;
  /** Confirm the ban for the currently-open dialog user. */
  confirmBan: () => Promise<void>;
  /** Unban the given user outside the dialog flow. */
  unban: (userId: string) => Promise<void>;
  /** Clear the last error message. */
  clearError: () => void;
  /** Close the ban dialog and reset dialog state. */
  closeDialog: () => void;
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
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openBanDialog = useCallback(
    (user: { id: string; username: string; displayName: string | null }) => {
      setBanDialogUser(user);
      setReason('');
      setError(null);
      setProcessing(false);
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setBanDialogUser(null);
    setReason('');
    setError(null);
    setProcessing(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const confirmBan = useCallback(async () => {
    if (!banDialogUser || !reason.trim()) return;
    const userId = banDialogUser.id;
    log.debug({ userId }, 'useBanUser confirmBan started');
    setProcessing(true);
    try {
      await adminApi.banUser(banDialogUser.id, reason);
      onSuccess(banDialogUser.id, true);
      setBanDialogUser(null);
      setReason('');
      setError(null);
      setProcessing(false);
      log.debug({ userId }, 'useBanUser confirmBan completed');
    } catch (err) {
      setError((err as { message?: string })?.message || 'Failed to ban user.');
      setProcessing(false);
      log.error({ err, userId }, 'useBanUser confirmBan failed');
    }
  }, [banDialogUser, reason, onSuccess]);

  const unban = useCallback(
    async (userId: string) => {
      log.debug({ userId }, 'useBanUser unban started');
      try {
        await adminApi.unbanUser(userId);
        onSuccess(userId, false);
        setError(null);
        log.debug({ userId }, 'useBanUser unban completed');
      } catch (err) {
        setError((err as { message?: string })?.message || 'Failed to unban user.');
        log.error({ err, userId }, 'useBanUser unban failed');
      }
    },
    [onSuccess],
  );

  return {
    banDialogUser,
    reason,
    processing,
    error,
    openBanDialog,
    setReason,
    confirmBan,
    unban,
    clearError,
    closeDialog,
  };
}
