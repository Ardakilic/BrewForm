// deno-lint-ignore-file require-await
import * as model from './model.ts';
import { coffeeVarieties } from '@brewform/db/schema';
import { cacheProvider } from '../../utils/cache/singleton.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';

type CoffeeVarietyInsert = typeof coffeeVarieties.$inferInsert;
type CoffeeVarietySelect = typeof coffeeVarieties.$inferSelect;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCoffeeVarietyById(
  id: string,
  deps: { model: typeof model; cache?: CacheProvider } = { model, cache: cacheProvider },
) {
  const cacheKey = ['coffee-variety', id];
  const cached = await deps.cache?.get<CoffeeVarietySelect>(cacheKey);
  if (cached) return cached;

  const variety = await deps.model.findById(id);
  if (!variety) return null;

  await deps.cache?.set(cacheKey, variety, {
    ttlMs: CACHE_TTL_MS,
  });
  return variety;
}

export async function listCoffeeVarieties(
  params: {
    category?: string;
    search?: string;
    page: number;
    perPage: number;
  },
  deps: { model: typeof model } = { model },
) {
  return deps.model.findMany(params);
}

export async function createCoffeeVariety(
  data: CoffeeVarietyInsert,
  userId: string,
  deps: { model: typeof model } = { model },
) {
  return deps.model.create({ ...data, createdBy: userId, isSystem: false });
}

export async function updateCoffeeVariety(
  id: string,
  data: Partial<CoffeeVarietyInsert>,
  _userId: string,
  deps: { model: typeof model; cache?: CacheProvider } = { model, cache: cacheProvider },
) {
  const variety = await deps.model.findById(id);
  if (!variety) throw new Error('Coffee variety not found');
  if (variety.isSystem) {
    throw new Error('Cannot modify system coffee varieties');
  }

  const result = await deps.model.update(id, data);
  await deps.cache?.delete(['coffee-variety', id]);
  return result;
}

export async function deleteCoffeeVariety(
  id: string,
  _userId: string,
  deps: { model: typeof model; cache?: CacheProvider } = { model, cache: cacheProvider },
) {
  const variety = await deps.model.findById(id);
  if (!variety) throw new Error('Coffee variety not found');
  if (variety.isSystem) {
    throw new Error('Cannot delete system coffee varieties');
  }

  const result = await deps.model.softDelete(id);
  await deps.cache?.delete(['coffee-variety', id]);
  return result;
}

export async function getRecipesForVariety(
  varietyId: string,
  page: number,
  perPage: number,
  deps: { model: typeof model } = { model },
) {
  return deps.model.getRecipesUsingVariety(varietyId, page, perPage);
}
