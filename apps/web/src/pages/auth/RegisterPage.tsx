/**
 * BrewForm Register Page
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

function RegisterPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [field]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      await register({
        email: formData.email,
        username: formData.username,
        password: formData.password,
        displayName: formData.displayName || undefined,
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t('pages.register.title')}</title>
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
          <HeadingMedium marginBottom="8px">{t('auth.register.title')}</HeadingMedium>
          <ParagraphMedium
            color={theme.colors.contentSecondary}
            marginBottom="24px"
          >
            {t('auth.register.subtitle')}
          </ParagraphMedium>

          {error && (
            <Notification kind={KIND.negative} closeable={false}>
              {error}
            </Notification>
          )}

          <form onSubmit={handleSubmit}>
            <FormControl label={t('auth.register.email')}>
              <Input
                type="email"
                value={formData.email}
                onChange={handleChange('email')}
                required
                autoComplete="email"
              />
            </FormControl>

            <FormControl label={t('auth.register.username')} caption="Lowercase letters, numbers, and underscores only">
              <Input
                value={formData.username}
                onChange={handleChange('username')}
                required
                autoComplete="username"
              />
            </FormControl>

            <FormControl label={t('auth.register.displayName')}>
              <Input
                value={formData.displayName}
                onChange={handleChange('displayName')}
                autoComplete="name"
              />
            </FormControl>

            <FormControl label={t('auth.register.password')} caption="Minimum 8 characters">
              <Input
                type="password"
                value={formData.password}
                onChange={handleChange('password')}
                required
                autoComplete="new-password"
              />
            </FormControl>

            <FormControl label={t('auth.register.confirmPassword')}>
              <Input
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange('confirmPassword')}
                required
                autoComplete="new-password"
              />
            </FormControl>

            <Button
              type="submit"
              isLoading={isLoading}
              overrides={{
                BaseButton: {
                  style: { width: '100%' },
                },
              }}
            >
              {t('auth.register.submit')}
            </Button>
          </form>

          <ParagraphSmall
            className={css({
              textAlign: 'center',
              marginTop: '24px',
            })}
          >
            {t('auth.register.hasAccount')}{' '}
            <Link
              to="/login"
              className={css({ color: '#6F4E37', fontWeight: 600 })}
            >
              {t('auth.register.signIn')}
            </Link>
          </ParagraphSmall>
        </Card>
      </div>
    </>
  );
}

export default RegisterPage;
