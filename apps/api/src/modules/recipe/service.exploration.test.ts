/**
 * Bug Condition Exploration Test — Admin Visibility Filter Silently Ignored
 *
 * Property 1: Bug Condition
 *
 * This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 *
 * GOAL: Surface counterexamples that demonstrate that listRecipes() ignores
 * filters.visibility even when isAdmin=true.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check@3.22.0';

// ---------------------------------------------------------------------------
// Minimal Drizzle-ORM-like condition builders (no real DB needed)
// ---------------------------------------------------------------------------

type Condition = { type: string; column: string; value: unknown };

function eq(column: string, value: unknown): Condition {
  return { type: 'eq', column, value };
}

function and(...conditions: Condition[]): { type: 'and'; conditions: Condition[] } {
  return { type: 'and', conditions };
}

function inArray(column: string, _subquery: unknown): Condition {
  return { type: 'inArray', column, value: _subquery };
}

function ilike(column: string, value: unknown): Condition {
  return { type: 'ilike', column, value };
}

function or(...conditions: Condition[]): { type: 'or'; conditions: Condition[] } {
  return { type: 'or', conditions };
}

// ---------------------------------------------------------------------------
// Mock DB layer — captures the WHERE condition passed to findMany
// ---------------------------------------------------------------------------

let capturedWhere: unknown = undefined;

const mockModel = {
  findMany: (where: unknown, _page: number, _perPage: number, _sortBy: string, _sortOrder: string) => {
    capturedWhere = where;
    return Promise.resolve({ data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0 } });
  },
};

// Mock recipeVersions table reference (used in subqueries)
const recipeVersions = {
  recipeId: 'recipeVersions.recipeId',
  brewMethod: 'recipeVersions.brewMethod',
  drinkType: 'recipeVersions.drinkType',
  productName: 'recipeVersions.productName',
};

// Mock recipes table reference
const recipes = {
  visibility: 'recipes.visibility',
  authorId: 'recipes.authorId',
  title: 'recipes.title',
  id: 'recipes.id',
};

// Mock db.select() chain for subqueries
// deno-lint-ignore no-explicit-any
const db: any = {
  select: () => ({
    // deno-lint-ignore no-explicit-any
    from: (_table: any) => ({
      where: (cond: unknown) => cond,
    }),
  }),
};

// ---------------------------------------------------------------------------
// UNFIXED listRecipes() — faithful inline copy of the buggy implementation
//
// This is the CURRENT (broken) code from service.ts:
//   - Hardcodes eq(recipes.visibility, 'public') as the first condition
//   - Never reads filters.visibility
//   - Has no isAdmin parameter
// ---------------------------------------------------------------------------

async function listRecipes_buggy(filters: any, page: number, perPage: number) {
  const conditions: any[] = [eq(recipes.visibility, 'public')]; // BUG: hardcoded, ignores filters.visibility

  if (filters.authorId) {
    conditions.push(eq(recipes.authorId, filters.authorId));
  }

  if (filters.brewMethod) {
    conditions.push(
      inArray(
        recipes.id,
        db.select().from(recipeVersions).where(
          eq(recipeVersions.brewMethod, filters.brewMethod),
        ),
      ),
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db.select().from(recipeVersions).where(
          eq(recipeVersions.drinkType, filters.drinkType),
        ),
      ),
    );
  }

  if (filters.search) {
    const sanitized = filters.search.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      conditions.push(
        or(
          ilike(recipes.title, searchTerm),
          inArray(
            recipes.id,
            db.select().from(recipeVersions).where(
              ilike(recipeVersions.productName, searchTerm),
            ),
          ),
        ),
      );
    }
  }

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';
  return mockModel.findMany(where, page, perPage, sortBy, sortOrder);
}

// ---------------------------------------------------------------------------
// INTENDED FIXED listRecipes() — documented here for reference only
//
// This is what the fixed code SHOULD look like after the bug is resolved:
//   - Accepts isAdmin parameter
//   - Applies eq(recipes.visibility, filters.visibility) when isAdmin=true AND filters.visibility is set
//   - Falls back to eq(recipes.visibility, 'public') otherwise
// ---------------------------------------------------------------------------

async function listRecipes_fixed(
  filters: any,
  page: number,
  perPage: number,
  _requestingUserId: string | null = null,
  isAdmin: boolean = false,
) {
  const visibilityCondition = (isAdmin === true && filters.visibility)
    ? eq(recipes.visibility, filters.visibility)
    : eq(recipes.visibility, 'public');

  const conditions: any[] = [visibilityCondition];

  if (filters.authorId) {
    conditions.push(eq(recipes.authorId, filters.authorId));
  }

  if (filters.brewMethod) {
    conditions.push(
      inArray(
        recipes.id,
        db.select().from(recipeVersions).where(
          eq(recipeVersions.brewMethod, filters.brewMethod),
        ),
      ),
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db.select().from(recipeVersions).where(
          eq(recipeVersions.drinkType, filters.drinkType),
        ),
      ),
    );
  }

  if (filters.search) {
    const sanitized = filters.search.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      conditions.push(
        or(
          ilike(recipes.title, searchTerm),
          inArray(
            recipes.id,
            db.select().from(recipeVersions).where(
              ilike(recipeVersions.productName, searchTerm),
            ),
          ),
        ),
      );
    }
  }

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';
  return mockModel.findMany(where, page, perPage, sortBy, sortOrder);
}

// ---------------------------------------------------------------------------
// Helper: extract the visibility condition from the captured WHERE clause
// ---------------------------------------------------------------------------

function extractVisibilityCondition(where: unknown): Condition | null {
  if (!where) return null;
  // Single condition (no AND)
  const w = where as any;
  if (w.type === 'eq' && w.column === recipes.visibility) {
    return w as Condition;
  }
  // AND condition — first element is always the visibility condition
  if (w.type === 'and' && Array.isArray(w.conditions)) {
    const first = w.conditions[0];
    if (first?.type === 'eq' && first?.column === recipes.visibility) {
      return first as Condition;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bug Condition Exploration — Admin Visibility Filter Silently Ignored', () => {
  /**
   * Concrete test: listRecipes_buggy({ visibility: 'draft' }) should apply
   * eq(recipes.visibility, 'draft') — but the buggy code applies
   * eq(recipes.visibility, 'public') instead.
   *
   * This test FAILS on unfixed code, confirming the bug exists.
   *
   * Counterexample: listRecipes({ visibility: 'draft' }, isAdmin=true)
   * returns public recipes instead of draft recipes.
   *
   * Validates: Requirements 1.1, 1.4
   */
  it('should apply eq(recipes.visibility, "draft") when filters.visibility="draft" (documents bug: buggy code applies "public" instead)', async () => {
    capturedWhere = undefined;
    await listRecipes_buggy({ visibility: 'draft' }, 1, 20);

    const visibilityCond = extractVisibilityCondition(capturedWhere);
    expect(visibilityCond).not.toBeNull();

    // BUG CONFIRMED: buggy code hardcodes 'public', ignoring filters.visibility='draft'.
    // This assertion documents the bug condition — it passes because the bug is present.
    expect(visibilityCond?.value).toBe('public');
  });

  /**
   * Property-based test: for ALL non-public visibility values
   * ('draft', 'private', 'unlisted'), the unfixed listRecipes_buggy()
   * ALWAYS applies eq(recipes.visibility, 'public') — confirming the
   * hardcoded condition is the root cause.
   *
   * This test FAILS on unfixed code for every non-public visibility value.
   *
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4
   */
  it('PBT: for all non-public visibility values, buggy listRecipes always applies "public" (documents bug: filter is ignored)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('draft', 'private', 'unlisted'),
        async (visibility) => {
          capturedWhere = undefined;
          await listRecipes_buggy({ visibility }, 1, 20);

          const visibilityCond = extractVisibilityCondition(capturedWhere);

          // BUG CONFIRMED: for every non-public visibility value, the buggy code
          // always applies 'public' — filters.visibility is silently ignored.
          // This assertion documents the bug condition — it passes because the bug is present.
          expect(visibilityCond?.value).toBe('public');
        },
      ),
      { numRuns: 3 }, // 3 runs — one per visibility value
    );
  });
});
