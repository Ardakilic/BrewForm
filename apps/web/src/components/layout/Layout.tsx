import { Outlet } from 'react-router';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { CookieConsent } from '../CookieConsent';
import { EmailVerificationBanner } from '../EmailVerificationBanner';
import { useTranslation } from '../../contexts/I18nContext.tsx';

export function Layout() {
  const { t } = useTranslation();

  return (
    <div className='flex min-h-screen flex-col'>
      <a
        href='#main-content'
        className='sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg'
        style={{
          backgroundColor: 'var(--accent-primary)',
          color: 'var(--bg-primary)',
        }}
      >
        {t('a11y.skipToContent')}
      </a>
      <EmailVerificationBanner />
      <Navbar />
      <main id='main-content' className='flex-1' tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}
