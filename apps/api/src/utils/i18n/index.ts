/**
 * BrewForm Internationalization (i18n) Utilities
 * Basic translation layer with JSON locale support
 */

import { getConfig } from '../../config/index.js';
import { getLogger } from '../logger/index.js';

// ============================================
// Types
// ============================================

export type LocaleCode = string;
export type TranslationKey = string;
export type TranslationParams = Record<string, string | number>;

export interface Translations {
  [key: string]: string | Translations;
}

export interface LocaleData {
  code: LocaleCode;
  name: string;
  nativeName: string;
  translations: Translations;
}

// ============================================
// Locale Store
// ============================================

const locales = new Map<LocaleCode, LocaleData>();

/**
 * Default English translations
 */
const defaultTranslations: Translations = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    loading: 'Loading...',
    error: 'An error occurred',
    success: 'Success',
    confirm: 'Confirm',
    search: 'Search',
    filter: 'Filter',
    sort: 'Sort',
    ascending: 'Ascending',
    descending: 'Descending',
    noResults: 'No results found',
    loadMore: 'Load more',
    viewAll: 'View all',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    close: 'Close',
    yes: 'Yes',
    no: 'No',
  },
  auth: {
    login: 'Log in',
    logout: 'Log out',
    register: 'Register',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    forgotPassword: 'Forgot password?',
    resetPassword: 'Reset password',
    verifyEmail: 'Verify email',
    rememberMe: 'Remember me',
    loginSuccess: 'Welcome back!',
    registerSuccess: 'Account created successfully',
    logoutSuccess: 'You have been logged out',
    invalidCredentials: 'Invalid email or password',
    emailNotVerified: 'Please verify your email address',
    passwordResetSent: 'Password reset link sent to your email',
    passwordResetSuccess: 'Password reset successfully',
    accountBanned: 'Your account has been suspended',
  },
  recipe: {
    title: 'Recipe',
    recipes: 'Recipes',
    createRecipe: 'Create Recipe',
    editRecipe: 'Edit Recipe',
    deleteRecipe: 'Delete Recipe',
    viewRecipe: 'View Recipe',
    shareRecipe: 'Share Recipe',
    forkRecipe: 'Fork Recipe',
    compare: 'Compare',
    version: 'Version',
    versions: 'Versions',
    bumpVersion: 'Create New Version',
    visibility: 'Visibility',
    draft: 'Draft',
    private: 'Private',
    unlisted: 'Unlisted',
    public: 'Public',
    featured: 'Featured',
    favourite: 'Favourite',
    unfavourite: 'Remove from favourites',
    favourites: 'Favourites',
    forkedFrom: 'Forked from',
  },
  brewing: {
    brewMethod: 'Brew Method',
    drinkType: 'Drink Type',
    dose: 'Dose',
    yield: 'Yield',
    ratio: 'Ratio',
    time: 'Time',
    temperature: 'Temperature',
    grindSize: 'Grind Size',
    grinder: 'Grinder',
    brewer: 'Brewer',
    portafilter: 'Portafilter',
    basket: 'Basket',
    puckScreen: 'Puck Screen',
    paperFilter: 'Paper Filter',
    tamper: 'Tamper',
    preparations: 'Preparations',
    flowRate: 'Flow Rate',
    extractionYield: 'Extraction Yield',
  },
  coffee: {
    coffee: 'Coffee',
    coffees: 'Coffees',
    vendor: 'Vendor',
    origin: 'Origin',
    region: 'Region',
    farm: 'Farm',
    altitude: 'Altitude',
    variety: 'Variety',
    process: 'Process',
    roastLevel: 'Roast Level',
    roastDate: 'Roast Date',
    grindDate: 'Grind Date',
    flavorNotes: 'Flavor Notes',
  },
  tasting: {
    tastingNotes: 'Tasting Notes',
    rating: 'Rating',
    emojiRating: 'Quick Rating',
    superGood: 'Super Good',
    good: 'Good',
    okay: 'Okay',
    bad: 'Bad',
    horrible: 'Horrible',
    tags: 'Tags',
    addTag: 'Add tag',
  },
  equipment: {
    equipment: 'Equipment',
    myEquipment: 'My Equipment',
    addEquipment: 'Add Equipment',
    setup: 'Setup',
    setups: 'Setups',
    createSetup: 'Create Setup',
    defaultSetup: 'Default Setup',
  },
  profile: {
    profile: 'Profile',
    editProfile: 'Edit Profile',
    settings: 'Settings',
    preferences: 'Preferences',
    theme: 'Theme',
    language: 'Language',
    units: 'Units',
    timezone: 'Timezone',
    notifications: 'Notifications',
    myRecipes: 'My Recipes',
    myBeans: 'My Beans',
  },
  validation: {
    required: '{{field}} is required',
    minLength: '{{field}} must be at least {{min}} characters',
    maxLength: '{{field}} must be at most {{max}} characters',
    email: 'Please enter a valid email address',
    passwordStrength: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    grindBeforeRoast: 'Grind date cannot be before roast date',
    incompatibleBrewMethod: '{{drinkType}} cannot be made with {{brewMethod}}',
    positiveNumber: '{{field}} must be a positive number',
  },
  errors: {
    notFound: 'Not found',
    unauthorized: 'Unauthorized',
    forbidden: 'Access denied',
    badRequest: 'Invalid request',
    serverError: 'Something went wrong. Please try again later.',
    networkError: 'Network error. Please check your connection.',
    rateLimited: 'Too many requests. Please try again later.',
  },
};

