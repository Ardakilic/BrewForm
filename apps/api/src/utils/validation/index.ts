/**
 * BrewForm Validation Utilities
 * Shared validation schemas and helpers using Zod
 */

import { z } from 'zod';
import { BrewMethodType, DrinkType, EmojiRating, ProcessingMethod, Visibility } from '@prisma/client';
// Re-export CUID validation utilities
export * from './cuid';

// ============================================
// Common Schemas
// ============================================

/**
 * Pagination query schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * ID parameter schema (accepts both CUID and slug formats)
 */
export const idParamSchema = z.object({
  id: z.string().min(1).max(200),
});

/**
 * Slug parameter schema
 */
export const slugParamSchema = z.object({
  slug: z.string().min(1).max(200),
});

/**
 * Recipe ID parameter schema (for routes using :recipeId)
 */
export const recipeIdParamSchema = z.object({
  recipeId: z.string().cuid(),
});

/**
 * Comment ID parameter schema (for routes using :commentId)
 */
export const commentIdParamSchema = z.object({
  commentId: z.string().cuid(),
});

// ============================================
// Brew Method Compatibility
// ============================================

/**
 * Valid brew method and drink type combinations
 * This is used for hard validation
 */
export const BREW_METHOD_DRINK_COMPATIBILITY: Record<BrewMethodType, DrinkType[]> = {
  ESPRESSO_MACHINE: [
    DrinkType.ESPRESSO, DrinkType.RISTRETTO, DrinkType.LUNGO,
    DrinkType.AMERICANO, DrinkType.LATTE, DrinkType.CAPPUCCINO,
    DrinkType.FLAT_WHITE, DrinkType.CORTADO, DrinkType.MACCHIATO,
    DrinkType.MOCHA, DrinkType.AFFOGATO,
  ],
  MOKA_POT: [
    DrinkType.ESPRESSO, DrinkType.AMERICANO, DrinkType.LATTE,
    DrinkType.CAPPUCCINO, DrinkType.MOCHA,
  ],
  FRENCH_PRESS: [DrinkType.FRENCH_PRESS, DrinkType.ICED_COFFEE],
  POUR_OVER_V60: [DrinkType.POUR_OVER, DrinkType.ICED_COFFEE],
  POUR_OVER_CHEMEX: [DrinkType.POUR_OVER, DrinkType.ICED_COFFEE],
  POUR_OVER_KALITA: [DrinkType.POUR_OVER, DrinkType.ICED_COFFEE],
  AEROPRESS: [
    DrinkType.ESPRESSO, DrinkType.AMERICANO, DrinkType.POUR_OVER,
    DrinkType.ICED_COFFEE,
  ],
  COLD_BREW: [DrinkType.COLD_BREW, DrinkType.ICED_COFFEE],
  DRIP_COFFEE: [DrinkType.POUR_OVER, DrinkType.ICED_COFFEE],
  TURKISH_CEZVE: [DrinkType.TURKISH_COFFEE],
  SIPHON: [DrinkType.POUR_OVER],
  VIETNAMESE_PHIN: [DrinkType.VIETNAMESE_COFFEE, DrinkType.ICED_COFFEE],
  IBRIK: [DrinkType.TURKISH_COFFEE],
  PERCOLATOR: [DrinkType.POUR_OVER],
  OTHER: Object.values(DrinkType),
};

/**
 * Check if brew method and drink type are compatible
 */
export function isBrewMethodCompatible(
  brewMethod: BrewMethodType,
  drinkType: DrinkType
): boolean {
  const compatibleDrinks = BREW_METHOD_DRINK_COMPATIBILITY[brewMethod];
  return compatibleDrinks.includes(drinkType);
}

// ============================================
// Recipe Validation Schemas
// ============================================

/**
 * Typical brew ratio ranges by drink type
 */
