/**
 * Recipe business-logic / service layer.
 *
 * Sits between controllers and the data-access layer ({@link ./model.ts}).
 * Orchestrates multi-step operations (creation, version bumping, forking),
 * enforces business rules (equipment compatibility, visibility checks),
 * and triggers side effects (badge evaluation, follower notifications).
 *
 * All DB access is delegated to `model.ts` — no Drizzle calls directly
 * from this module except for the compatibility validation helper.
 */
import { sanitizeText } from '../../utils/sanitize.ts';
import * as model from './model.ts';
import { db } from '@brewform/db';
import {
  brewMethodEquipmentRules,
  equipment,
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
  setups,
  users,
} from '@brewform/db/schema';
import { and, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { computeBrewRatio, computeFlowRate } from '@brewform/shared/utils';
import { ensureUniqueSlug, generateSlug } from '@brewform/shared/utils';
import { createLogger } from '../../utils/logger/index.ts';
import { notifyFollowersOfNewRecipe, notifyRecipeLiked } from '../../utils/notify/index.ts';
import { evaluateBadges } from '../badge/service.ts';

const logger = createLogger('recipe-service');

async function generateUniqueSlug(title: string): Promise<string> {
  const slug = generateSlug(title);
  const existing = await model.findBySlug(slug);
  if (!existing) return slug;
  return ensureUniqueSlug(slug, []);
}

/** Retrieve a recipe by slug or UUID. Throws `RECIPE_NOT_FOUND` if neither matches. */
export async function getRecipe(slugOrId: string) {
  logger.debug({}, 'getRecipe started');
  let recipe: any;
  if (slugOrId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    recipe = await model.findById(slugOrId);
  } else {
    recipe = await model.findBySlug(slugOrId);
  }
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  logger.debug({}, 'getRecipe completed');
  return recipe;
}

/** Lightweight shape used by `checkEquipmentCompatibility` to validate equipment items against brew method rules. */
export interface CompatibilityCheckItem {
  /** Equipment UUID from the `equipment` table. */
  id: string;
  /** Equipment category (e.g. `'pressurized_basket'`, `'paper_filter'`). */
  type: string;
}

/** Row shape from the `brewMethodEquipmentRules` DB table. */
export interface CompatibilityRule {
  /** Brew method key (e.g. `'espresso'`, `'pour_over'`). */
  brewMethod: string;
  /** Equipment type this rule applies to. */
  equipmentType: string;
  /** Whether the equipment type is compatible with the brew method. */
  compatible: boolean;
}

/**
 * Validate that equipment items are compatible with a given brew method.
 *
 * Compatibility rules are defined in the `brewMethodEquipmentRules` DB table.
 * Each rule specifies whether an equipment type is allowed for a brew method
 * (e.g. espresso requires a pressurized brewer, prohibits French press).
 * Pure function — no I/O, suitable for both server and client use.
 *
 * @param equipmentItems - Equipment items to check (id + type per item).
 * @param brewMethod     - The brew method being validated against.
 * @param rules          - Full list of compatibility rules (fetched from DB).
 * @returns Array of human-readable incompatibility messages. Empty array means all compatible.
 */
export function checkEquipmentCompatibility(
  equipmentItems: CompatibilityCheckItem[],
  brewMethod: string,
  rules: CompatibilityRule[],
): string[] {
  const incompatible: string[] = [];
  for (const eqItem of equipmentItems) {
    const rule = rules.find(
      (r) => r.brewMethod === brewMethod && r.equipmentType === eqItem.type,
    );
    if (rule && !rule.compatible) {
      incompatible.push(`${eqItem.type} is not compatible with ${brewMethod}`);
    }
  }
  return incompatible;
}

async function validateEquipmentCompatibility(
  brewMethod: string,
  equipmentIds: string[],
): Promise<void> {
  if (!brewMethod || !equipmentIds?.length) return;

  const equipmentList = await db
    .select({ id: equipment.id, type: equipment.type })
    .from(equipment)
    .where(inArray(equipment.id, equipmentIds));

  const allRules = await db
    .select()
    .from(brewMethodEquipmentRules)
    .where(eq(brewMethodEquipmentRules.brewMethod, brewMethod as any));

  const incompatible = checkEquipmentCompatibility(
    equipmentList.map((e) => ({ id: e.id, type: e.type })),
    brewMethod,
    allRules as CompatibilityRule[],
  );

  if (incompatible.length) {
    throw Object.assign(
      new Error('EQUIPMENT_INCOMPATIBLE'),
      { code: 'EQUIPMENT_INCOMPATIBLE', details: incompatible },
    );
  }
}

/**
 * Create a new recipe with its first version and all related entities.
 *
 * Orchestration steps:
 * 1. Validate equipment compatibility against the selected brew method
 * 2. Generate a unique slug from the sanitized title
 * 3. Inherit `grinder` and `brewerDetails` from the user's setup when `setupId`
 *    is provided (falling back to explicitly supplied values)
 * 4. Compute derived metrics (`brewRatio`, `flowRate`) from raw measurements
 * 5. Insert recipe, version, taste notes, equipment, additional preparations,
 *    and version photos inside a single transaction
 * 6. If visibility is `'public'`, asynchronously notify the author's followers
 * 7. Asynchronously evaluate badge eligibility for the author
 *
 * @param authorId - UUID of the authenticated user creating the recipe.
 * @param data     - Creation payload (validated Zod schema from `@brewform/shared`).
 * @returns The complete recipe object with version, relations, and author summary.
 */
export async function createRecipe(authorId: string, data: any) {
  logger.debug({ authorId }, 'createRecipe started');
  await validateEquipmentCompatibility(data.brewMethod, data.equipmentIds ?? []);

  const safeTitle = sanitizeText(data.title);
  if (!safeTitle.trim()) throw new Error('VALIDATION_ERROR: Title cannot be empty');
  const slug = await generateUniqueSlug(safeTitle);

  let grinder = data.grinder;
  let brewerDetails = data.brewerDetails;
  if (data.setupId) {
    const setupResult = await db.select().from(setups)
      .where(
        and(eq(setups.id, data.setupId), eq(setups.userId, authorId), isNull(setups.deletedAt)),
      )
      .limit(1);
    const setup = setupResult[0];
    if (setup) {
      if (!grinder) grinder = setup.grinder;
      if (!brewerDetails) brewerDetails = setup.brewerDetails;
    }
  }

  const brewRatio = data.groundWeightGrams && data.extractionVolumeMl
    ? computeBrewRatio(data.groundWeightGrams, data.extractionVolumeMl)
    : null;
  const flowRate = data.extractionVolumeMl && data.extractionTimeSeconds
    ? computeFlowRate(data.extractionVolumeMl, data.extractionTimeSeconds)
    : null;

  const recipe: any = await db.transaction(async (tx) => {
    const [r] = await tx.insert(recipes).values({
      slug,
      title: safeTitle,
      authorId,
      visibility: data.visibility || 'draft',
      currentVersionId: null,
    }).returning();

    const [version] = await tx.insert(recipeVersions).values({
      recipeId: r.id,
      versionNumber: 1,
      productName: data.productName,
      coffeeBrand: data.coffeeBrand,
      coffeeProcessing: data.coffeeProcessing,
      vendorId: data.vendorId,
      roastDate: data.roastDate ? new Date(data.roastDate) : null,
      packageOpenDate: data.packageOpenDate ? new Date(data.packageOpenDate) : null,
      grindDate: data.grindDate ? new Date(data.grindDate) : null,
      brewDate: data.brewDate ? new Date(data.brewDate) : new Date(),
      brewMethod: data.brewMethod,
      drinkType: data.drinkType,
      brewerDetails,
      grinder,
      grindSize: data.grindSize,
      groundWeightGrams: data.groundWeightGrams,
      extractionTimeSeconds: data.extractionTimeSeconds,
      extractionVolumeMl: data.extractionVolumeMl,
      temperatureCelsius: data.temperatureCelsius,
      brewRatio,
      flowRate,
      personalNotes: sanitizeText(data.personalNotes),
      preparationNotes: sanitizeText(data.preparationNotes),
      isFavourite: data.isFavourite || false,
      rating: data.rating,
      emojiTag: data.emojiTag,
      preInfusionTimeSeconds: data.preInfusionTimeSeconds ?? null,
      beanId: data.beanId ?? null,
    }).returning();

    if (data.tasteNoteIds?.length) {
      await tx.insert(recipeTasteNotes).values(
        data.tasteNoteIds.map((id: string) => ({
          recipeVersionId: version.id,
          tasteNoteId: id,
          intensity: data.tasteNoteIntensities?.[id] ?? 1,
        })),
      );
    }

    if (data.equipmentIds?.length) {
      await tx.insert(recipeEquipment).values(
        data.equipmentIds.map((id: string) => ({ recipeVersionId: version.id, equipmentId: id })),
      );
    }

    if (data.additionalPreparations?.length) {
      await tx.insert(recipeAdditionalPreparations).values(
        data.additionalPreparations.map((p: any, i: number) => ({
          recipeVersionId: version.id,
          name: p.name,
          type: p.type,
          inputAmount: p.inputAmount,
          preparationType: p.preparationType,
          sortOrder: i,
        })),
      );
    }

    if (data.photoIds?.length) {
      await tx.insert(recipeVersionPhotos).values(
        data.photoIds.map((photoId: string, i: number) => ({
          recipeVersionId: version.id,
          photoId,
          sortOrder: i,
        })),
      );
    }

    await tx.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, r.id));

    return { ...r, versions: [version] };
  });

  const finalRecipe: any = await model.findById(recipe.id);

  if (finalRecipe?.visibility === 'public') {
    (async () => {
      const authorResult = await db.select().from(users).where(eq(users.id, authorId)).limit(1);
      const author = authorResult[0];
      if (!author?.username) return;
      await notifyFollowersOfNewRecipe({
        authorId,
        authorUsername: author.username,
        recipeTitle: finalRecipe.title,
        recipeSlug: finalRecipe.slug,
      });
    })().catch((err) => logger.error({ err }, 'notifyFollowersOfNewRecipe failed'));
  }

  evaluateBadges(authorId).catch((err) => logger.error({ err }, 'evaluateBadges failed'));

  logger.debug({ authorId }, 'createRecipe completed');
  return finalRecipe;
}

