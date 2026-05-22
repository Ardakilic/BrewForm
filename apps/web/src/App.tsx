import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { I18nProvider } from './contexts/I18nContext.tsx';
import { router } from './router.tsx';
import { PageSkeleton } from './components/ui/Skeleton.tsx';

export default function App() {
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
