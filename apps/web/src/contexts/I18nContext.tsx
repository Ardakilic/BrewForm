import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { getAvailableLocales, t as translate } from '@brewform/shared/i18n';
import { createLogger } from '@/utils/logger.ts';

type Locale = 'en' | 'tr';

const log = createLogger('I18nContext');

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  availableLocales: string[];
}

const I18nContext = createContext<I18nContextType | null>(null);

const LOCALE_DIR: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  tr: 'ltr',
};

/**
 * Owns the active locale (persisted in localStorage, default `en`),
 * keeps `<html lang/dir>` in sync, and provides a locale-bound `t()`.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem('brewform_locale') as Locale | null;
    if (stored && getAvailableLocales().includes(stored)) return stored;
    return 'en';
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALE_DIR[locale] ?? 'ltr';
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('brewform_locale', newLocale);
    log.debug({ locale: newLocale }, 'I18nContext locale changed');
  }, []);

  const t = useCallback((key: string) => translate(key, locale), [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, availableLocales: getAvailableLocales() }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Accesses the i18n context (`t`, locale, setLocale); throws outside {@link I18nProvider}. */
export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation must be used within I18nProvider');
  return context;
}
