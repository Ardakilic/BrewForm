import { Suspense } from 'react';
import { RouterProvider } from 'react-router/dom';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { I18nProvider } from './contexts/I18nContext.tsx';
import { router } from './router.tsx';
import { PageSkeleton } from './components/ui/Skeleton.tsx';
import { useStaticCacheSync } from './hooks/useStaticCacheSync.ts';

/**
 * Application root: stacks the theme/i18n/auth providers around the
 * router and keeps the static-data cache in sync across tabs.
 */
export default function App() {
  useStaticCacheSync();

  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <Suspense fallback={<PageSkeleton />}>
            <RouterProvider router={router} />
          </Suspense>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
