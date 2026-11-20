import { type FormEvent, useEffect, useState } from 'react';
import { Link, useFetcher, useSearchParams } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { Field } from '../../components/form/Field.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { failureToError } from '../../routes/action-result.ts';
import { getApiErrorMessage } from '../../utils/apiErrorMessage.ts';
import type { action } from './ResetPasswordPage.data.ts';

const log = createLogger('ResetPasswordPage');

/**
 * Password-reset form using the `?token=` from the email link. Matching passwords are checked
 * locally; the reset is submitted to the `/reset-password` route action
 * (`ResetPasswordPage.data.ts`) through a fetcher, and a success state with a login link is
 * shown once the password is changed.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const fetcher = useFetcher<typeof action>();
  const loading = fetcher.state !== 'idle';
  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const success = result?.ok === true;
  const error =
    localError ||
    (result && !result.ok
      ? getApiErrorMessage(failureToError(result), t, 'auth.resetPassword.error.failed')
      : '');

  useEffect(() => {
    log.debug({}, 'ResetPasswordPage mounted');
    return () => {
      log.debug({}, 'ResetPasswordPage unmounted');
    };
  }, []);

  /** Validates the form locally, then submits the token and new password to the route action. */
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError('');

    if (newPassword !== confirmPassword) {
      setLocalError(t('auth.register.passwordsMismatch'));
      return;
    }

    if (!token) {
      setLocalError(t('auth.resetPassword.error.invalidToken'));
      return;
    }

    fetcher.submit({ token, newPassword }, { method: 'post' });
  }

  if (success) {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('auth.resetPassword.success')}
        </h1>
        <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
          {t('auth.resetPassword.successDesc')}
        </p>
        <Link to="/login" className="btn-primary mt-6 inline-block">
          {t('auth.login.title')}
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('auth.resetPassword.invalidLink')}
        </h1>
        <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
          {t('auth.resetPassword.invalidLinkDesc')}
        </p>
        <Link to="/forgot-password" className="btn-primary mt-6 inline-block">
          {t('auth.resetPassword.requestNew')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {t('auth.resetPassword.title')}
      </h1>
      {error && <ErrorState message={error} className="mt-4" />}
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Field label={t('auth.resetPassword.newPassword')} htmlFor="newPassword">
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('auth.password.placeholder')}
            className="input-field"
            required
            minLength={8}
          />
        </Field>
        <Field label={t('auth.resetPassword.confirmNew')} htmlFor="confirmPassword">
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('auth.resetPassword.confirmNew.placeholder')}
            className="input-field"
            required
          />
        </Field>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? t('auth.resetPassword.resetting') : t('auth.resetPassword.reset')}
        </button>
      </form>
    </div>
  );
}
