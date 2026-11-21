/**
 * Integration tests verifying that the seed script is idempotent.
 *
 * These tests exercise the real seed helpers against a PostgreSQL test
 * database. Running the same seed function twice must not raise unique
 * constraint violations and must leave the table with the same row count.
 *
 * ── Cross-suite isolation (wave-5 task 8.2) ────────────────────────────────
 * The root `test` task runs the API suite BEFORE the db suite against the SAME
 * `brewform_test` database (root `test` script: `test:api && … && test:db`). The API
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

import { readFileSync } from 'node:fs';
import { and, count, eq, inArray } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { client, db } from './index.ts';
import { recountCommentCounts } from './recount-comment-counts.ts';
import {
  badges,
  beans,
  brewLogs,
  brewMethodEquipmentRules,
  coffeeVarieties,
  collectionItems,
  collections,
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
import { normalizeAdminEmail, seedBrewMethodCompatibility } from './seed.ts';
import { coffeeVarietySeedData } from './seed-coffee-varieties.ts';
import { equipmentCatalogSeedData } from './seed-equipment-catalog.ts';
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

const scaaPath = new URL('../../../files/scaa-2.json', import.meta.url);
const scaaData = JSON.parse(readFileSync(scaaPath, 'utf8'));

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
describe('Seed idempotency — brew method compatibility', () => {
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
describe('Seed idempotency — full seed', () => {
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
    expect((await db.select({ count: count() }).from(recipeEquipment))[0].count).toBeGreaterThan(0);
    expect(
      (await db.select({ count: count() }).from(recipeAdditionalPreparations))[0].count,
    ).toBeGreaterThan(0);
    expect((await db.select({ count: count() }).from(photos))[0].count).toBeGreaterThanOrEqual(
      recipeSeedData.length,
    );
    expect(
      (await db.select({ count: count() }).from(recipeVersionPhotos))[0].count,
    ).toBeGreaterThanOrEqual(recipeSeedData.length);
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
    expect((await db.select({ count: count() }).from(setups))[0].count).toBe(setupSeedData.length);
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
describe('Seed idempotency — collection sortOrder (D99.3)', () => {
  beforeAll(resetDatabase);

  it('numbers items 0..n-1 per collection, not globally sequenced', async () => {
    const { main } = await import('./seed.ts');
    await main();

    const items = await db
      .select({
        collectionId: collectionItems.collectionId,
        sortOrder: collectionItems.sortOrder,
      })
      .from(collectionItems);

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

/**
 * Re-running the seed on a database whose admin or demo accounts differ from the seed's
 * identities only in letter case (an older install, or data written before the wave-6
 * `user_email_lower_unique`/`user_username_lower_unique` expression indexes) must reuse those
 * rows. `onConflictDoNothing({ target: users.email })` infers only the exact `user_email_unique`
 * constraint, so such a row used to abort the seed transaction with a unique violation.
 */
describe('Seed idempotency — case-insensitive user identifiers', () => {
  beforeAll(resetDatabase);

  it('reuses accounts whose email or username differs only in case and seeds twice', async () => {
    const [alice, bob] = userSeedData;
    const legacy = [
      {
        email: normalizeAdminEmail(process.env.ADMIN_EMAIL).toUpperCase(),
        username: 'legacy-admin',
      },
      { email: alice.email.toUpperCase(), username: `${alice.username}-legacy` },
      { email: `legacy-${bob.email}`, username: bob.username.toUpperCase() },
    ];
    const preexisting = await db
      .insert(users)
      .values(legacy.map((identity) => ({ ...identity, passwordHash: 'legacy-hash' })))
      .returning({ id: users.id });

    const { main } = await import('./seed.ts');
    await main();
    await main();

    expect((await db.select({ count: count() }).from(users))[0].count).toBe(
      userSeedData.length + 1,
    );
    expect((await db.select({ count: count() }).from(userPreferences))[0].count).toBe(
      userSeedData.length + 1,
    );
    const reused = await db
      .select({ email: users.email, username: users.username })
      .from(users)
      .where(
        inArray(
          users.id,
          preexisting.map((row) => row.id),
        ),
      );
    // The seed never rewrites an existing account: the legacy identities are kept as they were.
    expect(reused).toHaveLength(legacy.length);
    expect(reused).toEqual(expect.arrayContaining(legacy));
    const reusedPreferences = await db
      .select({ count: count() })
      .from(userPreferences)
      .where(
        inArray(
          userPreferences.userId,
          preexisting.map((row) => row.id),
        ),
      );
    expect(reusedPreferences[0].count).toBe(legacy.length);
  });
});

