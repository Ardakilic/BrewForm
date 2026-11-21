/**
 * Pre-upgrade identifier check for the wave-6 unique indexes.
 *
 * Wave 6 adds `user_email_lower_unique`, `user_username_lower_unique` (case-insensitive) and
 * `setup_user_default_unique` (one active default setup per user). Drizzle applies all pending
 * migrations in ONE transaction, so existing data that violates any of these indexes makes the
 * whole migration roll back and the new API container never becomes healthy. This script reports
 * that data first, with ids only, and offers opt-in transactional fixes.
 *
 * Invocation:
 *
 * ```sh
 * make db-check-identifiers                              # report only (dev, via docker compose)
 * make db-check-identifiers args=--fix-setup-defaults    # with an opt-in fix
 * pnpm --filter @brewform/db run check-identifiers -- --fix-deleted-duplicates
 * node /app/packages/db/src/check-identifiers.ts         # inside the API image
 * ```
 *
 * Flags (each fix runs in its own transaction and prints the affected ids):
 * - `--fix-deleted-duplicates`: in every email/username case-duplicate group, rewrite only the
 *   SOFT-DELETED members to `email = deleted+<id>@deleted.invalid` and
 *   `username = deleted-<first 12 hex characters of the id without dashes>`.
 * - `--fix-setup-defaults`: keep each user's most recently updated active default setup and set
 *   `is_default = false` on the others.
 * - `--fix-empty-slugs`: give each recipe whose slug is `''` (legacy all-non-Latin titles) a
 *   `recipe-<suffix>` slug, trying the next candidate on a unique violation.
 *
 * Groups with two or more ACTIVE accounts are never changed automatically; the report prints the
 * manual path (contact the owners, then an admin renames or re-emails all but one account through
 * `PATCH /api/v1/admin/users/:id`).
 *
 * Output contract:
 * - stdout: a human-readable report with a count line for every category, then per-group details
 *   (user ids, usernames, account state) and the fixes applied.
 * - exit code: `1` when a blocking issue (email or username case duplicates, multiple active
 *   defaults) is left after the requested fixes, `0` otherwise. Empty legacy slugs are a
 *   non-blocking warning.
 *
 * Privacy rule: the report NEVER prints email addresses (only ids and usernames, which are
 * public). It loads only `id`, `email`, `username`, `deletedAt` and `createdAt` from `user`,
 * `id`, `userId` and `updatedAt` from active default setups, and `id` from recipes with `slug = ''`.
 *
 * Required env: `DATABASE_URL`.
 *
 * @module
 */

import { parseArgs } from 'node:util';
import { randomSlugSuffix, SLUG_SUFFIX_ATTEMPTS, slugCandidates } from '@brewform/shared/utils';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { client, db } from './index.ts';
import { recipes, setups, users } from './schema.ts';

/** A `user` row as loaded by the check (only the columns the report needs). */
export interface IdentifierUserRow {
  id: string;
  email: string;
  username: string;
  deletedAt: Date | null;
  createdAt: Date;
}

/** An active default `setup` row as loaded by the check. */
export interface DefaultSetupRow {
  id: string;
  userId: string;
  updatedAt: Date;
}

/** One account inside a case-duplicate group. Deliberately carries no email. */
export interface DuplicateMember {
  id: string;
  username: string;
  /** True when the account is soft-deleted. */
  deleted: boolean;
  /** True when `--fix-deleted-duplicates` would tombstone this member (soft-deleted accounts only). */
  fixable: boolean;
}

/** Accounts whose `email` (or `username`) collide when lower-cased. */
export interface DuplicateGroup {
  key: 'email' | 'username';
  members: DuplicateMember[];
  /** Number of non-deleted members; two or more need the manual admin path. */
  activeCount: number;
}

/** A user with more than one active default setup. */
export interface MultipleDefaults {
  userId: string;
  /** The most recently updated default, which `--fix-setup-defaults` keeps. */
  keepId: string;
  /** The other defaults, which `--fix-setup-defaults` clears. */
  clearIds: string[];
}

/** Fixes applied by one {@link runCheck} call. */
export interface AppliedFixes {
  /** Ids of soft-deleted accounts that were tombstoned. */
  deletedDuplicates: string[];
  /** Ids of setups whose `is_default` was cleared. */
  setupDefaults: string[];
  /** Recipes that received a slug, with the new slug. */
  emptySlugs: Array<{ id: string; slug: string }>;
}