// ============================================
// Initialization
// ============================================

/**
 * Initialize default locale
 */
function initializeDefaultLocale(): void {
  locales.set('en', {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    translations: defaultTranslations,
  });
}

// Initialize on module load
initializeDefaultLocale();

/**
 * Register a new locale
 */
export function registerLocale(locale: LocaleData): void {
  locales.set(locale.code, locale);
  getLogger().debug({ type: 'i18n', operation: 'register', locale: locale.code });
}

/**
 * Get available locale codes
 */
export function getAvailableLocales(): LocaleCode[] {
  const config = getConfig();
  return config.supportedLocales.split(',').map((l) => l.trim());
}

/**
 * Check if a locale is supported
 */
export function isLocaleSupported(code: LocaleCode): boolean {
  return getAvailableLocales().includes(code);
}

// ============================================
// Translation
// ============================================

/**
 * Get nested value from translations object
 */
function getNestedValue(obj: Translations, path: string): string | undefined {
  const keys = path.split('.');
  let current: Translations | string | undefined = obj;

  for (const key of keys) {
    if (current === undefined || typeof current === 'string') {
      return undefined;
    }
    current = current[key];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Interpolate parameters into translation string
 */
function interpolate(str: string, params?: TranslationParams): string {
  if (!params) return str;

  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

/**
 * Translate a key
 */
export function t(
  key: TranslationKey,
  params?: TranslationParams,
  locale?: LocaleCode
): string {
  const config = getConfig();
  const localeCode = locale || config.defaultLocale;
  
  // Try requested locale
  const localeData = locales.get(localeCode);
  if (localeData) {
    const translation = getNestedValue(localeData.translations, key);
    if (translation) {
      return interpolate(translation, params);
    }
  }

  // Fallback to default locale
  if (localeCode !== 'en') {
    const defaultLocale = locales.get('en');
    if (defaultLocale) {
      const translation = getNestedValue(defaultLocale.translations, key);
      if (translation) {
        return interpolate(translation, params);
      }
    }
  }

  // Return key if translation not found
  getLogger().warn({
    type: 'i18n',
    operation: 'missing',
    key,
    locale: localeCode,
  });
  
  return key;
}

/**
 * Create a translator for a specific locale
 */
export function createTranslator(locale: LocaleCode) {
  return (key: TranslationKey, params?: TranslationParams) => t(key, params, locale);
}

/**
 * Get all translations for a locale
 */
export function getTranslations(locale: LocaleCode): Translations {
  const localeData = locales.get(locale) || locales.get('en');
  return localeData?.translations || {};
}

// ============================================
// Exports
// ============================================

export const i18n = {
  t,
  translate: t,
  registerLocale,
  getAvailableLocales,
  isLocaleSupported,
  createTranslator,
  getTranslations,
};

export default i18n;
