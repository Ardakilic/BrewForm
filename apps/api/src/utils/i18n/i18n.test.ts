/**
 * i18n Utilities Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config and logger before importing i18n utils
vi.mock('../../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    defaultLocale: 'en',
    supportedLocales: 'en,es,de',
  })),
}));

vi.mock('../logger/index.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  t,
  registerLocale,
  getAvailableLocales,
  isLocaleSupported,
  createTranslator,
  getTranslations,
} from './index.js';

describe('i18n Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('t (translate)', () => {
    it('should translate common keys', () => {
      expect(t('common.save')).toBe('Save');
      expect(t('common.cancel')).toBe('Cancel');
      expect(t('common.delete')).toBe('Delete');
    });

    it('should translate auth keys', () => {
      expect(t('auth.login')).toBe('Log in');
      expect(t('auth.logout')).toBe('Log out');
      expect(t('auth.register')).toBe('Register');
    });

    it('should translate recipe keys', () => {
      expect(t('recipe.title')).toBe('Recipe');
      expect(t('recipe.recipes')).toBe('Recipes');
      expect(t('recipe.createRecipe')).toBe('Create Recipe');
    });

    it('should translate brewing keys', () => {
      expect(t('brewing.brewMethod')).toBe('Brew Method');
      expect(t('brewing.dose')).toBe('Dose');
      expect(t('brewing.yield')).toBe('Yield');
    });

    it('should translate error keys', () => {
      expect(t('errors.notFound')).toBe('Not found');
      expect(t('errors.unauthorized')).toBe('Unauthorized');
    });

    it('should return key for missing translations', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('should interpolate parameters', () => {
      const result = t('validation.required', { field: 'Email' });
      expect(result).toContain('Email');
    });

    it('should handle missing parameters gracefully', () => {
      const result = t('validation.required');
      expect(result).toContain('{{field}}');
    });
  });

  describe('registerLocale', () => {
    it('should register a new locale', () => {
      const spanishLocale = {
        code: 'es',
        name: 'Spanish',
        nativeName: 'Español',
        translations: {
          common: {
            save: 'Guardar',
            cancel: 'Cancelar',
          },
        },
      };

      registerLocale(spanishLocale);

      expect(t('common.save', undefined, 'es')).toBe('Guardar');
    });
  });

  describe('getAvailableLocales', () => {
    it('should return list of supported locales', () => {
      const locales = getAvailableLocales();
      expect(locales).toContain('en');
      expect(locales).toContain('es');
      expect(locales).toContain('de');
    });
  });

  describe('isLocaleSupported', () => {
    it('should return true for supported locales', () => {
      expect(isLocaleSupported('en')).toBe(true);
      expect(isLocaleSupported('es')).toBe(true);
    });

    it('should return false for unsupported locales', () => {
      expect(isLocaleSupported('xx')).toBe(false);
      expect(isLocaleSupported('fr')).toBe(false);
    });
  });

  describe('createTranslator', () => {
    it('should create translator for specific locale', () => {
      const translate = createTranslator('en');
      expect(translate('common.save')).toBe('Save');
    });

    it('should use locale-specific translations', () => {
      registerLocale({
        code: 'de',
        name: 'German',
        nativeName: 'Deutsch',
        translations: {
          common: {
            save: 'Speichern',
          },
        },
      });

      const translate = createTranslator('de');
      expect(translate('common.save')).toBe('Speichern');
    });
  });

  describe('getTranslations', () => {
    it('should return translations for locale', () => {
      const translations = getTranslations('en');
      expect(translations).toBeDefined();
      expect(translations.common).toBeDefined();
    });

    it('should fallback to English for unknown locale', () => {
      const translations = getTranslations('xx');
      expect(translations).toBeDefined();
      expect(translations.common).toBeDefined();
    });
  });

  describe('Translation Coverage', () => {
    it('should have coffee translations', () => {
      expect(t('coffee.coffee')).toBe('Coffee');
      expect(t('coffee.vendor')).toBe('Vendor');
      expect(t('coffee.origin')).toBe('Origin');
    });

    it('should have tasting translations', () => {
      expect(t('tasting.tastingNotes')).toBe('Tasting Notes');
      expect(t('tasting.rating')).toBe('Rating');
    });

    it('should have equipment translations', () => {
      expect(t('equipment.equipment')).toBe('Equipment');
      expect(t('equipment.myEquipment')).toBe('My Equipment');
    });

    it('should have profile translations', () => {
      expect(t('profile.profile')).toBe('Profile');
      expect(t('profile.settings')).toBe('Settings');
    });

    it('should have validation translations', () => {
      expect(t('validation.email')).toBe('Please enter a valid email address');
    });
  });
});
