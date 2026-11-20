/**
 * Recipe slug pipeline: a built-in transliterating base generator, random no-vowel suffixes and
 * the ordered candidate list the API claims inside the creation transaction.
 *
 * This module is bundled into the web app as well as the API, so it uses only built-in
 * JavaScript facilities (`String.prototype.normalize`, Unicode property escapes and
 * `globalThis.crypto.getRandomValues`) and never imports a `node:` built-in or a slug library.
 */

/** Maximum length of a slug base, so `<base>-<6-char suffix>` stays at or below 100 characters. */
const SLUG_BASE_MAX_LENGTH = 93;

/** Base used for suffixing when a title produces no ASCII-mappable characters. */
const EMPTY_SLUG_BASE = 'recipe';

/**
 * Characters that `toLowerCase()` + NFKD cannot reduce to ASCII (they have no canonical
 * decomposition), mapped explicitly: `ı ß æ œ ø đ ð ł þ`.
 */
const NON_DECOMPOSABLE_MAP: Readonly<Record<string, string>> = {
  ı: 'i',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
};

/** Matches any character of {@link NON_DECOMPOSABLE_MAP}. */
const NON_DECOMPOSABLE_REGEX = /[ıßæœøđðłþ]/g;

/** The UUID shape `getRecipe(slugOrId)` treats as an id lookup. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Derives a slug base from a title using only built-in Unicode facilities.
 *
 * Steps, in order: strip apostrophes (`'`, `’`, `` ` ``) so possessives stay joined →
 * `toLowerCase()` (locale-independent; `toLocaleLowerCase('tr')` would turn `I` into `ı`) →
 * the 9-entry map for characters with no decomposition (`ı ß æ œ ø đ ð ł þ`) →
 * `normalize('NFKD')` and strip combining marks (turns Turkish `ç ğ ö ş ü`, the `i` + U+0307 that
 * `İ` lowercases to, and other Latin diacritics into base letters; expands `ﬁ` → `fi`, `①` → `1`) →
 * every run outside `[a-z0-9]` (including `_`) becomes `-` → trim `-` → cap at 93 characters,
 * cutting at the last `-` within the limit when one exists.
 *
 * @param title - The (already sanitized) recipe title.
 * @returns A string matching `SlugSchema`, or `''` when the title has no ASCII-mappable characters
 *   (`東京コーヒー`, `Кофе`, `!!!`); {@link slugCandidates} handles the empty case.
 */
export function generateSlug(title: string): string {
  const slug = title
    .replace(/['’`]/g, '')
    .toLowerCase()
    .replace(NON_DECOMPOSABLE_REGEX, (ch) => NON_DECOMPOSABLE_MAP[ch] ?? ch)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= SLUG_BASE_MAX_LENGTH) return slug;

  const cut = slug.slice(0, SLUG_BASE_MAX_LENGTH);
  // A '-' right after the cut means the cut already sits on a word boundary.
  if (slug[SLUG_BASE_MAX_LENGTH] === '-') return cut.replace(/-+$/, '');
  const boundary = cut.lastIndexOf('-');
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
}

/**
 * Alphabet of random slug suffixes: the digits `2`–`9` and the consonants other than `l` and `y`
 * (27 characters). No vowels, so a suffix cannot spell a word; no look-alikes (`0/o`, `1/l/i`),
 * which matters for slugs printed on QR-code labels.
 */
export const SLUG_SUFFIX_ALPHABET = '23456789bcdfghjkmnpqrstvwxz';

/** Length of a random slug suffix: 27^6 = 387,420,489 possible suffixes. */
export const SLUG_SUFFIX_LENGTH = 6;

/** Number of random suffixes the API tries after the bare base before answering `409 SLUG_CONFLICT`. */
export const SLUG_SUFFIX_ATTEMPTS = 5;

/** Largest multiple of 27 that fits in a byte (27 × 9); bytes at or above it are rejected. */
const SUFFIX_REJECTION_LIMIT = 243;

/**
 * Draws a uniformly distributed random suffix from {@link SLUG_SUFFIX_ALPHABET}.
 *
 * Uses `globalThis.crypto.getRandomValues` (Node and browsers; `node:crypto` would break the web
 * bundle) with rejection sampling: bytes `>= 243` are discarded so `b % 27` has no modulo bias.
 * With the default length there are 27^6 = 387,420,489 suffixes.
 *
 * @param length - Number of characters to return (default {@link SLUG_SUFFIX_LENGTH}).
 * @returns `length` characters from the no-vowel, no-look-alike alphabet.
 */
export function randomSlugSuffix(length: number = SLUG_SUFFIX_LENGTH): string {
  let out = '';
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= SUFFIX_REJECTION_LIMIT) continue;
      out += SLUG_SUFFIX_ALPHABET[b % SLUG_SUFFIX_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Slug bases that are never issued bare because they name static siblings of `:slug` in the API
 * recipe router or the web `recipes/...` routes (or would read as such). Drift guards in
 * `apps/api/src/modules/recipe/reserved-slugs.test.ts` and `apps/web/src/router.reserved-slugs.test.ts`
 * fail when a new static route lands without its word here.
 */
export const RESERVED_RECIPE_SLUGS = [
  'new',
  'edit',
  'starred',
  'unavailable',
  'compare',
  'meta',
  'merge',
  'versions',
  'diff',
  'focus',
  'fork',
  'search',
  'feed',
  'share',
  'recipe',
  'recipes',
] as const;

/** Set view of {@link RESERVED_RECIPE_SLUGS} for O(1) membership checks. */
const RESERVED_RECIPE_SLUG_SET: ReadonlySet<string> = new Set(RESERVED_RECIPE_SLUGS);

/**
 * Tells whether a slug base must always be suffixed: it is a reserved route word, or it is shaped
 * like a UUID (which `getRecipe(slugOrId)` would treat as an id lookup).
 *
 * @param base - A slug base produced by {@link generateSlug}.
 * @returns `true` for every {@link RESERVED_RECIPE_SLUGS} entry and every UUID-shaped base.
 */
export function isReservedRecipeSlug(base: string): boolean {
  return RESERVED_RECIPE_SLUG_SET.has(base) || UUID_REGEX.test(base);
}

/**
 * Builds the ordered, de-duplicated list of slugs to try for a title.
 *
 * The bare base comes first unless it is empty, reserved or UUID-shaped; then `<base>-<suffix>`
 * for each suffix (an empty base is replaced by `recipe`). The caller passes the suffixes in
 * (normally {@link SLUG_SUFFIX_ATTEMPTS} fresh {@link randomSlugSuffix} values), so this function
 * stays deterministic and tests can control the suffixes.
 *
 * @param title - The (already sanitized) recipe title.
 * @param suffixes - Suffixes to append, in order.
 * @returns At most `1 + suffixes.length` distinct candidates.
 */
export function slugCandidates(title: string, suffixes: readonly string[]): string[] {
  const base = generateSlug(title);
  const candidates: string[] = [];
  if (base !== '' && !isReservedRecipeSlug(base)) candidates.push(base);
  const suffixBase = base === '' ? EMPTY_SLUG_BASE : base;
  for (const suffix of suffixes) {
    candidates.push(`${suffixBase}-${suffix}`);
  }
  return [...new Set(candidates)];
}
