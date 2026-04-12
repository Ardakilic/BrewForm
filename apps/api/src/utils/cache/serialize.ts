/**
 * BrewForm Cache Module — Serialization Helpers
 *
 * Both Deno KV (which stores arbitrary V8 values) and Redis (which stores
 * strings) need a serialization layer.  We store JSON so all backends are
 * interchangeable without data-format surprises.
 */

import type { CacheEnvelope } from './types.ts';

/**
 * Serialize a cache envelope to a JSON string.
 */
export function encode<T>(envelope: CacheEnvelope<T>): string {
  return JSON.stringify(envelope);
}

/**
 * Deserialize a JSON string to a cache envelope.
 * Returns undefined on parse errors so callers treat it as a miss.
 */
export function decode<T>(
  raw: string | null | undefined,
): CacheEnvelope<T> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return undefined;
  }
}

/**
 * Convert an array cache key to a Redis-compatible colon-joined string.
 */
export function keyToString(key: readonly (string | number)[]): string {
  return key.join(':');
}

/**
 * Build a Redis SCAN pattern from a prefix key array.
 */
export function prefixToPattern(prefix: readonly (string | number)[]): string {
  return prefix.length === 0 ? '*' : `${keyToString(prefix)}*`;
}
