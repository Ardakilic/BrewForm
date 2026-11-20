/**
 * Drift guard (spec: recipe-slug, "Reserved and identifier-shaped slugs are never issued bare"):
 * every static first path segment of the API recipe router is a sibling of `/:slug`, so it must
 * be in `RESERVED_RECIPE_SLUGS`; otherwise a recipe could be issued that slug and be shadowed by
 * (or shadow) the static route. The failure message names the missing word.
 */
import '../../test-setup.ts';
import { RESERVED_RECIPE_SLUGS } from '@brewform/shared/utils';
import { describe, expect, it } from 'vitest';
import recipeRouter from './index.ts';

/**
 * The first segment of each registered path, skipping the root, params and wildcards.
 *
 * @param paths - Router paths relative to the mount point (e.g. `/meta/:slug`).
 */
function staticFirstSegments(paths: readonly string[]): string[] {
  const segments = new Set<string>();
  for (const path of paths) {
    const first = path.split('/').filter(Boolean)[0];
    if (!first || first.startsWith(':') || first.includes('*')) continue;
    segments.add(first);
  }
  return [...segments].sort();
}

describe('RESERVED_RECIPE_SLUGS covers the API recipe router', () => {
  it('finds the static siblings of /:slug', () => {
    const segments = staticFirstSegments(recipeRouter.routes.map((r) => r.path));
    expect(segments).toEqual(expect.arrayContaining(['merge', 'meta', 'starred']));
  });

  it('lists every static first path segment as a reserved slug', () => {
    const reserved: ReadonlySet<string> = new Set(RESERVED_RECIPE_SLUGS);
    const missing = staticFirstSegments(recipeRouter.routes.map((r) => r.path)).filter(
      (segment) => !reserved.has(segment),
    );
    expect(missing, `add these words to RESERVED_RECIPE_SLUGS: ${missing.join(', ')}`).toEqual([]);
  });

  it('would report a new static route such as /popular', () => {
    const reserved: ReadonlySet<string> = new Set(RESERVED_RECIPE_SLUGS);
    const missing = staticFirstSegments(['/popular', '/:slug', '/starred']).filter(
      (segment) => !reserved.has(segment),
    );
    expect(missing).toEqual(['popular']);
  });
});
