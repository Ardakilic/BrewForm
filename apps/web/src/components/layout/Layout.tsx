import { Outlet } from 'react-router';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { CookieConsent } from '../CookieConsent';

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}