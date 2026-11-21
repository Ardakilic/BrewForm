import { Suspense } from 'react';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from './AppProviders.tsx';
import { PageSkeleton } from './components/ui/Skeleton.tsx';
import { useAuthTabSync } from './hooks/useAuthTabSync.ts';
import { useStaticCacheSync } from './hooks/useStaticCacheSync.ts';
import { createAppRouter } from './router.tsx';

/** The browser router, created on first render (not on import) and reused afterwards. */
let appRouter: ReturnType<typeof createAppRouter> | null = null;

/**
 * Returns the app's single browser router, creating it on first call. A module-level
 * singleton (rather than `useState`) keeps it to one instance under React StrictMode, which
 * double-invokes state initialisers.
 */
function getAppRouter(): ReturnType<typeof createAppRouter> {
  appRouter ??= createAppRouter();
  return appRouter;
}

/**
 * Mirrors sign-ins and sign-outs made in other tabs (`useAuthTabSync` with the app router). It
 * renders nothing; it sits under the app providers (it needs the auth context) and outside the
 * router tree, so one mount also covers `/admin/*` and the root error screen.
 */
function AuthTabSync() {
  useAuthTabSync(getAppRouter());
  return null;
}

/**
 * Application root: renders the browser router inside the shared {@link AppProviders}
 * stack, keeps the static-data cache in sync across tabs and mirrors sign-ins and sign-outs
 * made in other tabs ({@link AuthTabSync}).
 */
export default function App() {
  useStaticCacheSync();

  return (
    <AppProviders>
      <AuthTabSync />
      <Suspense fallback={<PageSkeleton />}>
        <RouterProvider router={getAppRouter()} />
      </Suspense>
    </AppProviders>
  );
}
