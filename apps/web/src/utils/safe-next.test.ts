import { describe, expect, it } from 'vitest';
import { getSafeNext, isSafeNextPath, loginPathFor } from './safe-next.ts';

describe('isSafeNextPath', () => {
  it.each(['/collections?page=2', '/', '/recipes/new', '/u/alice?tab=collections#top'])(
    'accepts the same-origin relative path %s',
    (path) => {
      expect(isSafeNextPath(path)).toBe(true);
    },
  );

  it.each([
    '//evil.example',
    '/\\evil',
    'https://x',
    'javascript:alert(1)',
    'collections',
    '',
    '/foo/https://evil.example',
    ' /recipes',
    '/\tevil',
  ])('rejects %s', (path) => {
    expect(isSafeNextPath(path)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isSafeNextPath(null)).toBe(false);
    expect(isSafeNextPath(undefined)).toBe(false);
  });
});

describe('getSafeNext', () => {
  it('returns a safe next param', () => {
    expect(getSafeNext(new URLSearchParams('next=%2Fcollections%3Fpage%3D2'))).toBe(
      '/collections?page=2',
    );
  });

  it('returns null for an unsafe or missing next param', () => {
    expect(getSafeNext(new URLSearchParams('next=%2F%2Fevil.example'))).toBeNull();
    expect(getSafeNext(new URLSearchParams(''))).toBeNull();
  });
});

describe('loginPathFor', () => {
  it('encodes pathname and search into the next param', () => {
    expect(loginPathFor('/settings', '')).toBe('/login?next=%2Fsettings');
    expect(loginPathFor('/collections', '?page=2')).toBe('/login?next=%2Fcollections%3Fpage%3D2');
  });
});
