import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { VISIBILITY_VALUES } from '../constants/visibility.ts';
import {
  CollectionAddRecipeSchema,
  CollectionCreateSchema,
  CollectionListFilterSchema,
  CollectionReorderSchema,
  CollectionUpdateSchema,
} from './collection.ts';

describe('CollectionCreateSchema', () => {
  it('should validate a valid collection', () => {
    const result = CollectionCreateSchema.safeParse({ name: 'My V60s' });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = CollectionCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should reject empty name', () => {
    const result = CollectionCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should default visibility to private', () => {
    const result = CollectionCreateSchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe('private');
    }
  });

  it('should accept all visibility values', () => {
    for (const visibility of VISIBILITY_VALUES) {
      const result = CollectionCreateSchema.safeParse({ name: 'Test', visibility });
      expect(result.success).toBe(true);
    }
  });

  it('should accept optional description', () => {
    const result = CollectionCreateSchema.safeParse({ name: 'Test', description: 'A collection' });
    expect(result.success).toBe(true);
  });
});

describe('CollectionUpdateSchema', () => {
  it('should accept partial updates', () => {
    const result = CollectionUpdateSchema.safeParse({ name: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('should reject empty object', () => {
    const result = CollectionUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept visibility-only update', () => {
    const result = CollectionUpdateSchema.safeParse({ visibility: 'public' });
    expect(result.success).toBe(true);
  });
});

describe('CollectionAddRecipeSchema', () => {
  it('should validate a valid recipeId', () => {
    const result = CollectionAddRecipeSchema.safeParse({ recipeId: crypto.randomUUID() });
    expect(result.success).toBe(true);
  });

  it('should reject non-UUID recipeId', () => {
    const result = CollectionAddRecipeSchema.safeParse({ recipeId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject missing recipeId', () => {
    const result = CollectionAddRecipeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept optional sortOrder', () => {
    const result = CollectionAddRecipeSchema.safeParse({
      recipeId: crypto.randomUUID(),
      sortOrder: 5,
    });
    expect(result.success).toBe(true);
  });
});

describe('CollectionReorderSchema', () => {
  it('should validate a valid itemIds array', () => {
    const result = CollectionReorderSchema.safeParse({
      itemIds: [crypto.randomUUID(), crypto.randomUUID()],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty array', () => {
    const result = CollectionReorderSchema.safeParse({ itemIds: [] });
    expect(result.success).toBe(false);
  });

  it('should reject missing itemIds', () => {
    const result = CollectionReorderSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('CollectionListFilterSchema', () => {
  it('should default page to 1 and perPage to 20', () => {
    const result = CollectionListFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(20);
    }
  });

  it('should accept page and perPage', () => {
    const result = CollectionListFilterSchema.safeParse({ page: '2', perPage: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.perPage).toBe(50);
    }
  });

  it('should accept optional visibility', () => {
    const result = CollectionListFilterSchema.safeParse({ visibility: 'public' });
    expect(result.success).toBe(true);
  });

  it('should accept optional recipeId', () => {
    const result = CollectionListFilterSchema.safeParse({ recipeId: crypto.randomUUID() });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.recipeId).toBe('string');
    }
  });

  it('should omit recipeId when not provided', () => {
    const result = CollectionListFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recipeId).toBeUndefined();
    }
  });
});
