/**
 * Predicate matrix for the shared recipe visibility rule (capability
 * `recipe-visibility`, "One shared listing condition and predicate pair decides
 * visibility"): `canListRecipe` (listing surfaces) and `canViewRecipe` (direct
 * links). Pure functions, no database.
 */

import '../../test-setup.ts';
import { describe, expect, it } from 'vitest';
import { canListRecipe, canViewRecipe } from './service.ts';

const AUTHOR = 'author-a';
const OTHER = 'user-b';

const VISIBILITIES = ['public', 'unlisted', 'private', 'draft'] as const;

/** The three `deletedAt` shapes a caller can hand the predicate: active, a `Date`, an ISO string. */
const DELETED_AT: Array<{ label: string; value: Date | string | null }> = [
  { label: 'null', value: null },
  { label: 'a Date', value: new Date('2026-01-01T00:00:00Z') },
  { label: 'an ISO string', value: '2026-01-01T00:00:00.000Z' },
];

/** The three viewers of the matrix: anonymous, the author, another user. */
const VIEWERS: Array<{ label: string; value: string | null }> = [
  { label: 'anonymous', value: null },
  { label: 'the author', value: AUTHOR },
  { label: 'another user', value: OTHER },
];

describe('canListRecipe', () => {
  for (const visibility of VISIBILITIES) {
    for (const deletedAt of DELETED_AT) {
      for (const viewer of VIEWERS) {
        const active = deletedAt.value === null;
        const expected = active && (visibility === 'public' || viewer.value === AUTHOR);
        it(`returns ${expected} for a ${visibility} recipe with deletedAt ${deletedAt.label} and ${viewer.label}`, () => {
          const recipe = { visibility, authorId: AUTHOR, deletedAt: deletedAt.value };
          expect(canListRecipe(recipe, viewer.value)).toBe(expected);
        });
      }
    }
  }

  it('treats an absent deletedAt as not deleted', () => {
    expect(canListRecipe({ visibility: 'public', authorId: AUTHOR })).toBe(true);
    expect(canListRecipe({ visibility: 'unlisted', authorId: AUTHOR })).toBe(false);
    expect(canListRecipe({ visibility: 'unlisted', authorId: AUTHOR }, AUTHOR)).toBe(true);
  });

  it('treats an undefined viewer as anonymous', () => {
    expect(canListRecipe({ visibility: 'private', authorId: AUTHOR }, undefined)).toBe(false);
  });
});

describe('canViewRecipe (locks the direct-link rule)', () => {
  for (const visibility of VISIBILITIES) {
    for (const viewer of VIEWERS) {
      for (const isAdmin of [false, true]) {
        const expected =
          visibility === 'public' ||
          visibility === 'unlisted' ||
          viewer.value === AUTHOR ||
          isAdmin;
        it(`returns ${expected} for a ${visibility} recipe, ${viewer.label}, isAdmin ${isAdmin}`, () => {
          expect(canViewRecipe({ visibility, authorId: AUTHOR }, viewer.value, isAdmin)).toBe(
            expected,
          );
        });
      }
    }
  }
});
