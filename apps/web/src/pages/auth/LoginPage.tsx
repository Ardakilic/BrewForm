/**
 * BrewForm Login Page
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { FormControl } from 'baseui/form-control';
import { Input } from 'baseui/input';
import { Button } from 'baseui/button';
import { HeadingMedium, ParagraphMedium, ParagraphSmall } from 'baseui/typography';
import { Notification, KIND } from 'baseui/notification';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../../contexts/AuthContext';

function LoginPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const from = (location.state as { from?: Location })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Log In - BrewForm</title>
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
            Root: {
              style: {
                width: '400px',
                maxWidth: '100%',
              },
            },
          }}
        >
          <HeadingMedium marginBottom="8px">{t('auth.login.title')}</HeadingMedium>
          <ParagraphMedium
            color={theme.colors.contentSecondary}
            marginBottom="24px"
          >
            {t('auth.login.subtitle')}
          </ParagraphMedium>

          {error && (
            <Notification kind={KIND.negative} closeable={false}>
              {error}
            </Notification>
          )}

          <form onSubmit={handleSubmit}>
            <FormControl label={t('auth.login.email')}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
                autoComplete="email"
              />
            </FormControl>

            <FormControl label={t('auth.login.password')}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                autoComplete="current-password"
              />
            </FormControl>

            <Link
              to="/forgot-password"
              className={css({
                display: 'block',
                marginBottom: '16px',
                color: '#6F4E37',
                fontSize: '14px',
              })}
            >
              {t('auth.login.forgotPassword')}
            </Link>

            <Button
              type="submit"
              isLoading={isLoading}
              overrides={{
                BaseButton: {
                  style: { width: '100%' },
                },
              }}
            >
              {t('auth.login.submit')}
            </Button>
          </form>

          <ParagraphSmall
            className={css({
              textAlign: 'center',
              marginTop: '24px',
            })}
          >
            {t('auth.login.noAccount')}{' '}
            <Link
              to="/register"
              className={css({ color: '#6F4E37', fontWeight: 600 })}
            >
              {t('auth.login.signUp')}
            </Link>
          </ParagraphSmall>
        </Card>
      </div>
    </>
  );
}

export default LoginPage;
