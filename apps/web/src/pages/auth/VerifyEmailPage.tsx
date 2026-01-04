/**
 * BrewForm Verify Email Page
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { HeadingMedium, ParagraphMedium } from 'baseui/typography';
import { Button } from 'baseui/button';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { api } from '../../utils/api';
import LoadingSpinner from '../../components/LoadingSpinner';

function VerifyEmailPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (token) {
      api
        .post('/auth/verify-email', { token })
        .then((res) => {
          setStatus(res.success ? 'success' : 'error');
        })
        .catch(() => setStatus('error'));
    } else {
      setStatus('error');
    }
  }, [token]);

  return (
    <>
      <Helmet>
        <title>{t('pages.verifyEmail.title')}</title>
      </Helmet>

      <div
        className={css({
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        })}
      >
        <Card
          overrides={{
            Root: { style: { width: '400px', maxWidth: '100%', textAlign: 'center' } },
          }}
        >
          <HeadingMedium marginBottom="16px">
            {t('auth.verifyEmail.title')}
          </HeadingMedium>

          {status === 'loading' && (
            <>
              <LoadingSpinner />
              <ParagraphMedium color={theme.colors.contentSecondary}>
                {t('auth.verifyEmail.verifying')}
              </ParagraphMedium>
            </>
          )}

          {status === 'success' && (
            <>
              <div className={css({ fontSize: '48px', marginBottom: '16px' })}>✅</div>
              <ParagraphMedium color={theme.colors.contentSecondary} marginBottom="24px">
                {t('auth.verifyEmail.success')}
              </ParagraphMedium>
              <Link to="/login">
                <Button>Continue to Login</Button>
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className={css({ fontSize: '48px', marginBottom: '16px' })}>❌</div>
              <ParagraphMedium color={theme.colors.contentSecondary} marginBottom="24px">
                {t('auth.verifyEmail.error')}
              </ParagraphMedium>
              <Link to="/login">
                <Button>Back to Login</Button>
              </Link>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

export default VerifyEmailPage;
