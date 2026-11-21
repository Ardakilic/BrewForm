/**
 * Auth model — data access layer for authentication entities.
 *
 * User queries filter soft-deletes (`deletedAt IS NULL`), with one documented
 * exception: the availability checks {@link isEmailTaken} and
 * {@link isUsernameTaken} also count soft-deleted accounts, because the unique
 * indexes cover soft-deleted rows and a deleted account's username stays
 * reserved (a new account must not inherit its profile links and mentions).
 * Emails and usernames are compared case-insensitively with
 * `eq(lower(col), lower(value))`: the database lowers both sides with the same
 * rules as the `user_email_lower_unique` / `user_username_lower_unique`
 * expression indexes, so lookups agree with them on any database locale and
 * the indexes serve them. Password hashing uses
 * bcryptjs (10 salt rounds). Email verification tokens are SHA-256 hashed
 * before storage to prevent plaintext token leaks.
 */
import { db } from '@brewform/db';
import {
  emailVerificationTokens,
  lower,
  passwordResets,
  userPreferences,
  users,
} from '@brewform/db/schema';
import { compareSync, hashSync } from 'bcryptjs';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { isUniqueViolation } from '../../utils/errors.ts';

/**
 * Unique constraints that guard `user.email`: the exact-match constraint and the
 * case-insensitive `lower(email)` expression index (created in wave-6 task 7.15).
 */
export const USER_EMAIL_CONSTRAINTS = ['user_email_unique', 'user_email_lower_unique'] as const;

/**
 * Unique constraints that guard `user.username`: the exact-match constraint and
 * the case-insensitive `lower(username)` expression index (wave-6 task 7.15).
 */
export const USER_USERNAME_CONSTRAINTS = [
  'user_username_unique',
  'user_username_lower_unique',
] as const;

/**
 * Translate a Postgres unique violation on a user identifier into its domain
 * code. Detection goes through the shared {@link isUniqueViolation} helper, so
 * bare and Drizzle-wrapped driver errors are both recognized.
 *
 * @param err - Any error thrown by a `user` insert or update.
 * @returns `EMAIL_ALREADY_EXISTS`, `USERNAME_ALREADY_EXISTS`, or `null` when the
 *          error is not a unique violation on one of those constraints.
 */
export function userIdentifierConflict(
  err: unknown,
): 'EMAIL_ALREADY_EXISTS' | 'USERNAME_ALREADY_EXISTS' | null {
  if (USER_EMAIL_CONSTRAINTS.some((constraint) => isUniqueViolation(err, constraint))) {
    return 'EMAIL_ALREADY_EXISTS';
  }
  if (USER_USERNAME_CONSTRAINTS.some((constraint) => isUniqueViolation(err, constraint))) {
    return 'USERNAME_ALREADY_EXISTS';
  }
  return null;
}

/**
 * Find a non-deleted user by email, including preferences. Both sides are
 * lowered in SQL (`lower(email) = lower($1)`, served by
 * `user_email_lower_unique`), so legacy mixed-case rows are found too.
 */
export async function findUserByEmail(email: string) {
  const result = await db
    .select()
    .from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(and(eq(lower(users.email), lower(email)), isNull(users.deletedAt)))
    .limit(1);
  if (!result[0]) return null;
  return { ...result[0].user, preferences: result[0].user_preferences };
}

/** Find a non-deleted user by UUID, including preferences. */
export async function findUserById(id: string) {
  const result = await db
    .select()
    .from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  if (!result[0]) return null;
  return { ...result[0].user, preferences: result[0].user_preferences };
}

/**
 * Create a new user with hashed password and default preferences.
 *
 * Runs inside a transaction: inserts the user row, then creates an
 * associated `userPreferences` row. Returns the bare user record.
 *
 * @param data.email - Unique email address
 * @param data.username - Unique username
 * @param data.password - Plaintext password (bcrypt-hashed internally)
 * @param data.displayName - Optional display name
 * @returns The newly created user row (without preferences)
 */
export function createUser(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}) {
  const passwordHash = hashSync(data.password, 10);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: data.email,
        username: data.username,
        passwordHash,
        displayName: data.displayName || null,
      })
      .returning();
    await tx.insert(userPreferences).values({ userId: user.id });
    return user;
  });
}