/** The full check result. */
export interface IdentifierReport {
  emailGroups: DuplicateGroup[];
  usernameGroups: DuplicateGroup[];
  multipleDefaults: MultipleDefaults[];
  emptySlugRecipeIds: string[];
  fixes: AppliedFixes;
}

/** The result of {@link runCheck}: the report after fixes, and the fixes applied. */
export interface CheckResult {
  report: IdentifierReport;
  fixes: AppliedFixes;
}

/** Options for {@link runCheck}; every fix is opt-in. */
export interface RunCheckOptions {
  fixDeletedDuplicates?: boolean;
  fixSetupDefaults?: boolean;
  fixEmptySlugs?: boolean;
}

/** An empty {@link AppliedFixes}. */
function noFixes(): AppliedFixes {
  return { deletedDuplicates: [], setupDefaults: [], emptySlugs: [] };
}

/**
 * Group users whose `email` or `username` collide case-insensitively (the same comparison the
 * `lower()` unique indexes make). Groups and members keep input order.
 *
 * @param rows - User rows (soft-deleted ones included).
 * @param key - The identifier column to compare.
 * @returns One group per colliding value with two or more members; soft-deleted members are
 *   marked fixable.
 */
export function groupCaseInsensitiveDuplicates(
  rows: readonly IdentifierUserRow[],
  key: 'email' | 'username',
): DuplicateGroup[] {
  const buckets = new Map<string, IdentifierUserRow[]>();
  for (const row of rows) {
    const value = row[key].toLowerCase();
    const bucket = buckets.get(value);
    if (bucket) bucket.push(row);
    else buckets.set(value, [row]);
  }
  const groups: DuplicateGroup[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const members = bucket.map((row) => {
      const deleted = row.deletedAt !== null;
      return { id: row.id, username: row.username, deleted, fixable: deleted };
    });
    groups.push({ key, members, activeCount: members.filter((m) => !m.deleted).length });
  }
  return groups;
}

/**
 * Find users with more than one active default setup.
 *
 * @param rows - Active (`deleted_at is null`) default setups.
 * @returns For each such user, the newest default to keep and the older ones to clear.
 */
export function findMultipleDefaults(rows: readonly DefaultSetupRow[]): MultipleDefaults[] {
  const byUser = new Map<string, DefaultSetupRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId);
    if (list) list.push(row);
    else byUser.set(row.userId, [row]);
  }
  const result: MultipleDefaults[] = [];
  for (const [userId, list] of byUser) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    result.push({ userId, keepId: sorted[0].id, clearIds: sorted.slice(1).map((s) => s.id) });
  }
  return result;
}

/**
 * Build a report from loaded rows (pure).
 *
 * @param userRows - All user rows.
 * @param defaultRows - Active default setups.
 * @param emptySlugRecipeIds - Ids of recipes whose slug is `''`.
 * @param fixes - Fixes already applied (defaults to none).
 */
export function buildReport(
  userRows: readonly IdentifierUserRow[],
  defaultRows: readonly DefaultSetupRow[],
  emptySlugRecipeIds: readonly string[],
  fixes: AppliedFixes = noFixes(),
): IdentifierReport {
  return {
    emailGroups: groupCaseInsensitiveDuplicates(userRows, 'email'),
    usernameGroups: groupCaseInsensitiveDuplicates(userRows, 'username'),
    multipleDefaults: findMultipleDefaults(defaultRows),
    emptySlugRecipeIds: [...emptySlugRecipeIds],
    fixes,
  };
}

/**
 * Tell whether the report still has data that would make the wave-6 migration fail.
 *
 * @param report - A check report.
 * @returns `true` for any email or username case-duplicate group or any user with several
 *   active defaults; empty slugs alone are not blocking.
 */
export function hasBlockingIssues(report: IdentifierReport): boolean {
  return (
    report.emailGroups.length > 0 ||
    report.usernameGroups.length > 0 ||
    report.multipleDefaults.length > 0
  );
}

/** Render one duplicate member (id, username and state; never the email). */
function describeMember(member: DuplicateMember): string {
  const state = member.deleted ? 'soft-deleted, fixable with --fix-deleted-duplicates' : 'active';
  return `${member.id} (username ${member.username}, ${state})`;
}