/**
 * Update an existing recipe, optionally creating a new version.
 *
 * When `data.bumpVersion` is truthy, a new version row is created with any
 * supplied fields merged over the latest version's values. Derived metrics
 * (`brewRatio`, `flowRate`) are recomputed when raw measurements change.
 * The recipe's `currentVersionId` is updated to point to the new version.
 *
 * When `bumpVersion` is falsy, only top-level recipe fields (title, visibility)
 * are updated — no new version is created.
 *
 * @throws `RECIPE_NOT_FOUND` if the recipe does not exist.
 * @throws `FORBIDDEN` if the requesting user is not the recipe author.
 */
export async function updateRecipe(recipeId: string, authorId: string, data: any) {
  logger.debug({ recipeId, authorId }, 'updateRecipe started');
  const recipe: any = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');

  if (data.bumpVersion) {
    const latestVersion: any = recipe.versions?.[0];
    const newVersionNumber = latestVersion.versionNumber + 1;

    if (data.brewMethod || data.equipmentIds) {
      const existingEquipmentIds = latestVersion.equipment?.map((e: any) => e.equipmentId) ?? [];
      await validateEquipmentCompatibility(
        data.brewMethod ?? latestVersion.brewMethod,
        data.equipmentIds ?? existingEquipmentIds,
      );
    }

    const brewRatio = data.groundWeightGrams || data.extractionVolumeMl
      ? computeBrewRatio(
        data.groundWeightGrams ?? latestVersion.groundWeightGrams ?? 0,
        data.extractionVolumeMl ?? latestVersion.extractionVolumeMl ?? 0,
      )
      : latestVersion.brewRatio;
    const flowRate = data.extractionVolumeMl || data.extractionTimeSeconds
      ? computeFlowRate(
        data.extractionVolumeMl ?? latestVersion.extractionVolumeMl ?? 0,
        data.extractionTimeSeconds ?? latestVersion.extractionTimeSeconds ?? 0,
      )
      : latestVersion.flowRate;

    const version = await model.createVersion({
      recipeId: recipe.id,
      versionNumber: newVersionNumber,
      productName: data.productName ?? latestVersion.productName,
      coffeeBrand: data.coffeeBrand ?? latestVersion.coffeeBrand,
      coffeeProcessing: data.coffeeProcessing ?? latestVersion.coffeeProcessing,
      vendorId: data.vendorId ?? latestVersion.vendorId,
      roastDate: data.roastDate ? new Date(data.roastDate) : latestVersion.roastDate,
      packageOpenDate: data.packageOpenDate
        ? new Date(data.packageOpenDate)
        : latestVersion.packageOpenDate,
      grindDate: data.grindDate ? new Date(data.grindDate) : latestVersion.grindDate,
      brewDate: new Date(),
      brewMethod: data.brewMethod ?? latestVersion.brewMethod,
      drinkType: data.drinkType ?? latestVersion.drinkType,
      brewerDetails: data.brewerDetails ?? latestVersion.brewerDetails,
      grinder: data.grinder ?? latestVersion.grinder,
      grindSize: data.grindSize ?? latestVersion.grindSize,
      groundWeightGrams: data.groundWeightGrams ?? latestVersion.groundWeightGrams,
      extractionTimeSeconds: data.extractionTimeSeconds ?? latestVersion.extractionTimeSeconds,
      extractionVolumeMl: data.extractionVolumeMl ?? latestVersion.extractionVolumeMl,
      temperatureCelsius: data.temperatureCelsius ?? latestVersion.temperatureCelsius,
      brewRatio,
      flowRate,
      personalNotes: sanitizeText(data.personalNotes ?? latestVersion.personalNotes),
      preparationNotes: sanitizeText(data.preparationNotes ?? latestVersion.preparationNotes),
      isFavourite: data.isFavourite ?? latestVersion.isFavourite,
      rating: data.rating ?? latestVersion.rating,
      emojiTag: data.emojiTag ?? latestVersion.emojiTag,
      preInfusionTimeSeconds: data.preInfusionTimeSeconds ?? latestVersion.preInfusionTimeSeconds,
      beanId: data.beanId ?? latestVersion.beanId,
    });

    const safeTitle = sanitizeText(data.title ?? recipe.title);
    if (!safeTitle.trim()) throw new Error('VALIDATION_ERROR: Title cannot be empty');

    if (data.photoIds?.length) {
      await db.insert(recipeVersionPhotos).values(
        data.photoIds.map((photoId: string, i: number) => ({
          recipeVersionId: version.id,
          photoId,
          sortOrder: i,
        })),
      );
    } else {
      const previousPhotos = await db
        .select()
        .from(recipeVersionPhotos)
        .where(eq(recipeVersionPhotos.recipeVersionId, latestVersion.id));
      if (previousPhotos.length) {
        await db.insert(recipeVersionPhotos).values(
          previousPhotos.map((vp) => ({
            recipeVersionId: version.id,
            photoId: vp.photoId,
            sortOrder: vp.sortOrder,
          })),
        );
      }
    }

    await model.update(recipe.id, {
      title: safeTitle,
      visibility: data.visibility ?? recipe.visibility,
      currentVersionId: version.id,
    });
  } else {
    const safeTitle = sanitizeText(data.title ?? recipe.title);
    if (!safeTitle.trim()) throw new Error('VALIDATION_ERROR: Title cannot be empty');
    await model.update(recipe.id, {
      title: safeTitle,
      visibility: data.visibility ?? recipe.visibility,
    });
  }

  logger.debug({ recipeId, authorId }, 'updateRecipe completed');
  return model.findById(recipeId);
}

