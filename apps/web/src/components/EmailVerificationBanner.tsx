import { useState } from 'react';
import { authApi } from '../api/index.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { getApiErrorMessage, isRateLimitedError } from '../utils/apiErrorMessage.ts';

/**
 * Banner prompting unverified users to verify their email, with a
 * resend button. Renders nothing when logged out or already verified.
 * A rate-limited resend shows the localised "try again in N seconds"
 * message; other failures stay silent (the user can try again).
 */
export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!user || user.emailVerifiedAt) return null;

  const handleResend = async () => {
    setSending(true);
    setError('');
    try {
      await authApi.sendVerification();
      setSent(true);
    } catch (err: unknown) {
      // Other failures stay silent -- the user can try again.
      if (isRateLimitedError(err)) setError(getApiErrorMessage(err, t, 'emailVerification.resend'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="btn-primary flex w-full justify-center gap-2 rounded-none text-sm">
      <span>{t('emailVerification.banner')}</span>
      <button
        type="button"
        onClick={handleResend}
        disabled={sending || sent}
        className="underline font-medium"
      >
        {sent
          ? t('emailVerification.sent')
          : sending
            ? t('emailVerification.sending')
            : t('emailVerification.resend')}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
