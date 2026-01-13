/**
 * BrewForm i18n Configuration
 * Internationalization setup with i18next
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import tr from './locales/tr.json';
import fr from './locales/fr.json';
import de from './locales/de.json';

export const supportedLanguages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
] as const;

const resources = {
  en: { translation: en },
  tr: { translation: tr },
  fr: { translation: fr },
  de: { translation: de },
};

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('brewform-locale') || 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export const changeLanguage = (lang: string) => {
  localStorage.setItem('brewform-locale', lang);
  i18n.changeLanguage(lang);
};

export default i18n;
