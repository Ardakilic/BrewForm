/**
 * Validation Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  paginationSchema,
  idParamSchema,
  slugParamSchema,
  registerSchema,
  loginSchema,
  resetPasswordSchema,
  updateProfileSchema,
  grinderSchema,
  brewerSchema,
  vendorSchema,
  coffeeSchema,
  recipeVersionInputSchema,
  createRecipeSchema,
  updateRecipeSchema,
  recipeFilterSchema,
  isBrewMethodCompatible,
  validateRecipeHard,
  validateRecipeSoft,
  validateRecipe,
  TYPICAL_RATIOS,
  TYPICAL_EXTRACTION_TIMES,
  TYPICAL_TEMPERATURES,
} from './index.js';

describe('Validation Utilities', () => {
  describe('Common Schemas', () => {
    describe('paginationSchema', () => {
      it('should parse valid pagination params', () => {
        const result = paginationSchema.parse({ page: '2', limit: '50' });
        expect(result.page).toBe(2);
        expect(result.limit).toBe(50);
      });

      it('should use defaults for missing params', () => {
        const result = paginationSchema.parse({});
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
      });

      it('should reject invalid page', () => {
        expect(() => paginationSchema.parse({ page: '0' })).toThrow();
        expect(() => paginationSchema.parse({ page: '-1' })).toThrow();
      });

      it('should clamp limit to max 100', () => {
        expect(() => paginationSchema.parse({ limit: '200' })).toThrow();
      });
    });

    describe('idParamSchema', () => {
      it('should accept valid IDs', () => {
        const result = idParamSchema.parse({ id: 'test-slug-123' });
        expect(result.id).toBe('test-slug-123');
      });

      it('should reject empty ID', () => {
        expect(() => idParamSchema.parse({ id: '' })).toThrow();
      });
    });

    describe('slugParamSchema', () => {
      it('should accept valid slugs', () => {
        const result = slugParamSchema.parse({ slug: 'my-recipe-slug' });
        expect(result.slug).toBe('my-recipe-slug');
      });
    });
  });

  describe('Auth Schemas', () => {
    describe('registerSchema', () => {
      it('should accept valid registration data', () => {
        const result = registerSchema.parse({
          email: 'test@example.com',
          username: 'testuser',
          password: 'SecurePass123',
        });
        expect(result.email).toBe('test@example.com');
        expect(result.username).toBe('testuser');
      });

      it('should reject invalid email', () => {
        expect(() => registerSchema.parse({
          email: 'not-an-email',
          username: 'testuser',
          password: 'SecurePass123',
        })).toThrow();
      });

      it('should reject weak password', () => {
        expect(() => registerSchema.parse({
          email: 'test@example.com',
          username: 'testuser',
          password: 'weak',
        })).toThrow();
      });

      it('should reject password without uppercase', () => {
        expect(() => registerSchema.parse({
          email: 'test@example.com',
          username: 'testuser',
          password: 'securepass123',
        })).toThrow();
      });

      it('should reject password without number', () => {
        expect(() => registerSchema.parse({
          email: 'test@example.com',
          username: 'testuser',
          password: 'SecurePassword',
        })).toThrow();
      });

      it('should reject invalid username characters', () => {
        expect(() => registerSchema.parse({
          email: 'test@example.com',
          username: 'test user!',
          password: 'SecurePass123',
        })).toThrow();
      });

      it('should accept username with underscores and hyphens', () => {
        const result = registerSchema.parse({
          email: 'test@example.com',
          username: 'test_user-123',
          password: 'SecurePass123',
        });
        expect(result.username).toBe('test_user-123');
      });
    });

    describe('loginSchema', () => {
      it('should accept valid login data', () => {
        const result = loginSchema.parse({
          email: 'test@example.com',
          password: 'anypassword',
        });
        expect(result.email).toBe('test@example.com');
      });

      it('should reject invalid email', () => {
        expect(() => loginSchema.parse({
          email: 'invalid',
          password: 'password',
        })).toThrow();
      });
    });

    describe('resetPasswordSchema', () => {
      it('should accept valid reset data', () => {
        const result = resetPasswordSchema.parse({
          token: 'reset-token-123',
          password: 'NewSecurePass123',
        });
        expect(result.token).toBe('reset-token-123');
      });

      it('should reject weak new password', () => {
        expect(() => resetPasswordSchema.parse({
          token: 'reset-token',
          password: 'weak',
        })).toThrow();
      });
    });
  });

  describe('Profile Schema', () => {
    describe('updateProfileSchema', () => {
      it('should accept valid profile updates', () => {
        const result = updateProfileSchema.parse({
          displayName: 'Coffee Lover',
          bio: 'I love espresso',
          website: 'https://example.com',
        });
        expect(result.displayName).toBe('Coffee Lover');
      });

      it('should accept empty website', () => {
        const result = updateProfileSchema.parse({
          website: '',
        });
        expect(result.website).toBe('');
      });

      it('should reject invalid website URL', () => {
        expect(() => updateProfileSchema.parse({
          website: 'not-a-url',
        })).toThrow();
      });

      it('should accept valid units preference', () => {
        const result = updateProfileSchema.parse({
          preferredUnits: 'METRIC',
        });
        expect(result.preferredUnits).toBe('METRIC');
      });

      it('should accept valid theme preference', () => {
        const result = updateProfileSchema.parse({
          preferredTheme: 'DARK',
        });
        expect(result.preferredTheme).toBe('DARK');
      });
    });
  });

  describe('Equipment Schemas', () => {
    describe('grinderSchema', () => {
      it('should accept valid grinder data', () => {
        const result = grinderSchema.parse({
          brand: 'Niche',
          model: 'Zero',
          burrSize: 63,
        });
        expect(result.brand).toBe('Niche');
        expect(result.model).toBe('Zero');
      });

      it('should require brand and model', () => {
        expect(() => grinderSchema.parse({ brand: '' })).toThrow();
        expect(() => grinderSchema.parse({ model: 'Zero' })).toThrow();
      });
    });

    describe('brewerSchema', () => {
      it('should accept valid brewer data', () => {
        const result = brewerSchema.parse({
          brand: 'La Marzocco',
          model: 'Linea Mini',
          brewMethod: 'ESPRESSO_MACHINE',
        });
        expect(result.brand).toBe('La Marzocco');
      });

      it('should accept brewer with defaultPressure', () => {
        const result = brewerSchema.parse({
          brand: 'Gaggia',
          model: 'Classic Pro',
          brewMethod: 'ESPRESSO_MACHINE',
          defaultPressure: '9',
        });
        expect(result.defaultPressure).toBe('9');
      });

      it('should accept variable defaultPressure for modified machines', () => {
        const result = brewerSchema.parse({
          brand: 'Gaggia',
          model: 'Gagguino Modified',
          brewMethod: 'ESPRESSO_MACHINE',
          defaultPressure: 'variable',
        });
        expect(result.defaultPressure).toBe('variable');
      });

      it('should accept range defaultPressure for high-end machines', () => {
        const result = brewerSchema.parse({
          brand: 'Decent',
          model: 'DE1',
          brewMethod: 'ESPRESSO_MACHINE',
          defaultPressure: '0-12',
        });
        expect(result.defaultPressure).toBe('0-12');
      });

      it('should allow undefined defaultPressure', () => {
        const result = brewerSchema.parse({
          brand: 'Hario',
          model: 'V60',
          brewMethod: 'POUR_OVER_V60',
        });
        expect(result.defaultPressure).toBeUndefined();
      });
    });

    describe('vendorSchema', () => {
      it('should accept valid vendor data', () => {
        const result = vendorSchema.parse({
          name: 'Blue Bottle Coffee',
          website: 'https://bluebottlecoffee.com',
          country: 'USA',
        });
        expect(result.name).toBe('Blue Bottle Coffee');
      });
    });

    describe('coffeeSchema', () => {
      it('should accept valid coffee data', () => {
        const result = coffeeSchema.parse({
          name: 'Ethiopia Yirgacheffe',
          origin: 'Ethiopia',
          processingMethod: 'WASHED',
          flavorNotes: ['citrus', 'floral'],
        });
        expect(result.name).toBe('Ethiopia Yirgacheffe');
      });
    });
  });

  describe('Recipe Schemas', () => {
    describe('recipeVersionInputSchema', () => {
      const validVersion = {
        title: 'Perfect Espresso',
        brewMethod: 'ESPRESSO_MACHINE',
        drinkType: 'ESPRESSO',
        doseGrams: 18,
      };

      it('should accept valid recipe version', () => {
        const result = recipeVersionInputSchema.parse(validVersion);
        expect(result.title).toBe('Perfect Espresso');
        expect(result.doseGrams).toBe(18);
      });

      it('should accept optional fields', () => {
        const result = recipeVersionInputSchema.parse({
          ...validVersion,
          yieldGrams: 36,
          brewTimeSec: 28,
          tempCelsius: 93,
          tastingNotes: 'Sweet and balanced',
          rating: 8,
        });
        expect(result.yieldGrams).toBe(36);
        expect(result.rating).toBe(8);
      });

      it('should accept pressure field', () => {
        const result = recipeVersionInputSchema.parse({
          ...validVersion,
          pressure: '9',
        });
        expect(result.pressure).toBe('9');
      });

      it('should accept various pressure formats', () => {
        const pressureFormats = ['9', '6-9', 'variable', '9 bar'];
        for (const pressure of pressureFormats) {
          const result = recipeVersionInputSchema.parse({
            ...validVersion,
            pressure,
          });
          expect(result.pressure).toBe(pressure);
        }
      });

      it('should accept undefined pressure (optional field)', () => {
        const result = recipeVersionInputSchema.parse(validVersion);
        expect(result.pressure).toBeUndefined();
      });

      it('should reject pressure exceeding max length', () => {
        expect(() => recipeVersionInputSchema.parse({
          ...validVersion,
          pressure: 'a'.repeat(51),
        })).toThrow();
      });

      it('should reject invalid rating', () => {
        expect(() => recipeVersionInputSchema.parse({
          ...validVersion,
          rating: 11,
        })).toThrow();
        expect(() => recipeVersionInputSchema.parse({
          ...validVersion,
          rating: 0,
        })).toThrow();
      });

      it('should reject negative dose', () => {
        expect(() => recipeVersionInputSchema.parse({
          ...validVersion,
          doseGrams: -1,
        })).toThrow();
      });
    });

    describe('createRecipeSchema', () => {
      it('should accept valid recipe creation data', () => {
        const result = createRecipeSchema.parse({
          visibility: 'PUBLIC',
          version: {
            title: 'My Recipe',
            brewMethod: 'ESPRESSO_MACHINE',
            drinkType: 'ESPRESSO',
            doseGrams: 18,
          },
        });
        expect(result.visibility).toBe('PUBLIC');
      });

      it('should default visibility to DRAFT', () => {
        const result = createRecipeSchema.parse({
          version: {
            title: 'My Recipe',
            brewMethod: 'ESPRESSO_MACHINE',
            drinkType: 'ESPRESSO',
            doseGrams: 18,
          },
        });
        expect(result.visibility).toBe('DRAFT');
      });
    });

    describe('updateRecipeSchema', () => {
      it('should accept visibility update', () => {
        const result = updateRecipeSchema.parse({ visibility: 'PUBLIC' });
        expect(result.visibility).toBe('PUBLIC');
      });

      it('should accept isFeatured update', () => {
        const result = updateRecipeSchema.parse({ isFeatured: true });
        expect(result.isFeatured).toBe(true);
      });
    });

    describe('recipeFilterSchema', () => {
      it('should accept valid filters', () => {
        const result = recipeFilterSchema.parse({
          brewMethod: 'ESPRESSO_MACHINE',
          search: 'espresso',
          minRating: 7,
        });
        expect(result.brewMethod).toBe('ESPRESSO_MACHINE');
      });

      it('should use default sort', () => {
        const result = recipeFilterSchema.parse({});
        expect(result.sortBy).toBe('createdAt');
        expect(result.sortOrder).toBe('desc');
      });
    });
  });

  describe('Brew Method Compatibility', () => {
    describe('isBrewMethodCompatible', () => {
      it('should return true for compatible espresso machine combinations', () => {
        expect(isBrewMethodCompatible('ESPRESSO_MACHINE', 'ESPRESSO')).toBe(true);
        expect(isBrewMethodCompatible('ESPRESSO_MACHINE', 'LATTE')).toBe(true);
        expect(isBrewMethodCompatible('ESPRESSO_MACHINE', 'CAPPUCCINO')).toBe(true);
      });

      it('should return true for compatible pour over combinations', () => {
        expect(isBrewMethodCompatible('POUR_OVER_V60', 'POUR_OVER')).toBe(true);
      });

      it('should return false for incompatible combinations', () => {
        expect(isBrewMethodCompatible('ESPRESSO_MACHINE', 'POUR_OVER')).toBe(false);
        expect(isBrewMethodCompatible('POUR_OVER_V60', 'ESPRESSO')).toBe(false);
      });

      it('should allow OTHER brew method with any drink', () => {
        expect(isBrewMethodCompatible('OTHER', 'ESPRESSO')).toBe(true);
        expect(isBrewMethodCompatible('OTHER', 'POUR_OVER')).toBe(true);
      });
    });
  });

  describe('Recipe Validation', () => {
    const validRecipe = {
      title: 'Perfect Espresso',
      brewMethod: 'ESPRESSO_MACHINE' as const,
      drinkType: 'ESPRESSO' as const,
      doseGrams: 18,
      yieldGrams: 36,
      brewTimeSec: 28,
      tempCelsius: 93,
      isFavourite: false,
    };

    describe('validateRecipeHard', () => {
      it('should pass for valid recipe', () => {
        const result = validateRecipeHard(validRecipe);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should fail for incompatible brew method and drink type', () => {
        const result = validateRecipeHard({
          ...validRecipe,
          brewMethod: 'FRENCH_PRESS',
          drinkType: 'ESPRESSO',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should fail when grind date is before roast date', () => {
        const result = validateRecipeHard({
          ...validRecipe,
          roastDate: new Date('2024-01-15'),
          grindDate: new Date('2024-01-10'),
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Grind date cannot be before roast date.');
      });
    });

    describe('validateRecipeSoft', () => {
      it('should pass for typical recipe', () => {
        const result = validateRecipeSoft(validRecipe);
        expect(result.warnings).toHaveLength(0);
      });

      it('should warn for atypical brew ratio', () => {
        const result = validateRecipeSoft({
          ...validRecipe,
          yieldGrams: 90,
        });
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('ratio');
      });

      it('should warn for atypical extraction time', () => {
        const result = validateRecipeSoft({
          ...validRecipe,
          brewTimeSec: 60,
        });
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('time');
      });

      it('should warn for atypical temperature', () => {
        const result = validateRecipeSoft({
          ...validRecipe,
          tempCelsius: 80,
        });
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('temperature');
      });
    });

    describe('validateRecipe', () => {
      it('should combine hard and soft validation', () => {
        const result = validateRecipe(validRecipe);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeDefined();
        expect(result.warnings).toBeDefined();
      });
    });
  });

  describe('Constants', () => {
    it('should have typical ratios for all drink types', () => {
      expect(TYPICAL_RATIOS.ESPRESSO).toBeDefined();
      expect(TYPICAL_RATIOS.ESPRESSO.min).toBeLessThan(TYPICAL_RATIOS.ESPRESSO.max);
    });

    it('should have typical extraction times for all brew methods', () => {
      expect(TYPICAL_EXTRACTION_TIMES.ESPRESSO_MACHINE).toBeDefined();
      expect(TYPICAL_EXTRACTION_TIMES.COLD_BREW.min).toBeGreaterThan(3600);
    });

    it('should have typical temperatures for all brew methods', () => {
      expect(TYPICAL_TEMPERATURES.ESPRESSO_MACHINE).toBeDefined();
      expect(TYPICAL_TEMPERATURES.COLD_BREW.max).toBeLessThan(30);
    });
  });
});