export const TYPICAL_RATIOS: Record<DrinkType, { min: number; max: number }> = {
  ESPRESSO: { min: 1.5, max: 2.5 },
  RISTRETTO: { min: 1, max: 1.5 },
  LUNGO: { min: 2.5, max: 4 },
  AMERICANO: { min: 2, max: 3 },
  LATTE: { min: 1.5, max: 2.5 },
  CAPPUCCINO: { min: 1.5, max: 2.5 },
  FLAT_WHITE: { min: 1.5, max: 2.5 },
  CORTADO: { min: 1.5, max: 2.5 },
  MACCHIATO: { min: 1.5, max: 2.5 },
  MOCHA: { min: 1.5, max: 2.5 },
  POUR_OVER: { min: 14, max: 18 },
  FRENCH_PRESS: { min: 14, max: 17 },
  COLD_BREW: { min: 5, max: 10 },
  ICED_COFFEE: { min: 14, max: 18 },
  TURKISH_COFFEE: { min: 8, max: 12 },
  AFFOGATO: { min: 1.5, max: 2.5 },
  IRISH_COFFEE: { min: 1.5, max: 2.5 },
  VIETNAMESE_COFFEE: { min: 3, max: 5 },
  OTHER: { min: 1, max: 20 },
};

/**
 * Typical extraction times by brew method (in seconds)
 */
export const TYPICAL_EXTRACTION_TIMES: Record<BrewMethodType, { min: number; max: number }> = {
  ESPRESSO_MACHINE: { min: 20, max: 35 },
  MOKA_POT: { min: 180, max: 300 },
  FRENCH_PRESS: { min: 180, max: 300 },
  POUR_OVER_V60: { min: 150, max: 210 },
  POUR_OVER_CHEMEX: { min: 210, max: 300 },
  POUR_OVER_KALITA: { min: 150, max: 210 },
  AEROPRESS: { min: 60, max: 180 },
  COLD_BREW: { min: 43200, max: 86400 }, // 12-24 hours
  DRIP_COFFEE: { min: 180, max: 360 },
  TURKISH_CEZVE: { min: 120, max: 240 },
  SIPHON: { min: 90, max: 180 },
  VIETNAMESE_PHIN: { min: 300, max: 600 },
  IBRIK: { min: 120, max: 240 },
  PERCOLATOR: { min: 300, max: 600 },
  OTHER: { min: 0, max: 86400 },
};

/**
 * Typical brew temperatures by brew method (in Celsius)
 */
export const TYPICAL_TEMPERATURES: Record<BrewMethodType, { min: number; max: number }> = {
  ESPRESSO_MACHINE: { min: 88, max: 96 },
  MOKA_POT: { min: 85, max: 100 },
  FRENCH_PRESS: { min: 90, max: 96 },
  POUR_OVER_V60: { min: 88, max: 96 },
  POUR_OVER_CHEMEX: { min: 88, max: 96 },
  POUR_OVER_KALITA: { min: 88, max: 96 },
  AEROPRESS: { min: 75, max: 96 },
  COLD_BREW: { min: 1, max: 25 },
  DRIP_COFFEE: { min: 90, max: 96 },
  TURKISH_CEZVE: { min: 85, max: 100 },
  SIPHON: { min: 88, max: 96 },
  VIETNAMESE_PHIN: { min: 88, max: 96 },
  IBRIK: { min: 85, max: 100 },
  PERCOLATOR: { min: 90, max: 100 },
  OTHER: { min: 1, max: 100 },
};

/**
 * Recipe version input schema - hard validation
 */
export const recipeVersionInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  
  // Brew method and drink type
  brewMethod: z.nativeEnum(BrewMethodType),
  drinkType: z.nativeEnum(DrinkType),
  
  // Coffee
  coffeeId: z.string().cuid().optional(),
  coffeeName: z.string().max(200).optional(),
  roastDate: z.coerce.date().optional(),
  grindDate: z.coerce.date().optional(),
  
  // Equipment (IDs)
  grinderId: z.string().cuid().optional(),
  brewerId: z.string().cuid().optional(),
  portafilterId: z.string().cuid().optional(),
  basketId: z.string().cuid().optional(),
  puckScreenId: z.string().cuid().optional(),
  paperFilterId: z.string().cuid().optional(),
  tamperId: z.string().cuid().optional(),
  
  // Grind settings
  grindSize: z.string().max(100).optional(),
  
  // Brew parameters (canonical units)
  doseGrams: z.number().positive().max(100),
  yieldMl: z.number().positive().max(1000).optional(),
  yieldGrams: z.number().positive().max(1000).optional(),
  brewTimeSec: z.number().int().positive().max(86400).optional(),
  tempCelsius: z.number().min(0).max(100).optional(),
  
  // Additional preparations
  preparations: z.array(z.object({
    name: z.string().max(100),
    type: z.string().max(100).optional(),
    input: z.string().max(200).optional(),
    method: z.string().max(100).optional(),
  })).optional(),
  
  // Tasting notes
  tastingNotes: z.string().max(10000).optional(),
  rating: z.number().int().min(1).max(10).optional(),
  emojiRating: z.nativeEnum(EmojiRating).optional(),
  isFavourite: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export type RecipeVersionInput = z.infer<typeof recipeVersionInputSchema>;

