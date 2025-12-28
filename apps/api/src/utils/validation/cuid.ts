/**
 * BrewForm Validation Utilities
 * Shared validation patterns for CUID and other common validations
 */

import { z } from 'zod';
import type { Cuid } from '../../types/index';

// ============================================
// CUID Validation Schemas
// ============================================

/**
 * Base CUID validation schema
 */
export const cuidSchema = z.string().cuid();

/**
 * Optional CUID validation schema
 */
export const optionalCuidSchema = z.string().cuid().optional();

/**
 * Nullable CUID validation schema
 */
export const nullableCuidSchema = z.string().cuid().nullable();

/**
 * CUID array validation schema
 */
export const cuidArraySchema = z.array(z.string().cuid());

/**
 * Optional CUID array validation schema
 */
export const optionalCuidArraySchema = z.array(z.string().cuid()).optional();

// ============================================
// Parameter Validation Schemas
// ============================================

/**
 * ID parameter validation with CUID
 */
export const idParamSchema = z.object({
  id: z.string().cuid(),
});

/**
 * Recipe ID parameter validation
 */
export const recipeIdParamSchema = z.object({
  recipeId: z.string().cuid(),
});

/**
 * Comment ID parameter validation
 */
export const commentIdParamSchema = z.object({
  commentId: z.string().cuid(),
});

/**
 * User ID parameter validation
 */
export const userIdParamSchema = z.object({
  userId: z.string().cuid(),
});

/**
 * Vendor ID parameter validation
 */
export const vendorIdParamSchema = z.object({
  vendorId: z.string().cuid(),
});

/**
 * Coffee ID parameter validation
 */
export const coffeeIdParamSchema = z.object({
  coffeeId: z.string().cuid(),
});

// ============================================
// Entity ID Schemas
// ============================================

/**
 * Equipment ID schemas
 */
export const equipmentIdsSchema = z.object({
  grinderId: z.string().cuid().optional(),
  brewerId: z.string().cuid().optional(),
  portafilterId: z.string().cuid().optional(),
  basketId: z.string().cuid().optional(),
  puckScreenId: z.string().cuid().optional(),
  paperFilterId: z.string().cuid().optional(),
  tamperId: z.string().cuid().optional(),
});

// ============================================
// Request Body Schemas
// ============================================

/**
 * Recipe reference IDs schema
 */
export const recipeReferenceSchema = z.object({
  coffeeId: z.string().cuid().optional(),
  vendorId: z.string().cuid().optional(),
});

/**
 * Comparison schema with CUID validation
 */
export const comparisonSchema = z.object({
  recipeAId: z.string().cuid(),
  recipeBId: z.string().cuid(),
});

/**
 * Comment schema with CUID validation
 */
export const commentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().cuid().optional(),
});

// ============================================
// Custom Validation Functions
// ============================================

/**
 * Validate that all IDs in an object are valid CUIDs
 */
export function validateCuidFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const field of fields) {
    const value = obj[field];
    if (value !== null && value !== undefined) {
      if (typeof value !== 'string' || !cuidSchema.safeParse(value).success) {
        errors.push(`${String(field)} must be a valid CUID`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Transform a string to CUID type (after validation)
 */
export function transformToCuid(value: string): Cuid {
  return cuidSchema.parse(value) as Cuid;
}

/**
 * Create a refined schema that validates CUID format
 */
export function createCuidRefine(message?: string) {
  return z.string().refine(
    (val: string) => /^c[0-9a-z]{24}$/i.test(val),
    { message: message || 'Invalid CUID format' }
  );
}

// ============================================
// Error Messages
// ============================================

export const CUID_ERROR_MESSAGES = {
  INVALID_CUID: 'Invalid CUID format',
  REQUIRED: 'ID is required',
  INVALID_FORMAT: 'ID must be a valid CUID (starts with "c" followed by 24 characters)',
} as const;

// ============================================
// Exports
// ============================================

export {
  cuidSchema as default,
};

export type {
  Cuid,
};
