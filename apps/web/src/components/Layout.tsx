/**
 * BrewForm Layout Component
 * Main layout with header, footer, and content area
 */

import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Button } from 'baseui/button';
import { Select } from 'baseui/select';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { supportedLanguages, changeLanguage } from '../i18n';

function Header() {
  const [css, theme] = useStyletron();
  const { t, i18n } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const languageOptions = supportedLanguages.map((lang) => ({
    id: lang.code,
    label: `${lang.flag} ${lang.name}`,
  }));

  const currentLanguage = languageOptions.find((l) => l.id === i18n.language) || languageOptions[0];

  return (
    <header
      className={css({
        backgroundColor: theme.colors.backgroundPrimary,
        borderBottom: `1px solid ${theme.colors.borderOpaque}`,
        padding: '16px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      })}
    >
      <div
        className={css({
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        })}
      >
        {/* Logo */}
        <Link to="/" className={css({ textDecoration: 'none' })}>
          <div
            className={css({
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            })}
          >
            <span
              className={css({
                fontSize: '24px',
                fontWeight: 700,
                color: '#6F4E37',
              })}
            >
              ☕ BrewForm
            </span>
          </div>
        </Link>

        {/* Navigation */}
        <nav
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
          })}
        >
          <Link
            to="/recipes"
            className={css({
              color: theme.colors.contentPrimary,
              textDecoration: 'none',
              ':hover': { color: '#6F4E37' },
            })}
          >
            {t('nav.recipes')}
          </Link>

          {/* Language Selector */}
          <div className={css({ width: '140px' })}>
            <Select
              options={languageOptions}
              value={[currentLanguage]}
              onChange={(params) => {
                if (params.value[0]) {
                  changeLanguage(params.value[0].id as string);
                }
              }}
              clearable={false}
              searchable={false}
              size="compact"
              overrides={{
                Root: { style: { width: '140px' } },
                ControlContainer: { style: { borderRadius: '8px' } },
              }}
            />
          </div>

          {isAuthenticated ? (
            <>
              <Link
                to="/recipes/new"
                className={css({
                  color: theme.colors.contentPrimary,
                  textDecoration: 'none',
                  ':hover': { color: '#6F4E37' },
                })}
              >
                {t('recipe.create')}
              </Link>
              <Link
                to="/profile"
                className={css({
                  color: theme.colors.contentPrimary,
                  textDecoration: 'none',
                  ':hover': { color: '#6F4E37' },
                })}
              >
                {t('nav.profile')}
              </Link>
              {user?.isAdmin && (
                <Link
                  to="/admin"
                  className={css({
                    color: theme.colors.contentPrimary,
                    textDecoration: 'none',
                    ':hover': { color: '#6F4E37' },
                  })}
                >
                  {t('nav.admin')}
                </Link>
              )}
              <Button size="compact" onClick={handleLogout}>
                {t('nav.logout')}
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button size="compact" kind="secondary">
                  {t('nav.login')}
                </Button>
              </Link>
              <Link to="/register">
                <Button size="compact">{t('nav.register')}</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer
      className={css({
        backgroundColor: theme.colors.backgroundSecondary,
        borderTop: `1px solid ${theme.colors.borderOpaque}`,
        padding: '32px 24px',
        marginTop: 'auto',
      })}
    >
      <div
        className={css({
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          textAlign: 'center',
        })}
      >
        <div
          className={css({
            display: 'flex',
            gap: '24px',
          })}
        >
          <Link
            to="/about"
            className={css({
              color: theme.colors.contentSecondary,
              textDecoration: 'none',
              ':hover': { color: '#6F4E37' },
            })}
          >
            {t('footer.links.about')}
          </Link>
          <Link
            to="/privacy"
            className={css({
              color: theme.colors.contentSecondary,
              textDecoration: 'none',
              ':hover': { color: '#6F4E37' },
            })}
          >
            {t('footer.links.privacy')}
          </Link>
          <Link
            to="/terms"
            className={css({
              color: theme.colors.contentSecondary,
              textDecoration: 'none',
              ':hover': { color: '#6F4E37' },
            })}
          >
            {t('footer.links.terms')}
          </Link>
        </div>
        <p
          className={css({
            color: theme.colors.contentTertiary,
            fontSize: '14px',
          })}
        >
          {t('footer.copyright', { year })}
        </p>
      </div>
    </footer>
  );
}

function Layout() {
  const [css] = useStyletron();

  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      })}
    >
      <Header />
      <main
        className={css({
          flex: 1,
          padding: '24px',
        })}
      >
        <div
          className={css({
            maxWidth: '1200px',
            margin: '0 auto',
          })}
        >
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default Layout;
