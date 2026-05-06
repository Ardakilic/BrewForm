import { db } from '@brewform/db';
import { userPreferences } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';

export async function findByUserId(userId: string) {
  const result = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function upsert(userId: string, data: Partial<typeof userPreferences.$inferInsert>) {
  const existing = await findByUserId(userId);
  if (existing) {
    const [result] = await db.update(userPreferences).set(data).where(
      eq(userPreferences.userId, userId),
    ).returning();
    return result;
  }
  const [result] = await db.insert(userPreferences).values({ userId, ...data }).returning();
  return result;
}
