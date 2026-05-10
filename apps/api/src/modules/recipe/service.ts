import * as model from './model.ts';
import { db } from '@brewform/db';
import {
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
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

export async function getRecipe(slugOrId: string) {
  let recipe: any;
  if (slugOrId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    recipe = await model.findById(slugOrId);
  } else {
    recipe = await model.findBySlug(slugOrId);
  }
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  return recipe;
}

export async function createRecipe(authorId: string, data: any) {
  const slug = await generateUniqueSlug(data.title);

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
      title: data.title,
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
      personalNotes: data.personalNotes,
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

  return finalRecipe;
}

export async function updateRecipe(recipeId: string, authorId: string, data: any) {
  const recipe: any = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');

  if (data.bumpVersion) {
    const latestVersion: any = recipe.versions?.[0];
    const newVersionNumber = latestVersion.versionNumber + 1;

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
      personalNotes: data.personalNotes ?? latestVersion.personalNotes,
      isFavourite: data.isFavourite ?? latestVersion.isFavourite,
      rating: data.rating ?? latestVersion.rating,
      emojiTag: data.emojiTag ?? latestVersion.emojiTag,
      preInfusionTimeSeconds: data.preInfusionTimeSeconds ?? latestVersion.preInfusionTimeSeconds,
      beanId: data.beanId ?? latestVersion.beanId,
    });

    await model.update(recipe.id, {
      title: data.title ?? recipe.title,
      visibility: data.visibility ?? recipe.visibility,
      currentVersionId: version.id,
    });
  } else {
    await model.update(recipe.id, {
      title: data.title ?? recipe.title,
      visibility: data.visibility ?? recipe.visibility,
    });
  }

  return model.findById(recipeId);
}

export async function deleteRecipe(recipeId: string, authorId: string) {
  const recipe: any = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');
  await model.softDelete(recipeId);
}

export async function forkRecipe(sourceId: string, authorId: string, title?: string) {
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

  return forked;
}

export async function listRecipes(filters: any, page: number, perPage: number, requestingUserId: string | null = null, isAdmin: boolean = false) {
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

  if (filters.tasteNoteId) {
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

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';
  return model.findMany(where, page, perPage, sortBy, sortOrder);
}

export async function toggleLike(userId: string, recipeId: string) {
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

  return result;
}

export async function toggleFavourite(userId: string, recipeId: string) {
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  return model.toggleFavourite(userId, recipeId);
}

export async function toggleFeature(recipeId: string, authorId: string) {
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');
  return model.toggleFeature(recipeId);
}

export async function getRecipeMeta(slug: string) {
  const recipe: any = await model.findBySlug(slug);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  const latestVersion = recipe.versions?.[0];
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
