import { type FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { authApi } from '../../api/index.ts';
import { createLogger } from '@/utils/logger.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { Field } from '../../components/form/Field.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';

const log = createLogger('ResetPasswordPage');

/**
 * Password-reset form using the `?token=` from the email link; shows a
 * success state with a login link once the password is changed.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    log.debug({}, 'ResetPasswordPage mounted');
    return () => {
      log.debug({}, 'ResetPasswordPage unmounted');
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError(t('auth.register.passwordsMismatch'));
      return;
    }

    if (!token) {
      setError(t('auth.resetPassword.error.invalidToken'));
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword });
      setSuccess(true);
    } catch (err: unknown) {
      log.error({ err }, 'ResetPasswordPage resetPassword failed');
      const message = err instanceof Error ? err.message : t('auth.resetPassword.error.failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className='mx-auto max-w-md px-6 py-12'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('auth.resetPassword.success')}
        </h1>
        <p className='mt-4' style={{ color: 'var(--text-secondary)' }}>
          {t('auth.resetPassword.successDesc')}
        </p>
        <Link to='/login' className='btn-primary mt-6 inline-block'>
          {t('auth.login.title')}
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className='mx-auto max-w-md px-6 py-12'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('auth.resetPassword.invalidLink')}
        </h1>
        <p className='mt-4' style={{ color: 'var(--text-secondary)' }}>
          {t('auth.resetPassword.invalidLinkDesc')}
        </p>
        <Link to='/forgot-password' className='btn-primary mt-6 inline-block'>
          {t('auth.resetPassword.requestNew')}
        </Link>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-md px-6 py-12'>
      <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('auth.resetPassword.title')}
      </h1>
      {error && <ErrorState message={error} className='mt-4' />}
      <form onSubmit={handleSubmit} className='mt-6 flex flex-col gap-4'>
        <Field label={t('auth.resetPassword.newPassword')} htmlFor='newPassword'>
          <input
            id='newPassword'
            type='password'
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('auth.password.placeholder')}
            className='input-field'
            required
            minLength={8}
          />
        </Field>
        <Field label={t('auth.resetPassword.confirmNew')} htmlFor='confirmPassword'>
          <input
            id='confirmPassword'
            type='password'
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('auth.resetPassword.confirmNew.placeholder')}
            className='input-field'
            required
          />
        </Field>
        <button type='submit' className='btn-primary' disabled={loading}>
          {loading ? t('auth.resetPassword.resetting') : t('auth.resetPassword.reset')}
        </button>
      </form>
    </div>
  );
}
