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

type MockCondition = {
  type: string;
  column?: string;
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

const recipes = {
  id: 'recipes.id',
  currentVersionId: 'recipes.currentVersionId',
  title: 'recipes.title',
};

const recipeVersions = {
  recipeId: 'recipeVersions.recipeId',
  brewMethod: 'recipeVersions.brewMethod',
  drinkType: 'recipeVersions.drinkType',
  productName: 'recipeVersions.productName',
  brewerDetails: 'recipeVersions.brewerDetails',
  coffeeVarietyId: 'recipeVersions.coffeeVarietyId',
};

const recipeEquipment = {
  recipeVersionId: 'recipeEquipment.recipeVersionId',
  equipmentId: 'recipeEquipment.equipmentId',
};

const recipeTasteNotes = {
  recipeVersionId: 'recipeTasteNotes.recipeVersionId',
  tasteNoteId: 'recipeTasteNotes.tasteNoteId',
};

// deno-lint-ignore no-explicit-any -- test mock parameter
const db: any = {
  select: (projection: unknown) => ({
    from: (table: unknown) => ({
      where: (cond: unknown) => ({ projection, table, where: cond }),
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
          db.select({ id: recipeVersions.recipeId })
            .from(recipeVersions)
            .where(ilike(recipeVersions.productName, searchTerm)),
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
});
