import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { authApi } from '../../api/index.ts';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('No verification token provided.');
      return;
    }

    authApi
      .verifyEmail({ token })
      .then(async () => {
        await refreshUser();
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err.message || 'Verification failed.');
      });
  }, [token, refreshUser]);

  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center px-6 text-center'>
      {status === 'loading' && (
        <p style={{ color: 'var(--text-secondary)' }}>Verifying your email...</p>
      )}
      {status === 'success' && (
        <>
          <h1 className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
            Email Verified!
          </h1>
          <p className='mt-4' style={{ color: 'var(--text-secondary)' }}>
            Your email has been verified. You now have full access to all features.
          </p>
          <Link to='/' className='btn-primary mt-6'>
            Go Home
          </Link>
        </>
      )}
      {status === 'error' && (
        <>
          <h1 className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
            Verification Failed
          </h1>
          <p className='mt-4' style={{ color: 'var(--text-secondary)' }}>
            {errorMessage}
          </p>
          <Link to='/' className='btn-primary mt-6'>
            Go Home
          </Link>
        </>
      )}
    </div>
  );
}
