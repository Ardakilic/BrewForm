/**
 * Public identity of a user shown next to content (capability `account-deletion`, "A deleted
 * account has no public identity").
 *
 * A soft-deleted account keeps its comments, recipes and collections, but no non-admin response
 * carries its identity. SQL-builder reads put `isNull(users.deletedAt)` into the join condition;
 * relational reads (a Drizzle `one` relation takes no `where`) select `deletedAt` and map the
 * projection through {@link visibleIdentity}.
 */

/**
 * Identity of a user shown next to content: `null` when the joined projection is missing or the
 * account is soft-deleted, otherwise the projection without its `deletedAt` key.
 *
 * @param user - The joined author or owner projection, selected with `deletedAt`
 * @returns The projection without `deletedAt`, or `null` for a missing or deleted account
 */
export function visibleIdentity<T extends { deletedAt: Date | null }>(
  user: T | null | undefined,
): Omit<T, 'deletedAt'> | null {
  if (!user || user.deletedAt !== null) return null;
  const { deletedAt: _deletedAt, ...identity } = user;
  return identity;
}
