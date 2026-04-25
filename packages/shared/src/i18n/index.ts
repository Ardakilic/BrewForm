import en from './en.json' with { type: 'json' };
import tr from './tr.json' with { type: 'json' };

const locales: Record<string, Record<string, string>> = {
  en,
  tr,
};

export function t(key: string, locale: string = 'en'): string {
  return locales[locale]?.[key] || locales['en']?.[key] || key;
}

export function getAvailableLocales(): string[] {
  return Object.keys(locales);
}

export { en, tr };