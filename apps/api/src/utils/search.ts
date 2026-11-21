/**
 * Free-text search helpers shared by the API's model and service layers.
 *
 * Pure string functions with no `drizzle-orm` import, so services may use them too. A model
 * normalises a filter value once with {@link normalizeSearchTerm} and matches it literally with
 * `ilike(col, toContainsPattern(term))`.
 */

/**
 * Normalize a free-text filter value (`search`, `mainBrewer`, `author`) once, so the
 * search-active check, the filter predicate and the relevance score all see the same
 * term. Trims surrounding whitespace only; nothing is stripped or lowercased (case
 * folding is left to PostgreSQL's `ilike`). `RecipeFilterSchema` already trims and
 * bounds `search` at 200 characters; this helper keeps model callers safe too.
 *
 * @param raw - The raw filter value, or `undefined` when absent.
 * @returns The trimmed term; `''` (no search) for `undefined` or whitespace-only input.
 */
export function normalizeSearchTerm(raw: string | undefined): string {
  return raw === undefined ? '' : raw.trim();
}

/**
 * Build the `ilike` "contains" pattern for a normalized term so user input matches
 * literally. PostgreSQL's default `LIKE`/`ILIKE` escape character is `\`, so the
 * metacharacters are escaped with it, in this order: `\` → `\\` first (so the escapes
 * added next are not doubled), then `%` → `\%`, then `_` → `\_`; the result is wrapped
 * as `%…%`. The pattern is passed as a bound parameter of Drizzle's `ilike()`, so no
 * `ESCAPE` clause or raw SQL is needed, and `pg_trgm` honours the escapes.
 *
 * @example toContainsPattern('50%_\\') // → '%50\\%\\_\\\\%' (the text `%50\%\_\\%`)
 * @param term - A term already passed through {@link normalizeSearchTerm}.
 * @returns The `%<escaped>%` pattern.
 */
export function toContainsPattern(term: string): string {
  const escaped = term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
  return `%${escaped}%`;
}