/** Render the detail lines of a duplicate-group list. */
function describeGroups(label: string, groups: readonly DuplicateGroup[]): string[] {
  const lines: string[] = [];
  groups.forEach((group, index) => {
    lines.push(`  ${label} group ${index + 1}: ${group.members.length} accounts`);
    for (const member of group.members) lines.push(`    - ${describeMember(member)}`);
    if (group.activeCount >= 2) {
      lines.push(
        `    ! ${group.activeCount} active accounts share this ${group.key} ignoring case: contact the owners, then an admin changes the ${group.key} of all but one account through PATCH /api/v1/admin/users/:id and re-runs this check.`,
      );
    }
  });
  return lines;
}

/**
 * Render the report as plain text. Never includes email addresses.
 *
 * @param report - A check report.
 * @returns The multi-line report, ending with a newline-free last line.
 */
export function formatReport(report: IdentifierReport): string {
  const blocking = hasBlockingIssues(report);
  const lines = [
    'Identifier check (wave-6 unique indexes)',
    `  email case duplicates: ${report.emailGroups.length} group(s) [blocking]`,
    `  username case duplicates: ${report.usernameGroups.length} group(s) [blocking]`,
    `  multiple active default setups: ${report.multipleDefaults.length} user(s) [blocking]`,
    `  empty recipe slugs: ${report.emptySlugRecipeIds.length} recipe(s) [warning]`,
  ];
  lines.push(...describeGroups('email', report.emailGroups));
  lines.push(...describeGroups('username', report.usernameGroups));
  for (const entry of report.multipleDefaults) {
    lines.push(
      `  user ${entry.userId}: keeps default setup ${entry.keepId}; clear with --fix-setup-defaults: ${entry.clearIds.join(', ')}`,
    );
  }
  if (report.emptySlugRecipeIds.length > 0) {
    lines.push(
      `  recipes with an empty slug (repair with --fix-empty-slugs): ${report.emptySlugRecipeIds.join(', ')}`,
    );
  }
  const { fixes } = report;
  if (fixes.deletedDuplicates.length > 0) {
    lines.push(
      `Fixed: tombstoned ${fixes.deletedDuplicates.length} soft-deleted account(s): ${fixes.deletedDuplicates.join(', ')}`,
    );
  }
  if (fixes.setupDefaults.length > 0) {
    lines.push(
      `Fixed: cleared ${fixes.setupDefaults.length} extra default setup(s): ${fixes.setupDefaults.join(', ')}`,
    );
  }
  if (fixes.emptySlugs.length > 0) {
    lines.push(
      `Fixed: assigned ${fixes.emptySlugs.length} slug(s): ${fixes.emptySlugs.map((f) => `${f.id} -> ${f.slug}`).join(', ')}`,
    );
  }
  lines.push(
    blocking
      ? 'Result: blocking issues found; fix them before deploying wave 6.'
      : 'Result: no blocking issues.',
  );
  return lines.join('\n');
}

/** The tombstone username for a soft-deleted account: `deleted-<first 12 hex of the id>`. */
function tombstoneUsername(id: string): string {
  return `deleted-${id.replaceAll('-', '').slice(0, 12)}`;
}

/** True when `err` (or an error on its `cause` chain) is a Postgres unique violation. */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Load the rows the check needs (and nothing else). */
async function loadRows(database: typeof db) {
  const userRows = await database
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      deletedAt: users.deletedAt,
      createdAt: users.createdAt,
    })
    .from(users);
  const defaultRows = await database
    .select({ id: setups.id, userId: setups.userId, updatedAt: setups.updatedAt })
    .from(setups)
    .where(and(eq(setups.isDefault, true), isNull(setups.deletedAt)));
  const emptySlugRows = await database
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.slug, ''));
  return { userRows, defaultRows, emptySlugIds: emptySlugRows.map((r) => r.id) };
}

/** Tombstone the soft-deleted members of every duplicate group, in one transaction. */
async function fixDeletedDuplicates(
  database: typeof db,
  report: IdentifierReport,
): Promise<string[]> {
  const ids = [
    ...new Set(
      [...report.emailGroups, ...report.usernameGroups]
        .flatMap((group) => group.members)
        .filter((member) => member.fixable)
        .map((member) => member.id),
    ),
  ];
  if (ids.length === 0) return [];
  await database.transaction(async (tx) => {
    for (const id of ids) {
      await tx
        .update(users)
        .set({ email: `deleted+${id}@deleted.invalid`, username: tombstoneUsername(id) })
        .where(and(eq(users.id, id), isNotNull(users.deletedAt)));
    }
  });
  return ids;
}

