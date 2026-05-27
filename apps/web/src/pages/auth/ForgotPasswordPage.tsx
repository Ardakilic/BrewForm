import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { authApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword({ email });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send reset email';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className='mx-auto max-w-md px-6 py-12'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('auth.forgotPassword.checkEmail')}
        </h1>
        <p className='mt-4' style={{ color: 'var(--text-secondary)' }}>
          {t('auth.forgotPassword.checkEmailDesc')}
        </p>
        <Link to='/login' className='btn-secondary mt-6 inline-block'>
          {t('auth.forgotPassword.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-md px-6 py-12'>
      <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('auth.forgotPassword.title')}
      </h1>
      <p className='mt-2 text-sm' style={{ color: 'var(--text-secondary)' }}>
        {t('auth.forgotPassword.desc')}
      </p>
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
            {t('auth.email')}
          </label>
          <input
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='you@example.com'
            className='input-field'
            required
          />
        </div>
        <button type='submit' className='btn-primary' disabled={loading}>
          {loading ? t('auth.forgotPassword.sending') : t('auth.forgotPassword.sendLink')}
        </button>
      </form>
      <p className='mt-4 text-sm' style={{ color: 'var(--text-secondary)' }}>
        {t('auth.forgotPassword.rememberPassword')}{' '}
        <Link to='/login' style={{ color: 'var(--accent-primary)' }}>
          {t('auth.login.title')}
        </Link>
      </p>
    </div>
  );
}
