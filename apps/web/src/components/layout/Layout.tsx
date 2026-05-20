import { Outlet } from 'react-router';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { CookieConsent } from '../CookieConsent';
import { EmailVerificationBanner } from '../EmailVerificationBanner';

export function Layout() {
  return (
    <div className='flex min-h-screen flex-col'>
      <EmailVerificationBanner />
      <Navbar />
      <main className='flex-1'>
        <Outlet />
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}
