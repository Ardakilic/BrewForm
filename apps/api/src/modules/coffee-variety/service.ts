// deno-lint-ignore-file require-await
import * as model from './model.ts';
import { coffeeVarieties } from '@brewform/db/schema';
import { cacheProvider } from '../../utils/cache/singleton.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';
import { createLogger } from '../../utils/logger/index.ts';

/**
 * Coffee variety service.
 *
 * Provides lookup, listing, creation, updates, deletion, and recipe lookups for coffee varieties.
 */
export const log = createLogger('coffee-variety-service');

type CoffeeVarietyInsert = typeof coffeeVarieties.$inferInsert;
type CoffeeVarietySelect = typeof coffeeVarieties.$inferSelect;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Get a coffee variety by ID, using the cache when available.
 */
export async function getCoffeeVarietyById(
  id: string,
  deps: { model: typeof model; cache?: CacheProvider } = { model, cache: cacheProvider },
) {
  log.debug({ id }, 'getCoffeeVarietyById started');
  const cacheKey = ['coffee-variety', id];
  const cached = await deps.cache?.get<CoffeeVarietySelect>(cacheKey);
  if (cached) {
    log.debug({ id, cached: true }, 'getCoffeeVarietyById completed');
    return cached;
  }

  const variety = await deps.model.findById(id);
  if (!variety) {
    log.debug({ id, cached: false }, 'getCoffeeVarietyById completed');
    return null;
  }

  await deps.cache?.set(cacheKey, variety, {
    ttlMs: CACHE_TTL_MS,
  });
  log.debug({ id, cached: false }, 'getCoffeeVarietyById completed');
  return variety;
}

/**
 * List coffee varieties with optional filters and pagination.
 */
export async function listCoffeeVarieties(
  params: {
    category?: string;
    search?: string;
    page: number;
    perPage: number;
  },
  deps: { model: typeof model } = { model },
) {
  log.debug(
    {
      category: params.category,
      search: params.search,
      page: params.page,
      perPage: params.perPage,
    },
    'listCoffeeVarieties started',
  );
  const result = await deps.model.findMany(params);
  log.debug(
    {
      category: params.category,
      search: params.search,
      page: params.page,
      perPage: params.perPage,
      total: result.total,
    },
    'listCoffeeVarieties completed',
  );
  return result;
}

/**
 * Create a new coffee variety owned by the given user.
 */
export async function createCoffeeVariety(
  data: CoffeeVarietyInsert,
  userId: string,
  deps: { model: typeof model } = { model },
) {
  log.debug({ userId, name: data.name }, 'createCoffeeVariety started');
  const result = await deps.model.create({ ...data, createdBy: userId, isSystem: false });
  log.debug({ userId, name: data.name, varietyId: result.id }, 'createCoffeeVariety completed');
  return result;
}

/**
 * Update a coffee variety by ID.
 *
 * Only the creator (or an admin) may update. System varieties are immutable
 * regardless of admin status.
 *
 * @throws COFFEE_VARIETY_NOT_FOUND if the variety doesn't exist
 * @throws SYSTEM_VARIETY_IMMUTABLE if the variety is a built-in/system record
 * @throws FORBIDDEN if the user is neither the creator nor an admin
 */
export async function updateCoffeeVariety(
  id: string,
  data: Partial<CoffeeVarietyInsert>,
  userId: string,
  deps: { model: typeof model; cache?: CacheProvider } = { model, cache: cacheProvider },
  isAdmin: boolean = false,
) {
  log.debug({ id, userId, isAdmin }, 'updateCoffeeVariety started');

  const variety = await deps.model.findById(id);
  if (!variety) {
    log.error({ id, userId }, 'updateCoffeeVariety failed: coffee variety not found');
    throw new Error('COFFEE_VARIETY_NOT_FOUND');
  }
  if (variety.isSystem) {
    log.warn({ id, userId }, 'updateCoffeeVariety failed: system variety immutable');
    throw new Error('SYSTEM_VARIETY_IMMUTABLE');
  }
  if (variety.createdBy !== userId && !isAdmin) {
    log.warn(
      { id, userId, isAdmin, createdBy: variety.createdBy },
      'updateCoffeeVariety failed: forbidden',
    );
    throw new Error('FORBIDDEN');
  }

  const result = await deps.model.update(id, data);
  await deps.cache?.delete(['coffee-variety', id]);
  log.debug({ id, userId }, 'updateCoffeeVariety completed');
  return result;
}

/**
 * Soft-delete a coffee variety by ID.
 *
 * Only the creator (or an admin) may delete. System varieties are immutable
 * regardless of admin status.
 *
 * @throws COFFEE_VARIETY_NOT_FOUND if the variety doesn't exist
 * @throws SYSTEM_VARIETY_IMMUTABLE if the variety is a built-in/system record
 * @throws FORBIDDEN if the user is neither the creator nor an admin
 */
export async function deleteCoffeeVariety(
  id: string,
  userId: string,
  deps: { model: typeof model; cache?: CacheProvider } = { model, cache: cacheProvider },
  isAdmin: boolean = false,
) {
  log.debug({ id, userId, isAdmin }, 'deleteCoffeeVariety started');

  const variety = await deps.model.findById(id);
  if (!variety) {
    log.error({ id, userId }, 'deleteCoffeeVariety failed: coffee variety not found');
    throw new Error('COFFEE_VARIETY_NOT_FOUND');
  }
  if (variety.isSystem) {
    log.warn({ id, userId }, 'deleteCoffeeVariety failed: system variety immutable');
    throw new Error('SYSTEM_VARIETY_IMMUTABLE');
  }
  if (variety.createdBy !== userId && !isAdmin) {
    log.warn(
      { id, userId, isAdmin, createdBy: variety.createdBy },
      'deleteCoffeeVariety failed: forbidden',
    );
    throw new Error('FORBIDDEN');
  }

  const result = await deps.model.softDelete(id);
  await deps.cache?.delete(['coffee-variety', id]);
  log.debug({ id, userId }, 'deleteCoffeeVariety completed');
  return result;
}

/**
 * Get recipes that use the given coffee variety, paginated.
 */
export async function getRecipesForVariety(
  varietyId: string,
  page: number,
  perPage: number,
  deps: { model: typeof model } = { model },
) {
  log.debug({ varietyId, page, perPage }, 'getRecipesForVariety started');
  const result = await deps.model.getRecipesUsingVariety(varietyId, page, perPage);
  log.debug({ varietyId, page, perPage, total: result.total }, 'getRecipesForVariety completed');
  return result;
}
