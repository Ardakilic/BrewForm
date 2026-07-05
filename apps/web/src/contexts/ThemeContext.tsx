import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { createLogger } from '@/utils/logger.ts';

type Theme = 'light' | 'dark' | 'coffee';

const log = createLogger('ThemeContext');

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

/**
 * Owns the active theme (light/dark/coffee), initialised from
 * localStorage or the OS colour scheme, and mirrors it onto the root
 * element's class name.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('brewform_theme') as Theme | null;
    if (stored && ['light', 'dark', 'coffee'].includes(stored)) return stored;
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('brewform_theme', theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    log.debug({ theme: newTheme }, 'ThemeContext theme changed');
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Accesses the theme context; throws when used outside {@link ThemeProvider}. */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
