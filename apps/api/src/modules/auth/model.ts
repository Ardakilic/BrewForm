import { db } from '@brewform/db';
import { passwordResets, userPreferences, users } from '@brewform/db/schema';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { compareSync, hashSync } from 'bcryptjs';

export async function findUserByEmail(email: string) {
  const result = await db.select().from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  if (!result[0]) return null;
  return { ...result[0].user, preferences: result[0].user_preferences };
}

export async function findUserByUsername(username: string) {
  const result = await db.select().from(users)
    .where(and(eq(users.username, username), isNull(users.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function findUserById(id: string) {
  const result = await db.select().from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  if (!result[0]) return null;
  return { ...result[0].user, preferences: result[0].user_preferences };
}

export async function createUser(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}) {
  const passwordHash = hashSync(data.password, 10);
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName || null,
    }).returning();
    await tx.insert(userPreferences).values({ userId: user.id });
    return user;
  });
}

export function verifyPassword(plainPassword: string, hashedPassword: string): boolean {
  return compareSync(plainPassword, hashedPassword);
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const passwordHash = hashSync(newPassword, 10);
  const [result] = await db.update(users).set({ passwordHash }).where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

export async function createPasswordReset(userId: string, token: string, expiresAt: Date) {
  const [result] = await db.insert(passwordResets).values({ userId, token, expiresAt }).returning();
  return result;
}

export async function findPasswordResetByToken(token: string) {
  const result = await db.select().from(passwordResets)
    .leftJoin(users, eq(passwordResets.userId, users.id))
    .where(eq(passwordResets.token, token))
    .limit(1);
  if (!result[0]) return null;
  return { ...result[0].password_reset, user: result[0].user };
}

export async function markPasswordResetUsed(id: string) {
  const [result] = await db.update(passwordResets).set({ usedAt: new Date() }).where(
    eq(passwordResets.id, id),
  ).returning();
  return result ?? null;
}

export async function markOnboardingComplete(userId: string) {
  const [result] = await db.update(users).set({ onboardingCompleted: true }).where(
    eq(users.id, userId),
  ).returning();
  return result ?? null;
}

export async function isEmailTaken(email: string, excludeId?: string) {
  const conditions = [eq(users.email, email), isNull(users.deletedAt)];
  if (excludeId) conditions.push(ne(users.id, excludeId));
  const [result] = await db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
  return !!result;
}

export async function isUsernameTaken(username: string, excludeId?: string) {
  const conditions = [eq(users.username, username), isNull(users.deletedAt)];
  if (excludeId) conditions.push(ne(users.id, excludeId));
  const [result] = await db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
  return !!result;
}
