/**
 * Integration tests verifying that the seed script is idempotent.
 *
 * These tests exercise the real seed helpers against a PostgreSQL test
 * database. Running the same seed function twice must not raise unique
 * constraint violations and must leave the table with the same row count.
 *
 * ── Cross-suite isolation (wave-5 task 8.2) ────────────────────────────────
 * The root `test` task runs the API suite BEFORE the db suite against the SAME
 * `brewform_test` database (deno.json: `test:api && … && test:db`). The API
 * tests create and delete users/recipes/etc. and leave stray rows behind, which
 * broke the exact row-count assertions below whenever the db suite ran after the
 * API suite on a shared database.
 *
 * Chosen fix: reset the database to a clean slate at the start of every describe
 * block by TRUNCATE-ing all tables (`RESTART IDENTITY CASCADE`), then let the
 * seed under test repopulate from an empty database. We chose truncate-and-reseed
 * over the alternatives:
 *   • vs. drop + recreate + migrate: truncating keeps the shared module
 *     connection pool (`db`/`client`) valid. A `DROP DATABASE … WITH (FORCE)`
 *     would kill the pool's live connections (other db test files use `db` before
 *     this one runs) and force a reconnect, adding fragility; it would also
 *     require re-running migrations and is slower. The schema is already
 *     provisioned by `make test-db-provision` / CI before any tests run, and no
 *     migration inserts reference data, so truncating rows is sufficient.
 *   • vs. relative (before/after delta) counts: exact counts are a stronger
 *     regression test for the duplicate-key crashes this file guards against.
 * This mirrors the repo's existing reset pattern (apps/api/scripts/flush-db.ts).
 * The seed is designed to run on an empty database (idempotent via on-conflict
 * handling), so truncate → seed reproduces the exact fresh-database counts.
 */

import { beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { count } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { client, db } from './index.ts';
import {
  badges,
  beans,
  brewMethodEquipmentRules,
  coffeeVarieties,
  collectionItems,
  comments,
  equipment,
  photos,
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
  setups,
  tasteNotes,
  userBadges,
  userFollows,
  userPreferences,
  userRecipeFavourites,
  userRecipeLikes,
  userRecipeRatings,
  users,
  vendors,
} from './schema.ts';
import { seedBrewMethodCompatibility } from './seed.ts';
import {
  badgeSeedData,
  beanSeedData,
  brewMethodCompatibilityRules,
  equipmentSeedData,
  recipeSeedData,
  setupSeedData,
  socialSeedData,
  userSeedData,
  vendorSeedData,
} from './seed-users-recipes.ts';
import { equipmentCatalogSeedData } from './seed-equipment-catalog.ts';
import { coffeeVarietySeedData } from './seed-coffee-varieties.ts';

const scaaPath = new URL('../../../files/scaa-2.json', import.meta.url);
const scaaData = JSON.parse(await Deno.readTextFile(scaaPath));

function collectScaaNames(data: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const item of data) {
    const root = item as { name: string; children?: unknown[] };
    names.add(root.name);
    for (const child of root.children ?? []) {
      const childItem = child as { name: string; children?: unknown[] };
      names.add(childItem.name);
      for (const grandChild of childItem.children ?? []) {
        names.add((grandChild as { name: string }).name);
      }
    }
  }
  return names;
}

const scaaNames = collectScaaNames(scaaData.data);

// Names of every table in the schema, discovered once (mirrors the
// table-discovery loop in apps/api/scripts/flush-db.ts). Used by resetDatabase
// to truncate the whole database before each describe block (wave-5 task 8.2).
const TABLE_NAMES: string[] = [];
for (const value of Object.values(await import('./schema.ts'))) {
  try {
    TABLE_NAMES.push(getTableConfig(value as never).name);
  } catch {
    // skip non-table exports (enums, relations, etc.)
  }
}

/**
 * Resets the test database to a clean slate by truncating every table, so the
 * seed under test repopulates from an empty database regardless of stray rows
 * left by earlier suites (wave-5 task 8.2). See the file header for rationale.
 */
