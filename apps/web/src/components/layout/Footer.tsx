import { Link } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext';

export function Footer() {
  const { locale, setLocale, t, availableLocales } = useTranslation();

  return (
    <footer
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-primary)',
      }}
    >
      <div className='mx-auto max-w-6xl px-6 py-8'>
        <div className='grid grid-cols-1 gap-8 md:grid-cols-3'>
          <div>
            <h3 className='text-lg font-bold' style={{ color: 'var(--accent-primary)' }}>
              ☕ {t('app.name')}
            </h3>
            <p className='mt-2 text-sm' style={{ color: 'var(--text-secondary)' }}>
              {t('footer.tagline')}
            </p>
          </div>
          <div>
            <h4 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{t('footer.explore')}</h4>
            <div className='mt-2 flex flex-col gap-1'>
              <Link to='/recipes' className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                {t('nav.recipes')}
              </Link>
              <Link
                to='/recipes?sort=popular'
                className='text-sm'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('footer.popular')}
              </Link>
              <Link
                to='/taste-notes'
                className='text-sm'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('taste.reference')}
              </Link>
            </div>
          </div>
          <div>
            <h4 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{t('footer.legal')}</h4>
            <div className='mt-2 flex flex-col gap-1'>
              <Link to='/privacy' className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                {t('footer.privacy')}
              </Link>
              <Link to='/terms' className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                {t('footer.terms')}
              </Link>
            </div>
            {availableLocales.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <label
                  htmlFor='language-switcher'
                  className='text-xs'
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('preferences.locale')}
                </label>
                <select
                  id='language-switcher'
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as 'en' | 'tr')}
                  className='mt-1 text-sm'
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    width: '100%',
                    borderRadius: '4px',
                    padding: '2px 4px',
                  }}
                >
                  {availableLocales.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div
          className='mt-6 border-t pt-4 text-center text-xs'
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}
        >
          &copy; {new Date().getFullYear()} {t('app.name')}. {t('footer.copyright')}
        </div>
      </div>
    </footer>
  );
}
