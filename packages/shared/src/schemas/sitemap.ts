import { z } from 'zod';

/** The parts of the sitemap index: the static pages, the public recipes and the listed authors. */
export const SITEMAP_PARTS = ['static', 'recipes', 'users'] as const;

/** One sitemap part (see {@link SITEMAP_PARTS}). */
export type SitemapPart = (typeof SITEMAP_PARTS)[number];

/**
 * Highest sitemap page number: a sitemap index lists at most 50,000 sitemaps (sitemaps.org), so
 * no part ever needs a page past it.
 */
export const SITEMAP_MAX_PAGE = 50_000;

/**
 * Query of `GET /sitemap.xml` (capability `recipe-visibility`, "The sitemap is a root-level
 * sitemap index with bounded pages"). Without `part` the route answers the sitemap index; with
 * `part` it answers that part's `page` (1-based, coerced from the query string, default 1,
 * at most {@link SITEMAP_MAX_PAGE}). Anything else is a 400 `VALIDATION_ERROR`.
 */
export const SitemapQuerySchema = z.object({
  part: z.enum(SITEMAP_PARTS).optional(),
  page: z.coerce.number().int().min(1).max(SITEMAP_MAX_PAGE).default(1),
});

/** Inferred type of {@link SitemapQuerySchema}. */
export type SitemapQuery = z.infer<typeof SitemapQuerySchema>;
