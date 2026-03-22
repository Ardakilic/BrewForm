/**
 * Mock for src/utils/database/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from '../mock-fn.ts';

// deno-lint-ignore no-explicit-any
let _prisma: any = null;

export function getPrisma() {
  return _prisma;
}

export function setPrisma(p: unknown): void {
  _prisma = p;
}

export function resetPrisma(): void {
  _prisma = null;
}

export function getPagination({
  page = 1,
  limit = 20,
}: { page?: number; limit?: number } = {}) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  return { skip: (safePage - 1) * safeLimit, take: safeLimit };
}

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number,
) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function softDeleteFilter() {
  return { deletedAt: null };
}

export const checkDbConnection = mockFn<Promise<boolean>>(
  () => Promise.resolve(true),
);
