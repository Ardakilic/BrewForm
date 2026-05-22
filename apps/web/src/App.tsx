import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './contexts/I18nContext';
import { router } from './router';
import { PageSkeleton } from './components/ui/Skeleton';

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