/** Soft-delete a recipe. Throws `RECIPE_NOT_FOUND` or `FORBIDDEN` on failure. */
export async function deleteRecipe(recipeId: string, authorId: string) {
  logger.debug({ recipeId, authorId }, 'deleteRecipe started');
  const recipe: any = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');
  await model.softDelete(recipeId);
  logger.debug({ recipeId, authorId }, 'deleteRecipe completed');
}

/**
 * Fork an existing recipe into the caller's account.
 *
 * Only public/unlisted recipes can be freely forked; draft/private recipes
 * require the caller to be the original author. A unique slug is generated
 * from the fork title (defaults to `"Fork of <original title>"`).
 * Badge eligibility is re-evaluated for the forking user after creation.
 *
 * @param sourceId - UUID of the recipe to fork.
 * @param authorId - UUID of the user performing the fork.
 * @param title    - Optional custom title for the forked recipe.
 * @returns The newly created forked recipe.
 */
export async function forkRecipe(sourceId: string, authorId: string, title?: string) {
  logger.debug({ sourceId, authorId }, 'forkRecipe started');
  const source: any = await model.findById(sourceId);
  if (!source) throw new Error('RECIPE_NOT_FOUND');
  if (source.visibility === 'draft' || source.visibility === 'private') {
    if (source.authorId !== authorId) throw new Error('FORBIDDEN');
  }

  const forkTitle = title || `Fork of ${source.title}`;
  const slug = generateSlug(forkTitle);
  const uniqueSlug = await ensureUniqueSlug(slug, []);

  const forked = await model.forkRecipe(sourceId, authorId, forkTitle, uniqueSlug);

  evaluateBadges(authorId).catch((err) => logger.error({ err }, 'evaluateBadges failed'));

  logger.debug({ sourceId, authorId }, 'forkRecipe completed');
  return forked;
}

