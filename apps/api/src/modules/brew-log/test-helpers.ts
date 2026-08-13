/**
 * Shared DB fixture helpers for the brew-log module's integration tests
 * (model.test.ts, service.test.ts, index.test.ts). All helpers insert real
 * rows into the test database; callers are responsible for cleanup via the
 * `cleanup*` helpers.
 */

import { db } from '@brewform/db';
import { brewLogs, recipes, users } from '@brewform/db/schema';
import { inArray } from 'drizzle-orm';

/** Recipe visibility values accepted by fixture helpers. */
export type TestVisibility = 'private' | 'public' | 'draft' | 'unlisted';

/** Create a throwaway user with a unique email/username derived from `prefix`. */
export async function createUser(prefix: string) {
  const id = crypto.randomUUID();
  const [user] = await db.insert(users).values({
    id,
    email: `${prefix}-${id}@example.com`,
    username: `${prefix}-${id.slice(0, 8)}`,
    passwordHash: 'hash',
  }).returning();
  return user;
}

/** Create a throwaway recipe owned by `authorId` (default visibility: public). */
export async function createRecipe(authorId: string, visibility: TestVisibility = 'public') {
  const id = crypto.randomUUID();
  const [recipe] = await db.insert(recipes).values({
    id,
    slug: `slug-${id.slice(0, 8)}`,
    title: `Recipe ${id.slice(0, 4)}`,
    authorId,
    visibility,
    createdAt: new Date(),
  }).returning();
  return recipe;
}

/** Insert a brew log row for `userId`/`recipeId` with optional column overrides. */
export async function createBrewLogRow(
  userId: string,
  recipeId: string,
  overrides: Partial<typeof brewLogs.$inferInsert> = {},
) {
  const [row] = await db.insert(brewLogs).values({ userId, recipeId, ...overrides }).returning();
  return row;
}

/** Hard-delete brew logs owned by the given users or referencing the given recipes. */
export async function cleanupBrewLogs(userIds: string[], recipeIds: string[]) {
  if (userIds.length) await db.delete(brewLogs).where(inArray(brewLogs.userId, userIds));
  if (recipeIds.length) await db.delete(brewLogs).where(inArray(brewLogs.recipeId, recipeIds));
}

/** Hard-delete the given recipes. */
export async function cleanupRecipes(recipeIds: string[]) {
  if (recipeIds.length === 0) return;
  await db.delete(recipes).where(inArray(recipes.id, recipeIds));
}

/** Hard-delete the given users. */
export async function cleanupUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  await db.delete(users).where(inArray(users.id, userIds));
}

/** Date `n` days in the past (for `brewedAt` fixtures). */
export const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
