/**
 * BrewForm Recipe Service
 * Handles recipe CRUD, versioning, forking, and social features
 */

import { getPrisma, softDeleteFilter, getPagination, createPaginationMeta } from '../../utils/database/index.js';
import { getLogger, logAudit } from '../../utils/logger/index.js';
import { createRecipeSlug } from '../../utils/slug/index.js';
import { validateRecipe, type RecipeVersionInput } from '../../utils/validation/index.js';
import { invalidateCache, CacheKeys, cacheGetOrSet } from '../../utils/redis/index.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../middleware/errorHandler.js';
import { calculateBrewRatio, calculateFlowRate } from '../../utils/units/index.js';
import type { Visibility, BrewMethodType, DrinkType } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface CreateRecipeInput {
  visibility?: Visibility;
  version: RecipeVersionInput;
}

export interface RecipeFilters {
  search?: string;
  brewMethod?: BrewMethodType;
  drinkType?: DrinkType;
  vendorId?: string;
  coffeeId?: string;
  grinderId?: string;
  brewerId?: string;
  userId?: string;
  visibility?: Visibility;
  minRating?: number;
  tags?: string[];
  sortBy?: 'createdAt' | 'rating' | 'favouriteCount' | 'viewCount';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// ============================================
// Service Functions
// ============================================

/**
 * Create a new recipe
 */
export async function createRecipe(userId: string, input: CreateRecipeInput) {
  const prisma = getPrisma();
  const logger = getLogger();

  // Validate recipe
  const validation = validateRecipe(input.version);
  if (!validation.valid) {
    throw new ValidationError(
      validation.errors.map((e) => ({ field: 'version', message: e }))
    );
  }

  // Generate slug
  const slug = createRecipeSlug(input.version.title);

  // Calculate derived metrics
  const brewRatio = input.version.yieldGrams
    ? calculateBrewRatio(input.version.doseGrams, input.version.yieldGrams)
    : null;
  const flowRate =
    input.version.yieldMl && input.version.brewTimeSec
      ? calculateFlowRate(input.version.yieldMl, input.version.brewTimeSec)
      : null;

  // Create recipe with first version
  const recipe = await prisma.recipe.create({
    data: {
      userId,
      slug,
      visibility: input.visibility || 'DRAFT',
      versions: {
        create: {
          userId,
          versionNumber: 1,
          title: input.version.title,
          description: input.version.description,
          brewMethod: input.version.brewMethod,
          drinkType: input.version.drinkType,
          coffeeId: input.version.coffeeId,
          coffeeName: input.version.coffeeName,
          roastDate: input.version.roastDate,
          grindDate: input.version.grindDate,
          grinderId: input.version.grinderId,
          brewerId: input.version.brewerId,
          portafilterId: input.version.portafilterId,
          basketId: input.version.basketId,
          puckScreenId: input.version.puckScreenId,
          paperFilterId: input.version.paperFilterId,
          tamperId: input.version.tamperId,
          grindSize: input.version.grindSize,
          doseGrams: input.version.doseGrams,
          yieldMl: input.version.yieldMl,
          yieldGrams: input.version.yieldGrams,
          brewTimeSec: input.version.brewTimeSec,
          tempCelsius: input.version.tempCelsius,
          pressure: input.version.pressure,
          brewRatio,
          flowRate,
          preparations: input.version.preparations as object,
          tastingNotes: input.version.tastingNotes,
          rating: input.version.rating,
          emojiRating: input.version.emojiRating,
          isFavourite: input.version.isFavourite,
          tags: input.version.tags || [],
          tasteNotes: input.version.tasteNoteIds?.length
            ? {
                create: input.version.tasteNoteIds.map((tasteNoteId) => ({
                  tasteNoteId,
                })),
              }
            : undefined,
        },
      },
    },
    include: {
      versions: {
        include: {
          tasteNotes: {
            include: {
              tasteNote: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  // Set current version
  await prisma.recipe.update({
    where: { id: recipe.id },
    data: { currentVersionId: recipe.versions[0].id },
  });

  logAudit('recipe_created', 'recipe', recipe.id, userId);
  logger.info({ type: 'recipe', action: 'create', recipeId: recipe.id, userId });

  // Invalidate caches
  await invalidateCache(CacheKeys.latestRecipes());
  await invalidateCache(`${CacheKeys.recipeList('*')}`);

  return { ...recipe, currentVersionId: recipe.versions[0].id };
}

/**
 * Get recipe by ID
 */
export async function getRecipeById(recipeId: string, viewerId?: string | null) {
  const prisma = getPrisma();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId, ...softDeleteFilter() },
    include: {
      currentVersion: {
        include: {
          coffee: { include: { vendor: true } },
          grinder: true,
          brewer: true,
          portafilter: true,
          basket: true,
          puckScreen: true,
          paperFilter: true,
          tamper: true,
          tasteNotes: {
            include: {
              tasteNote: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      forkedFrom: {
        select: {
          id: true,
          slug: true,
          currentVersion: { select: { title: true } },
          user: { select: { username: true } },
        },
      },
      _count: {
        select: {
          versions: true,
          forks: true,
          comments: { where: softDeleteFilter() },
        },
      },
    },
  });

  if (!recipe) {
    throw new NotFoundError('Recipe');
  }

  // Check visibility
  const isOwner = viewerId === recipe.userId;
  if (!isOwner) {
    if (recipe.visibility === 'DRAFT' || recipe.visibility === 'PRIVATE') {
      throw new NotFoundError('Recipe');
    }
  }

  // Increment view count (async, don't wait)
  if (!isOwner) {
    prisma.recipe
      .update({
        where: { id: recipeId },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {});
  }

  return recipe;
}

/**
 * Get recipe by slug
 */
export async function getRecipeBySlug(slug: string, viewerId?: string | null) {
  const prisma = getPrisma();

  const recipe = await prisma.recipe.findUnique({
    where: { slug, ...softDeleteFilter() },
  });

  if (!recipe) {
    throw new NotFoundError('Recipe');
  }

  return getRecipeById(recipe.id, viewerId);
}

/**
 * Update recipe metadata (visibility, featured)
 */
export async function updateRecipe(
  recipeId: string,
  userId: string,
  input: { visibility?: Visibility; isFeatured?: boolean }
) {
  const prisma = getPrisma();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId, ...softDeleteFilter() },
  });

  if (!recipe) {
    throw new NotFoundError('Recipe');
  }

  if (recipe.userId !== userId) {
    throw new ForbiddenError('You can only update your own recipes');
  }

  const updated = await prisma.recipe.update({
    where: { id: recipeId },
    data: {
      visibility: input.visibility,
      isFeatured: input.isFeatured,
    },
    include: {
      currentVersion: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });

  logAudit('recipe_updated', 'recipe', recipeId, userId);

  // Invalidate caches
  await invalidateCache(CacheKeys.recipe(recipeId));
  await invalidateCache(CacheKeys.recipeBySlug(recipe.slug));

  return updated;
}

/**
 * Create new version of a recipe
 */
export async function createRecipeVersion(
  recipeId: string,
  userId: string,
  input: RecipeVersionInput
) {
  const prisma = getPrisma();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId, ...softDeleteFilter() },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });

  if (!recipe) {
    throw new NotFoundError('Recipe');
  }

  if (recipe.userId !== userId) {
    throw new ForbiddenError('You can only update your own recipes');
  }

  // Validate
  const validation = validateRecipe(input);
  if (!validation.valid) {
    throw new ValidationError(
      validation.errors.map((e) => ({ field: 'version', message: e }))
    );
  }

  const nextVersion = (recipe.versions[0]?.versionNumber || 0) + 1;

  // Calculate derived metrics
  const brewRatio = input.yieldGrams
    ? calculateBrewRatio(input.doseGrams, input.yieldGrams)
    : null;
  const flowRate =
    input.yieldMl && input.brewTimeSec
      ? calculateFlowRate(input.yieldMl, input.brewTimeSec)
      : null;

  const version = await prisma.recipeVersion.create({
    data: {
      recipeId,
      userId,
      versionNumber: nextVersion,
      title: input.title,
      description: input.description,
      brewMethod: input.brewMethod,
      drinkType: input.drinkType,
      coffeeId: input.coffeeId,
      coffeeName: input.coffeeName,
      roastDate: input.roastDate,
      grindDate: input.grindDate,
      grinderId: input.grinderId,
      brewerId: input.brewerId,
      portafilterId: input.portafilterId,
      basketId: input.basketId,
      puckScreenId: input.puckScreenId,
      paperFilterId: input.paperFilterId,
      tamperId: input.tamperId,
      grindSize: input.grindSize,
      doseGrams: input.doseGrams,
      yieldMl: input.yieldMl,
      yieldGrams: input.yieldGrams,
      brewTimeSec: input.brewTimeSec,
      tempCelsius: input.tempCelsius,
      pressure: input.pressure,
      brewRatio,
      flowRate,
      preparations: input.preparations as object,
      tastingNotes: input.tastingNotes,
      rating: input.rating,
      emojiRating: input.emojiRating,
      isFavourite: input.isFavourite,
      tags: input.tags || [],
      tasteNotes: input.tasteNoteIds?.length
        ? {
            create: input.tasteNoteIds.map((tasteNoteId) => ({
              tasteNoteId,
            })),
          }
        : undefined,
    },
    include: {
      tasteNotes: {
        include: {
          tasteNote: true,
        },
      },
    },
  });

  // Update current version
  await prisma.recipe.update({
    where: { id: recipeId },
    data: { currentVersionId: version.id },
  });

  logAudit('recipe_version_created', 'recipe_version', version.id, userId);

  // Invalidate caches
  await invalidateCache(CacheKeys.recipe(recipeId));

  return version;
}

/**
 * Fork a recipe
 */
export async function forkRecipe(recipeId: string, userId: string) {
  const prisma = getPrisma();

  const original = await prisma.recipe.findUnique({
    where: { id: recipeId, ...softDeleteFilter() },
    include: {
      currentVersion: {
        include: {
          tasteNotes: true,
        },
      },
    },
  });

  if (!original || !original.currentVersion) {
    throw new NotFoundError('Recipe');
  }

  // Check if public or unlisted
  if (original.visibility === 'DRAFT' || original.visibility === 'PRIVATE') {
    throw new ForbiddenError('Cannot fork private recipes');
  }

  const v = original.currentVersion;
  const slug = createRecipeSlug(`${v.title} fork`);

  // Get taste note IDs from original version
  const originalTasteNoteIds = (v.tasteNotes as { tasteNoteId: string }[])?.map(
    (tn) => tn.tasteNoteId
  ) || [];

  // Create forked recipe
  const forked = await prisma.recipe.create({
    data: {
      userId,
      slug,
      visibility: 'DRAFT',
      forkedFromId: recipeId,
      versions: {
        create: {
          userId,
          versionNumber: 1,
          title: `${v.title} (Fork)`,
          description: v.description,
          brewMethod: v.brewMethod,
          drinkType: v.drinkType,
          coffeeId: v.coffeeId,
          coffeeName: v.coffeeName,
          roastDate: v.roastDate,
          grindDate: v.grindDate,
          grinderId: v.grinderId,
          brewerId: v.brewerId,
          portafilterId: v.portafilterId,
          basketId: v.basketId,
          puckScreenId: v.puckScreenId,
          paperFilterId: v.paperFilterId,
          tamperId: v.tamperId,
          grindSize: v.grindSize,
          doseGrams: v.doseGrams,
          yieldMl: v.yieldMl,
          yieldGrams: v.yieldGrams,
          brewTimeSec: v.brewTimeSec,
          tempCelsius: v.tempCelsius,
          pressure: v.pressure,
          brewRatio: v.brewRatio,
          flowRate: v.flowRate,
          preparations: v.preparations as object,
          tastingNotes: null,
          rating: null,
          emojiRating: null,
          isFavourite: false,
          tags: v.tags,
          tasteNotes: originalTasteNoteIds.length
            ? {
                create: originalTasteNoteIds.map((tasteNoteId) => ({
                  tasteNoteId,
                })),
              }
            : undefined,
        },
      },
    },
    include: {
      versions: {
        include: {
          tasteNotes: {
            include: {
              tasteNote: true,
            },
          },
        },
      },
    },
  });

  // Set current version
  await prisma.recipe.update({
    where: { id: forked.id },
    data: { currentVersionId: forked.versions[0].id },
  });

  // Increment fork count on original
  await prisma.recipe.update({
    where: { id: recipeId },
    data: { forkCount: { increment: 1 } },
  });

  logAudit('recipe_forked', 'recipe', forked.id, userId);

  return { ...forked, currentVersionId: forked.versions[0].id };
}

/**
 * Delete recipe (soft delete)
 */
export async function deleteRecipe(recipeId: string, userId: string) {
  const prisma = getPrisma();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId, ...softDeleteFilter() },
  });

  if (!recipe) {
    throw new NotFoundError('Recipe');
  }

  if (recipe.userId !== userId) {
    throw new ForbiddenError('You can only delete your own recipes');
  }

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { deletedAt: new Date() },
  });

