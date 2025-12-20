/**
 * BrewForm Forgot Password Page
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { FormControl } from 'baseui/form-control';
import { Input } from 'baseui/input';
import { Button } from 'baseui/button';
import { HeadingMedium, ParagraphMedium, ParagraphSmall } from 'baseui/typography';
import { Notification, KIND } from 'baseui/notification';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { api } from '../../utils/api';

function ForgotPasswordPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Forgot Password - BrewForm</title>
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
            Root: { style: { width: '400px', maxWidth: '100%' } },
          }}
        >
          <HeadingMedium marginBottom="8px">
            {t('auth.forgotPassword.title')}
          </HeadingMedium>
          <ParagraphMedium
            color={theme.colors.contentSecondary}
            marginBottom="24px"
          >
            {t('auth.forgotPassword.subtitle')}
          </ParagraphMedium>

          {success ? (
            <Notification kind={KIND.positive}>
              If an account exists with this email, a reset link has been sent.
            </Notification>
          ) : (
            <>
              {error && (
                <Notification kind={KIND.negative} closeable={false}>
                  {error}
                </Notification>
              )}

              <form onSubmit={handleSubmit}>
                <FormControl label={t('auth.forgotPassword.email')}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    required
                  />
                </FormControl>

                <Button
                  type="submit"
                  isLoading={isLoading}
                  overrides={{ BaseButton: { style: { width: '100%' } } }}
                >
                  {t('auth.forgotPassword.submit')}
                </Button>
              </form>
            </>
          )}

          <ParagraphSmall className={css({ textAlign: 'center', marginTop: '24px' })}>
            <Link to="/login" className={css({ color: '#6F4E37' })}>
              {t('auth.forgotPassword.backToLogin')}
            </Link>
          </ParagraphSmall>
        </Card>
      </div>
    </>
  );
}

export default ForgotPasswordPage;
