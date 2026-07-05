import en from './en.json' with { type: 'json' };
import tr from './tr.json' with { type: 'json' };

const locales: Record<string, Record<string, string>> = {
  en,
  tr,
};

/** Translates a message key for the given locale (default 'en'), falling back to English and then to the key itself. */
export function t(key: string, locale: string = 'en'): string {
  return locales[locale]?.[key] || locales['en']?.[key] || key;
}

/** Returns the locale codes with bundled translations (currently 'en' and 'tr'). */
export function getAvailableLocales(): string[] {
  return Object.keys(locales);
}

export { en, tr };
