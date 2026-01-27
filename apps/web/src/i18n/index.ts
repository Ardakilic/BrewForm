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
import es from './locales/es.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import az from './locales/az.json';
import ka from './locales/ka.json';
import ar_f from './locales/ar_f.json';
import hy from './locales/hy.json';
import ko from './locales/ko.json';
import zh_TW from './locales/zh_TW.json';
import th from './locales/th.json';
import hi from './locales/hi.json';
import ja from './locales/ja.json';
import zh_CN from './locales/zh_CN.json';

export const supportedLanguages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'az', name: 'Azərbaycan', flag: '🇦🇿' },
  { code: 'ka', name: 'ქართული', flag: '🇬🇪' },
  { code: 'ar_f', name: 'العربية', flag: '🇸🇦' },
  { code: 'hy', name: 'Հայերադdelays', flag: '🇦🇲' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'zh_TW', name: '繁體中文', flag: '🇹🇼' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh_CN', name: '简体中文', flag: '🇨🇳' },
] as const;

const resources = {
  en: { translation: en },
  tr: { translation: tr },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
  pt: { translation: pt },
  ru: { translation: ru },
  az: { translation: az },
  ka: { translation: ka },
  ar_f: { translation: ar_f },
  hy: { translation: hy },
  ko: { translation: ko },
  zh_TW: { translation: zh_TW },
  th: { translation: th },
  hi: { translation: hi },
  ja: { translation: ja },
  zh_CN: { translation: zh_CN },
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
