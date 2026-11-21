import { describe, expect, it } from 'vitest';
import { assertSafeStorageKey, SAFE_STORAGE_KEY_RE } from './key.ts';

const UUID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

describe('assertSafeStorageKey', () => {
  it.each([
    `${UUID}.jpg`,
    `${UUID}_medium.webp`,
    '1731000000000-abcd1234.jpeg',
    '1731000000000-abcd1234_medium.png',
    'a',
  ])('accepts %s', (key) => {
    expect(() => assertSafeStorageKey(key)).not.toThrow();
    expect(SAFE_STORAGE_KEY_RE.test(key)).toBe(true);
  });

  it.each([
    '',
    '.hidden',
    'a/b.jpg',
    'a\\b.jpg',
    '..',
    'a..b',
    'x.x/%2e%2e/%2e%2e/other-bucket/payload',
    'abc.png?policy=',
    'a#b',
    'a b.jpg',
    'a.verylongext',
    'a'.repeat(200),
  ])('rejects %j', (key) => {
    expect(() => assertSafeStorageKey(key)).toThrow('Invalid storage key');
  });

  it('never echoes the rejected key in the error message', () => {
    const key = 'abc.png?policy=';
    try {
      assertSafeStorageKey(key);
      expect.unreachable('assertSafeStorageKey should have thrown');
    } catch (err) {
      expect((err as Error).message).toBe('Invalid storage key');
      expect((err as Error).message).not.toContain('policy');
    }
  });
});
