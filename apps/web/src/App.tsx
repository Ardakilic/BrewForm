import { Suspense } from 'react';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from './AppProviders.tsx';
import { PageSkeleton } from './components/ui/Skeleton.tsx';
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
 * Application root: renders the browser router inside the shared {@link AppProviders}
 * stack and keeps the static-data cache in sync across tabs.
 */
export default function App() {
  useStaticCacheSync();

  return (
    <AppProviders>
      <Suspense fallback={<PageSkeleton />}>
        <RouterProvider router={getAppRouter()} />
      </Suspense>
    </AppProviders>
  );
}
