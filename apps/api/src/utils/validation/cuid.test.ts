/**
 * CUID Validation Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  cuidSchema,
  optionalCuidSchema,
  nullableCuidSchema,
  cuidArraySchema,
  optionalCuidArraySchema,
  idParamSchema,
  recipeIdParamSchema,
  commentIdParamSchema,
  userIdParamSchema,
  vendorIdParamSchema,
  coffeeIdParamSchema,
  equipmentIdsSchema,
  recipeReferenceSchema,
  comparisonSchema,
  commentSchema,
  validateCuidFields,
  transformToCuid,
  createCuidRefine,
  CUID_ERROR_MESSAGES,
} from './cuid.js';

describe('CUID Validation Utilities', () => {
  const validCuid = 'clh1234567890abcdefghij01';
  const invalidCuid = 'invalid-id';

  describe('CUID Schemas', () => {
    describe('cuidSchema', () => {
      it('should accept valid CUID', () => {
        const result = cuidSchema.parse(validCuid);
        expect(result).toBe(validCuid);
      });

      it('should reject invalid CUID', () => {
        expect(() => cuidSchema.parse(invalidCuid)).toThrow();
        expect(() => cuidSchema.parse('')).toThrow();
        expect(() => cuidSchema.parse('123')).toThrow();
      });
    });

    describe('optionalCuidSchema', () => {
      it('should accept valid CUID', () => {
        const result = optionalCuidSchema.parse(validCuid);
        expect(result).toBe(validCuid);
      });

      it('should accept undefined', () => {
        const result = optionalCuidSchema.parse(undefined);
        expect(result).toBeUndefined();
      });

      it('should reject invalid CUID', () => {
        expect(() => optionalCuidSchema.parse(invalidCuid)).toThrow();
      });
    });

    describe('nullableCuidSchema', () => {
      it('should accept valid CUID', () => {
        const result = nullableCuidSchema.parse(validCuid);
        expect(result).toBe(validCuid);
      });

      it('should accept null', () => {
        const result = nullableCuidSchema.parse(null);
        expect(result).toBeNull();
      });
    });

    describe('cuidArraySchema', () => {
      it('should accept array of valid CUIDs', () => {
        const result = cuidArraySchema.parse([validCuid, validCuid]);
        expect(result).toHaveLength(2);
      });

      it('should accept empty array', () => {
        const result = cuidArraySchema.parse([]);
        expect(result).toHaveLength(0);
      });

      it('should reject array with invalid CUID', () => {
        expect(() => cuidArraySchema.parse([validCuid, invalidCuid])).toThrow();
      });
    });

    describe('optionalCuidArraySchema', () => {
      it('should accept undefined', () => {
        const result = optionalCuidArraySchema.parse(undefined);
        expect(result).toBeUndefined();
      });

      it('should accept valid array', () => {
        const result = optionalCuidArraySchema.parse([validCuid]);
        expect(result).toHaveLength(1);
      });
    });
  });

  describe('Parameter Schemas', () => {
    describe('idParamSchema', () => {
      it('should accept valid id param', () => {
        const result = idParamSchema.parse({ id: validCuid });
        expect(result.id).toBe(validCuid);
      });

      it('should reject invalid id', () => {
        expect(() => idParamSchema.parse({ id: invalidCuid })).toThrow();
      });
    });

    describe('recipeIdParamSchema', () => {
      it('should accept valid recipeId param', () => {
        const result = recipeIdParamSchema.parse({ recipeId: validCuid });
        expect(result.recipeId).toBe(validCuid);
      });
    });

    describe('commentIdParamSchema', () => {
      it('should accept valid commentId param', () => {
        const result = commentIdParamSchema.parse({ commentId: validCuid });
        expect(result.commentId).toBe(validCuid);
      });
    });

    describe('userIdParamSchema', () => {
      it('should accept valid userId param', () => {
        const result = userIdParamSchema.parse({ userId: validCuid });
        expect(result.userId).toBe(validCuid);
      });
    });

    describe('vendorIdParamSchema', () => {
      it('should accept valid vendorId param', () => {
        const result = vendorIdParamSchema.parse({ vendorId: validCuid });
        expect(result.vendorId).toBe(validCuid);
      });
    });

    describe('coffeeIdParamSchema', () => {
      it('should accept valid coffeeId param', () => {
        const result = coffeeIdParamSchema.parse({ coffeeId: validCuid });
        expect(result.coffeeId).toBe(validCuid);
      });
    });
  });

  describe('Entity ID Schemas', () => {
    describe('equipmentIdsSchema', () => {
      it('should accept all optional equipment IDs', () => {
        const result = equipmentIdsSchema.parse({
          grinderId: validCuid,
          brewerId: validCuid,
        });
        expect(result.grinderId).toBe(validCuid);
        expect(result.brewerId).toBe(validCuid);
      });

      it('should accept empty object', () => {
        const result = equipmentIdsSchema.parse({});
        expect(result.grinderId).toBeUndefined();
      });

      it('should reject invalid equipment IDs', () => {
        expect(() => equipmentIdsSchema.parse({ grinderId: invalidCuid })).toThrow();
      });
    });
  });

  describe('Request Body Schemas', () => {
    describe('recipeReferenceSchema', () => {
      it('should accept optional coffee and vendor IDs', () => {
        const result = recipeReferenceSchema.parse({
          coffeeId: validCuid,
          vendorId: validCuid,
        });
        expect(result.coffeeId).toBe(validCuid);
      });

      it('should accept empty object', () => {
        const result = recipeReferenceSchema.parse({});
        expect(result).toBeDefined();
      });
    });

    describe('comparisonSchema', () => {
      it('should accept two recipe IDs', () => {
        const result = comparisonSchema.parse({
          recipeAId: validCuid,
          recipeBId: validCuid,
        });
        expect(result.recipeAId).toBe(validCuid);
        expect(result.recipeBId).toBe(validCuid);
      });

      it('should require both recipe IDs', () => {
        expect(() => comparisonSchema.parse({ recipeAId: validCuid })).toThrow();
      });
    });

    describe('commentSchema', () => {
      it('should accept comment with optional parentId', () => {
        const result = commentSchema.parse({
          content: 'Great recipe!',
          parentId: validCuid,
        });
        expect(result.content).toBe('Great recipe!');
        expect(result.parentId).toBe(validCuid);
      });

      it('should accept comment without parentId', () => {
        const result = commentSchema.parse({
          content: 'Nice espresso',
        });
        expect(result.content).toBe('Nice espresso');
      });

      it('should reject empty content', () => {
        expect(() => commentSchema.parse({ content: '' })).toThrow();
      });

      it('should reject content exceeding max length', () => {
        expect(() => commentSchema.parse({ content: 'a'.repeat(2001) })).toThrow();
      });
    });
  });

  describe('Custom Validation Functions', () => {
    describe('validateCuidFields', () => {
      it('should validate all specified CUID fields', () => {
        const obj = { id: validCuid, userId: validCuid, name: 'test' };
        const result = validateCuidFields(obj, ['id', 'userId']);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should report errors for invalid CUIDs', () => {
        const obj = { id: invalidCuid, userId: validCuid };
        const result = validateCuidFields(obj, ['id', 'userId']);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('id');
      });

      it('should skip null and undefined values', () => {
        const obj = { id: null, userId: undefined };
        const result = validateCuidFields(obj, ['id', 'userId']);
        expect(result.isValid).toBe(true);
      });
    });

    describe('transformToCuid', () => {
      it('should return validated CUID', () => {
        const result = transformToCuid(validCuid);
        expect(result).toBe(validCuid);
      });

      it('should throw for invalid CUID', () => {
        expect(() => transformToCuid(invalidCuid)).toThrow();
      });
    });

    describe('createCuidRefine', () => {
      it('should create schema that validates CUID format', () => {
        const schema = createCuidRefine();
        expect(() => schema.parse(validCuid)).not.toThrow();
      });

      it('should reject invalid format', () => {
        const schema = createCuidRefine();
        expect(() => schema.parse(invalidCuid)).toThrow();
      });

      it('should use custom error message', () => {
        const schema = createCuidRefine('Custom error');
        try {
          schema.parse(invalidCuid);
        } catch (e) {
          expect(String(e)).toContain('Custom error');
        }
      });
    });
  });

  describe('Constants', () => {
    it('should have error messages defined', () => {
      expect(CUID_ERROR_MESSAGES.INVALID_CUID).toBeDefined();
      expect(CUID_ERROR_MESSAGES.REQUIRED).toBeDefined();
      expect(CUID_ERROR_MESSAGES.INVALID_FORMAT).toBeDefined();
    });
  });
});