/** Verify a plaintext password against a bcrypt hash. */
export function verifyPassword(plainPassword: string, hashedPassword: string): boolean {
  return compareSync(plainPassword, hashedPassword);
}

/** Hash and persist a new password for the given user. */
export async function updateUserPassword(userId: string, newPassword: string) {
  const passwordHash = hashSync(newPassword, 10);
  const [result] = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

/** Create a password reset token for the given user. */
export async function createPasswordReset(userId: string, token: string, expiresAt: Date) {
  const [result] = await db.insert(passwordResets).values({ userId, token, expiresAt }).returning();
  return result;
}

/** Look up a password reset record by its raw token, including the associated user. */
export async function findPasswordResetByToken(token: string) {
  const result = await db
    .select()
    .from(passwordResets)
    .leftJoin(users, eq(passwordResets.userId, users.id))
    .where(eq(passwordResets.token, token))
    .limit(1);
  if (!result[0]) return null;
  return { ...result[0].password_reset, user: result[0].user };
}

/** Mark a password reset record as used (sets `usedAt` to now). */
export async function markPasswordResetUsed(id: string) {
  const [result] = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(eq(passwordResets.id, id))
    .returning();
  return result ?? null;
}

/** Set `onboardingCompleted = true` for the given user. */
export async function markOnboardingComplete(userId: string) {
  const [result] = await db
    .update(users)
    .set({ onboardingCompleted: true })
    .where(eq(users.id, userId))
    .returning();
  return result ?? null;
}

/**
 * Check whether an email is already taken, case-insensitively (both sides
 * lowered in SQL, like `user_email_lower_unique`), by ANY user row,
 * soft-deleted ones included. This deliberately skips the soft-delete filter:
 * the unique indexes cover soft-deleted rows, so the check must agree with them
 * for registration to answer 409 before the insert.
 * Pass `excludeId` to ignore a specific user (e.g. for profile updates).
 */
export async function isEmailTaken(email: string, excludeId?: string) {
  const conditions = [eq(lower(users.email), lower(email))];
  if (excludeId) conditions.push(ne(users.id, excludeId));
  const [result] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions))
    .limit(1);
  return !!result;
}

/**
 * Check whether a username is already taken, case-insensitively (both sides
 * lowered in SQL, like `user_username_lower_unique`), by ANY user row,
 * soft-deleted ones included. This deliberately skips the soft-delete
 * filter: the unique indexes cover soft-deleted rows, and a deleted account's
 * username stays reserved so nobody inherits its profile links and mentions.
 * Pass `excludeId` to ignore a specific user (e.g. for profile updates).
 */
export async function isUsernameTaken(username: string, excludeId?: string) {
  const conditions = [eq(lower(users.username), lower(username))];
  if (excludeId) conditions.push(ne(users.id, excludeId));
  const [result] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions))
    .limit(1);
  return !!result;
}

/** SHA-256 hash a raw token string for secure storage (one-way). */
async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Store a SHA-256 hashed email verification token. The raw token is
 *  never persisted — only the hash is stored for later comparison. */
export async function createEmailVerificationToken(userId: string, token: string, expiresAt: Date) {
  const hashed = await hashToken(token);
  const [result] = await db
    .insert(emailVerificationTokens)
    .values({
      userId,
      token: hashed,
      expiresAt,
    })
    .returning();
  return result;
}

/** Find an email verification record by hashing the raw token and
 *  comparing against stored hashes. */
export async function findEmailVerificationByToken(token: string) {
  const hashed = await hashToken(token);
  const result = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.token, hashed))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Mark an email verification token as used and set `emailVerifiedAt` on the user.
 *
 * Runs inside a transaction to atomically consume the token and update the user.
 *
 * @param userId - The user whose email is being verified
 * @param tokenId - The verification token record ID to consume
 * @throws {Error} TOKEN_ALREADY_USED if the token was already consumed
 */
export async function markEmailVerified(userId: string, tokenId: string) {
  await db.transaction(async (tx) => {
    const [consumed] = await tx
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(emailVerificationTokens.id, tokenId), isNull(emailVerificationTokens.usedAt)))
      .returning({ id: emailVerificationTokens.id });
    if (!consumed) {
      throw new Error('TOKEN_ALREADY_USED');
    }
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  });
}