/**
 * Hard validation result
 */
export interface HardValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Soft validation result
 */
export interface SoftValidationResult {
  warnings: string[];
}

/**
 * Full validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Perform hard validation on recipe input
 * These errors block saving
 */
export function validateRecipeHard(input: RecipeVersionInput): HardValidationResult {
  const errors: string[] = [];

  // Check brew method and drink type compatibility
  if (!isBrewMethodCompatible(input.brewMethod, input.drinkType)) {
    errors.push(
      `${input.drinkType} cannot be made with ${input.brewMethod}. Please choose a compatible brew method.`
    );
  }

  // Check grind date is not before roast date
  if (input.roastDate && input.grindDate) {
    if (input.grindDate < input.roastDate) {
      errors.push('Grind date cannot be before roast date.');
    }
  }

  // Check required fields
  if (!input.doseGrams || input.doseGrams <= 0) {
    errors.push('Dose (grams) is required and must be positive.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Perform soft validation on recipe input
 * These generate warnings but don't block saving
 */
export function validateRecipeSoft(input: RecipeVersionInput): SoftValidationResult {
  const warnings: string[] = [];

  // Check brew ratio
  if (input.yieldGrams && input.doseGrams) {
    const ratio = input.yieldGrams / input.doseGrams;
    const typical = TYPICAL_RATIOS[input.drinkType];
    
    if (ratio < typical.min || ratio > typical.max) {
      warnings.push(
        `Brew ratio (1:${ratio.toFixed(1)}) is outside the typical range ` +
        `(1:${typical.min} - 1:${typical.max}) for ${input.drinkType}.`
      );
    }
  }

  // Check extraction time
  if (input.brewTimeSec) {
    const typical = TYPICAL_EXTRACTION_TIMES[input.brewMethod];
    
    if (input.brewTimeSec < typical.min || input.brewTimeSec > typical.max) {
      const minFormatted = typical.min >= 3600 
        ? `${Math.floor(typical.min / 3600)}h` 
        : typical.min >= 60 
          ? `${Math.floor(typical.min / 60)}m` 
          : `${typical.min}s`;
      const maxFormatted = typical.max >= 3600 
        ? `${Math.floor(typical.max / 3600)}h` 
        : typical.max >= 60 
          ? `${Math.floor(typical.max / 60)}m` 
          : `${typical.max}s`;
      
      warnings.push(
        `Extraction time is outside typical range (${minFormatted} - ${maxFormatted}) for ${input.brewMethod}.`
      );
    }
  }

  // Check temperature
  if (input.tempCelsius) {
    const typical = TYPICAL_TEMPERATURES[input.brewMethod];
    
    if (input.tempCelsius < typical.min || input.tempCelsius > typical.max) {
      warnings.push(
        `Brew temperature (${input.tempCelsius}°C) is outside typical range ` +
        `(${typical.min}°C - ${typical.max}°C) for ${input.brewMethod}.`
      );
    }
  }

  // Check for missing common fields
  if (!input.brewTimeSec && input.brewMethod === BrewMethodType.ESPRESSO_MACHINE) {
    warnings.push('Extraction time is commonly recorded for espresso shots.');
  }

  // Check for milk with non-milk drinks
  const milkDrinks: DrinkType[] = [
    DrinkType.LATTE, DrinkType.CAPPUCCINO, DrinkType.FLAT_WHITE,
    DrinkType.CORTADO, DrinkType.MACCHIATO, DrinkType.MOCHA,
  ];
  
  if (input.preparations?.some((p: { name: string }) => p.name.toLowerCase().includes('milk'))) {
    if (!milkDrinks.includes(input.drinkType)) {
      warnings.push(
        `Milk preparation noted for ${input.drinkType}, which is typically not a milk-based drink.`
      );
    }
  }

  return { warnings };
}

/**
 * Perform full validation
 */
export function validateRecipe(input: RecipeVersionInput): ValidationResult {
  const hardResult = validateRecipeHard(input);
  const softResult = validateRecipeSoft(input);

  return {
    valid: hardResult.valid,
    errors: hardResult.errors,
    warnings: softResult.warnings,
  };
}

// ============================================
// User Validation Schemas
// ============================================

export const registerSchema = z.object({
  email: z.string().email().max(255),
  username: z.string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  password: z.string()
    .min(8)
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
  displayName: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const resetPasswordRequestSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string()
    .min(8)
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
});

export const updateProfileSchema = z.object({
  displayName: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().url().max(255).optional().or(z.literal('')),
  preferredLocale: z.string().max(10).optional(),
  preferredTimezone: z.string().max(50).optional(),
  preferredUnits: z.enum(['METRIC', 'IMPERIAL']).optional(),
  preferredTheme: z.enum(['LIGHT', 'DARK', 'COFFEE', 'SYSTEM']).optional(),
});

// ============================================
// Equipment Validation Schemas
// ============================================

export const grinderSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  type: z.string().max(50).optional(),
  burrSize: z.number().int().positive().optional(),
  description: z.string().max(1000).optional(),
});

export const brewerSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  brewMethod: z.nativeEnum(BrewMethodType),
  type: z.string().max(50).optional(),
  description: z.string().max(1000).optional(),
});