/**
 * List recipes with filtering, pagination, and sorting.
 *
 * Applies visibility rules (public-only for non-admins unless a specific
 * visibility filter is passed by an admin). Supports filtering by author,
 * brew method, drink type, equipment, taste notes (AND logic for multiple),
 * text search (title + product name), and main brewer name.
 *
 * @param filters           - Filter criteria (see controller for accepted keys).
 * @param page              - Page number (1-based).
 * @param perPage           - Items per page.
 * @param _requestingUserId - Unused; reserved for future scoped queries.
 * @param isAdmin           - Whether the requester is an admin (bypasses visibility restrictions).
 * @returns Paginated recipe list with total count.
 */
export async function listRecipes(
  filters: any,
  page: number,
  perPage: number,
  _requestingUserId: string | null = null,
  isAdmin: boolean = false,
) {
  logger.debug({}, 'listRecipes started');
  const visibilityCondition = (isAdmin === true && filters.visibility)
    ? eq(recipes.visibility, filters.visibility)
    : eq(recipes.visibility, 'public');
  const conditions: any[] = [visibilityCondition];

  if (filters.authorId) {
    conditions.push(eq(recipes.authorId, filters.authorId));
  }

  if (filters.brewMethod) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.brewMethod, filters.brewMethod),
        ),
      ),
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.drinkType, filters.drinkType),
        ),
      ),
    );
  }

  if (filters.equipmentId) {
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db.select({ id: recipeEquipment.recipeVersionId }).from(recipeEquipment).where(
          eq(recipeEquipment.equipmentId, filters.equipmentId),
        ),
      ),
    );
  }

  if (filters.tasteNoteIds) {
    const ids = filters.tasteNoteIds.split(',').map((id: string) => id.trim());
    // AND logic: recipe's current version must have ALL specified taste notes
    for (const noteId of ids) {
      conditions.push(
        inArray(
          recipes.currentVersionId,
          db.select({ id: recipeTasteNotes.recipeVersionId })
            .from(recipeTasteNotes)
            .where(eq(recipeTasteNotes.tasteNoteId, noteId)),
        ),
      );
    }
  } else if (filters.tasteNoteId) {
    // Backward compatibility: single taste note filter
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db.select({ id: recipeTasteNotes.recipeVersionId }).from(recipeTasteNotes).where(
          eq(recipeTasteNotes.tasteNoteId, filters.tasteNoteId),
        ),
      ),
    );
  }

  if (filters.search) {
    const sanitized = filters.search.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      conditions.push(
        or(
          ilike(recipes.title, searchTerm),
          inArray(
            recipes.id,
            db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
              ilike(recipeVersions.productName, searchTerm),
            ),
          ),
        ),
      );
    }
  }

  if (filters.mainBrewer) {
    const sanitized = filters.mainBrewer.replace(/[%_]/g, '');
    if (sanitized) {
      const searchTerm = `%${sanitized}%`;
      conditions.push(
        inArray(
          recipes.id,
          db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
            ilike(recipeVersions.brewerDetails, searchTerm),
          ),
        ),
      );
    }
  }

  if (filters.coffeeVarietyId) {
    conditions.push(model.recipeCoffeeVarietyCondition(filters.coffeeVarietyId));
  }

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';
  const result = await model.findMany(where, page, perPage, sortBy, sortOrder);
  logger.debug({}, 'listRecipes completed');
  return result;
}

