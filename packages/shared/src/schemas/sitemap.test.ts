import { describe, expect, it } from 'vitest';
import { SITEMAP_MAX_PAGE, SITEMAP_PARTS, SitemapQuerySchema } from './sitemap.ts';

describe('SitemapQuerySchema (recipe-visibility, sitemap index)', () => {
  it('defaults page to 1 and leaves part unset for the index', () => {
    expect(SitemapQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it('coerces a query-string page to an integer', () => {
    expect(SitemapQuerySchema.parse({ part: 'recipes', page: '3' })).toEqual({
      part: 'recipes',
      page: 3,
    });
  });

  it('accepts pages 1 through 50,000', () => {
    expect(SITEMAP_MAX_PAGE).toBe(50_000);
    expect(SitemapQuerySchema.safeParse({ page: '1' }).success).toBe(true);
    expect(SitemapQuerySchema.safeParse({ page: '50000' }).success).toBe(true);
  });

  it('rejects page 0, page 50,001, a fraction and a non-number', () => {
    for (const page of ['0', '50001', '1.5', 'abc', '-1']) {
      const result = SitemapQuerySchema.safeParse({ page });
      expect(result.success, page).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(['page']);
    }
  });

  it('accepts exactly the static, recipes and users parts', () => {
    expect(SITEMAP_PARTS).toEqual(['static', 'recipes', 'users']);
    for (const part of SITEMAP_PARTS) {
      expect(SitemapQuerySchema.parse({ part }).part).toBe(part);
    }
    for (const part of ['bogus', 'index', 'RECIPES', '']) {
      const result = SitemapQuerySchema.safeParse({ part });
      expect(result.success, part).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(['part']);
    }
  });
});
