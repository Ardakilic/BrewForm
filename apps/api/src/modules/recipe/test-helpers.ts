/**
 * Shared database fixtures for the recipe tests: the slug tests
 * (`service.slug.test.ts`, `service.slug-exhaustion.test.ts`, the slug cases in
 * `index.test.ts`) and the recipe-write tests (`model.update.test.ts`,
 * `service.update.test.ts`, the write cases in `index.test.ts`).
 *
 * {@link SlugFixtures} creates users, tracks them, and in `cleanup()` deletes every
 * recipe they authored (forks included, so recipes created through the service
 * need no manual tracking, photos included) and then the users. Creating or forking a recipe
 * fires `evaluateBadges()` without awaiting it, so cleanup first drains that
 * evaluation before deleting `user_badge` rows and users.
 * {@link RecipeWriteFixtures} adds the referenced rows a recipe write links to
 * (taste notes, equipment, coffee varieties, vendors, beans, photos) and deletes
 * them too. Excluded from coverage by the `src/**\/test-helpers.ts` pattern in
 * `apps/api/vitest.config.ts`.
 */
import { db } from '@brewform/db';
import {
  beans,
  coffeeVarieties,
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
  userRecipeFavourites,
  userRecipeLikes,
  users,
  vendors,
} from '@brewform/db/schema';
import { RecipeCreateSchema } from '@brewform/shared/schemas';
import { asc, eq, inArray, or } from 'drizzle-orm';
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
    await this.deleteRecipes();
    await this.deleteUsers();
  }

  /** Delete every recipe authored by the tracked users, children (relations, photos) first. */
  protected async deleteRecipes(): Promise<void> {
    const { userIds } = this;
    if (userIds.length === 0) return;
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
      await db.delete(photos).where(inArray(photos.recipeId, recipeIds));
      await db.delete(userRecipeLikes).where(inArray(userRecipeLikes.recipeId, recipeIds));
      await db
        .delete(userRecipeFavourites)
        .where(inArray(userRecipeFavourites.recipeId, recipeIds));
      await db.delete(recipes).where(inArray(recipes.id, recipeIds));
    }
  }

  /** Drain pending badge evaluations, then delete the tracked users and their badges. */
  protected async deleteUsers(): Promise<void> {
    const { userIds } = this;
    if (userIds.length === 0) return;
    for (const userId of userIds) {
      await evaluateBadges(userId);
    }
    await db.delete(userBadges).where(inArray(userBadges.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    this.userIds.length = 0;
  }
}

/** Options for the soft-deletable reference rows of {@link RecipeWriteFixtures}. */
export interface ReferenceRowOptions {
  /** Create the row soft-deleted (`deletedAt` set). */
  deleted?: boolean;
}

/** The relation rows of one version, in a stable order, for before/after comparisons. */
export interface VersionSnapshot {
  row: typeof recipeVersions.$inferSelect;
  tasteNotes: Array<{ tasteNoteId: string; intensity: number }>;
  equipmentIds: string[];
  preparations: Array<{ name: string; inputAmount: string; sortOrder: number }>;
  photos: Array<{ photoId: string; sortOrder: number }>;
}

/**
 * {@link SlugFixtures} plus the reference rows a recipe write links to. Every row created here
 * is tracked and deleted by `cleanup()` after the recipes and before the users.
 */
export class RecipeWriteFixtures extends SlugFixtures {
  readonly tasteNoteIds: string[] = [];
  readonly equipmentIds: string[] = [];
  readonly varietyIds: string[] = [];
  readonly vendorIds: string[] = [];
  readonly beanIds: string[] = [];
  readonly setupIds: string[] = [];

  /**
   * Insert a (non-default) setup owned by `userId`.
   *
   * @param userId - The owner.
   * @param values - The setup's grinder and brewer details.
   * @returns The setup id.
   */
  async setup(
    userId: string,
    values: { grinder: string | null; brewerDetails: string | null },
  ): Promise<string> {
    const id = crypto.randomUUID();
    await db
      .insert(setups)
      .values({ id, name: `Write Setup ${id.slice(0, 8)}`, userId, ...values });
    this.setupIds.push(id);
    return id;
  }

  /**
   * Insert a taste note.
   *
   * @param options - Soft-delete the row.
   * @returns The taste-note id.
   */
  async tasteNote(options: ReferenceRowOptions = {}): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(tasteNotes).values({
      id,
      name: `Write Note ${id.slice(0, 8)}`,
      deletedAt: options.deleted ? new Date() : null,
    });
    this.tasteNoteIds.push(id);
    return id;
  }

  /**
   * Insert an equipment item.
   *
   * @param type - Equipment type (default `grinder`).
   * @param options - Soft-delete the row.
   * @returns The equipment id.
   */
  async equipmentItem(
    type: (typeof equipment.$inferInsert)['type'] = 'grinder',
    options: ReferenceRowOptions = {},
  ): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(equipment).values({
      id,
      name: `Write Gear ${id.slice(0, 8)}`,
      type,
      deletedAt: options.deleted ? new Date() : null,
    });
    this.equipmentIds.push(id);
    return id;
  }

  /**
   * Insert a coffee variety.
   *
   * @param name - Variety name (made unique with a suffix).
   * @param options - Soft-delete the row.
   * @returns The variety id and its stored name.
   */
  async variety(
    name = 'Gesha',
    options: ReferenceRowOptions = {},
  ): Promise<{ id: string; name: string }> {
    const id = crypto.randomUUID();
    const fullName = `${name} ${id.slice(0, 8)}`;
    await db.insert(coffeeVarieties).values({
      id,
      name: fullName,
      category: 'variety',
      deletedAt: options.deleted ? new Date() : null,
    });
    this.varietyIds.push(id);
    return { id, name: fullName };
  }

  /**
   * Insert a vendor.
   *
   * @param options - Soft-delete the row.
   * @returns The vendor id.
   */
  async vendor(options: ReferenceRowOptions = {}): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(vendors).values({
      id,
      name: `Write Roaster ${id.slice(0, 8)}`,
      deletedAt: options.deleted ? new Date() : null,
    });
    this.vendorIds.push(id);
    return id;
  }

  /**
   * Insert a bean owned by `userId`.
   *
   * @param userId - The owner.
   * @returns The bean id.
   */
  async bean(userId: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(beans).values({ id, name: `Write Bean ${id.slice(0, 8)}`, userId });
    this.beanIds.push(id);
    return id;
  }

  /**
   * Insert a photo row of a recipe (deleted with the recipe in `cleanup()`).
   *
   * @param recipeId - The recipe the photo belongs to.
   * @returns The photo id.
   */
  async photo(recipeId: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(photos).values({ id, recipeId, url: `/uploads/${id}.webp` });
    return id;
  }

  /**
   * Read the version numbers of a recipe, oldest first.
   *
   * @param recipeId - Recipe id.
   */
  async versionNumbers(recipeId: string): Promise<number[]> {
    const rows = await db
      .select({ versionNumber: recipeVersions.versionNumber })
      .from(recipeVersions)
      .where(eq(recipeVersions.recipeId, recipeId))
      .orderBy(asc(recipeVersions.versionNumber));
    return rows.map((r) => r.versionNumber);
  }

  /**
   * Read one version row with its relations in a stable order.
   *
   * @param versionId - Version id.
   */
  async snapshot(versionId: string): Promise<VersionSnapshot> {
    const [row] = await db.select().from(recipeVersions).where(eq(recipeVersions.id, versionId));
    const tasteNoteRows = await db
      .select({ tasteNoteId: recipeTasteNotes.tasteNoteId, intensity: recipeTasteNotes.intensity })
      .from(recipeTasteNotes)
      .where(eq(recipeTasteNotes.recipeVersionId, versionId));
    const equipmentRows = await db
      .select({ equipmentId: recipeEquipment.equipmentId })
      .from(recipeEquipment)
      .where(eq(recipeEquipment.recipeVersionId, versionId));
    const preparationRows = await db
      .select({
        name: recipeAdditionalPreparations.name,
        inputAmount: recipeAdditionalPreparations.inputAmount,
        sortOrder: recipeAdditionalPreparations.sortOrder,
      })
      .from(recipeAdditionalPreparations)
      .where(eq(recipeAdditionalPreparations.recipeVersionId, versionId))
      .orderBy(asc(recipeAdditionalPreparations.sortOrder));
    const photoRows = await db
      .select({ photoId: recipeVersionPhotos.photoId, sortOrder: recipeVersionPhotos.sortOrder })
      .from(recipeVersionPhotos)
      .where(eq(recipeVersionPhotos.recipeVersionId, versionId))
      .orderBy(asc(recipeVersionPhotos.sortOrder));
    // Join rows have no order of their own; sort by id in JS (byte order, not DB collation).
    const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return {
      row,
      tasteNotes: tasteNoteRows.sort((a, b) => byId(a.tasteNoteId, b.tasteNoteId)),
      equipmentIds: equipmentRows.map((r) => r.equipmentId).sort(byId),
      preparations: preparationRows,
      photos: photoRows,
    };
  }

  /** Delete the recipes, then the tracked reference rows, then the users. */
  override async cleanup(): Promise<void> {
    await this.deleteRecipes();
    if (this.beanIds.length) await db.delete(beans).where(inArray(beans.id, this.beanIds));
    if (this.setupIds.length) await db.delete(setups).where(inArray(setups.id, this.setupIds));
    if (this.tasteNoteIds.length) {
      await db.delete(tasteNotes).where(inArray(tasteNotes.id, this.tasteNoteIds));
    }
    if (this.equipmentIds.length) {
      await db.delete(equipment).where(inArray(equipment.id, this.equipmentIds));
    }
    if (this.varietyIds.length) {
      await db.delete(coffeeVarieties).where(inArray(coffeeVarieties.id, this.varietyIds));
    }
    if (this.vendorIds.length) await db.delete(vendors).where(inArray(vendors.id, this.vendorIds));
    for (const list of [
      this.beanIds,
      this.setupIds,
      this.tasteNoteIds,
      this.equipmentIds,
      this.varietyIds,
      this.vendorIds,
    ]) {
      list.length = 0;
    }
    await this.deleteUsers();
  }
}