/**
 * Toggle a user's like on a recipe.
 *
 * Returns the new liked state. When liking (not un-liking) a recipe by a
 * different author, fires an asynchronous `notifyRecipeLiked` side effect.
 */
export async function toggleLike(userId: string, recipeId: string) {
  logger.debug({ userId, recipeId }, 'toggleLike started');
  const recipe: any = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  const result = await model.toggleLike(userId, recipeId);

  if (result.liked && recipe.authorId !== userId) {
    (async () => {
      const likerResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const liker = likerResult[0];
      if (!liker?.username) return;
      await notifyRecipeLiked({
        recipeAuthorId: recipe.authorId,
        likerUsername: liker.username,
        recipeTitle: recipe.title,
        recipeSlug: recipe.slug,
      });
    })().catch((err) => logger.error({ err }, 'notifyRecipeLiked failed'));
  }

  logger.debug({ userId, recipeId }, 'toggleLike completed');
  return result;
}

/** Toggle a recipe in the user's favourites. Returns the new favourited state. */
export async function toggleFavourite(userId: string, recipeId: string) {
  logger.debug({ userId, recipeId }, 'toggleFavourite started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  const result = await model.toggleFavourite(userId, recipeId);
  logger.debug({ userId, recipeId }, 'toggleFavourite completed');
  return result;
}

/** Toggle the featured flag on the requesting user's own recipe. Throws `FORBIDDEN` if not the author. */
export async function toggleFeature(recipeId: string, authorId: string) {
  logger.debug({ recipeId, authorId }, 'toggleFeature started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');
  const result = await model.toggleFeature(recipeId);
  logger.debug({ recipeId, authorId }, 'toggleFeature completed');
  return result;
}

/** Save custom notes on the current version of a recipe. Throws `RECIPE_NOT_FOUND` if there is no current version. */
export async function saveNotes(recipeId: string, notes: string) {
  logger.debug({ recipeId }, 'saveNotes started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (!recipe.currentVersionId) throw new Error('RECIPE_NOT_FOUND');
  await model.updateVersionNotes(recipe.currentVersionId, notes);
  logger.debug({ recipeId }, 'saveNotes completed');
}

/** List recipes starred (favourited) by the given user, with filtering and pagination. */
export async function listStarredRecipes(
  filters: any,
  page: number,
  perPage: number,
  userId: string,
) {
  logger.debug({ userId }, 'listStarredRecipes started');
  const result = await model.findStarred(userId, filters, page, perPage);
  logger.debug({ userId }, 'listStarredRecipes completed');
  return result;
}

/**
 * Return lightweight metadata for a recipe by slug.
 *
 * Includes title, author, visibility, counts, and the primary photo URL.
 * Used for SEO / social sharing previews and link unfurling.
 */
export async function getRecipeMeta(slug: string) {
  logger.debug({ slug }, 'getRecipeMeta started');
  const recipe: any = await model.findBySlug(slug);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  const latestVersion = recipe.versions?.[0];
  logger.debug({ slug }, 'getRecipeMeta completed');
  return {
    id: recipe.id,
    title: recipe.title,
    slug: recipe.slug,
    author: recipe.author,
    visibility: recipe.visibility,
    likeCount: recipe.likeCount,
    commentCount: recipe.commentCount,
    createdAt: recipe.createdAt,
    productName: latestVersion?.productName || null,
    brewMethod: latestVersion?.brewMethod || null,
    photoUrl: recipe.photos?.[0]?.url || null,
  };
}
