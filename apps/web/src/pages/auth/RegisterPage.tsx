import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { authApi } from '../../api/index.ts';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [statusLoading, setStatusLoading] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const { enabled } = await authApi.registrationStatus();
        setRegistrationEnabled(enabled);
      } catch {
        setRegistrationEnabled(true);
      } finally {
        setStatusLoading(false);
      }
    }
    checkStatus();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length > 128) {
      setError(t('password.tooLong'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.register.passwordsMismatch'));
      return;
    }

    setLoading(true);
    try {
      await register({ email, username, password, displayName: displayName || undefined });
      navigate('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (statusLoading) {
    return (
      <div className='mx-auto max-w-md px-6 py-12 text-center'>
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  if (!registrationEnabled) {
    return (
      <div className='mx-auto max-w-md px-6 py-12'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('auth.register.title')}
        </h1>
        <div
          className='mt-6 rounded p-6'
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <p className='text-base' style={{ color: 'var(--text-primary)' }}>
            {t('auth.register.registrationClosed')}
          </p>
          <p className='mt-3 text-sm' style={{ color: 'var(--text-secondary)' }}>
            {t('auth.register.hasAccount')}{' '}
            <Link to='/login' style={{ color: 'var(--accent-primary)' }}>
              {t('auth.register.logIn')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-md px-6 py-12'>
      <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('auth.register.title')}
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
        <div>
          <label
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.username')}
          </label>
          <input
            type='text'
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder='coffee_lover'
            className='input-field'
            required
          />
        </div>
        <div>
          <label
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.register.displayName')}{' '}
            <span style={{ color: 'var(--text-tertiary)' }}>({t('common.optional')})</span>
          </label>
          <input
            type='text'
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder='Coffee Lover'
            className='input-field'
          />
        </div>
        <div>
          <label
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.password')}
          </label>
          <input
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder='At least 8 characters'
            className='input-field'
            required
            minLength={8}
            maxLength={128}
          />
          {password.length > 0 && (
            <ul className='mt-1 text-xs space-y-0.5' style={{ color: 'var(--text-tertiary)' }}>
              <li
                style={{
                  color: password.length >= 8 && password.length <= 128
                    ? 'var(--success)'
                    : 'var(--text-tertiary)',
                }}
              >
                {password.length >= 8 && password.length <= 128 ? '\u2713' : '\u25CB'}{' '}
                {t('password.requiresLength')}
              </li>
              <li
                style={{
                  color: /[a-z]/.test(password) ? 'var(--success)' : 'var(--text-tertiary)',
                }}
              >
                {/[a-z]/.test(password) ? '\u2713' : '\u25CB'} {t('password.requiresLowercase')}
              </li>
              <li
                style={{
                  color: /[A-Z]/.test(password) ? 'var(--success)' : 'var(--text-tertiary)',
                }}
              >
                {/[A-Z]/.test(password) ? '\u2713' : '\u25CB'} {t('password.requiresUppercase')}
              </li>
              <li
                style={{
                  color: /[0-9]/.test(password) ? 'var(--success)' : 'var(--text-tertiary)',
                }}
              >
                {/[0-9]/.test(password) ? '\u2713' : '\u25CB'} {t('password.requiresDigit')}
              </li>
              <li
                style={{
                  color: /[^a-zA-Z0-9]/.test(password) ? 'var(--success)' : 'var(--text-tertiary)',
                }}
              >
                {/[^a-zA-Z0-9]/.test(password) ? '\u2713' : '\u25CB'}{' '}
                {t('password.requiresSpecial')}
              </li>
            </ul>
          )}
        </div>
        <div>
          <label
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.confirmPassword')}
          </label>
          <input
            type='password'
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder='Re-enter your password'
            className='input-field'
            required
          />
        </div>
        <button type='submit' className='btn-primary' disabled={loading}>
          {loading ? t('auth.register.creating') : t('nav.register')}
        </button>
      </form>
      <p className='mt-4 text-sm' style={{ color: 'var(--text-secondary)' }}>
        {t('auth.register.hasAccount')}{' '}
        <Link to='/login' style={{ color: 'var(--accent-primary)' }}>
          {t('auth.register.logIn')}
        </Link>
      </p>
    </div>
  );
}
