import { useFetcher } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { failureToError } from '../routes/action-result.ts';
import { SEND_VERIFICATION_PATH, type sendVerificationAction } from '../routes/resources/auth.ts';
import { getApiErrorMessage, isRateLimitedError } from '../utils/apiErrorMessage.ts';

/**
 * Banner prompting unverified users to verify their email, with a resend button that submits
 * to the `resources/auth/send-verification` resource-route action through a fetcher (no page
 * revalidation). Renders nothing when logged out or already verified. A rate-limited resend
 * shows the localised "try again in N seconds" message and an expired session (`UNAUTHORIZED`,
 * the resource route never redirects) shows `error.unauthorized`; other failures stay silent
 * (the user can try again).
 */
export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof sendVerificationAction>();

  if (!user || user.emailVerifiedAt) return null;

  const sending = fetcher.state !== 'idle';
  const result = sending ? undefined : fetcher.data;
  const sent = result?.ok === true;
  let error = '';
  if (result && !result.ok) {
    // Other failures stay silent -- the user can try again.
    const err = failureToError(result);
    if (isRateLimitedError(err)) error = getApiErrorMessage(err, t, 'emailVerification.resend');
    else if (result.code === 'UNAUTHORIZED') error = t('error.unauthorized');
  }

  /** Submits the resend request to the resource route. */
  const handleResend = () => {
    fetcher.submit(
      {},
      { method: 'post', action: SEND_VERIFICATION_PATH, defaultShouldRevalidate: false },
    );
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
