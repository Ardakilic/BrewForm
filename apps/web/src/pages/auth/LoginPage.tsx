import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../contexts/I18nContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, rememberMe);
      navigate('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth.login.title');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='mx-auto max-w-md px-6 py-12'>
      <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('auth.login.title')}
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
            htmlFor='email'
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.email')}
          </label>
          <input
            id='email'
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
            htmlFor='password'
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.password')}
          </label>
          <input
            id='password'
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder='Enter your password'
            className='input-field'
            required
          />
        </div>
        <div className='flex items-center gap-2'>
          <input
            type='checkbox'
            id='rememberMe'
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className='h-4 w-4 cursor-pointer'
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          <label
            htmlFor='rememberMe'
            className='text-sm cursor-pointer select-none'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.login.rememberMe')}
          </label>
        </div>
        <button type='submit' className='btn-primary' disabled={loading}>
          {loading ? t('auth.login.loggingIn') : t('auth.login.title')}
        </button>
      </form>
      <p className='mt-4 text-sm' style={{ color: 'var(--text-secondary)' }}>
        <Link to='/forgot-password' style={{ color: 'var(--accent-primary)' }}>
          {t('auth.login.forgotPassword')}
        </Link>
      </p>
      <p className='mt-2 text-sm' style={{ color: 'var(--text-secondary)' }}>
        {t('auth.login.noAccount')}{' '}
        <Link to='/register' style={{ color: 'var(--accent-primary)' }}>
          {t('auth.login.signUp')}
        </Link>
      </p>
    </div>
  );
}
