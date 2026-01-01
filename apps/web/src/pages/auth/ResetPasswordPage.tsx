/**
 * BrewForm Reset Password Page
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { FormControl } from 'baseui/form-control';
import { Input } from 'baseui/input';
import { Button } from 'baseui/button';
import { HeadingMedium, ParagraphMedium } from 'baseui/typography';
import { Notification, KIND } from 'baseui/notification';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { api } from '../../utils/api';

function ResetPasswordPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/auth/reset-password', { token, password });
      navigate('/login', { state: { message: 'Password reset successfully' } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Reset Password - BrewForm</title>
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
            {t('auth.resetPassword.title')}
          </HeadingMedium>
          <ParagraphMedium
            color={theme.colors.contentSecondary}
            marginBottom="24px"
          >
            {t('auth.resetPassword.subtitle')}
          </ParagraphMedium>

          {error && (
            <Notification kind={KIND.negative} closeable={false}>
              {error}
            </Notification>
          )}

          <form onSubmit={handleSubmit}>
            <FormControl label={t('auth.resetPassword.password')} caption="Minimum 8 characters">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
              />
            </FormControl>

            <FormControl label={t('auth.resetPassword.confirmPassword')}>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                required
              />
            </FormControl>

            <Button
              type="submit"
              isLoading={isLoading}
              overrides={{ BaseButton: { style: { width: '100%' } } }}
            >
              {t('auth.resetPassword.submit')}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

export default ResetPasswordPage;
