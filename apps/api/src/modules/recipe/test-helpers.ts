/**
 * Shared database fixtures for the recipe slug tests (`service.slug.test.ts`,
 * `service.slug-exhaustion.test.ts`, the slug cases in `index.test.ts`).
 *
 * {@link SlugFixtures} creates users, tracks them, and in `cleanup()` deletes every
 * recipe they authored (forks included, so recipes created through the service
 * need no manual tracking) and then the users. Creating or forking a recipe
 * fires `evaluateBadges()` without awaiting it, so cleanup first drains that
 * evaluation before deleting `user_badge` rows and users. Excluded from
 * coverage by the `src/**\/test-helpers.ts` pattern in `apps/api/vitest.config.ts`.
 */
import { db } from '@brewform/db';
import {
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
  userBadges,
  userRecipeFavourites,
  userRecipeLikes,
  users,
} from '@brewform/db/schema';
import { RecipeCreateSchema } from '@brewform/shared/schemas';
import { eq, inArray, or } from 'drizzle-orm';
import { evaluateBadges } from '../badge/service.ts';

/** Source of one random slug suffix (`<sfx>` in the recipe-slug spec). */
export const SFX = '[23456789bcdfghjkmnpqrstvwxz]{6}';

/** Escape a literal string for use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build `^<base>-<sfx>$` for a slug base.
 *
 * @param base - The literal slug base.
 */
export function suffixedSlug(base: string): RegExp {
  return new RegExp(`^${escapeRegExp(base)}-${SFX}$`);
}

/** A per-run lowercase marker (8 hex characters) so titles and slugs never collide across tests. */
export function slugMarker(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8);
}

/**
 * Parse a minimal valid recipe-create payload through `RecipeCreateSchema`.
 *
 * @param title - Recipe title.
 * @param visibility - Recipe visibility (default `public`).
 */
export function recipeInput(
  title: string,
  visibility: 'public' | 'draft' | 'private' | 'unlisted' = 'public',
) {
  return RecipeCreateSchema.parse({
    title,
    visibility,
    brewMethod: 'v60',
    drinkType: 'pour_over',
    preparationNotes: 'Bloom 45s',
  });
}

/** Creates users for a test file and deletes them, and every recipe they authored, in `cleanup()`. */
export class SlugFixtures {
  /** Ids of every user created through this instance. */
  readonly userIds: string[] = [];

  /**
   * Insert an email-verified user with a unique email and username.
   *
   * @param prefix - Short label used in the email and username.
   */
  async user(prefix: string): Promise<typeof users.$inferSelect> {
    const id = crypto.randomUUID();
    const [user] = await db
      .insert(users)
      .values({
        id,
        email: `${prefix}-${id}@example.com`,
        username: `${prefix}-${id.slice(0, 8)}`,
        passwordHash: 'hash',
        emailVerifiedAt: new Date(),
      })
      .returning();
    this.userIds.push(user.id);
    return user;
  }

  /**
   * Count the version rows of a recipe.
   *
   * @param recipeId - Recipe whose versions to count.
   */
  async versionCount(recipeId: string): Promise<number> {
    const rows = await db
      .select({ id: recipeVersions.id })
      .from(recipeVersions)
      .where(eq(recipeVersions.recipeId, recipeId));
    return rows.length;
  }

  /**
   * Read a recipe row by id, soft-deleted rows included.
   *
   * @param recipeId - Recipe id.
   */
  async rawRecipe(recipeId: string) {
    const [row] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    return row;
  }

  /** Delete every recipe authored by the tracked users (children first), then the users. */
  async cleanup(): Promise<void> {
    const { userIds } = this;
    if (userIds.length === 0) return;
    for (const userId of userIds) {
      await evaluateBadges(userId);
    }
    const authored = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(inArray(recipes.authorId, userIds));
    const recipeIds = authored.map((r) => r.id);
    if (recipeIds.length > 0) {
      await db
        .update(recipes)
        .set({ forkedFromId: null, currentVersionId: null })
        .where(or(inArray(recipes.id, recipeIds), inArray(recipes.forkedFromId, recipeIds)));
      const versionIds = db
        .select({ id: recipeVersions.id })
        .from(recipeVersions)
        .where(inArray(recipeVersions.recipeId, recipeIds));
      await db
        .delete(recipeTasteNotes)
        .where(inArray(recipeTasteNotes.recipeVersionId, versionIds));
      await db.delete(recipeEquipment).where(inArray(recipeEquipment.recipeVersionId, versionIds));
      await db
        .delete(recipeAdditionalPreparations)
        .where(inArray(recipeAdditionalPreparations.recipeVersionId, versionIds));
      await db
        .delete(recipeVersionPhotos)
        .where(inArray(recipeVersionPhotos.recipeVersionId, versionIds));
      await db.delete(recipeVersions).where(inArray(recipeVersions.recipeId, recipeIds));
      await db.delete(userRecipeLikes).where(inArray(userRecipeLikes.recipeId, recipeIds));
      await db
        .delete(userRecipeFavourites)
        .where(inArray(userRecipeFavourites.recipeId, recipeIds));
      await db.delete(recipes).where(inArray(recipes.id, recipeIds));
    }
    await db.delete(userBadges).where(inArray(userBadges.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    this.userIds.length = 0;
  }
}
