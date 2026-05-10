import { Link } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../contexts/I18nContext';

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <header
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-primary)',
      }}
    >
      <nav className='mx-auto flex max-w-6xl items-center justify-between px-6 py-3'>
        <Link to='/' className='text-xl font-bold' style={{ color: 'var(--accent-primary)' }}>
          ☕ {t('app.name')}
        </Link>

        <div className='flex items-center gap-4'>
          <Link to='/recipes' className='text-sm' style={{ color: 'var(--text-secondary)' }}>
            {t('nav.recipes')}
          </Link>

          {isAuthenticated && (
            <>
              <Link
                to='/recipes/new'
                className='text-sm'
                style={{ color: 'var(--accent-primary)' }}
              >
                {t('recipe.create')}
              </Link>
              <Link to='/setups' className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                {t('setup.title')}
              </Link>
              <Link
                to={`/u/${user?.username}`}
                className='text-sm'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('nav.profile')}
              </Link>
            </>
          )}

          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'coffee')}
            className='text-sm rounded'
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <option value='light'>{t('theme.light')}</option>
            <option value='dark'>{t('theme.dark')}</option>
            <option value='coffee'>{t('theme.coffee')}</option>
          </select>

          {isAuthenticated
            ? (
              <button type='button' onClick={logout} className='btn-secondary text-sm'>
                {t('nav.logout')}
              </button>
            )
            : (
              <>
                <Link to='/login' className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                  {t('nav.login')}
                </Link>
                <Link to='/register' className='btn-primary text-sm'>{t('nav.register')}</Link>
              </>
            )}
        </div>
      </nav>
    </header>
  );
}
