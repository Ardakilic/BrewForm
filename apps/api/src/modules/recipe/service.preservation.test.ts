// deno-lint-ignore-file no-explicit-any require-await

/**
 * Preservation Property Tests — Non-Admin and Unauthenticated Requests Always Return Public Recipes
 *
 * Property 2: Preservation
 *
 * These tests MUST PASS on unfixed code — they capture baseline behavior that must not
 * regress after the fix is applied.
 *
 * GOAL: Lock down the baseline non-admin behavior before touching any production code.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check';

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
  findMany: (
    where: unknown,
    _page: number,
    _perPage: number,
    _sortBy: string,
    _sortOrder: string,
  ) => {
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
const db: any = {
  select: () => ({
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
// Helper: extract the visibility condition from the captured WHERE clause
// ---------------------------------------------------------------------------

function extractVisibilityCondition(where: unknown): Condition | null {
  if (!where) return null;
  const w = where as any;
  // Single condition (no AND)
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
// Helper: extract all conditions from the captured WHERE clause as a flat array
// ---------------------------------------------------------------------------

function extractAllConditions(where: unknown): Condition[] {
  if (!where) return [];
  const w = where as any;
  if (w.type === 'and' && Array.isArray(w.conditions)) {
    return w.conditions as Condition[];
  }
  return [w as Condition];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Preservation — Non-Admin and Unauthenticated Requests Always Return Public Recipes', () => {
  /**
   * Preservation 2.1 — PBT
   *
   * For any filters object where isAdmin=false (or absent) and any visibility value in filters,
   * listRecipes_buggy ALWAYS applies eq(recipes.visibility, 'public').
   *
   * This test PASSES on unfixed code — the buggy code always hardcodes 'public',
   * which is the correct behavior for non-admin callers.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it('PBT (2.1): for any filters with any visibility value and isAdmin=false, always applies eq(recipes.visibility, "public")', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          visibility: fc.option(
            fc.constantFrom('draft', 'private', 'unlisted', 'public'),
            { nil: undefined },
          ),
        }),
        async (filters) => {
          capturedWhere = undefined;
          // isAdmin is absent (not passed) — simulates non-admin / unauthenticated caller
          await listRecipes_buggy(filters, 1, 20);

          const visibilityCond = extractVisibilityCondition(capturedWhere);
          expect(visibilityCond).not.toBeNull();
          // Baseline: non-admin callers always receive the 'public' condition
          expect(visibilityCond?.value).toBe('public');
        },
      ),
    );
  });

  /**
   * Preservation 2.2 — PBT
   *
   * For any filters object with no filters.visibility set (even with isAdmin=true conceptually),
   * listRecipes_buggy ALWAYS applies eq(recipes.visibility, 'public') — default behavior preserved.
   *
   * This test PASSES on unfixed code — when no visibility filter is provided, the default
   * 'public' condition must always be applied regardless of admin status.
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  it('PBT (2.2): for any filters with no visibility field, always applies eq(recipes.visibility, "public") (default preserved)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          brewMethod: fc.option(
            fc.constantFrom('v60', 'espresso_machine', 'french_press'),
            { nil: undefined },
          ),
          drinkType: fc.option(
            fc.constantFrom('espresso', 'pour_over'),
            { nil: undefined },
          ),
        }),
        async (filters) => {
          capturedWhere = undefined;
          // No visibility field in filters — default behavior must apply
          await listRecipes_buggy(filters, 1, 20);

          const visibilityCond = extractVisibilityCondition(capturedWhere);
          expect(visibilityCond).not.toBeNull();
          // Default: when no visibility filter is given, always return public recipes
          expect(visibilityCond?.value).toBe('public');
        },
      ),
    );
  });

  /**
   * Preservation 2.3 — Concrete
   *
   * listRecipes_buggy({ brewMethod: 'v60', visibility: 'draft' }, 1, 20) with isAdmin=false
   * → mock DB receives eq(recipes.visibility, 'public') AND the brewMethod condition is also present.
   *
   * This test PASSES on unfixed code — confirms that:
   * 1. The visibility condition is always 'public' for non-admin callers
   * 2. Other filters (brewMethod) are still applied correctly (no regression)
   *
   * **Validates: Requirements 3.1, 3.3**
   */
  it('Concrete (2.3): non-admin with brewMethod="v60" and visibility="draft" → visibility is "public" AND brewMethod condition is present', async () => {
    capturedWhere = undefined;
    await listRecipes_buggy({ brewMethod: 'v60', visibility: 'draft' }, 1, 20);

    const visibilityCond = extractVisibilityCondition(capturedWhere);
    expect(visibilityCond).not.toBeNull();
    // Visibility must always be 'public' for non-admin callers
    expect(visibilityCond?.value).toBe('public');

    // Other filters must still be applied — brewMethod condition must be present
    const allConditions = extractAllConditions(capturedWhere);
    const brewMethodCond = allConditions.find(
      (c) => c.type === 'inArray' && c.column === recipes.id,
    );
    expect(brewMethodCond).not.toBeUndefined();
  });
});