export const vendorSchema = z.object({
  name: z.string().min(1).max(100),
  website: z.string().url().max(255).optional(),
  country: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
});

export const createVendorSchema = vendorSchema;

export const updateVendorSchema = vendorSchema.partial();

export const coffeeSchema = z.object({
  name: z.string().min(1).max(200),
  vendorId: z.string().cuid().optional(),
  origin: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  farm: z.string().max(100).optional(),
  altitude: z.number().int().positive().max(5000).optional(),
  variety: z.string().max(100).optional(),
  processingMethod: z.nativeEnum(ProcessingMethod).optional(),
  flavorNotes: z.array(z.string().max(50)).max(20).optional(),
  description: z.string().max(2000).optional(),
  roastLevel: z.string().max(50).optional(),
});

export const createCoffeeSchema = coffeeSchema;

export const updateCoffeeSchema = coffeeSchema.partial();

// ============================================
// Recipe Schemas
// ============================================

export const createRecipeSchema = z.object({
  visibility: z.nativeEnum(Visibility).default(Visibility.DRAFT),
  version: recipeVersionInputSchema,
});

export const updateRecipeSchema = z.object({
  visibility: z.nativeEnum(Visibility).optional(),
  isFeatured: z.boolean().optional(),
});

export const recipeFilterSchema = z.object({
  search: z.string().max(200).optional(),
  brewMethod: z.nativeEnum(BrewMethodType).optional(),
  drinkType: z.nativeEnum(DrinkType).optional(),
  vendorId: z.string().cuid().optional(),
  coffeeId: z.string().cuid().optional(),
  grinderId: z.string().cuid().optional(),
  brewerId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  minRating: z.coerce.number().int().min(1).max(10).optional(),
  tags: z.string().optional(), // comma-separated
  sortBy: z.enum(['createdAt', 'rating', 'favouriteCount', 'viewCount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).merge(paginationSchema);

export type RecipeFilters = z.infer<typeof recipeFilterSchema>;

export default {
  pagination: paginationSchema,
  idParam: idParamSchema,
  slugParam: slugParamSchema,
  recipeIdParam: recipeIdParamSchema,
  commentIdParam: commentIdParamSchema,
  recipeVersionInput: recipeVersionInputSchema,
  register: registerSchema,
  login: loginSchema,
  resetPasswordRequest: resetPasswordRequestSchema,
  resetPassword: resetPasswordSchema,
  updateProfile: updateProfileSchema,
  grinder: grinderSchema,
  brewer: brewerSchema,
  vendor: vendorSchema,
  createVendor: createVendorSchema,
  updateVendor: updateVendorSchema,
  coffee: coffeeSchema,
  createCoffee: createCoffeeSchema,
  updateCoffee: updateCoffeeSchema,
  createRecipe: createRecipeSchema,
  updateRecipe: updateRecipeSchema,
  recipeFilter: recipeFilterSchema,
  validateRecipe,
  validateRecipeHard,
  validateRecipeSoft,
  isBrewMethodCompatible,
};
