import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { authApi } from '../../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('VerifyEmailPage');

/**
 * Verifies the email token from `?token=` on mount, refreshes the auth
 * user, and renders loading/success/error states.
 */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    log.debug({}, 'VerifyEmailPage mounted');
    return () => {
      log.debug({}, 'VerifyEmailPage unmounted');
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage(t('verifyEmail.noToken'));
      return;
    }

    authApi
      .verifyEmail({ token })
      .then(async () => {
        await refreshUser();
        setStatus('success');
      })
      .catch((err) => {
        log.error({ err }, 'VerifyEmailPage verifyEmail failed');
        setStatus('error');
        setErrorMessage(t('verifyEmail.failed'));
      });
  }, [token, refreshUser]);

  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center px-6 text-center'>
      {status === 'loading' && (
        <p style={{ color: 'var(--text-secondary)' }}>{t('verifyEmail.verifying')}</p>
      )}
      {status === 'success' && (
        <>
          <h1 className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
            {t('verifyEmail.successTitle')}
          </h1>
          <p className='mt-4' style={{ color: 'var(--text-secondary)' }}>
            {t('verifyEmail.successMessage')}
          </p>
          <Link to='/' className='btn-primary mt-6'>
            {t('common.goHome')}
          </Link>
        </>
      )}
      {status === 'error' && (
        <>
          <h1 className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
            {t('verifyEmail.errorTitle')}
          </h1>
          <p className='mt-4' style={{ color: 'var(--text-secondary)' }}>
            {errorMessage}
          </p>
          <Link to='/' className='btn-primary mt-6'>
            {t('common.goHome')}
          </Link>
        </>
      )}
    </div>
  );
}
