/**
 * Unit tests for the shared free-text search helpers in `./search.ts`.
 */

import { describe, expect, it } from 'vitest';
import { normalizeSearchTerm, toContainsPattern } from './search.ts';

describe('normalizeSearchTerm / toContainsPattern (real exports)', () => {
  it('normalizeSearchTerm trims only and maps undefined to an empty string', () => {
    expect(normalizeSearchTerm(undefined)).toBe('');
    expect(normalizeSearchTerm('   ')).toBe('');
    expect(normalizeSearchTerm('  Espresso_100%  ')).toBe('Espresso_100%');
    expect(normalizeSearchTerm('İstanbul')).toBe('İstanbul');
  });

  it('toContainsPattern escapes \\, % and _ in that order and wraps in %…%', () => {
    // The five-character term `50%_\` becomes the pattern `%50\%\_\\%`.
    expect(toContainsPattern('50%_\\')).toBe('%50\\%\\_\\\\%');
    expect(toContainsPattern('espresso')).toBe('%espresso%');
    expect(toContainsPattern('\\')).toBe('%\\\\%');
    expect(toContainsPattern('a_c')).toBe('%a\\_c%');
    expect(toContainsPattern('100%')).toBe('%100\\%%');
    // An already-escaped sequence is escaped again, never treated as an escape.
    expect(toContainsPattern('\\%')).toBe('%\\\\\\%%');
  });
});