  logAudit('recipe_deleted', 'recipe', recipeId, userId);

  // Invalidate caches
  await invalidateCache(CacheKeys.recipe(recipeId));
  await invalidateCache(CacheKeys.recipeBySlug(recipe.slug));
}

/**
 * Build visibility filter for recipe queries
 */
function buildVisibilityFilter(filters: RecipeFilters, viewerId?: string | null): string | undefined {
  if (filters.visibility) return filters.visibility;
  if (filters.userId && filters.userId === viewerId) return undefined;
  return 'PUBLIC';
}

/**
 * Build current version filter for recipe queries
 */
function buildVersionFilter(filters: RecipeFilters): Record<string, unknown> | undefined {
  const hasVersionFilters = filters.brewMethod || filters.drinkType || filters.coffeeId || 
    filters.grinderId || filters.brewerId || filters.minRating || filters.tags;
  
  if (!hasVersionFilters) return undefined;
  
  return {
    ...(filters.brewMethod && { brewMethod: filters.brewMethod }),
    ...(filters.drinkType && { drinkType: filters.drinkType }),
    ...(filters.coffeeId && { coffeeId: filters.coffeeId }),
    ...(filters.grinderId && { grinderId: filters.grinderId }),
    ...(filters.brewerId && { brewerId: filters.brewerId }),
    ...(filters.minRating && { rating: { gte: filters.minRating } }),
    ...(filters.tags?.length && { tags: { hasSome: filters.tags } }),
  };
}

