/**
 * Recipe business-logic / service layer.
 *
 * Sits between controllers and the data-access layer ({@link ./model.ts}).
 * Orchestrates multi-step operations (creation, version bumping, forking),
 * enforces business rules (equipment compatibility, visibility checks),
 * and triggers side effects (badge evaluation, follower notifications).
 *
 * All DB access is delegated to `model.ts` — no Drizzle calls from this module.
 */
import type { z } from 'zod';
import { sanitizeText } from '../../utils/sanitize.ts';
import * as model from './model.ts';
import { computeBrewRatio, computeFlowRate } from '@brewform/shared/utils';
import { ensureUniqueSlug, generateSlug } from '@brewform/shared/utils';
import {
  RecipeCreateSchema,
  RecipeFilterSchema,
  RecipeUpdateSchema,
} from '@brewform/shared/schemas';
import type { RecipeMerge } from '@brewform/shared/schemas';
import { createLogger } from '../../utils/logger/index.ts';
import { decodeCursor } from '@brewform/shared/utils';
import { notifyFollowersOfNewRecipe } from '../../utils/notify/index.ts';
import { createLikeNotification } from '../notification/service.ts';
import { evaluateBadges } from '../badge/service.ts';
import type { BrewMethod } from '@brewform/shared/types';

/** Type alias for the result returned by model.findById / model.findBySlug (rich relational query). */
type RecipeWithRelations = NonNullable<Awaited<ReturnType<typeof model.findById>>> | undefined;

/**
 * Augmented recipe-create input. Extends the Zod-inferred shape with
 * `photoIds` which the controller layer may supply when linking existing
 * uploads during creation.
 */
type RecipeCreateInput = z.infer<typeof RecipeCreateSchema> & {
  photoIds?: string[];
};

/**
 * Augmented recipe-update input. Extends the Zod-inferred `RecipeUpdateSchema`
 * shape (which is partial + `bumpVersion`) with the same `photoIds` field
 * the create path supports.
 */
type RecipeUpdateInput = z.infer<typeof RecipeUpdateSchema> & {
  photoIds?: string[];
};

const logger = createLogger('recipe-service');

/** Generate a URL-safe slug from the title, ensuring uniqueness against existing recipes. */
async function generateUniqueSlug(title: string): Promise<string> {
  const slug = generateSlug(title);
  const existing = await model.findBySlug(slug);
  if (!existing) return slug;
  return ensureUniqueSlug(slug, []);
}

