/**
 * Equipment setup database operations for BrewForm.
 *
 * Manages user brewing setups (grinder, dripper, etc.) with soft-delete and
 * paginated listing. A user has at most one active default setup: the partial
 * unique index `setup_user_default_unique` enforces it, and {@link create} /
 * {@link update} switch the default (clear the owner's other active default,
 * then write) inside one transaction, so a failed write never leaves the user
 * without their previous default. A concurrent switch that still trips the
 * index raises `23505`, which the global error handler maps to `409 CONFLICT`.
 */
import { db } from '@brewform/db';
import { setups } from '@brewform/db/schema';
import { and, count, desc, eq, isNull, ne, type SQL } from 'drizzle-orm';

/** A Drizzle transaction handle, as passed to the `db.transaction` callback. */
type SetupTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Clear `is_default` on the owner's other active default setups, inside the caller's transaction.
 *
 * @param tx - The open default-switch transaction.
 * @param ownerId - The setup owner.
 * @param exceptId - A setup id to leave untouched (the one being promoted), if any.
 */
async function clearOtherDefaults(tx: SetupTx, ownerId: string, exceptId?: string): Promise<void> {
  const conditions: SQL[] = [
    eq(setups.userId, ownerId),
    eq(setups.isDefault, true),
    isNull(setups.deletedAt),
  ];
  if (exceptId) conditions.push(ne(setups.id, exceptId));
  await tx
    .update(setups)
    .set({ isDefault: false })
    .where(and(...conditions));
}

/** Find a setup by ID. Returns null if deleted or not found. */
export async function findById(id: string) {
  const result = await db
    .select()
    .from(setups)
    .where(and(eq(setups.id, id), isNull(setups.deletedAt)))
    .limit(1);
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
    db
      .select()
      .from(setups)
      .where(where)
      .orderBy(desc(setups.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(setups).where(where),
  ]);
  return { setups: data, total: totalResult[0].count };
}

/**
 * Create a new setup. When `data.isDefault === true`, the owner's other active
 * default is cleared and the row inserted in one transaction.
 *
 * @param data - The setup row to insert (including `userId`).
 * @returns The inserted setup row.
 */
export async function create(data: typeof setups.$inferInsert) {
  if (data.isDefault !== true) {
    const [result] = await db.insert(setups).values(data).returning();
    return result;
  }
  return await db.transaction(async (tx) => {
    await clearOtherDefaults(tx, data.userId);
    const [result] = await tx.insert(setups).values(data).returning();
    return result;
  });
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

/**
 * Update one of the owner's setups by ID. When `data.isDefault === true`, the
 * owner's other active default is cleared and the row updated in one
 * transaction (a failed write rolls the clear back).
 *
 * @param id - The setup to update.
 * @param data - The fields to change.
 * @param ownerId - The setup owner (the service has already checked ownership).
 * @returns The updated row, or null if no setup with that id belongs to the owner.
 */
export async function update(id: string, data: Partial<UpdatableSetup>, ownerId: string) {
  const target = and(eq(setups.id, id), eq(setups.userId, ownerId));
  if (data.isDefault !== true) {
    const [result] = await db.update(setups).set(data).where(target).returning();
    return result ?? null;
  }
  return await db.transaction(async (tx) => {
    await clearOtherDefaults(tx, ownerId, id);
    const [result] = await tx.update(setups).set(data).where(target).returning();
    return result ?? null;
  });
}

/** Soft-delete a setup by setting its deletedAt timestamp. */
export async function softDelete(id: string) {
  const [result] = await db
    .update(setups)
    .set({ deletedAt: new Date() })
    .where(and(eq(setups.id, id), isNull(setups.deletedAt)))
    .returning();
  return result ?? null;
}
