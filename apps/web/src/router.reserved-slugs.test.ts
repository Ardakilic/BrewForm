/**
 * Drift guard (spec: recipe-slug, "Reserved and identifier-shaped slugs are never issued bare"):
 * every static `recipes/<segment>` route in `router.tsx` is a sibling of `recipes/:slug`, so its
 * segment must be in `RESERVED_RECIPE_SLUGS`; otherwise a recipe titled like the segment would get
 * that bare slug and be unreachable at `/recipes/<slug>`. The failure message names the missing word.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RESERVED_RECIPE_SLUGS } from '@brewform/shared/utils';
import { describe, expect, it } from 'vitest';

/** Source of `apps/web/src/router.tsx` (this test sits next to it). */
const ROUTER_SOURCE = readFileSync(
  join(dirname(new URL(import.meta.url).pathname), 'router.tsx'),
  'utf8',
);

/** Matches `path: 'recipes/<segment>…'` (single or double quotes) and captures `<segment>`. */
const RECIPE_PATH_RE = /path:\s*['"]\/?recipes\/([^'"/]+)/g;

/**
 * The static first segments under `recipes/` declared in a router source, params skipped.
 *
 * @param source - Router module source text.
 */
function staticRecipeSegments(source: string): string[] {
  const segments = new Set<string>();
  for (const match of source.matchAll(RECIPE_PATH_RE)) {
    const segment = match[1];
    if (segment.startsWith(':')) continue;
    segments.add(segment);
  }
  return [...segments].sort();
}

describe('RESERVED_RECIPE_SLUGS covers the web recipes/... routes', () => {
  it('finds the static siblings of recipes/:slug', () => {
    expect(staticRecipeSegments(ROUTER_SOURCE)).toEqual(
      expect.arrayContaining(['new', 'starred', 'unavailable', 'compare']),
    );
  });

  it('lists every static recipes/<segment> as a reserved slug', () => {
    const reserved: ReadonlySet<string> = new Set(RESERVED_RECIPE_SLUGS);
    const missing = staticRecipeSegments(ROUTER_SOURCE).filter((s) => !reserved.has(s));
    expect(missing, `add these words to RESERVED_RECIPE_SLUGS: ${missing.join(', ')}`).toEqual([]);
  });

  it('would report a new static route such as recipes/popular', () => {
    const reserved: ReadonlySet<string> = new Set(RESERVED_RECIPE_SLUGS);
    const source =
      "{ path: 'recipes/popular' }, { path: 'recipes/:slug' }, { path: 'recipes/new' }";
    expect(staticRecipeSegments(source).filter((s) => !reserved.has(s))).toEqual(['popular']);
  });
});
