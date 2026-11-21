/**
 * DB-backed parity test for the shared recipe visibility helpers (capability
 * `recipe-visibility`): the SQL conditions `listableRecipeCondition` /
 * `viewableRecipeCondition` must select exactly the rows the pure predicates
 * `canListRecipe` / `canViewRecipe` accept, for every visibility, active and
 * soft-deleted, and for viewer `null`, the author and another user. Also covers the
 * viewer-independent list fork mask `maskUnlistableForkSources`.
 */

import '../../test-setup.ts';
import { db } from '@brewform/db';
import { recipes, type users } from '@brewform/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanupRecipes,
  cleanupUsers,
  createRecipe,
  createUser,
} from '../brew-log/test-helpers.ts';
import {
  listableRecipeCondition,
  maskUnlistableForkSources,
  viewableRecipeCondition,
} from './model.ts';
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

/**
 * The viewer-independent list fork mask (capability `recipe-visibility`, "Fork attribution
 * never reveals a recipe the viewer could not list"): one primary-key query, and every
 * `forkedFromId` whose source is not listable to an anonymous viewer becomes `null`.
 */
describe('maskUnlistableForkSources', () => {
  let author: typeof users.$inferSelect;
  /** Fork sources by label: one per visibility, plus a soft-deleted public one. */
  const sources: Record<string, typeof recipes.$inferSelect> = {};

  beforeAll(async () => {
    author = await createUser('vis-mask');
    for (const visibility of VISIBILITIES) {
      sources[visibility] = await createRecipe(author.id, visibility);
    }
    const deleted = await createRecipe(author.id, 'public');
    const [softDeleted] = await db
      .update(recipes)
      .set({ deletedAt: new Date() })
      .where(eq(recipes.id, deleted.id))
      .returning();
    sources.deleted = softDeleted;
  });

  afterAll(async () => {
    await cleanupRecipes(Object.values(sources).map((r) => r.id));
    await cleanupUsers([author.id]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the rows unchanged without a query when no row has a fork source', async () => {
    const selectSpy = vi.spyOn(db, 'select');
    const rows = [
      { id: 'row-1', forkedFromId: null },
      { id: 'row-2', forkedFromId: null },
    ];
    expect(await maskUnlistableForkSources(rows)).toEqual(rows);
    expect(await maskUnlistableForkSources([])).toEqual([]);
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('keeps public sources, with one query for every row', async () => {
    const selectSpy = vi.spyOn(db, 'select');
    const rows = [
      { id: 'row-1', forkedFromId: sources.public.id, title: 'first' },
      { id: 'row-2', forkedFromId: sources.public.id, title: 'second' },
      { id: 'row-3', forkedFromId: null, title: 'original' },
    ];
    expect(await maskUnlistableForkSources(rows)).toEqual(rows);
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it('masks unlisted, private, draft and soft-deleted sources and keeps other fields', async () => {
    const hidden = ['unlisted', 'private', 'draft', 'deleted'];
    const rows = hidden.map((label) => ({
      id: `row-${label}`,
      forkedFromId: sources[label].id,
      title: label,
    }));
    const masked = await maskUnlistableForkSources([
      ...rows,
      { id: 'row-public', forkedFromId: sources.public.id, title: 'public' },
    ]);
    expect(masked).toEqual([
      ...rows.map((r) => ({ ...r, forkedFromId: null })),
      { id: 'row-public', forkedFromId: sources.public.id, title: 'public' },
    ]);
  });

  it('masks a source id that matches no recipe', async () => {
    const rows = [{ id: 'row-1', forkedFromId: crypto.randomUUID() }];
    expect(await maskUnlistableForkSources(rows)).toEqual([{ id: 'row-1', forkedFromId: null }]);
  });
});