/**
 * Finding #31: `setup_user_default_unique` is a partial unique index (one active default setup per
 * user). A demo user who renames their default setup no longer matches the seed's
 * `(userId, name)` existence check, so the re-run inserted a second default and aborted the
 * whole seed transaction with `23505`.
 */
describe('Seed idempotency — renamed default setup (setup_user_default_unique)', () => {
  beforeAll(resetDatabase);

  it('keeps the renamed default setup and adds no second one on a re-run', async () => {
    const { main } = await import('./seed.ts');
    await main();

    const [alice] = await db.select().from(users).where(eq(users.username, 'alice'));
    await db
      .update(setups)
      .set({ name: 'Renamed default' })
      .where(and(eq(setups.userId, alice.id), eq(setups.isDefault, true)));

    await expect(main()).resolves.toBeUndefined();

    const aliceSetups = await db
      .select({ name: setups.name, isDefault: setups.isDefault })
      .from(setups)
      .where(eq(setups.userId, alice.id));
    expect(aliceSetups).toEqual([{ name: 'Renamed default', isDefault: true }]);
  });
});

/**
 * Finding #12 (user decision 2): with `APP_ENV=production` the seed creates only the admin with its
 * preferences and the reference data (brew-method rules, badges, the system equipment catalogue,
 * the system coffee varieties, the real-roaster vendors and the SCAA taste notes). No demo account
 * and none of their content. `afterAll` re-seeds in the default mode so the database ends fully
 * seeded, like after the other describes.
 */
describe('Seed — production mode seeds no demo content', () => {
  beforeAll(async () => {
    await resetDatabase();
    vi.stubEnv('APP_ENV', 'production');
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await resetDatabase();
    const { main } = await import('./seed.ts');
    await main();
  });

  it('creates only the admin and the reference catalogues, twice without changes', async () => {
    const { main } = await import('./seed.ts');
    await main();
    await main();

    const allUsers = await db.select({ email: users.email, isAdmin: users.isAdmin }).from(users);
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0].isAdmin).toBe(true);
    expect(allUsers.filter((u) => u.email.endsWith('@example.com'))).toEqual([]);
    expect((await db.select({ count: count() }).from(userPreferences))[0].count).toBe(1);

    for (const table of [
      recipes,
      beans,
      setups,
      collections,
      brewLogs,
      comments,
      userFollows,
      userBadges,
    ]) {
      expect((await db.select({ count: count() }).from(table))[0].count).toBe(0);
    }

    expect((await db.select({ count: count() }).from(vendors))[0].count).toBe(
      vendorSeedData.length,
    );
    expect((await db.select({ count: count() }).from(equipment))[0].count).toBe(
      equipmentCatalogSeedData.length,
    );
    expect((await db.select({ count: count() }).from(coffeeVarieties))[0].count).toBe(
      coffeeVarietySeedData.length,
    );
    expect((await db.select({ count: count() }).from(badges))[0].count).toBe(badgeSeedData.length);
    expect((await db.select({ count: count() }).from(brewMethodEquipmentRules))[0].count).toBe(
      brewMethodCompatibilityRules.length,
    );
    expect((await db.select({ count: count() }).from(tasteNotes))[0].count).toBeGreaterThanOrEqual(
      scaaNames.size,
    );
  });
});

/**
 * D99.67: the seed stores each demo recipe's `commentCount` as the number of comments the recount
 * counts, so a fresh development install needs no repair.
 */
describe('Seed — comment counts', () => {
  beforeAll(resetDatabase);

  it('a fresh development seed needs no comment-count repair', async () => {
    const { main } = await import('./seed.ts');
    await main();

    const result = await recountCommentCounts(db);

    expect(result.repaired).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
