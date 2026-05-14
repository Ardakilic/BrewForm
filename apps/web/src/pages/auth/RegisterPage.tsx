import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../contexts/I18nContext';

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

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
          />
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
