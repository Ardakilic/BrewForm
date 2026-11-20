/**
 * Shared database fixtures for the private-notes tests: the `recipe-note`
 * module's model, service and route tests, `routes/recipe-notes-post-removed.test.ts`
 * and the account-deletion case in `user/service.test.ts`.
 *
 * {@link NoteFixtures} tracks every user and recipe it creates so `cleanup()`
 * can delete them in foreign-key order (private notes → versions → recipes →
 * badges → users). Excluded from coverage by the `src/**\/test-helpers.ts`
 * pattern in `apps/api/vitest.config.ts`.
 */
import { db } from '@brewform/db';
import { recipes, recipeVersions, userBadges, userRecipeNotes, users } from '@brewform/db/schema';
import type { Visibility } from '@brewform/shared/types';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { signAccessToken } from '../auth/jwt.ts';

/** A `user` row created by {@link NoteFixtures.user}. */
export type FixtureUser = typeof users.$inferSelect;

/** A `recipe` row created by {@link NoteFixtures.recipe}, with its version ids (oldest first). */
export interface FixtureRecipe {
  recipe: typeof recipes.$inferSelect;
  versionIds: string[];
}

/** Options for {@link NoteFixtures.user}. */
export interface FixtureUserOptions {
  /** Set `emailVerifiedAt` (default `true`). */
  emailVerified?: boolean;
  /** Set `isAdmin` (default `false`). */
  isAdmin?: boolean;
}

/** Options for {@link NoteFixtures.recipe}. */
export interface FixtureRecipeOptions {
  /** Recipe visibility (default `public`). */
  visibility?: Visibility;
  /** Soft-delete the recipe (`deletedAt` set). */
  deleted?: boolean;
  /**
   * One entry per version (oldest first) holding that version's public
   * `personal_notes` (the author's brewer note). Defaults to a single version.
   */
  brewerNotes?: Array<string | null>;
}

/** A `{ versionId, personalNotes }` pair, used to prove brewer notes were not touched. */
export interface BrewerNoteSnapshot {
  id: string;
  personalNotes: string | null;
}

/** Creates and tracks users/recipes for a test file, and deletes them again in `cleanup()`. */
export class NoteFixtures {
  /** Ids of every user created through this instance. */
  readonly userIds: string[] = [];
  /** Ids of every recipe created through this instance. */
  readonly recipeIds: string[] = [];

  /**
   * Insert a user with a unique email and username.
   *
   * @param prefix - Short label used in the email and username.
   * @param options - Email-verified and admin flags.
   * @returns The inserted user row.
   */
  async user(prefix: string, options: FixtureUserOptions = {}): Promise<FixtureUser> {
    const id = crypto.randomUUID();
    const [user] = await db
      .insert(users)
      .values({
        id,
        email: `${prefix}-${id}@example.com`,
        username: `${prefix}-${id.slice(0, 8)}`,
        passwordHash: 'hash',
        emailVerifiedAt: options.emailVerified === false ? null : new Date(),
        isAdmin: options.isAdmin ?? false,
      })
      .returning();
    this.userIds.push(user.id);
    return user;
  }

  /**
   * Insert a recipe with one or more versions and point `currentVersionId` at the newest.
   *
   * @param authorId - Owning user id.
   * @param options - Visibility, soft-delete flag and per-version brewer notes.
   * @returns The recipe row and its version ids (oldest first).
   */
  async recipe(authorId: string, options: FixtureRecipeOptions = {}): Promise<FixtureRecipe> {
    const id = crypto.randomUUID();
    const [recipe] = await db
      .insert(recipes)
      .values({
        id,
        slug: `notes-${id.slice(0, 8)}`,
        title: `Notes fixture ${id.slice(0, 8)}`,
        authorId,
        visibility: options.visibility ?? 'public',
        deletedAt: options.deleted ? new Date() : null,
      })
      .returning();
    this.recipeIds.push(recipe.id);
    const versionIds: string[] = [];
    const notes = options.brewerNotes ?? ['Brewer note v1'];
    for (const [index, personalNotes] of notes.entries()) {
      const [version] = await db
        .insert(recipeVersions)
        .values({
          recipeId: recipe.id,
          versionNumber: index + 1,
          brewMethod: 'v60',
          drinkType: 'pour_over',
          preparationNotes: 'fixture preparation',
          personalNotes,
        })
        .returning({ id: recipeVersions.id });
      versionIds.push(version.id);
    }
    const currentVersionId = versionIds.at(-1) ?? null;
    await db.update(recipes).set({ currentVersionId }).where(eq(recipes.id, recipe.id));
    return { recipe: { ...recipe, currentVersionId }, versionIds };
  }

  /**
   * Read every version's public brewer note of a recipe, ordered by version number.
   *
   * @param recipeId - Recipe whose versions to read.
   */
  async brewerNotes(recipeId: string): Promise<BrewerNoteSnapshot[]> {
    return await db
      .select({ id: recipeVersions.id, personalNotes: recipeVersions.personalNotes })
      .from(recipeVersions)
      .where(eq(recipeVersions.recipeId, recipeId))
      .orderBy(asc(recipeVersions.versionNumber));
  }

  /**
   * Read the raw `user_recipe_note` rows (deleted ones included) for a user and recipe.
   *
   * @param userId - Note owner.
   * @param recipeId - Recipe the note belongs to.
   */
  async noteRows(userId: string, recipeId: string) {
    return await db
      .select()
      .from(userRecipeNotes)
      .where(and(eq(userRecipeNotes.userId, userId), eq(userRecipeNotes.recipeId, recipeId)));
  }

  /** Delete every row created through this instance, children first. Safe to call repeatedly. */
  async cleanup(): Promise<void> {
    const { userIds, recipeIds } = this;
    if (userIds.length > 0 || recipeIds.length > 0) {
      const ownerFilter =
        userIds.length > 0 && recipeIds.length > 0
          ? or(
              inArray(userRecipeNotes.userId, userIds),
              inArray(userRecipeNotes.recipeId, recipeIds),
            )
          : userIds.length > 0
            ? inArray(userRecipeNotes.userId, userIds)
            : inArray(userRecipeNotes.recipeId, recipeIds);
      await db.delete(userRecipeNotes).where(ownerFilter);
    }
    if (recipeIds.length > 0) {
      await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, recipeIds));
      await db.delete(recipes).where(inArray(recipes.id, recipeIds));
    }
    if (userIds.length > 0) {
      await db.delete(userBadges).where(inArray(userBadges.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    this.userIds.length = 0;
    this.recipeIds.length = 0;
  }
}

/**
 * Sign a real access token for a fixture user (sent as `Authorization: Bearer <token>`).
 *
 * @param user - The user to authenticate as.
 */
export async function bearer(user: FixtureUser): Promise<string> {
  const token = await signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });
  return `Bearer ${token}`;
}
