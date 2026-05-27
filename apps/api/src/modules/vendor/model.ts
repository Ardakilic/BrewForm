/**
 * Vendor database operations for BrewForm.
 *
 * Manages coffee vendor/roaster records with soft-delete, paginated listing,
 * name-based search, and full CRUD operations.
 */
import { db } from '@brewform/db';
import { vendors } from '@brewform/db/schema';
import { and, asc, count, eq, isNull, like } from 'drizzle-orm';

/** Find a vendor by ID. Returns null if deleted or not found. */
export async function findById(id: string) {
  const result = await db.select().from(vendors).where(
    and(eq(vendors.id, id), isNull(vendors.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

/**
 * List all non-deleted vendors with pagination, ordered by name ascending.
 *
 * @returns Paginated vendor list with total count
 */
export async function findMany(page: number, perPage: number) {
  const where = isNull(vendors.deletedAt);
  const [data, totalResult] = await Promise.all([
    db.select().from(vendors).where(where).orderBy(asc(vendors.name)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(vendors).where(where),
  ]);
  return { vendors: data, total: totalResult[0].count };
}

/** Search non-deleted vendors by name (LIKE match), limited to 10 results. */
export async function search(query: string) {
  return db.select().from(vendors)
    .where(and(isNull(vendors.deletedAt), like(vendors.name, `%${query}%`)))
    .orderBy(asc(vendors.name))
    .limit(10);
}

/** Create a new vendor. */
export async function create(data: typeof vendors.$inferInsert) {
  const [result] = await db.insert(vendors).values(data).returning();
  return result;
}

/** Update a vendor by ID. Returns null if not found. */
export async function update(id: string, data: Partial<typeof vendors.$inferInsert>) {
  const [result] = await db.update(vendors).set(data).where(eq(vendors.id, id)).returning();
  return result ?? null;
}

/** Soft-delete a vendor by setting its deletedAt timestamp. */
export async function softDelete(id: string) {
  const [result] = await db.update(vendors).set({ deletedAt: new Date() }).where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
    .returning();
  return result ?? null;
}
