import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { authApi } from '../../api/index.ts';
import { createLogger } from '@/utils/logger.ts';
import { Field } from '../../components/form/Field.tsx';
import { LoadingState } from '../../components/ui/LoadingState.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';

const log = createLogger('RegisterPage');

/**
 * Registration form with client-side password checks; hidden behind a
 * server-side registration-enabled flag. Navigates home on success.
 */
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
    log.debug({}, 'RegisterPage mounted');
    return () => {
      log.debug({}, 'RegisterPage unmounted');
    };
  }, []);

  useEffect(() => {
    async function checkStatus() {
      try {
        const { enabled } = await authApi.registrationStatus();
        setRegistrationEnabled(enabled);
      } catch (err: unknown) {
        log.error({ err }, 'RegisterPage registration status check failed');
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
      log.error({ err }, 'RegisterPage registration failed');
      const message = err instanceof Error ? err.message : t('auth.register.error.failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (statusLoading) {
    return <LoadingState className='mx-auto max-w-md px-6' />;
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
      {error && <ErrorState message={error} className='mt-4' />}
      <form onSubmit={handleSubmit} className='mt-6 flex flex-col gap-4'>
        <Field label={t('auth.email')} htmlFor='email'>
          {
            /*
            D40: 'you@example.com' (and 'coffee_lover' for username) are locale-neutral
            example values, not prose, so they are intentionally left untranslated.
          */
          }
          <input
            id='email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='you@example.com'
            className='input-field'
            required
          />
        </Field>
        <Field label={t('auth.username')} htmlFor='username'>
          <input
            id='username'
            type='text'
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder='coffee_lover'
            className='input-field'
            required
          />
        </Field>
        <Field
          label={
            <>
              {t('auth.register.displayName')}{' '}
              <span style={{ color: 'var(--text-tertiary)' }}>({t('common.optional')})</span>
            </>
          }
          htmlFor='displayName'
        >
          <input
            id='displayName'
            type='text'
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('auth.register.displayName.placeholder')}
            className='input-field'
          />
        </Field>
        <div>
          <Field label={t('auth.password')} htmlFor='password'>
            <input
              id='password'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.password.placeholder')}
              className='input-field'
              required
              minLength={8}
              maxLength={128}
            />
          </Field>
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
        <Field label={t('auth.confirmPassword')} htmlFor='confirmPassword'>
          <input
            id='confirmPassword'
            type='password'
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('auth.register.confirmPassword.placeholder')}
            className='input-field'
            required
          />
        </Field>
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
