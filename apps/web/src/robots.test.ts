/**
 * Crawl-rule guard for the two robots.txt sources: the static `public/robots.txt` (served by the
 * dev server) and the `build-robots-txt` plugin in `vite.config.ts` (emitted into `dist/`). The
 * private `/equipment` page stays disallowed while the public `/equipments` catalog and the
 * `/equipment/:id` detail pages stay crawlable: crawlers apply the longest matching rule, so the
 * two `Allow` lines must sit beside `Disallow: /equipment` in both sources.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Absolute path of `apps/web` (this file lives in `apps/web/src`). */
const WEB_ROOT = join(dirname(new URL(import.meta.url).pathname), '..');

/** Absolute path of a file in the web workspace root. */
function webFile(relative: string): string {
  return join(WEB_ROOT, relative);
}

/**
 * Returns the trimmed `Allow:`/`Disallow:` rule lines of a robots.txt body, in order.
 *
 * @param body - The robots.txt text (or the template literal that produces it).
 */
function ruleLines(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(Allow|Disallow):/.test(line));
}

const sources = [
  { name: 'public/robots.txt', body: readFileSync(webFile('public/robots.txt'), 'utf8') },
  { name: 'vite.config.ts', body: readFileSync(webFile('vite.config.ts'), 'utf8') },
];

describe.each(sources)('robots rules in $name', ({ body }) => {
  it('allows the public equipment catalog and detail pages before disallowing /equipment', () => {
    const rules = ruleLines(body);
    const disallow = rules.indexOf('Disallow: /equipment');
    expect(disallow).toBeGreaterThan(-1);
    expect(rules.indexOf('Allow: /equipments')).toBeGreaterThan(-1);
    expect(rules.indexOf('Allow: /equipments')).toBeLessThan(disallow);
    expect(rules.indexOf('Allow: /equipment/')).toBeGreaterThan(-1);
    expect(rules.indexOf('Allow: /equipment/')).toBeLessThan(disallow);
  });

  it('keeps the private areas disallowed', () => {
    const rules = ruleLines(body);
    for (const path of ['/settings', '/admin', '/onboarding', '/setups', '/beans', '/equipment']) {
      expect(rules).toContain(`Disallow: ${path}`);
    }
  });
});
