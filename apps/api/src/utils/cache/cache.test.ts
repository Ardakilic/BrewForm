/**
 * Cache Module — serialize helper tests
 *
 * Tests keyToString, prefixToPattern, encode/decode round-trips.
 *
 * Full cache semantics (cacheGetOrSet, cacheGetManyOrSet, invalidateCache)
 * are tested in the backend tests: memory.test.ts, redis.test.ts
 */

import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import type { CacheEnvelope } from './types.ts';

describe('Cache module — serialize helpers', () => {
  it('keyToString joins with colons', async () => {
    const { keyToString } = await import('./serialize.ts');
    expect(keyToString(['recipes', 'latest'])).toBe('recipes:latest');
    expect(keyToString(['user', 'abc', 42])).toBe('user:abc:42');
  });

  it('prefixToPattern appends * (without colon) to match exact key and descendants', async () => {
    const { prefixToPattern } = await import('./serialize.ts');
    expect(prefixToPattern(['recipes'])).toBe('recipes*');
    expect(prefixToPattern([])).toBe('*');
  });

  it('encode / decode round-trips an envelope', async () => {
    const { encode, decode } = await import('./serialize.ts');
    const env: CacheEnvelope<{ a: number }> = { v: { a: 1 }, f: 12345 };
    const decoded = decode<{ a: number }>(encode(env));
    expect(decoded).toEqual(env);
  });

  it('decode returns undefined for invalid JSON', async () => {
    const { decode } = await import('./serialize.ts');
    expect(decode('not-json')).toBeUndefined();
    expect(decode(null)).toBeUndefined();
    expect(decode(undefined)).toBeUndefined();
  });
});
