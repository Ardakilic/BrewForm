import { type FormEvent, useEffect, useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { Field } from '../../components/form/Field.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { failureToError } from '../../routes/action-result.ts';
import { getApiErrorMessage } from '../../utils/apiErrorMessage.ts';
import type { action } from './ForgotPasswordPage.data.ts';

const log = createLogger('ForgotPasswordPage');

/**
 * Forgot-password form: submits the email to the `/forgot-password` route action
 * (`ForgotPasswordPage.data.ts`) through a fetcher and swaps to a "check your email"
 * confirmation on success.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const loading = fetcher.state !== 'idle';
  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const success = result?.ok === true;
  const error =
    result && !result.ok
      ? getApiErrorMessage(failureToError(result), t, 'auth.forgotPassword.error.failed')
      : '';

  useEffect(() => {
    log.debug({}, 'ForgotPasswordPage mounted');
    return () => {
      log.debug({}, 'ForgotPasswordPage unmounted');
    };
  }, []);

  /** Submits the email to the route action. */
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    fetcher.submit({ email }, { method: 'post' });
  }

  if (success) {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('auth.forgotPassword.checkEmail')}
        </h1>
        <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
          {t('auth.forgotPassword.checkEmailDesc')}
        </p>
        <Link to="/login" className="btn-secondary mt-6 inline-block">
          {t('auth.forgotPassword.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {t('auth.forgotPassword.title')}
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {t('auth.forgotPassword.desc')}
      </p>
      {error && <ErrorState message={error} className="mt-4" />}
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Field label={t('auth.email')} htmlFor="email">
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-field"
            required
          />
        </Field>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? t('auth.forgotPassword.sending') : t('auth.forgotPassword.sendLink')}
        </button>
      </form>
      <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {t('auth.forgotPassword.rememberPassword')}{' '}
        <Link to="/login" style={{ color: 'var(--accent-primary)' }}>
          {t('auth.login.title')}
        </Link>
      </p>
    </div>
  );
}
