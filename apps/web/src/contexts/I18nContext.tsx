import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { t as translate, getAvailableLocales } from '@brewform/shared/i18n';

type Locale = 'en' | 'tr';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  availableLocales: string[];
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem('brewform_locale') as Locale | null;
    if (stored && getAvailableLocales().includes(stored)) return stored;
    return 'en';
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('brewform_locale', newLocale);
  }, []);

  const t = useCallback((key: string) => translate(key, locale), [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, availableLocales: getAvailableLocales() }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation must be used within I18nProvider');
  return context;
}