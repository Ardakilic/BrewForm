import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { authApi } from '../api/index.ts';
import { useTranslation } from '../contexts/I18nContext.tsx';

/**
 * Banner prompting unverified users to verify their email, with a
 * resend button. Renders nothing when logged out or already verified.
 */
export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerifiedAt) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await authApi.sendVerification();
      setSent(true);
    } catch {
      // Silently fail -- user can try again
    } finally {
      setSending(false);
    }
  };

  return (
    <div className='btn-primary flex w-full justify-center gap-2 rounded-none text-sm'>
      <span>{t('emailVerification.banner')}</span>
      <button
        type='button'
        onClick={handleResend}
        disabled={sending || sent}
        className='underline font-medium'
      >
        {sent
          ? t('emailVerification.sent')
          : sending
          ? t('emailVerification.sending')
          : t('emailVerification.resend')}
      </button>
    </div>
  );
}