async function resetDatabase(): Promise<void> {
  // Quote identifiers: some table names (e.g. "user") are reserved words.
  const tables = TABLE_NAMES.map((name) => `"${name}"`).join(', ');
  await client.unsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

/**
 * Runs `seedBrewMethodCompatibility` twice in a transaction and asserts that
 * the resulting row count equals the seed data length. This verifies the
 * helper uses `onConflictDoNothing` correctly.
 */
describe({
  name: 'Seed idempotency — brew method compatibility',
  sanitizeResources: false,
  sanitizeOps: false,
}, () => {
  beforeAll(resetDatabase);

  it('can run seedBrewMethodCompatibility twice without duplicates', async () => {
    await db.transaction(async (tx) => {
      await seedBrewMethodCompatibility(tx);
      await seedBrewMethodCompatibility(tx);

      const [result] = await tx.select({ count: count() }).from(brewMethodEquipmentRules);
      expect(result.count).toBe(brewMethodCompatibilityRules.length);
    });
  });
});

/**
 * Runs the full seed twice against the same database and asserts that all
 * seeded tables end up with the expected row counts. This is the main
 * regression test for the duplicate-key crashes that happened when
 * containers were wiped but the Postgres volume persisted.
 */
describe({
  name: 'Seed idempotency — full seed',
  sanitizeResources: false,
  sanitizeOps: false,
}, () => {
  beforeAll(resetDatabase);

  it('can run the full seed twice without throwing and leaves expected counts', async () => {
    const { main } = await import('./seed.ts');

    await main();
    await main();

    expect((await db.select({ count: count() }).from(users))[0].count).toBe(
      userSeedData.length + 1,
    );
    expect((await db.select({ count: count() }).from(userPreferences))[0].count).toBe(
      userSeedData.length + 1,
    );
    expect((await db.select({ count: count() }).from(vendors))[0].count).toBe(
      vendorSeedData.length,
    );
    expect((await db.select({ count: count() }).from(equipment))[0].count).toBe(
      equipmentSeedData.length + equipmentCatalogSeedData.length,
    );
    expect((await db.select({ count: count() }).from(coffeeVarieties))[0].count).toBe(
      coffeeVarietySeedData.length,
    );
    expect((await db.select({ count: count() }).from(beans))[0].count).toBe(beanSeedData.length);
    expect((await db.select({ count: count() }).from(recipes))[0].count).toBe(
      recipeSeedData.length,
    );
    expect((await db.select({ count: count() }).from(recipeVersions))[0].count).toBe(
      recipeSeedData.length,
    );
    expect((await db.select({ count: count() }).from(recipeEquipment))[0].count).toBeGreaterThan(
      0,
    );
    expect(
      (await db.select({ count: count() }).from(recipeAdditionalPreparations))[0].count,
    ).toBeGreaterThan(0);
    expect((await db.select({ count: count() }).from(photos))[0].count).toBeGreaterThanOrEqual(
      recipeSeedData.length,
    );
    expect((await db.select({ count: count() }).from(recipeVersionPhotos))[0].count)
      .toBeGreaterThanOrEqual(recipeSeedData.length);
    expect((await db.select({ count: count() }).from(tasteNotes))[0].count).toBeGreaterThanOrEqual(
      scaaNames.size,
    );
    expect((await db.select({ count: count() }).from(recipeTasteNotes))[0].count).toBeGreaterThan(
      0,
    );
    expect((await db.select({ count: count() }).from(badges))[0].count).toBe(badgeSeedData.length);
    expect((await db.select({ count: count() }).from(userBadges))[0].count).toBe(
      socialSeedData.badges.length,
    );
    expect((await db.select({ count: count() }).from(userFollows))[0].count).toBe(
      socialSeedData.follows.length,
    );
    expect((await db.select({ count: count() }).from(userRecipeLikes))[0].count).toBe(
      socialSeedData.likes.length,
    );
    expect((await db.select({ count: count() }).from(userRecipeFavourites))[0].count).toBe(
      socialSeedData.favourites.length,
    );
    expect((await db.select({ count: count() }).from(userRecipeRatings))[0].count).toBe(
      socialSeedData.ratings.length,
    );
    expect((await db.select({ count: count() }).from(comments))[0].count).toBeGreaterThan(0);
    expect((await db.select({ count: count() }).from(setups))[0].count).toBe(
      setupSeedData.length,
    );
    expect((await db.select({ count: count() }).from(brewMethodEquipmentRules))[0].count).toBe(
      brewMethodCompatibilityRules.length,
    );
  });
});

/**
 * D99.3 — collection item sortOrder must be per-collection (0..n-1), not
 * globally sequenced across all collections. A shared counter would produce
 * e.g. [0,1,2,3,4] for the first collection and [5,6] for the second; the
 * per-collection fix resets to 0 for each collection.
 */
describe({
  name: 'Seed idempotency — collection sortOrder (D99.3)',
  sanitizeResources: false,
  sanitizeOps: false,
}, () => {
  beforeAll(resetDatabase);

  it('numbers items 0..n-1 per collection, not globally sequenced', async () => {
    const { main } = await import('./seed.ts');
    await main();

    const items = await db.select({
      collectionId: collectionItems.collectionId,
      sortOrder: collectionItems.sortOrder,
    }).from(collectionItems);

    const byCollection = new Map<string, number[]>();
    for (const item of items) {
      const orders = byCollection.get(item.collectionId) ?? [];
      orders.push(item.sortOrder);
      byCollection.set(item.collectionId, orders);
    }

    // At least one collection has >2 items — otherwise a shared counter
    // would be indistinguishable from per-collection numbering.
    const maxItems = Math.max(...[...byCollection.values()].map((o) => o.length));
    expect(maxItems).toBeGreaterThan(2);

    // Each group's sorted sortOrder values equal [0, 1, ..., n-1].
    for (const [, orders] of byCollection) {
      const sorted = [...orders].sort((a, b) => a - b);
      const expected = Array.from({ length: sorted.length }, (_, i) => i);
      expect(sorted).toEqual(expected);
    }
  });
});
