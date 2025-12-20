/**
 * BrewForm Slug Utilities
 * URL-safe slug generation with uniqueness
 */

import slugify from 'slugify';
import { nanoid } from 'nanoid';

/**
 * Slugify options
 */
const SLUGIFY_OPTIONS = {
  lower: true,
  strict: true,
  trim: true,
};

/**
 * Generate a URL-safe slug from text
 */
export function createSlug(text: string): string {
  return slugify(text, SLUGIFY_OPTIONS);
}

/**
 * Generate a unique slug by appending a short ID
 */
export function createUniqueSlug(text: string): string {
  const baseSlug = createSlug(text);
  const uniqueId = nanoid(8);
  return `${baseSlug}-${uniqueId}`;
}

/**
 * Generate a slug with a counter suffix
 */
export function createNumberedSlug(text: string, counter: number): string {
  const baseSlug = createSlug(text);
  return counter > 0 ? `${baseSlug}-${counter}` : baseSlug;
}

/**
 * Check if a string is a valid slug
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Sanitize a slug to ensure it's valid
 */
export function sanitizeSlug(slug: string): string {
  return createSlug(slug);
}

/**
 * Generate a unique slug for recipes
 * Format: {title-slug}-{nanoid}
 */
export function createRecipeSlug(title: string): string {
  return createUniqueSlug(title);
}

/**
 * Generate a slug for equipment
 * Format: {brand-model}
 */
export function createEquipmentSlug(brand: string, model: string): string {
  return createSlug(`${brand} ${model}`);
}

/**
 * Generate a slug for vendors
 */
export function createVendorSlug(name: string): string {
  return createSlug(name);
}

/**
 * Generate a slug for coffee
 */
export function createCoffeeSlug(name: string, vendorName?: string): string {
  const text = vendorName ? `${vendorName} ${name}` : name;
  return createUniqueSlug(text);
}

/**
 * Extract base slug without unique suffix
 */
export function extractBaseSlug(slug: string): string {
  // Remove trailing -xxxxx where x is alphanumeric (nanoid suffix)
  return slug.replace(/-[a-zA-Z0-9]{8}$/, '');
}

/**
 * Generate a comparison share token
 */
export function createComparisonToken(): string {
  return nanoid(16);
}

export const slug = {
  create: createSlug,
  createUnique: createUniqueSlug,
  createNumbered: createNumberedSlug,
  isValid: isValidSlug,
  sanitize: sanitizeSlug,
  recipe: createRecipeSlug,
  equipment: createEquipmentSlug,
  vendor: createVendorSlug,
  coffee: createCoffeeSlug,
  extractBase: extractBaseSlug,
  comparisonToken: createComparisonToken,
};

export default slug;
