/**
 * User preference database operations for BrewForm.
 *
 * Provides lookup and upsert for per-user preference records (units,
 * notification settings, etc.). The upsert uses onConflictDoUpdate on the
 * userId unique constraint.
 */
import { db } from '@brewform/db';
import { userPreferences } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';

/** Find preferences for a user. Returns null if none exist. */
export async function findByUserId(userId: string) {
  const result = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Insert or update preferences for a user.
 *
 * Uses onConflictDoUpdate on the userId unique constraint.
 * Strips the userId field from the update payload to avoid conflicts.
 */
export async function upsert(userId: string, data: Partial<typeof userPreferences.$inferInsert>) {
  const { userId: _, ...updateData } = data;
  const [result] = await db
    .insert(userPreferences)
    .values({ ...data, userId })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: updateData,
    })
    .returning();
  return result;
}
