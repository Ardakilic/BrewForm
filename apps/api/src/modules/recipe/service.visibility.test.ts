/**
 * Predicate matrix for the shared recipe visibility rule (capability
 * `recipe-visibility`, "One shared listing condition and predicate pair decides
 * visibility"): `canListRecipe` (listing surfaces) and `canViewRecipe` (direct
 * links), plus the detail fork mask `resolveForkAttribution` built on
 * `canListRecipe`. No database.
 */

import '../../test-setup.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canListRecipe, canViewRecipe, logger, resolveForkAttribution } from './service.ts';

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

describe('resolveForkAttribution', () => {
  /** A fork source by AUTHOR with the given visibility state. */
  function source(visibility: string, deletedAt: Date | string | null = null) {
    return {
      id: 'source-id',
      slug: 'source-slug',
      title: 'Source',
      visibility,
      authorId: AUTHOR,
      deletedAt,
    };
  }

  const MASKED = { forkedFrom: null, forkedFromId: null, forkedFromSlug: null };
  const KEPT = {
    forkedFrom: { id: 'source-id', slug: 'source-slug', title: 'Source' },
    forkedFromId: 'source-id',
    forkedFromSlug: 'source-slug',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns three nulls when the recipe is not a fork', () => {
    expect(resolveForkAttribution(null, OTHER)).toEqual(MASKED);
    expect(resolveForkAttribution(undefined, null)).toEqual(MASKED);
  });

  it('keeps a public source, with only id, slug and title, for every viewer', () => {
    for (const viewer of VIEWERS) {
      expect(resolveForkAttribution(source('public'), viewer.value), viewer.label).toEqual(KEPT);
    }
  });

  it("masks an unlisted, private or draft source for everyone but the source's author", () => {
    for (const visibility of ['unlisted', 'private', 'draft']) {
      expect(resolveForkAttribution(source(visibility), null), visibility).toEqual(MASKED);
      expect(resolveForkAttribution(source(visibility), OTHER), visibility).toEqual(MASKED);
      expect(resolveForkAttribution(source(visibility), AUTHOR), visibility).toEqual(KEPT);
    }
  });

  it('masks a soft-deleted source for every viewer, its author included', () => {
    for (const viewer of VIEWERS) {
      expect(
        resolveForkAttribution(source('public', new Date()), viewer.value),
        viewer.label,
      ).toEqual(MASKED);
    }
  });

  it('logs entry and exit with the viewer id and whether the source was masked', () => {
    const debugSpy = vi.spyOn(logger, 'debug');
    resolveForkAttribution(source('unlisted'), OTHER);
    expect(debugSpy).toHaveBeenNthCalledWith(
      1,
      { viewerId: OTHER },
      'resolveForkAttribution started',
    );
    expect(debugSpy).toHaveBeenNthCalledWith(
      2,
      { viewerId: OTHER, masked: true },
      'resolveForkAttribution completed',
    );
  });
});
