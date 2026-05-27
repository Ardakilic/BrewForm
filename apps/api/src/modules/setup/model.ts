/**
 * Equipment setup database operations for BrewForm.
 *
 * Manages user brewing setups (grinder, dripper, etc.) with soft-delete,
 * paginated listing, and a helper to clear the default flag before assigning
 * a new default setup.
 */
import { db } from '@brewform/db';
import { setups } from '@brewform/db/schema';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

/** Find a setup by ID. Returns null if deleted or not found. */
export async function findById(id: string) {
  const result = await db.select().from(setups).where(
    and(eq(setups.id, id), isNull(setups.deletedAt)),
  ).limit(1);
  return result[0] ?? null;
}

/**
 * List paginated setups for a user.
 *
 * @returns Paginated setups list with total count
 */
export async function findByUser(userId: string, page: number, perPage: number) {
  const where = and(eq(setups.userId, userId), isNull(setups.deletedAt));
  const [data, totalResult] = await Promise.all([
    db.select().from(setups).where(where).orderBy(desc(setups.createdAt)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(setups).where(where),
  ]);
  return { setups: data, total: totalResult[0].count };
}

/** Create a new setup. */
export async function create(data: typeof setups.$inferInsert) {
  const [result] = await db.insert(setups).values(data).returning();
  return result;
}

/** User-editable fields for a setup. */
export type UpdatableSetup = Pick<
  typeof setups.$inferInsert,
  | 'name'
  | 'brewerDetails'
  | 'grinder'
  | 'portafilterId'
  | 'basketId'
  | 'puckScreenId'
  | 'paperFilterId'
  | 'tamperId'
  | 'isDefault'
>;

/** Update a setup by ID. Returns null if not found. */
export async function update(id: string, data: Partial<UpdatableSetup>) {
  const [result] = await db.update(setups).set(data).where(eq(setups.id, id)).returning();
  return result ?? null;
}

/** Soft-delete a setup by setting its deletedAt timestamp. */
export async function softDelete(id: string) {
  const [result] = await db.update(setups).set({ deletedAt: new Date() }).where(
    and(eq(setups.id, id), isNull(setups.deletedAt)),
  )
    .returning();
  return result ?? null;
}

/** Clear the isDefault flag for all of a user's setups. */
export async function clearDefaultForUser(userId: string) {
  await db.update(setups).set({ isDefault: false }).where(
    and(eq(setups.userId, userId), eq(setups.isDefault, true)),
  );
}
