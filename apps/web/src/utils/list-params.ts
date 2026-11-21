/**
 * Shared URL search-param parsers for list pages. Each page builds one parser from these
 * helpers and uses it in BOTH its loader (to call the API) and its controls (through
 * `useListUrlState`), so the two can never disagree about what the URL means. Invalid values
 * normalise to their defaults instead of throwing.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses a raw page value: a positive integer is kept (`parseInt` rules, so `"2abc"` is 2),
 * anything else (missing, non-numeric, zero, negative) is page 1.
 */
export function parsePageParam(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Reads the page number from `key` (default `page`) with {@link parsePageParam} rules. */
export function readPage(sp: URLSearchParams, key = 'page'): number {
  return parsePageParam(sp.get(key));
}

/**
 * Reads a free-text param, trimmed, falling back to legacy keys (for example `q` accepting a
 * legacy `search` link). Returns `''` when absent. `maxLength` truncates over-long input.
 */
export function readText(
  sp: URLSearchParams,
  key: string,
  options: { legacyKeys?: string[]; maxLength?: number } = {},
): string {
  const keys = [key, ...(options.legacyKeys ?? [])];
  for (const k of keys) {
    const value = sp.get(k)?.trim();
    if (value) return options.maxLength ? value.slice(0, options.maxLength) : value;
  }
  return '';
}

/** Returns `value` when it is one of `allowed`, else `fallback` (unknown enum values normalise). */
export function readEnum<T extends string>(
  sp: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = sp.get(key);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Returns the param when it is a well-formed UUID, else `''` (malformed ids normalise). */
export function readUuid(sp: URLSearchParams, key: string): string {
  const value = sp.get(key)?.trim() ?? '';
  return UUID_RE.test(value) ? value : '';
}

/** True only for the literal `true` (anything else, including absence, is `false`). */
export function readBoolean(sp: URLSearchParams, key: string): boolean {
  return sp.get(key) === 'true';
}

/** True when `value` is a well-formed UUID. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Applies `updates` to a copy of `sp` in canonical form: empty values (`''`, `null`,
 * `undefined`, empty arrays) and values equal to `defaults[key]` are removed, arrays are
 * joined with `,`. Returns the new params; `sp` is not mutated.
 */
export function withParams(
  sp: URLSearchParams,
  updates: Record<string, string | string[] | number | boolean | null | undefined>,
  defaults: Record<string, string> = {},
): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const [key, raw] of Object.entries(updates)) {
    const value = Array.isArray(raw)
      ? raw.join(',')
      : raw === null || raw === undefined || raw === false
        ? ''
        : String(raw);
    if (value === '' || value === defaults[key]) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }
  return next;
}