/** Retrieve a recipe by slug or UUID. Throws `RECIPE_NOT_FOUND` if neither matches. */
export async function getRecipe(slugOrId: string) {
  logger.debug({ slugOrId }, 'getRecipe started');
  let recipe: RecipeWithRelations;
  if (slugOrId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    recipe = (await model.findById(slugOrId)) ?? undefined;
  } else {
    recipe = (await model.findBySlug(slugOrId)) ?? undefined;
  }
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  logger.debug({ slugOrId }, 'getRecipe completed');
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
  brewMethod: BrewMethod;
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
  brewMethod: BrewMethod,
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

/** Validate equipment compatibility against the brew method's rules, throwing `EQUIPMENT_INCOMPATIBLE` on violation. */
async function validateEquipmentCompatibility(
  brewMethod: BrewMethod,
  equipmentIds: string[],
): Promise<void> {
  if (!brewMethod || !equipmentIds?.length) return;

  const equipmentList = await model.getEquipmentByIds(equipmentIds);
  const allRules = await model.getBrewMethodEquipmentRules(brewMethod);

  const incompatible = checkEquipmentCompatibility(
    equipmentList.map((e) => ({ id: e.id, type: e.type })),
    brewMethod,
    allRules,
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
export async function createRecipe(
  authorId: string,
  data: RecipeCreateInput,
) {
  logger.debug({ authorId }, 'createRecipe started');
  await validateEquipmentCompatibility(data.brewMethod, data.equipmentIds ?? []);

  const safeTitle = sanitizeText(data.title);
  if (!safeTitle.trim()) throw new Error('VALIDATION_ERROR: Title cannot be empty');
  const slug = await generateUniqueSlug(safeTitle);

  let grinder: string | null | undefined = data.grinder;
  let brewerDetails: string | null | undefined = data.brewerDetails;
  if (data.setupId) {
    const setup = await model.getUserSetup(data.setupId, authorId);
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

  const finalRecipe = await model.createRecipeWithRelations({
    authorId,
    slug,
    title: safeTitle,
    visibility: data.visibility || 'draft',
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
    tasteNoteIds: data.tasteNoteIds,
    tasteNoteIntensities: data.tasteNoteIntensities,
    equipmentIds: data.equipmentIds,
    additionalPreparations: data.additionalPreparations,
    photoIds: data.photoIds,
  });

  if (finalRecipe?.visibility === 'public') {
    (async () => {
      const author = await model.getUserById(authorId);
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
export async function updateRecipe(
  recipeId: string,
  authorId: string,
  data: RecipeUpdateInput,
) {
  logger.debug({ recipeId, authorId }, 'updateRecipe started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');

  if (data.bumpVersion) {
    const latestVersion = recipe.versions?.[0];
    if (!latestVersion) throw new Error('RECIPE_NO_VERSIONS');
    const newVersionNumber = latestVersion.versionNumber + 1;

    if (data.brewMethod || data.equipmentIds) {
      const existingEquipmentIds = latestVersion.equipment?.map((e) => e.equipmentId) ?? [];
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
      await model.insertVersionPhotos(version.id, data.photoIds);
    } else {
      const previousPhotos = await model.getVersionPhotos(latestVersion.id);
      if (previousPhotos.length) {
        await model.insertVersionPhotos(version.id, previousPhotos.map((vp) => vp.photoId));
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
  const recipe = await model.findById(recipeId);
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
  const source = await model.findById(sourceId);
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

/** Minimal shape required by {@link rankRecipes} — title, current version pointer, and version fields. */
interface RankableRecipe {
  title: string | null;
  currentVersionId: string | null;
  versions?: { id: string; productName: string | null; personalNotes: string | null }[];
}

/**
 * Rank recipes by weighted relevance score against a search term.
 *
 * Score weights:
 * - title match: 3 (highest — title is the most prominent field)
 * - productName match: 2 (coffee name is the second most visible)
 * - personalNotes match: 1 (lowest — free-text notes are least prominent)
 *
 * The search term is sanitized (stripping `%` and `_` wildcards) and
 * lowercased once before scoring, matching the sanitization applied in
 * `buildRecipeFilters` for the DB-level `ilike` conditions.
 *
 * The DB search matches ANY version's productName/personalNotes (via the
 * `inArray` subquery in `buildRecipeFilters`), not just the current version.
 * To keep ranking consistent with filtering, this function scores the BEST
 * matching version across all loaded versions — not just `currentVersionId`.
 *
 * The sort is STABLE: recipes with equal scores preserve their original
 * DB-query order (sortBy/sortOrder from the model query). This ensures
 * ranking does not re-shuffle equally-relevant items.
 *
 * Ranking SHALL NOT be applied when `search` is absent — the DB-level
 * `sortBy` / `sortOrder` ordering is the sole ordering in that case.
 *
 * @param recipes - Fetched recipe rows with their version fields.
 * @param searchTerm - The raw search string (sanitized + lowercased internally).
 * @returns A new array sorted by rank DESC (original order preserved for ties).
 */
export function rankRecipes<T extends RankableRecipe>(recipes: T[], searchTerm: string): T[] {
  const searchLower = searchTerm.replace(/[%_]/g, '').toLowerCase();
  const scored = recipes.map((recipe, index) => {
    let score = 0;
    if (recipe.title?.toLowerCase().includes(searchLower)) score += 3;
    // Score the best matching version across ALL loaded versions
    // (DB search matches any version, not just currentVersionId)
    const versions = recipe.versions ?? [];
    const hasProductMatch = versions.some((v) =>
      v.productName?.toLowerCase().includes(searchLower)
    );
    const hasNotesMatch = versions.some((v) =>
      v.personalNotes?.toLowerCase().includes(searchLower)
    );
    if (hasProductMatch) score += 2;
    if (hasNotesMatch) score += 1;
    return { recipe, score, index };
  });
  // Stable sort: by score DESC, then by original index ASC (preserves DB order for ties)
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.recipe);
}

/**
 * Cursor-aware recipe listing.
 *
 * When `filters.cursor` is present and `filters.sortBy === 'createdAt'`, the
 * service validates and decodes the cursor, then delegates to
 * {@link model.findCursor}. If the cursor is malformed, throws
 * `VALIDATION_ERROR: INVALID_CURSOR` so the route returns 400.
 *
 * When `filters.cursor` is present with an incompatible sort (e.g. `likeCount`
 * or `rating`), logs a warning and falls back to offset pagination.
 *
 * When both `page` and `cursor` are provided, cursor wins and `page` is
 * silently ignored.
 *
 * @param filters           - Filter criteria (see controller for accepted keys).
 * @param page              - Page number (1-based) for offset mode.
 * @param perPage           - Items per page.
 * @param _requestingUserId - Unused; reserved for future scoped queries.
 * @param isAdmin           - Whether the requester is an admin (bypasses visibility restrictions).
 * @returns Either `{ recipes, total }` for offset mode or
 *          `{ recipes, hasMore, nextCursor, total? }` for cursor mode.
 */
export async function listRecipes(
  filters: z.infer<typeof RecipeFilterSchema>,
  page: number,
  perPage: number,
  _requestingUserId: string | null = null,
  isAdmin: boolean = false,
  requestId?: string,
) {
  const where = model.buildListRecipesWhere(filters, isAdmin);
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';

  // F11: search-active detection — non-empty after sanitization
  const hasSearch = filters.search != null && filters.search.replace(/[%_]/g, '').length > 0;

  logger.debug(
    { userId: _requestingUserId, page, perPage, requestId, hasSearch },
    'listRecipes started',
  );

  const deprecations: { tasteNoteId?: boolean } = {};
  if (!filters.tasteNoteIds && filters.tasteNoteId) {
    deprecations.tasteNoteId = true;
    logger.warn(
      { filter: 'tasteNoteId', userId: _requestingUserId, requestId },
      'Deprecated query parameter used',
    );
  }

  const withDeprecations = <T>(result: T): T & { deprecations?: { tasteNoteId?: boolean } } =>
    deprecations.tasteNoteId
      ? { ...result, deprecations }
      : (result as T & { deprecations?: { tasteNoteId?: boolean } });

  // F11: search active → skip cursor path (ranking reorders, keyset cursor non-deterministic)
  if (filters.cursor && !hasSearch) {
    if (page > 1) {
      logger.debug(
        { userId: _requestingUserId, page, perPage },
        'Both cursor and page provided, using cursor pagination',
      );
    } else {
      logger.debug(
        { userId: _requestingUserId, page, perPage },
        'Cursor provided, using cursor pagination',
      );
    }

    if (sortBy !== 'createdAt') {
      logger.warn({ sortBy }, 'Cursor pagination incompatible with sortBy, falling back to offset');
      const result = await model.findMany(where, page, perPage, sortBy, sortOrder);
      logger.debug(
        { userId: _requestingUserId, page, perPage, resultCount: result.total },
        'listRecipes completed',
      );
      return withDeprecations(result);
    }

    let cursor: { createdAt: string; id: string };
    try {
      cursor = decodeCursor(filters.cursor);
    } catch (err) {
      logger.error({ err }, 'Invalid cursor provided');
      throw new Error('VALIDATION_ERROR: INVALID_CURSOR');
    }

    let result;
    try {
      result = await model.findCursor(where, cursor, perPage, sortOrder, filters.includeTotal);
    } catch (err) {
      // findCursor throws VALIDATION_ERROR: INVALID_CURSOR when the decoded
      // cursor's createdAt is not a valid date — surface it as a 400, not 500.
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'VALIDATION_ERROR: INVALID_CURSOR') {
        logger.error(
          { err, userId: _requestingUserId, page, perPage },
          'Invalid cursor payload provided',
        );
        throw new Error('VALIDATION_ERROR: INVALID_CURSOR');
      }
      throw err;
    }
    logger.debug(
      { userId: _requestingUserId, perPage, hasMore: result.hasMore },
      'listRecipes completed',
    );
    return withDeprecations(result);
  }

  // F11: search + cursor → offset fallback (ranking reorders, keyset cursor non-deterministic)
  if (filters.cursor && hasSearch) {
    logger.debug(
      { requestId, hasSearch: true, searchLength: filters.search?.length ?? 0 },
      'Search active, falling back to offset pagination for ranking',
    );
  }

  // F11: global ranking — fetch ALL matching recipes, rank in JS, then slice for the page.
  // This ensures relevance ranking is global, not page-local: a high-scoring title match
  // on page 2 is returned before a lower-scoring productName match on page 1.
  if (hasSearch) {
    const allResults = await model.findAllForRanking(where, sortBy, sortOrder);
    const ranked = rankRecipes(
      allResults.recipes as unknown as RankableRecipe[],
      filters.search!,
    ) as unknown as typeof allResults.recipes;
    const start = (page - 1) * perPage;
    const paged = ranked.slice(start, start + perPage);
    const result = { recipes: paged, total: allResults.total };
    logger.debug(
      { userId: _requestingUserId, page, perPage, resultCount: result.total },
      'listRecipes completed',
    );
    return withDeprecations(result);
  }

  const result = await model.findMany(where, page, perPage, sortBy, sortOrder);
  logger.debug(
    { userId: _requestingUserId, page, perPage, resultCount: result.total },
    'listRecipes completed',
  );
  return withDeprecations(result);
}

/**
 * List starred recipes, always using offset pagination.
 *
 * Starred queries (`/recipes/starred`) involve a favourites subquery JOIN that
 * is not yet compatible with cursor pagination; a cursor parameter is silently
 * ignored with a debug log.
 *
 * @param filters - Filter criteria, including ignored `cursor`.
 * @param page    - Page number (1-based).
 * @param perPage - Items per page.
 * @param userId  - UUID of the authenticated user whose favourites to query.
 * @returns Paginated recipe list with total count.
 */
export async function listStarredRecipes(
  filters: z.infer<typeof RecipeFilterSchema>,
  page: number,
  perPage: number,
  userId: string,
  requestId?: string,
) {
  logger.debug({ userId }, 'listStarredRecipes started');
  if (filters.cursor) {
    logger.debug('Cursor provided but starred recipes use offset pagination, using offset');
  }

  const deprecations: { tasteNoteId?: boolean } = {};
  if (!filters.tasteNoteIds && filters.tasteNoteId) {
    deprecations.tasteNoteId = true;
    logger.warn(
      { filter: 'tasteNoteId', userId, requestId },
      'Deprecated query parameter used',
    );
  }

  const result = await model.findStarred(userId, filters, page, perPage);
  logger.debug({ userId }, 'listStarredRecipes completed');
  return {
    ...result,
    ...(deprecations.tasteNoteId ? { deprecations } : {}),
  };
}

/**
 * Toggle a user's like on a recipe.
 *
 * Returns the new liked state. When liking (not un-liking) a recipe by a
 * different author, fires `createLikeNotification` (F05), which owns BOTH
 * the in-app `like` notification record AND the recipe-liked email (gated
 * on `notifyRecipeLiked` prefs — single flag gates both channels).
 */
export async function toggleLike(userId: string, recipeId: string) {
  logger.debug({ userId, recipeId }, 'toggleLike started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  const result = await model.toggleLike(userId, recipeId);

  if (result.liked && recipe.authorId !== userId) {
    (async () => {
      const liker = await model.getUserById(userId);
      if (!liker?.username) return;
      // F05: createLikeNotification owns BOTH the in-app `like` record AND
      // the recipe-liked email (gated on `notifyRecipeLiked` prefs — single
      // flag gates both). No direct notifyRecipeLiked call here — that would
      // double-send and bypass the preference gate.
      await createLikeNotification({
        likerId: userId,
        likerUsername: liker.username,
        recipeAuthorId: recipe.authorId,
        recipeId,
        recipeSlug: recipe.slug,
        recipeTitle: recipe.title,
      });
    })().catch((err) => logger.error({ err, recipeId }, 'createLikeNotification failed'));
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

/**
 * Return lightweight metadata for a recipe by slug.
 *
 * Includes title, author, visibility, counts, and the primary photo URL.
 * Used for SEO / social sharing previews and link unfurling.
 */
export async function getRecipeMeta(slug: string) {
  logger.debug({ slug }, 'getRecipeMeta started');
  const recipe = await model.findBySlug(slug);
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

/**
 * True when the caller may view the recipe.
 *
 * Canonical visibility predicate (previously duplicated inline at
 * `recipe/index.ts` GET /:slugOrId and GET /:slug/versions): `public`/`unlisted`
 * are visible to any caller including anonymous; `draft`/`private` are visible
 * only to the author (`userId === recipe.authorId`) or to an admin. The admin
 * bypass is deliberate: the recipe GET routes do NOT pass an admin flag (they
 * keep their pre-existing author-only semantics), but the comment surface does
 * — the comment-reply permission rule already honours `isAdmin`
 * (comment/service.ts), so the predicate supports it for that caller.
 *
 * Pure function with no I/O — intentionally has no entry/exit debug logging;
 * the calling routes/services already log.
 *
 * @param recipe - Minimal recipe shape: visibility + authorId
 * @param userId - Authenticated caller id, or null/undefined when anonymous
 * @param isAdmin - Whether the caller has admin privileges
 * @returns true when the caller may view the recipe
 */
export function canViewRecipe(
  recipe: { visibility: string; authorId: string },
  userId?: string | null,
  isAdmin?: boolean,
): boolean {
  if (recipe.visibility === 'draft' || recipe.visibility === 'private') {
    return userId === recipe.authorId || isAdmin === true;
  }
  return true;
}

// ponytail: no entry/exit debug logs on these 6 passthroughs — deliberate deviation,
// same precedent as canViewRecipe above. Add logging if these gain business logic.

/** List all versions for a recipe. */
export function getVersionsByRecipeId(recipeId: string) {
  return model.getVersionsByRecipeId(recipeId);
}

/** Fetch the current user's like and favourite status for a recipe. */
export function getUserLikeStatus(userId: string, recipeId: string) {
  return model.getUserLikeStatus(userId, recipeId);
}

/** Count the total number of users who have favourited a recipe. */
export function getFavouriteCount(recipeId: string) {
  return model.getFavouriteCount(recipeId);
}

/** Compute the average rating and total rating count for a recipe. */
export function getRecipeRatingStats(recipeId: string) {
  return model.getRecipeRatingStats(recipeId);
}

/** Fetch a specific user's rating for a recipe, or null if they haven't rated it. */
export function getUserRating(userId: string, recipeId: string) {
  return model.getUserRating(userId, recipeId);
}

/** Create or update a user's rating for a recipe. */
export function upsertUserRating(userId: string, recipeId: string, rating: number) {
  return model.upsertUserRating(userId, recipeId, rating);
}

export function getMergedIds(
  list1: { [key: string]: unknown }[] | undefined,
  list2: { [key: string]: unknown }[] | undefined,
  choice: string | undefined,
  idField: string,
): string[] {
  if (!choice || choice === 'none') return [];
  if (choice === 'v1') return (list1 ?? []).map((x) => x[idField] as string);
  if (choice === 'v2') return (list2 ?? []).map((x) => x[idField] as string);
  const ids = new Set<string>();
  (list1 ?? []).forEach((x) => ids.add(x[idField] as string));
  (list2 ?? []).forEach((x) => ids.add(x[idField] as string));
  return Array.from(ids);
}

export function getMergedPreparations(
  v1: { additionalPreparations?: unknown[] },
  v2: { additionalPreparations?: unknown[] },
  choice?: string,
): unknown[] {
  if (!choice || choice === 'none') return [];
  if (choice === 'v1') return v1.additionalPreparations ?? [];
  if (choice === 'v2') return v2.additionalPreparations ?? [];
  return [...(v1.additionalPreparations ?? []), ...(v2.additionalPreparations ?? [])];
}

/**
 * Merge two recipe versions into a new draft recipe.
 * @param authorId - UUID of the user performing the merge.
 * @param data - Validated merge selection payload.
 * @returns The newly created draft recipe.
 */
export async function mergeRecipes(authorId: string, data: RecipeMerge) {
  logger.debug({ authorId }, 'mergeRecipes started');

  const v1 = await model.fetchRecipeVersionWithRelations(data.recipeVersionId1);
  const v2 = await model.fetchRecipeVersionWithRelations(data.recipeVersionId2);

  if (!v1 || !v2) throw new Error('RECIPE_NOT_FOUND');

  const canAccess = (v: typeof v1) =>
    v.recipe.authorId === authorId || v.recipe.visibility === 'public';
  if (!canAccess(v1) || !canAccess(v2)) throw new Error('FORBIDDEN');

  const sel = data.selections;
  const pick = <K extends keyof typeof v1>(field: K) => {
    const choice = sel[field as keyof typeof sel];
    if (!choice || choice === 'none') return null;
    if (choice === 'v2') return v2[field];
    return v1[field];
  };

  const mergedData = {
    title: data.title,
    visibility: 'draft' as const,
    brewMethod: pick('brewMethod') ?? v1.brewMethod,
    drinkType: pick('drinkType') ?? v1.drinkType,
    grindSize: pick('grindSize') ?? undefined,
    groundWeightGrams: pick('groundWeightGrams') ?? undefined,
    extractionTimeSeconds: pick('extractionTimeSeconds') ?? undefined,
    extractionVolumeMl: pick('extractionVolumeMl') ?? undefined,
    temperatureCelsius: pick('temperatureCelsius') ?? undefined,
    brewerDetails: pick('brewerDetails') ?? undefined,
    grinder: pick('grinder') ?? undefined,
    preparationNotes: pick('preparationNotes') || 'Merged recipe',
    personalNotes: pick('personalNotes') ?? undefined,
    isFavourite: false,
    tasteNoteIds: getMergedIds(v1.tasteNotes, v2.tasteNotes, sel.tasteNotes, 'tasteNoteId'),
    equipmentIds: getMergedIds(v1.equipment, v2.equipment, sel.equipment, 'equipmentId'),
    additionalPreparations: getMergedPreparations(v1, v2, sel.additionalPreparations) as Array<{
      name: string;
      type: 'milk' | 'water' | 'syrup' | 'spice' | 'other';
      inputAmount: string;
      preparationType: string;
    }>,
  };

  try {
    const recipe = await createRecipe(authorId, mergedData);
    logger.debug({ authorId, recipeId: recipe?.id }, 'mergeRecipes completed');
    return recipe;
  } catch (err) {
    logger.error({ err, authorId }, 'mergeRecipes failed');
    throw err;
  }
}

/** The 20 scalar fields compared between two recipe versions. */
const DIFF_SCALAR_FIELDS = [
  'brewMethod',
  'drinkType',
  'productName',
  'coffeeBrand',
  'coffeeProcessing',
  'grindSize',
  'grinder',
  'brewerDetails',
  'groundWeightGrams',
  'extractionTimeSeconds',
  'extractionVolumeMl',
  'temperatureCelsius',
  'brewRatio',
  'flowRate',
  'preInfusionTimeSeconds',
  'tds',
  'preparationNotes',
  'personalNotes',
  'rating',
  'emojiTag',
] as const;

/**
 * Compute a field-by-field diff between two versions of the same recipe.
 *
 * @param recipeId - The recipe both versions must belong to.
 * @param v1Id - UUID of the first (older) version.
 * @param v2Id - UUID of the second (newer) version.
 * @returns A structured diff payload matching `VersionDiffOutputSchema`.
 * @throws Error('VERSION_NOT_FOUND') if either version is missing or belongs to a different recipe.
 * @throws Error('SAME_VERSION') if v1Id === v2Id.
 */
export async function diffVersions(recipeId: string, v1Id: string, v2Id: string) {
  logger.debug({ recipeId, v1Id, v2Id }, 'diffVersions started');

  if (v1Id === v2Id) throw new Error('SAME_VERSION');

  try {
    const [v1, v2] = await Promise.all([
      model.fetchRecipeVersionWithRelations(v1Id),
      model.fetchRecipeVersionWithRelations(v2Id),
    ]);

    if (!v1 || !v2 || v1.recipeId !== recipeId || v2.recipeId !== recipeId) {
      throw new Error('VERSION_NOT_FOUND');
    }

    const fields = DIFF_SCALAR_FIELDS.map((field) => {
      const value1 = v1[field] ?? null;
      const value2 = v2[field] ?? null;
      let status: 'added' | 'removed' | 'modified' | 'unchanged';
      if (value1 === null && value2 !== null) status = 'added';
      else if (value1 !== null && value2 === null) status = 'removed';
      else if (value1 !== value2) status = 'modified';
      else status = 'unchanged';
      return { field, value1, value2, status };
    });

    const names1 = new Set(v1.tasteNotes.map((tn) => tn.tasteNote.name));
    const names2 = new Set(v2.tasteNotes.map((tn) => tn.tasteNote.name));
    const tasteNotes = {
      added: [...names2].filter((n) => !names1.has(n)),
      removed: [...names1].filter((n) => !names2.has(n)),
      unchanged: [...names1].filter((n) => names2.has(n)),
    };

    const equip1 = new Set(v1.equipment.map((e) => e.equipment.name));
    const equip2 = new Set(v2.equipment.map((e) => e.equipment.name));
    const equipment = {
      added: [...equip2].filter((n) => !equip1.has(n)),
      removed: [...equip1].filter((n) => !equip2.has(n)),
      unchanged: [...equip1].filter((n) => equip2.has(n)),
    };

    const result = {
      version1: {
        id: v1.id,
        versionNumber: v1.versionNumber,
        brewDate: new Date(v1.brewDate).toISOString(),
      },
      version2: {
        id: v2.id,
        versionNumber: v2.versionNumber,
        brewDate: new Date(v2.brewDate).toISOString(),
      },
      fields,
      tasteNotes,
      equipment,
    };

    logger.debug({ recipeId, v1Id, v2Id }, 'diffVersions completed');
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'VERSION_NOT_FOUND') {
      logger.debug({ recipeId, v1Id, v2Id }, 'diffVersions version not found');
    } else {
      logger.error({ err, recipeId, v1Id, v2Id }, 'diffVersions failed');
    }
    throw err;
  }
}
