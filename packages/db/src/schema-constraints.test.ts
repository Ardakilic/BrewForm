import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  recipes,
  recipeTasteNotes,
  recipeVersions,
  reports,
  tasteNotes,
  userRecipeRatings,
  users,
} from './schema.ts';

/**
 * Tests for database-level CHECK constraints on core entity tables.
 * Ensures that CHECK constraints defined in the schema (e.g., intensity ranges,
 * rating ranges) are enforced at the database level, rejecting invalid values
 * and accepting valid ones.
 */
describe('Schema CHECK constraints', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let recipeVersionId: string;
  let tasteNoteId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    recipeVersionId = crypto.randomUUID();
    tasteNoteId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });

    await db.insert(recipes).values({
      id: recipeId,
      authorId: userId,
      slug: `test-recipe-${recipeId}`,
      title: 'Test Recipe',
      visibility: 'public',
    });

    await db.insert(recipeVersions).values({
      id: recipeVersionId,
      recipeId: recipeId,
      versionNumber: 1,
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      preparationNotes: 'Test notes',
    });

    await db.update(recipes).set({ currentVersionId: recipeVersionId }).where(
      eq(recipes.id, recipeId),
    );

    await db.insert(tasteNotes).values({
      id: tasteNoteId,
      name: 'Test Taste Note',
      depth: 0,
    });
  });

  /**
   * Cleans up all entities created during CHECK constraint tests.
   * Deletes in dependency order (child tables first) to avoid FK violations.
   */
  afterEach(async () => {
    await db.delete(recipeTasteNotes).where(eq(recipeTasteNotes.recipeVersionId, recipeVersionId));
    await db.delete(userRecipeRatings).where(eq(userRecipeRatings.recipeId, recipeId));
    await db.delete(tasteNotes).where(eq(tasteNotes.id, tasteNoteId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, recipeVersionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  describe('recipe_taste_note intensity check', () => {
    it('should reject intensity = 0', async () => {
      await expect(
        db.insert(recipeTasteNotes).values({
          recipeVersionId,
          tasteNoteId,
          intensity: 0,
        }),
      ).rejects.toThrow();
    });

    it('should reject intensity = 4', async () => {
      await expect(
        db.insert(recipeTasteNotes).values({
          recipeVersionId,
          tasteNoteId,
          intensity: 4,
        }),
      ).rejects.toThrow();
    });

    it('should accept intensity = 1', async () => {
      await expect(
        db.insert(recipeTasteNotes).values({
          recipeVersionId,
          tasteNoteId,
          intensity: 1,
        }),
      ).resolves.toBeDefined();
    });

    it('should accept intensity = 3', async () => {
      await expect(
        db.insert(recipeTasteNotes).values({
          recipeVersionId,
          tasteNoteId,
          intensity: 3,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('user_recipe_rating rating check', () => {
    it('should reject rating = 0', async () => {
      await expect(
        db.insert(userRecipeRatings).values({
          userId,
          recipeId,
          rating: 0,
        }),
      ).rejects.toThrow();
    });

    it('should reject rating = 11', async () => {
      await expect(
        db.insert(userRecipeRatings).values({
          userId,
          recipeId,
          rating: 11,
        }),
      ).rejects.toThrow();
    });

    it('should accept rating = 1', async () => {
      await expect(
        db.insert(userRecipeRatings).values({
          userId,
          recipeId,
          rating: 1,
        }),
      ).resolves.toBeDefined();
    });

    it('should accept rating = 10', async () => {
      await expect(
        db.insert(userRecipeRatings).values({
          userId,
          recipeId,
          rating: 10,
        }),
      ).resolves.toBeDefined();
    });
  });
});

/**
 * Tests for Postgres enum constraints on the `report.status` column.
 * Verifies that only valid enum values are accepted at the database level,
 * and that invalid values are rejected even when bypassing the application layer.
 */
describe('Schema enum constraints', { sanitizeOps: false, sanitizeResources: false }, () => {
  const reporterIds: string[] = [];

  /**
   * Cleans up reporter users and their reports after each test.
   * Uses the accumulated reporterIds array and deletes reports first (FK dependency).
   */
  afterEach(async () => {
    if (reporterIds.length > 0) {
      await db.delete(reports).where(inArray(reports.reporterId, reporterIds));
      await db.delete(users).where(inArray(users.id, reporterIds));
      reporterIds.length = 0;
    }
  });

  describe('report.status enum constraint', () => {
    for (const status of ['pending', 'reviewed', 'resolved', 'dismissed'] as const) {
      it(`should accept status = '${status}'`, async () => {
        const reporterId = crypto.randomUUID();
        reporterIds.push(reporterId);
        await db.insert(users).values({
          id: reporterId,
          email: `enum-${status}-${reporterId}@example.com`,
          username: `enum-${status}-${reporterId}`,
          passwordHash: 'hash',
        });

        await expect(
          db.insert(reports).values({
            reporterId,
            entityType: 'recipe',
            entityId: crypto.randomUUID(),
            reason: `Test report with status=${status}`,
            status,
          }),
        ).resolves.toBeDefined();
      });
    }

    it("should reject status = 'invalid' at the database level", async () => {
      const reporterId = crypto.randomUUID();
      reporterIds.push(reporterId);
      await db.insert(users).values({
        id: reporterId,
        email: `enum-invalid-${reporterId}@example.com`,
        username: `enum-invalid-${reporterId}`,
        passwordHash: 'hash',
      });

      await expect(
        db.execute(
          sql`INSERT INTO "report" ("id", "reporter_id", "entity_type", "entity_id", "reason", "status", "created_at", "updated_at")
            VALUES (${crypto.randomUUID()}, ${reporterId}, 'recipe', ${crypto.randomUUID()}, 'bypass', 'invalid', NOW(), NOW())`,
        ),
      ).rejects.toThrow();
    });
  });
});
