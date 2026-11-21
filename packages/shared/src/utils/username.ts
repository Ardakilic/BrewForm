/**
 * Derives a unique username from a base string: strips to [a-zA-Z0-9_-], caps at 30 chars,
 * then probes `isTaken` with "-1".."-100" suffixes. Throws when the base is empty after
 * cleaning or no candidate is free after 100 attempts.
 */
export async function generateUniqueUsername(
  baseUsername: string,
  isTaken: (username: string) => Promise<boolean>,
): Promise<string> {
  const clean = baseUsername.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
  if (!clean) throw new Error('Cannot generate username from empty base');

  if (!(await isTaken(clean))) return clean;

  for (let i = 1; i <= 100; i++) {
    const suffix = `-${i}`;
    const maxBase = 30 - suffix.length;
    const candidate = `${clean.slice(0, maxBase)}${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  throw new Error('Unable to generate unique username after 100 attempts');
}

/**
 * Usernames refused at self-registration (compared case-insensitively), so nobody can
 * impersonate the operator or the project. Admin-created users, the seed (whose default admin is
 * `admin`) and existing accounts are exempt. Registration answers "Username already taken", so the
 * list is not revealed.
 */
export const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'help',
  'api',
  'brewform',
  'moderator',
  'staff',
  'official',
  'security',
  'anonymous',
  'deleted',
  'null',
  'undefined',
  'settings',
] as const;

/** Set view of {@link RESERVED_USERNAMES} for O(1) membership checks. */
const RESERVED_USERNAME_SET: ReadonlySet<string> = new Set(RESERVED_USERNAMES);

/** Prefix kept free for operator tombstones (`deleted-<id>`, see `check-identifiers.ts`). */
const TOMBSTONE_USERNAME_PREFIX = 'deleted-';

/**
 * Tells whether a username may not be chosen at self-registration.
 *
 * @param username - The requested username (any letter case).
 * @returns `true` for every {@link RESERVED_USERNAMES} entry (case-insensitive) and for any
 *   username starting with `deleted-`.
 */
export function isReservedUsername(username: string): boolean {
  const key = username.toLowerCase();
  return RESERVED_USERNAME_SET.has(key) || key.startsWith(TOMBSTONE_USERNAME_PREFIX);
}
