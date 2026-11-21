/**
 * DB-backed parity test for the shared recipe visibility helpers (capability
 * `recipe-visibility`): the SQL conditions `listableRecipeCondition` /
 * `viewableRecipeCondition` must select exactly the rows the pure predicates
 * `canListRecipe` / `canViewRecipe` accept, for every visibility, active and
 * soft-deleted, and for viewer `null`, the author and another user.
 */

import '../../test-setup.ts';
import { db } from '@brewform/db';
import { recipes, type users } from '@brewform/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupRecipes,
  cleanupUsers,
  createRecipe,
  createUser,
} from '../brew-log/test-helpers.ts';
import { listableRecipeCondition, viewableRecipeCondition } from './model.ts';
import { canListRecipe, canViewRecipe } from './service.ts';

const VISIBILITIES = ['public', 'unlisted', 'private', 'draft'] as const;

describe('recipe visibility helpers — SQL/predicate parity', () => {
  let authorA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  /** Every fixture row as stored (active and soft-deleted copies). */
  let fixtures: Array<typeof recipes.$inferSelect> = [];

  beforeAll(async () => {
    authorA = await createUser('vis-parity-a');
    userB = await createUser('vis-parity-b');
    for (const visibility of VISIBILITIES) {
      const active = await createRecipe(authorA.id, visibility);
      const deleted = await createRecipe(authorA.id, visibility);
      const [softDeleted] = await db
        .update(recipes)
        .set({ deletedAt: new Date() })
        .where(eq(recipes.id, deleted.id))
        .returning();
      fixtures.push(active, softDeleted);
    }
  });

  afterAll(async () => {
    await cleanupRecipes(fixtures.map((r) => r.id));
    await cleanupUsers([authorA.id, userB.id]);
    fixtures = [];
  });

  /** Viewer ids for the matrix, resolved after the fixtures exist. */
  const viewers = (): Array<{ label: string; id: string | null }> => [
    { label: 'anonymous', id: null },
    { label: 'the author', id: authorA.id },
    { label: 'another user', id: userB.id },
  ];

  /** Run one condition over the fixture ids and return the selected ids, sorted. */
  async function selectIds(condition: ReturnType<typeof listableRecipeCondition>) {
    const rows = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        and(
          inArray(
            recipes.id,
            fixtures.map((r) => r.id),
          ),
          condition,
        ),
      );
    return rows.map((r) => r.id).sort();
  }

  it('has one active and one soft-deleted fixture per visibility', () => {
    expect(fixtures).toHaveLength(8);
    expect(fixtures.filter((r) => r.deletedAt !== null)).toHaveLength(4);
  });

  it('listableRecipeCondition(viewer) selects exactly the rows canListRecipe accepts', async () => {
    for (const viewer of viewers()) {
      const expected = fixtures
        .filter((r) => canListRecipe(r, viewer.id))
        .map((r) => r.id)
        .sort();
      expect(await selectIds(listableRecipeCondition(viewer.id)), viewer.label).toEqual(expected);
    }
  });

  it('viewableRecipeCondition(viewer) selects exactly the active rows canViewRecipe accepts', async () => {
    for (const viewer of viewers()) {
      const expected = fixtures
        .filter((r) => canViewRecipe(r, viewer.id) && r.deletedAt === null)
        .map((r) => r.id)
        .sort();
      expect(await selectIds(viewableRecipeCondition(viewer.id)), viewer.label).toEqual(expected);
    }
  });

  it('listableRecipeCondition(null) selects only the active public recipe', async () => {
    const publicActive = fixtures.find((r) => r.visibility === 'public' && r.deletedAt === null);
    expect(await selectIds(listableRecipeCondition(null))).toEqual([publicActive?.id]);
  });

  it('listableRecipeCondition(author) selects every active recipe of the author', async () => {
    const active = fixtures
      .filter((r) => r.deletedAt === null)
      .map((r) => r.id)
      .sort();
    expect(await selectIds(listableRecipeCondition(authorA.id))).toEqual(active);
  });
});

// Placeholder for the viewer-independent list fork mask (task 11.4).
describe.todo('maskUnlistableForkSources');
