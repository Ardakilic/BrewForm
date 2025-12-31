/**
 * BrewForm Theme Context
 * Provides light, dark, and coffee themes with system detection
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { LightTheme, DarkTheme, createTheme } from 'baseui';

// ============================================
// Coffee Theme (Custom)
// ============================================

const coffeeColors = {
  // Primary coffee browns
  primary: '#6F4E37',
  primary50: '#FDF8F5',
  primary100: '#F5E6DA',
  primary200: '#E8CDB8',
  primary300: '#D4A574',
  primary400: '#B8804A',
  primary500: '#6F4E37',
  primary600: '#5D4230',
  primary700: '#4A3527',
  primary800: '#38291D',
  primary900: '#261C14',

  // Accent (cream)
  accent: '#D4A574',
  accent50: '#FDF8F5',
  accent100: '#F9EFE6',
  accent200: '#F0DCC8',
  accent300: '#E8CDB8',
  accent400: '#D4A574',
  accent500: '#B8804A',
};

const CoffeeTheme = createTheme({
  colors: {
    backgroundPrimary: coffeeColors.primary50,
    backgroundSecondary: coffeeColors.primary100,
    backgroundTertiary: coffeeColors.primary200,
    buttonPrimaryFill: coffeeColors.primary,
    buttonPrimaryHover: coffeeColors.primary600,
    buttonPrimaryActive: coffeeColors.primary700,
    contentPrimary: coffeeColors.primary900,
    contentSecondary: coffeeColors.primary700,
    contentTertiary: coffeeColors.primary500,
  },
});

// ============================================
// Theme Types
// ============================================

export type ThemeMode = 'light' | 'dark' | 'coffee' | 'system';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  theme: typeof LightTheme;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// ============================================
// Theme Provider
// ============================================

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('brewform-theme');
    return (saved as ThemeMode) || 'system';
  });

  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Save theme preference
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('brewform-theme', mode);
  };

  // Determine actual theme
  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark);
  
  const theme = (() => {
    switch (themeMode) {
      case 'light':
        return LightTheme;
      case 'dark':
        return DarkTheme;
      case 'coffee':
        return CoffeeTheme;
      default:
        return systemDark ? DarkTheme : LightTheme;
    }
  })();

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, theme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