/**
 * Build search filter for recipe queries
 */
function buildSearchFilter(search?: string) {
  if (!search) return undefined;
  return [
    { currentVersion: { title: { contains: search, mode: 'insensitive' } } },
    { currentVersion: { description: { contains: search, mode: 'insensitive' } } },
    { currentVersion: { coffeeName: { contains: search, mode: 'insensitive' } } },
  ];
}

/**
 * List recipes with filters
 */
export async function listRecipes(filters: RecipeFilters, viewerId?: string | null) {
  const prisma = getPrisma();
  const pagination = getPagination({ page: filters.page, limit: filters.limit });

  const visibility = buildVisibilityFilter(filters, viewerId);
  const versionFilter = buildVersionFilter(filters);
  const searchFilter = buildSearchFilter(filters.search);

  const where: Record<string, unknown> = {
    ...softDeleteFilter(),
    ...(visibility && { visibility }),
    ...(filters.userId && { userId: filters.userId }),
    ...(versionFilter && { currentVersion: versionFilter }),
    ...(searchFilter && { OR: searchFilter }),
  };

  const orderBy: Record<string, 'asc' | 'desc'> = {
    [filters.sortBy || 'createdAt']: filters.sortOrder || 'desc',
  };

  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where: where as never,
      include: {
        currentVersion: {
          select: {
            id: true,
            title: true,
            description: true,
            brewMethod: true,
            drinkType: true,
            rating: true,
            emojiRating: true,
            doseGrams: true,
            yieldGrams: true,
            brewRatio: true,
            createdAt: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy,
      ...pagination,
    }),
    prisma.recipe.count({ where: where as never }),
  ]);

  return {
    recipes,
    pagination: createPaginationMeta(filters.page || 1, filters.limit || 20, total),
  };
}

