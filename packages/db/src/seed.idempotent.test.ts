// deno-lint-ignore-file no-explicit-any require-await

/**
 * Integration tests verifying that the seed script is idempotent.
 *
 * These tests exercise the real seed helpers against a PostgreSQL test
 * database. Running the same seed function twice must not raise unique
 * constraint violations and must leave the table with the same row count.
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { count } from 'drizzle-orm';
import { db } from './index.ts';
import {
  badges,
  beans,
  brewMethodEquipmentRules,
  coffeeVarieties,
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
