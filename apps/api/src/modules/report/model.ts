/**
 * Content report database operations for BrewForm.
 *
 * Manages user-submitted reports against entities (recipes, comments, users).
 * Supports creation, listing with optional status filter, and resolution
 * (marking as resolved with resolver identity and timestamp).
 */
import { db } from '@brewform/db';
import { reports } from '@brewform/db/schema';
import { count, desc, eq } from 'drizzle-orm';

/** Create a new content report. */
export async function create(
  reporterId: string,
  entityType: string,
  entityId: string,
  reason: string,
) {
  const [result] = await db.insert(reports).values({ reporterId, entityType, entityId, reason })
    .returning();
  return result;
}

/** Find a report by ID. */
export async function findById(id: string) {
  const result = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return result[0] ?? null;
}

/**
 * List reports with optional status filter and pagination.
 *
 * @param status - Optional status filter (e.g. 'pending', 'resolved')
 * @param page - 1-based page number
 * @param perPage - Reports per page
 * @returns Paginated reports list with total count
 */
export async function findMany(status: string | undefined, page: number, perPage: number) {
  let where = undefined;
  if (status) {
    where = eq(reports.status, status as typeof reports.status._.data);
  }
  const [data, totalResult] = await Promise.all([
    db.select().from(reports).where(where).orderBy(desc(reports.createdAt)).limit(perPage).offset(
      (page - 1) * perPage,
    ),
    db.select({ count: count() }).from(reports).where(where),
  ]);
  return { reports: data, total: totalResult[0].count };
}

/** Resolve a report by an admin, setting status to 'resolved' with timestamp. */
export async function resolve(id: string, resolvedBy: string) {
  const [result] = await db.update(reports)
    .set({ status: 'resolved', resolvedBy, resolvedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  return result ?? null;
}
