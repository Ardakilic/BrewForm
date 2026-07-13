/**
 * @mention parsing for comment/notification content.
 *
 * Extracts `@username` mentions from free-form text. A username matches the
 * registration rule in `schemas/auth.ts` — `[a-zA-Z0-9_-]{3,30}`.
 *
 * Boundary rules (both enforced by {@link MENTION_REGEX}):
 * - **Left guard**: the `@` must sit at the start of the string or immediately
 *   after a non-username character. This makes email-like text (`a@bcd`) a
 *   NON-match, since the `@` is preceded by an alphanumeric character.
 * - **Right guard**: a trailing lookahead requires the character after the
 *   captured username to NOT be a username character. This prevents a longer
 *   token (>30 chars) from silently truncate-matching its first 30 chars — an
 *   over-length run produces no match at all rather than a partial one.
 *
 * Results preserve original case (mention resolution is exact-match),
 * are deduplicated preserving first-seen order, and are capped at
 * {@link MAX_MENTIONS} unique usernames as a lightweight anti-spam measure.
 */

/** Maximum number of unique mentions returned from a single body of text. */
export const MAX_MENTIONS = 10;

/**
 * Matches `@username` where `username` is 3–30 chars of `[a-zA-Z0-9_-]`.
 *
 * The left group `(?:^|[^a-zA-Z0-9_-])` is the boundary guard (consumes at most
 * one preceding char). The trailing `(?![a-zA-Z0-9_-])` lookahead is the
 * right-boundary guard (consumes nothing). Global flag drives `matchAll`, which
 * copies the regex, so the shared `lastIndex` is never polluted across calls.
 */
const MENTION_REGEX = /(?:^|[^a-zA-Z0-9_-])@([a-zA-Z0-9_-]{3,30})(?![a-zA-Z0-9_-])/g;

/**
 * Extract unique `@username` mentions from text.
 *
 * @param content - Free-form text (e.g. a comment body) to scan.
 * @returns Usernames (without the leading `@`), case preserved, deduplicated in
 *          first-seen order, capped at {@link MAX_MENTIONS}.
 */
export function parseMentions(content: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of content.matchAll(MENTION_REGEX)) {
    const username = match[1];
    if (seen.has(username)) continue;
    seen.add(username);
    result.push(username);
    if (result.length >= MAX_MENTIONS) break;
  }

  return result;
}
