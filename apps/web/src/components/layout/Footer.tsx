import { Link } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext';
import { LanguageSelector } from './LanguageSelector';

export function Footer() {
  const { locale, setLocale, t, availableLocales } = useTranslation();

  return (
    <footer className='bg-[color:var(--bg-secondary)] border-t border-[color:var(--border-primary)]'>
      <div className='mx-auto max-w-6xl px-6 py-8'>
        <div className='grid grid-cols-1 gap-8 md:grid-cols-3'>
          <div>
            <h3 className='text-lg font-bold text-[color:var(--accent-primary)]'>
              ☕ {t('app.name')}
            </h3>
            <p className='mt-2 text-sm text-[color:var(--text-secondary)]'>
              {t('footer.tagline')}
            </p>
          </div>
          <div>
            <h4 className='font-semibold text-[color:var(--text-primary)]'>{t('footer.explore')}</h4>
            <div className='mt-2 flex flex-col gap-1'>
              <Link to='/recipes' className='text-sm text-[color:var(--text-secondary)]'>
                {t('nav.recipes')}
              </Link>
              <Link
                to='/recipes?sort=popular'
                className='text-sm text-[color:var(--text-secondary)]'
              >
                {t('footer.popular')}
              </Link>
              <Link
                to='/taste-notes'
                className='text-sm text-[color:var(--text-secondary)]'
              >
                {t('taste.reference')}
              </Link>
            </div>
          </div>
          <div>
            <h4 className='font-semibold text-[color:var(--text-primary)]'>{t('footer.legal')}</h4>
            <div className='mt-2 flex flex-col gap-1'>
              <Link to='/privacy' className='text-sm text-[color:var(--text-secondary)]'>
                {t('footer.privacy')}
              </Link>
              <Link to='/terms' className='text-sm text-[color:var(--text-secondary)]'>
                {t('footer.terms')}
              </Link>
            </div>
            {availableLocales.length > 0 && (
              <div className='mt-2'>
                <label htmlFor='language-switcher' className='text-xs text-[color:var(--text-secondary)]'>
                  {t('preferences.locale')}
                </label>
                <div className='mt-1'>
                  <LanguageSelector
                    locale={locale}
                    setLocale={setLocale}
                    availableLocales={availableLocales}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className='mt-6 border-t border-[color:var(--border-primary)] pt-4 text-center text-xs text-[color:var(--text-tertiary)]'>
          &copy; {new Date().getFullYear()} {t('app.name')}. {t('footer.copyright')}
        </div>
      </div>
    </footer>
  );
}
