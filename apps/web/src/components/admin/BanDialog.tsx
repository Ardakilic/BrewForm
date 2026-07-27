import { useEffect, useState } from 'react';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { Field } from '../form/Field.tsx';
import { Modal } from '../ui/Modal.tsx';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('BanDialog');

/**
 * Props for the {@link BanDialog} component.
 */
interface BanDialogProps {
  /** The user targeted by the ban action. */
  user: { id: string; username: string; displayName: string | null };
  /** Whether the dialog is currently visible. */
  open: boolean;
  /** Called when the user requests to close the dialog without confirming. */
  onClose: () => void;
  /** Called with the entered reason when the user confirms the ban. */
  onConfirm: (reason: string) => void;
  /** When true, both buttons are disabled and the confirm button shows a "banning" label. */
  processing: boolean;
}

/**
 * Controlled modal dialog for confirming a ban action against a user. Owns the
 * reason textarea state internally and reports the entered reason via
 * `onConfirm`. The parent controls visibility (`open`) and the processing state.
 */
export function BanDialog({ user, open, onClose, onConfirm, processing }: BanDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    log.debug({ userId: user.id, open }, 'BanDialog render');
  }, [open]);

  // `reason` is locally owned by the dialog: reset it whenever the dialog
  // closes or the targeted user changes, so a stale reason never leaks
  // into the next ban.
  useEffect(() => {
    setReason('');
  }, [open, user.id]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={t('admin.users.banDialogTitle')}>
      <h3 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
        {`${t('admin.users.banDialogTitle')}: ${user.displayName || user.username}`}
      </h3>
      <Field label={t('admin.users.banReason')}>
        <textarea
          className='input-field'
          rows={3}
          placeholder={t('admin.users.banReasonPlaceholder')}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className='flex gap-2 justify-end'>
        <button
          type='button'
          onClick={onClose}
          className='btn-secondary'
          disabled={processing}
        >
          {t('common.cancel')}
        </button>
        <button
          type='button'
          onClick={() => onConfirm(reason)}
          disabled={processing || !reason.trim()}
          className='btn-primary'
          style={{ backgroundColor: 'var(--error)' }}
        >
          {processing ? t('admin.users.banning') : t('admin.users.confirmBan')}
        </button>
      </div>
    </Modal>
  );
}