/**
 * Get latest public recipes
 */
export async function getLatestRecipes(limit = 10) {
  return cacheGetOrSet(
    CacheKeys.latestRecipes(),
    async () => {
      const prisma = getPrisma();
      return prisma.recipe.findMany({
        where: {
          ...softDeleteFilter(),
          visibility: 'PUBLIC',
        },
        include: {
          currentVersion: {
            select: {
              id: true,
              title: true,
              brewMethod: true,
              drinkType: true,
              rating: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    },
    300 // 5 minutes
  );
}

/**
 * Get popular recipes
 */
export async function getPopularRecipes(limit = 10) {
  return cacheGetOrSet(
    CacheKeys.popularRecipes(),
    async () => {
      const prisma = getPrisma();
      return prisma.recipe.findMany({
        where: {
          ...softDeleteFilter(),
          visibility: 'PUBLIC',
        },
        include: {
          currentVersion: {
            select: {
              id: true,
              title: true,
              brewMethod: true,
              drinkType: true,
              rating: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { favouriteCount: 'desc' },
        take: limit,
      });
    },
    300
  );
}

/**
 * Get recipe versions
 */
export async function getRecipeVersions(recipeId: string, viewerId?: string | null) {
  const prisma = getPrisma();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId, ...softDeleteFilter() },
  });

  if (!recipe) {
    throw new NotFoundError('Recipe');
  }

  // Check access
  const isOwner = viewerId === recipe.userId;
  if (!isOwner && (recipe.visibility === 'DRAFT' || recipe.visibility === 'PRIVATE')) {
    throw new NotFoundError('Recipe');
  }

  return prisma.recipeVersion.findMany({
    where: { recipeId },
    orderBy: { versionNumber: 'desc' },
  });
}

export const recipeService = {
  createRecipe,
  getRecipeById,
  getRecipeBySlug,
  updateRecipe,
  createRecipeVersion,
  forkRecipe,
  deleteRecipe,
  listRecipes,
  getLatestRecipes,
  getPopularRecipes,
  getRecipeVersions,
};

export default recipeService;
