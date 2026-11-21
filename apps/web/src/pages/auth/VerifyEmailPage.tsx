import { useEffect, useRef } from 'react';
import { Link, useLoaderData } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { failureToError } from '../../routes/action-result.ts';
import { getApiErrorMessage, isRateLimitedError } from '../../utils/apiErrorMessage.ts';
import type { loader } from './VerifyEmailPage.data.ts';

const log = createLogger('VerifyEmailPage');

/**
 * Shown while the `/verify-email` loader verifies the token on a first page load (the route's
 * hydrate fallback).
 */
export function VerifyEmailPending() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p style={{ color: 'var(--text-secondary)' }}>{t('verifyEmail.verifying')}</p>
    </div>
  );
}

/**
 * Renders the outcome of the `/verify-email` loader, which verifies `?token=` once
 * (`VerifyEmailPage.data.ts`). On success it refreshes the auth user once; on failure it shows
 * the localised error (a rate limit gets the "try again in N seconds" message).
 */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const result = useLoaderData<typeof loader>();
  const refreshed = useRef(false);
  const status = result.status;

  useEffect(() => {
    log.debug({}, 'VerifyEmailPage mounted');
    return () => {
      log.debug({}, 'VerifyEmailPage unmounted');
    };
  }, []);

  // Pick up the now-verified email flag once (StrictMode re-runs effects; the ref guards it).
  useEffect(() => {
    if (status !== 'success' || refreshed.current) return;
    refreshed.current = true;
    void refreshUser();
  }, [status, refreshUser]);

  let errorMessage = '';
  if (result.status === 'error') {
    if (result.reason === 'no-token') {
      errorMessage = t('verifyEmail.noToken');
    } else {
      // A rate limit gets the localised "try again in N seconds"; any other failure keeps the
      // generic localised message.
      const err = failureToError(result.failure);
      errorMessage = isRateLimitedError(err)
        ? getApiErrorMessage(err, t, 'verifyEmail.failed')
        : t('verifyEmail.failed');
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      {status === 'success' && (
        <>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
            {t('verifyEmail.successTitle')}
          </h1>
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
            {t('verifyEmail.successMessage')}
          </p>
          <Link to="/" className="btn-primary mt-6">
            {t('common.goHome')}
          </Link>
        </>
      )}
      {status === 'error' && (
        <>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
            {t('verifyEmail.errorTitle')}
          </h1>
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
            {errorMessage}
          </p>
          <Link to="/" className="btn-primary mt-6">
            {t('common.goHome')}
          </Link>
        </>
      )}
    </div>
  );
}
