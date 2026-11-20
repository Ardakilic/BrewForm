import { type ReactNode, useEffect } from 'react';
import { createLogger } from '@/utils/logger.ts';
import { ConfirmProvider } from './components/ui/Modal.tsx';
import { ToastProvider } from './components/ui/Toast.tsx';
import { AuthContext, type AuthContextType, AuthProvider } from './contexts/AuthContext.tsx';
import { I18nProvider } from './contexts/I18nContext.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';

const log = createLogger('AppProviders');

/** Props accepted by {@link AppProviders}. */
export interface AppProvidersProps {
  children: ReactNode;
  /**
   * Fixed auth state rendered instead of the session-restoring {@link AuthProvider}.
   * Only test harnesses pass it (`test-utils/render.tsx`); the app omits it.
   */
  auth?: AuthContextType;
}

/**
 * The single app-wide provider stack, rendered once around `RouterProvider` in `App.tsx`:
 * `ThemeProvider` → `I18nProvider` → `ToastProvider` → `ConfirmProvider` → `AuthProvider`.
 * Mounting the toast and confirm providers here (not in a layout) makes `useToast()` and
 * `useConfirm()` available on every route tree, including `/admin`. Tests render the same
 * component through `renderWithAppProviders`.
 */
export function AppProviders({ children, auth }: AppProvidersProps) {
  useEffect(() => {
    log.debug({}, 'AppProviders mounted');
    return () => {
      log.debug({}, 'AppProviders unmounted');
    };
  }, []);

  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <ConfirmProvider>
            {auth ? (
              <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
            ) : (
              <AuthProvider>{children}</AuthProvider>
            )}
          </ConfirmProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
