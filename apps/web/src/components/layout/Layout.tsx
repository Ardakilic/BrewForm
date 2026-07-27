import { Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { Navbar } from './Navbar.tsx';
import { Footer } from './Footer.tsx';
import { CookieConsent } from '../CookieConsent.tsx';
import { EmailVerificationBanner } from '../EmailVerificationBanner.tsx';
import { SessionRestoreBanner } from '../SessionRestoreBanner.tsx';
import { PageSkeleton } from '../ui/Skeleton.tsx';
import { ToastProvider } from '../ui/Toast.tsx';
import { ConfirmProvider } from '../ui/Modal.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';

/**
 * App shell for routed pages: skip link, verification banner, navbar,
 * suspenseful `<Outlet />` main area, footer, and cookie consent, with
 * scroll restoration. Toast and confirm-dialog providers are mounted here
 * so all routed pages can use `useToast()` and `useConfirm()`.
 */
export function Layout() {
  const { t } = useTranslation();

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className='flex min-h-screen flex-col'>
          <ScrollRestoration />
          <a
            href='#main-content'
            className='btn-primary sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:text-sm focus:shadow-lg'
          >
            {t('a11y.skipToContent')}
          </a>
          <EmailVerificationBanner />
          <SessionRestoreBanner />
          <Navbar />
          <main id='main-content' className='flex-1' tabIndex={-1}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
          <Footer />
          <CookieConsent />
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
