/**
 * Unit tests for buildRecipeFilters() — the shared filter-building helper.
 *
 * These tests use a minimal mock Drizzle surface (eq, inArray, ilike, or)
 * matching the pattern in service.preservation.test.ts, so no real DB is
 * required. The tests verify the shape of the SQL[] returned for each
 * filter branch.
 *
 * NOTE: Because the real helper imports `db` and Drizzle operators from
 * modules that cannot be cleanly stubbed in Deno, this file holds a
 * faithful inline copy of `buildRecipeFilters` (and the delegated
 * `recipeCoffeeVarietyCondition`) wired against the local mock surface.
 * Mirror any change to the real implementation here.
 *
 * TODO(integration-testing): Evaluate lightweight integration options
 * (in-memory PostgreSQL, testcontainers, or minimal adapter stubs) so the
 * real `buildRecipeFilters` and `recipeCoffeeVarietyCondition` exported
 * from `./model.ts` can be exercised here without a full DB fixture.
 * Tracking this in the repo issue tracker is the recommended follow-up;
 * once a path is chosen, the duplicated inline copy in this file should
 * be removed in favour of importing the real implementations.
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { rankRecipes } from './service.ts';

type MockCondition = {
  type: string;
  column?: string | MockCondition;
  value?: unknown;
  conditions?: MockCondition[];
};

function eq(column: string, value: unknown): MockCondition {
  return { type: 'eq', column, value };
}

function inArray(column: string, subquery: unknown): MockCondition {
  return { type: 'inArray', column, value: subquery };
}

function ilike(column: string, value: unknown): MockCondition {
  return { type: 'ilike', column, value };
}

function or(...conditions: MockCondition[]): MockCondition {
  return { type: 'or', conditions };
}

function gte(column: string | MockCondition, value: unknown): MockCondition {
  return { type: 'gte', column, value };
}

function lte(column: string | MockCondition, value: unknown): MockCondition {
  return { type: 'lte', column, value };
}

function avg(column: string): MockCondition {
  return { type: 'avg', column };
}

function and(...conditions: (MockCondition | undefined)[]): MockCondition | undefined {
  const filtered = conditions.filter((c) => c !== undefined) as MockCondition[];
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return { type: 'and', conditions: filtered };
}

const recipes = {
  id: 'recipes.id',
  currentVersionId: 'recipes.currentVersionId',
  title: 'recipes.title',
  createdAt: 'recipes.createdAt',
  authorId: 'recipes.authorId',
  featured: 'recipes.featured',
};

const recipeVersions = {
  recipeId: 'recipeVersions.recipeId',
  brewMethod: 'recipeVersions.brewMethod',
  drinkType: 'recipeVersions.drinkType',
  productName: 'recipeVersions.productName',
  brewerDetails: 'recipeVersions.brewerDetails',
  coffeeVarietyId: 'recipeVersions.coffeeVarietyId',
  personalNotes: 'recipeVersions.personalNotes',
  id: 'recipeVersions.id',
};

const recipeEquipment = {
  recipeVersionId: 'recipeEquipment.recipeVersionId',
  equipmentId: 'recipeEquipment.equipmentId',
};

const recipeTasteNotes = {
  recipeVersionId: 'recipeTasteNotes.recipeVersionId',
  tasteNoteId: 'recipeTasteNotes.tasteNoteId',
};

const users = {
  id: 'users.id',
  username: 'users.username',
  displayName: 'users.displayName',
};

const userRecipeRatings = {
  recipeId: 'userRecipeRatings.recipeId',
  rating: 'userRecipeRatings.rating',
};

// deno-lint-ignore no-explicit-any -- test mock parameter
const db: any = {
  select: (projection: unknown) => ({
    from: (table: unknown) => ({
      where: (cond: unknown) => ({ projection, table, where: cond }),
      groupBy: (..._cols: unknown[]) => ({
        having: (cond: unknown) => ({ projection, table, having: cond }),
      }),
    }),
  }),
};

interface RecipeFilterCriteria {
  brewMethod?: string;
  drinkType?: string;
  search?: string;
  equipmentId?: string;
  tasteNoteIds?: string;
  tasteNoteId?: string;
  mainBrewer?: string;
  coffeeVarietyId?: string;
  author?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minRating?: number;
  maxRating?: number;
}

function recipeCoffeeVarietyCondition(coffeeVarietyId: string): MockCondition {
  return inArray(
    recipes.id,
    db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
      eq(recipeVersions.coffeeVarietyId, coffeeVarietyId),
    ),
  );
}

function buildRecipeFilters(filters: RecipeFilterCriteria): MockCondition[] {
  const conditions: MockCondition[] = [];

  if (filters.brewMethod) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId })
          .from(recipeVersions)
          .where(eq(recipeVersions.brewMethod, filters.brewMethod)),
      ),
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId })
          .from(recipeVersions)
          .where(eq(recipeVersions.drinkType, filters.drinkType)),
      ),
    );
  }

  if (filters.search) {
    const sanitized = filters.search.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      const searchCondition = or(
        ilike(recipes.title, searchTerm),
        inArray(
          recipes.id,
          db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
            or(
              ilike(recipeVersions.productName, searchTerm),
              // F11: personalNotes added to search scope (weight 1)
              ilike(recipeVersions.personalNotes, searchTerm),
            ),
          ),
        ),
      );
      if (searchCondition) conditions.push(searchCondition);
    }
  }

  if (filters.mainBrewer) {
    const sanitized = filters.mainBrewer.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      conditions.push(
        inArray(
          recipes.id,
          db.select({ id: recipeVersions.recipeId })
            .from(recipeVersions)
            .where(ilike(recipeVersions.brewerDetails, searchTerm)),
        ),
      );
    }
  }

  // F11: author username/displayName substring filter
  if (filters.author) {
    const sanitized = filters.author.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      conditions.push(
        inArray(
          recipes.authorId,
          db.select({ id: users.id }).from(users).where(
            or(
              ilike(users.username, searchTerm),
              ilike(users.displayName, searchTerm),
            ),
          ),
        ),
      );
    }
  }

  // F11: date range filter on recipes.createdAt
  if (filters.dateFrom) {
    conditions.push(gte(recipes.createdAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(recipes.createdAt, filters.dateTo));
  }

  // F11: rating range filter via avg(userRecipeRatings.rating) subquery
  if (filters.minRating || filters.maxRating) {
    const minCondition = filters.minRating
      ? gte(avg(userRecipeRatings.rating), filters.minRating)
      : undefined;
    const maxCondition = filters.maxRating
      ? lte(avg(userRecipeRatings.rating), filters.maxRating)
      : undefined;
    const havingClause = and(minCondition, maxCondition);
    if (havingClause) {
      conditions.push(
        inArray(
          recipes.id,
          db.select({ recipeId: userRecipeRatings.recipeId })
            .from(userRecipeRatings)
            .groupBy(userRecipeRatings.recipeId)
            .having(havingClause),
        ),
      );
    }
  }

  if (filters.coffeeVarietyId) {
    conditions.push(recipeCoffeeVarietyCondition(filters.coffeeVarietyId));
  }

  if (filters.equipmentId) {
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db.select({ id: recipeEquipment.recipeVersionId })
          .from(recipeEquipment)
          .where(eq(recipeEquipment.equipmentId, filters.equipmentId)),
      ),
    );
  }

  if (filters.tasteNoteIds) {
    const ids = filters.tasteNoteIds.split(',').map((id) => id.trim());
    for (const noteId of ids) {
      conditions.push(
        inArray(
          recipes.currentVersionId,
          db.select({ id: recipeTasteNotes.recipeVersionId })
            .from(recipeTasteNotes)
            .where(eq(recipeTasteNotes.tasteNoteId, noteId)),
        ),
      );
    }
  } else if (filters.tasteNoteId) {
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db.select({ id: recipeTasteNotes.recipeVersionId })
          .from(recipeTasteNotes)
          .where(eq(recipeTasteNotes.tasteNoteId, filters.tasteNoteId)),
      ),
    );
  }

  return conditions;
}

describe('buildRecipeFilters', () => {
  it('returns an empty array when no filters are set', () => {
    const result = buildRecipeFilters({});
    expect(result).toEqual([]);
  });

  it('generates a brewMethod condition', () => {
    const result = buildRecipeFilters({ brewMethod: 'v60' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.id);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(eq(recipeVersions.brewMethod, 'v60'));
  });

  it('generates a drinkType condition', () => {
    const result = buildRecipeFilters({ drinkType: 'espresso' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.id);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(eq(recipeVersions.drinkType, 'espresso'));
  });

  it('generates a sanitized search condition with or()', () => {
    const result = buildRecipeFilters({ search: 'fr%uit_y' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('or');
    const subs = result[0].conditions!;
    expect(subs).toHaveLength(2);
    expect(subs[0]).toEqual(ilike(recipes.title, '%fruity%'));
    expect(subs[1].type).toBe('inArray');
    expect(subs[1].column).toBe(recipes.id);
  });

  it('skips search when sanitized input is empty', () => {
    expect(buildRecipeFilters({ search: '%_%' })).toEqual([]);
    expect(buildRecipeFilters({ search: '' })).toEqual([]);
  });

  it('generates a sanitized mainBrewer condition', () => {
    const result = buildRecipeFilters({ mainBrewer: 'Hario%' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.id);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(ilike(recipeVersions.brewerDetails, '%Hario%'));
  });

  it('skips mainBrewer when sanitized input is empty', () => {
    expect(buildRecipeFilters({ mainBrewer: '%' })).toEqual([]);
    expect(buildRecipeFilters({ mainBrewer: '' })).toEqual([]);
  });

  it('generates an equipmentId condition', () => {
    const result = buildRecipeFilters({ equipmentId: 'equip-uuid' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.currentVersionId);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(eq(recipeEquipment.equipmentId, 'equip-uuid'));
  });

  it('delegates coffeeVarietyId to recipeCoffeeVarietyCondition', () => {
    const result = buildRecipeFilters({ coffeeVarietyId: 'variety-uuid' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(recipeCoffeeVarietyCondition('variety-uuid'));
  });

  it('generates one condition per id for tasteNoteIds (multi)', () => {
    const result = buildRecipeFilters({ tasteNoteIds: 'a, b ,c' });
    expect(result).toHaveLength(3);
    const ids = result.map((cond) => {
      const sub = cond.value as { where: MockCondition };
      return sub.where.value;
    });
    expect(ids).toEqual(['a', 'b', 'c']);
    for (const cond of result) {
      expect(cond.type).toBe('inArray');
      expect(cond.column).toBe(recipes.currentVersionId);
    }
  });

  it('generates a single tasteNoteId condition (deprecated, singular)', () => {
    const result = buildRecipeFilters({ tasteNoteId: 'note-uuid' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('inArray');
    expect(result[0].column).toBe(recipes.currentVersionId);
    const sub = result[0].value as { where: MockCondition };
    expect(sub.where).toEqual(eq(recipeTasteNotes.tasteNoteId, 'note-uuid'));
  });

  it('prefers tasteNoteIds over tasteNoteId when both are set', () => {
    const result = buildRecipeFilters({ tasteNoteIds: 'a,b', tasteNoteId: 'c' });
    expect(result).toHaveLength(2);
    const ids = result.map((cond) => {
      const sub = cond.value as { where: MockCondition };
      return sub.where.value;
    });
    expect(ids).toEqual(['a', 'b']);
    expect(ids).not.toContain('c');
  });

  // --- F11: author filter ---
  it('buildRecipeFilters: author generates users subquery condition', () => {
    const conditions = buildRecipeFilters({ author: 'alice' });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('inArray');
    expect(conditions[0].column).toBe(recipes.authorId);
  });

  it('buildRecipeFilters: empty author generates no condition', () => {
    const conditions = buildRecipeFilters({ author: '' });
    expect(conditions).toHaveLength(0);
  });

  it('buildRecipeFilters: author with wildcards stripped', () => {
    const conditions = buildRecipeFilters({ author: '%alice%' });
    expect(conditions).toHaveLength(1);
    const sub = conditions[0].value as { where: MockCondition };
    const orCond = sub.where;
    expect(orCond.type).toBe('or');
    const orConds = orCond.conditions!;
    expect(orConds[0]).toEqual(ilike(users.username, '%alice%'));
    expect(orConds[1]).toEqual(ilike(users.displayName, '%alice%'));
  });

  // --- F11: date range filter ---
  it('buildRecipeFilters: dateFrom generates gte condition', () => {
    const date = new Date('2025-01-01');
    const conditions = buildRecipeFilters({ dateFrom: date });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('gte');
    expect(conditions[0].column).toBe(recipes.createdAt);
    expect(conditions[0].value).toBe(date);
  });

  it('buildRecipeFilters: dateTo generates lte condition', () => {
    const date = new Date('2025-12-01');
    const conditions = buildRecipeFilters({ dateTo: date });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('lte');
    expect(conditions[0].column).toBe(recipes.createdAt);
    expect(conditions[0].value).toBe(date);
  });

  it('buildRecipeFilters: both dateFrom and dateTo generate two conditions', () => {
    const conditions = buildRecipeFilters({
      dateFrom: new Date('2025-01-01'),
      dateTo: new Date('2025-12-01'),
    });
    expect(conditions).toHaveLength(2);
  });

  // --- F11: rating range filter ---
  it('buildRecipeFilters: minRating generates having-gte subquery', () => {
    const conditions = buildRecipeFilters({ minRating: 7 });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('inArray');
    expect(conditions[0].column).toBe(recipes.id);
  });

  it('buildRecipeFilters: maxRating generates having-lte subquery', () => {
    const conditions = buildRecipeFilters({ maxRating: 9 });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('inArray');
    expect(conditions[0].column).toBe(recipes.id);
  });

  it('buildRecipeFilters: both minRating and maxRating generate one subquery with two having conditions', () => {
    const conditions = buildRecipeFilters({ minRating: 5, maxRating: 9 });
    expect(conditions).toHaveLength(1); // single inArray with both having clauses
    const sub = conditions[0].value as { having: MockCondition };
    expect(sub.having.type).toBe('and');
    expect(sub.having.conditions).toHaveLength(2);
  });

  // --- F11: search personalNotes ---
  it('buildRecipeFilters: search includes personalNotes in or() condition', () => {
    const conditions = buildRecipeFilters({ search: 'V60' });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe('or');
    // The inner inArray subquery's where should be an or() with productName + personalNotes
    const subs = conditions[0].conditions!;
    expect(subs[1].type).toBe('inArray');
    const innerWhere = (subs[1].value as { where: MockCondition }).where;
    expect(innerWhere.type).toBe('or');
    expect(innerWhere.conditions).toHaveLength(2);
    expect(innerWhere.conditions![0]).toEqual(ilike(recipeVersions.productName, '%V60%'));
    expect(innerWhere.conditions![1]).toEqual(ilike(recipeVersions.personalNotes, '%V60%'));
  });
});

describe('rankRecipes', () => {
  it('title match scores higher than productName match', () => {
    const recipes = [
      {
        title: 'Untitled',
        currentVersionId: 'v2',
        versions: [{ id: 'v2', productName: 'Espresso Blend', personalNotes: null }],
      },
      {
        title: 'Espresso',
        currentVersionId: 'v1',
        versions: [{ id: 'v1', productName: 'Generic', personalNotes: null }],
      },
    ];
    const ranked = rankRecipes(recipes, 'espresso');
    expect(ranked[0].title).toBe('Espresso'); // score 3 > score 2
  });

  it('equal scores preserve DB order (stable sort)', () => {
    const recipes = [
      {
        title: 'Match A',
        currentVersionId: 'v1',
        versions: [{ id: 'v1', productName: null, personalNotes: null }],
      },
      {
        title: 'Match B',
        currentVersionId: 'v2',
        versions: [{ id: 'v2', productName: null, personalNotes: null }],
      },
    ];
    const ranked = rankRecipes(recipes, 'match');
    expect(ranked[0].title).toBe('Match A'); // original order preserved
    expect(ranked[1].title).toBe('Match B');
  });

  it('personalNotes match scores lowest', () => {
    const recipes = [
      {
        title: 'Untitled',
        currentVersionId: 'v1',
        versions: [{ id: 'v1', productName: null, personalNotes: 'Try V60' }],
      },
      {
        title: 'V60 Recipe',
        currentVersionId: 'v2',
        versions: [{ id: 'v2', productName: null, personalNotes: null }],
      },
    ];
    const ranked = rankRecipes(recipes, 'v60');
    expect(ranked[0].title).toBe('V60 Recipe'); // score 3 > score 1
  });
});
