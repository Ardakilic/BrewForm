// deno-lint-ignore-file no-explicit-any require-await
import * as model from './model.ts';
import { coffeeVarieties } from '@brewform/db/schema';
import { cacheProvider } from '../../utils/cache/singleton.ts';

type CoffeeVarietyInsert = typeof coffeeVarieties.$inferInsert;
type CoffeeVarietySelect = typeof coffeeVarieties.$inferSelect;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCoffeeVarietyById(id: string) {
  const cacheKey = ['coffee-variety', id];
  const cached = await cacheProvider?.get<CoffeeVarietySelect>(cacheKey);
  if (cached) return cached;

  const variety = await model.findById(id);
  if (!variety) return null;

  await cacheProvider?.set(cacheKey, variety, {
    ttlMs: CACHE_TTL_MS,
  });
  return variety;
}

export async function listCoffeeVarieties(params: {
  category?: string;
  search?: string;
  page: number;
  perPage: number;
}) {
  return model.findMany(params);
}

export async function createCoffeeVariety(
  data: CoffeeVarietyInsert,
  userId: string,
) {
  return model.create({ ...data, createdBy: userId, isSystem: false });
}

export async function updateCoffeeVariety(
  id: string,
  data: Partial<CoffeeVarietyInsert>,
  _userId: string,
) {
  const variety = await model.findById(id);
  if (!variety) throw new Error('Coffee variety not found');
  if (variety.isSystem) {
    throw new Error('Cannot modify system coffee varieties');
  }

  const result = await model.update(id, data);
  await cacheProvider?.delete(['coffee-variety', id]);
  return result;
}

export async function deleteCoffeeVariety(id: string, _userId: string) {
  const variety = await model.findById(id);
  if (!variety) throw new Error('Coffee variety not found');
  if (variety.isSystem) {
    throw new Error('Cannot delete system coffee varieties');
  }

  const result = await model.softDelete(id);
  await cacheProvider?.delete(['coffee-variety', id]);
  return result;
}

export async function getRecipesForVariety(
  varietyId: string,
  page: number,
  perPage: number,
) {
  return model.getRecipesUsingVariety(varietyId, page, perPage);
}