/** Clear the older active defaults of every affected user, in one transaction. */
async function fixSetupDefaults(database: typeof db, report: IdentifierReport): Promise<string[]> {
  const ids = report.multipleDefaults.flatMap((entry) => entry.clearIds);
  if (ids.length === 0) return [];
  await database.transaction(async (tx) => {
    await tx.update(setups).set({ isDefault: false }).where(inArray(setups.id, ids));
  });
  return ids;
}

/**
 * Give each empty-slug recipe a `recipe-<suffix>` slug in one transaction. Each candidate is tried
 * in a savepoint, so a unique violation only rolls back that attempt and the next one is tried.
 */
async function fixEmptySlugs(
  database: typeof db,
  recipeIds: readonly string[],
): Promise<Array<{ id: string; slug: string }>> {
  if (recipeIds.length === 0) return [];
  return await database.transaction(async (tx) => {
    const fixed: Array<{ id: string; slug: string }> = [];
    for (const id of recipeIds) {
      const candidates = slugCandidates(
        '',
        Array.from({ length: SLUG_SUFFIX_ATTEMPTS }, () => randomSlugSuffix()),
      );
      let assigned: string | null = null;
      for (const slug of candidates) {
        try {
          await tx.transaction(async (savepoint) => {
            await savepoint
              .update(recipes)
              .set({ slug })
              .where(and(eq(recipes.id, id), eq(recipes.slug, '')));
          });
          assigned = slug;
          break;
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }
      if (!assigned) throw new Error(`could not allocate a slug for recipe ${id}`);
      fixed.push({ id, slug: assigned });
    }
    return fixed;
  });
}

/**
 * Run the check: load the rows, apply the requested fixes (each in its own transaction), then
 * reload so the returned report describes the data as it is now.
 *
 * @param database - The Drizzle client (`@brewform/db`'s `db`).
 * @param options - Opt-in fixes.
 * @returns The report after fixes (which also lists the fixes) and the fixes applied.
 */
export async function runCheck(
  database: typeof db,
  options: RunCheckOptions,
): Promise<CheckResult> {
  const initial = await loadRows(database);
  const before = buildReport(initial.userRows, initial.defaultRows, initial.emptySlugIds);
  const fixes = noFixes();
  if (options.fixDeletedDuplicates) {
    fixes.deletedDuplicates = await fixDeletedDuplicates(database, before);
  }
  if (options.fixSetupDefaults) {
    fixes.setupDefaults = await fixSetupDefaults(database, before);
  }
  if (options.fixEmptySlugs) {
    fixes.emptySlugs = await fixEmptySlugs(database, before.emptySlugRecipeIds);
  }
  const anyFix =
    fixes.deletedDuplicates.length + fixes.setupDefaults.length + fixes.emptySlugs.length > 0;
  if (!anyFix) return { report: { ...before, fixes }, fixes };
  const after = await loadRows(database);
  return {
    report: buildReport(after.userRows, after.defaultRows, after.emptySlugIds, fixes),
    fixes,
  };
}

/**
 * Parse the CLI flags. A leading `--` (forwarded by `pnpm run <script> -- <args>`) is dropped.
 *
 * @param argv - Arguments after the script path.
 */
export function parseCliOptions(argv: readonly string[]): RunCheckOptions {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  const { values } = parseArgs({
    args,
    options: {
      'fix-deleted-duplicates': { type: 'boolean', default: false },
      'fix-setup-defaults': { type: 'boolean', default: false },
      'fix-empty-slugs': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  return {
    fixDeletedDuplicates: values['fix-deleted-duplicates'],
    fixSetupDefaults: values['fix-setup-defaults'],
    fixEmptySlugs: values['fix-empty-slugs'],
  };
}

if (import.meta.main) {
  try {
    const { report } = await runCheck(db, parseCliOptions(process.argv.slice(2)));
    console.log(formatReport(report));
    if (hasBlockingIssues(report)) process.exitCode = 1;
  } finally {
    // Release the postgres connection pool so the process exits promptly.
    await client.end();
  }
}
