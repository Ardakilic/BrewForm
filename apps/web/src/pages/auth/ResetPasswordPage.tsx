import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { authApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError(t('auth.register.passwordsMismatch'));
      return;
    }

    if (!token) {
      setError('Invalid or missing reset token. Please use the link from your email.');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reset password';
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
      {error && (
        <div
          className='mt-4 rounded p-3 text-sm'
          style={{ backgroundColor: 'var(--error)', color: 'white' }}
        >
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className='mt-6 flex flex-col gap-4'>
        <div>
          <label
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.resetPassword.newPassword')}
          </label>
          <input
            type='password'
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder='At least 8 characters'
            className='input-field'
            required
            minLength={8}
          />
        </div>
        <div>
          <label
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.resetPassword.confirmNew')}
          </label>
          <input
            type='password'
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder='Re-enter your new password'
            className='input-field'
            required
          />
        </div>
        <button type='submit' className='btn-primary' disabled={loading}>
          {loading ? t('auth.resetPassword.resetting') : t('auth.resetPassword.reset')}
        </button>
      </form>
    </div>
  );
}
