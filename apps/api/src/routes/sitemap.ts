import type { db as DbType } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import {
  ErrorEnvelopeSchema,
  SITEMAP_MAX_PAGE,
  SITEMAP_PARTS,
  type SitemapPart,
  SitemapQuerySchema,
} from '@brewform/shared/schemas';
import { zValidator } from '@hono/zod-validator';
import { and, asc, count, inArray, isNull, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { config } from '../config/index.ts';
import { listableRecipeCondition } from '../modules/recipe/model.ts';
import type { AppEnv } from '../types/hono.ts';
import { cacheProvider } from '../utils/cache/singleton.ts';
import { createLogger } from '../utils/logger/index.ts';
import { error, zodValidationHook } from '../utils/response/index.ts';

/**
 * Hono router for the sitemap (capability `recipe-visibility`, "The sitemap is a root-level
 * sitemap index with bounded pages"), mounted at `/` in `routes/index.ts`: `GET /sitemap.xml`
 * (the index, or one part's page) and the legacy `GET /api/v1/sitemap.xml` (301).
 */
const sitemap = new Hono<AppEnv>();

/** Logger of the sitemap route (exported for test spies). */
export const log = createLogger('sitemap');

/** Most URLs in one sitemap page (sitemaps.org: 50,000 URLs and 50 MB per file). */
export const SITEMAP_PAGE_SIZE = 50_000;

/** Cache TTL of every sitemap document (24 hours). */
export const SITEMAP_CACHE_TTL = 24 * 60 * 60 * 1000;

/** Content type of every sitemap document. */
const XML_CONTENT_TYPE = 'application/xml; charset=utf-8';

/** HTTP caching of a served sitemap document (crawlers may keep it for an hour). */
const XML_CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600';

/** One `<url>` of a sitemap page; `path` is appended to the public origin. */
export interface SitemapUrl {
  path: string;
  lastmod?: Date | null;
  changefreq: string;
  priority: string;
}

/** The public pages of the `static` part, in sitemap order. */
export const STATIC_PAGES: readonly SitemapUrl[] = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/recipes', priority: '0.9', changefreq: 'daily' },
  { path: '/taste-notes', priority: '0.6', changefreq: 'weekly' },
  { path: '/privacy', priority: '0.3', changefreq: 'monthly' },
  { path: '/terms', priority: '0.3', changefreq: 'monthly' },
];

/**
 * Cache key of one sitemap document: `['sitemap', 'index']` for the index, or
 * `['sitemap', <part>, <page>]` for a part's page (page 1 when omitted).
 *
 * @param part - The part, or `undefined` for the index.
 * @param page - The 1-based page of the part.
 */
export function sitemapCacheKey(part?: SitemapPart, page = 1): string[] {
  return part ? ['sitemap', part, String(page)] : ['sitemap', 'index'];
}

/** Builds in flight, keyed by the joined cache key: concurrent requests share one build. */
const inFlightBuilds = new Map<string, Promise<string | null>>();

/** Escape the five XML special characters. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** `YYYY-MM-DD` of a valid date, or `''`. */
function toW3CDate(date: Date | null | undefined): string {
  if (date && !Number.isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  return '';
}

let _db: typeof DbType | null = null;
/** The shared `db`, imported lazily so the router can be built without a database. */
async function getDb() {
  if (!_db) {
    const mod = await import('@brewform/db');
    _db = mod.db;
  }
  return _db;
}

/**
 * Listed authors: live (not soft-deleted) users who author at least one listable recipe.
 *
 * @param db - The database handle the sub-select is built on.
 */
function listedAuthorCondition(db: typeof DbType): SQL {
  return and(
    isNull(users.deletedAt),
    inArray(
      users.id,
      db.select({ id: recipes.authorId }).from(recipes).where(listableRecipeCondition(null)),
    ),
  ) as SQL;
}

/**
 * Dependency-injection proxy for test stubbing: the sitemap's four bounded queries.
 *
 * The sitemap is a discovery surface (capability `recipe-visibility`): every query filters with
 * `listableRecipeCondition(null)`, so only non-deleted `public` recipes are listed, and a user is
 * listed only when they author one and their account is not soft-deleted. The counts use the same
 * conditions as the rows. Pages are read with `limit`/`offset` in a stable order (`createdAt`,
 * then `id`, ascending), so new rows land on the last page.
 */
export const deps = {
  /** Number of listable recipes. */
  countPublicRecipes: async (): Promise<number> => {
    const db = await getDb();
    const [row] = await db
      .select({ count: count() })
      .from(recipes)
      .where(listableRecipeCondition(null));
    return row?.count ?? 0;
  },
  /** Number of listed authors. */
  countListedAuthors: async (): Promise<number> => {
    const db = await getDb();
    const [row] = await db.select({ count: count() }).from(users).where(listedAuthorCondition(db));
    return row?.count ?? 0;
  },
  /** One page of listable recipes (`slug`, `updatedAt`). */
  getPublicRecipes: async (page: number, pageSize: number = SITEMAP_PAGE_SIZE) => {
    const db = await getDb();
    return db
      .select({ slug: recipes.slug, updatedAt: recipes.updatedAt })
      .from(recipes)
      .where(listableRecipeCondition(null))
      .orderBy(asc(recipes.createdAt), asc(recipes.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  },
  /** One page of listed authors (`username`, `updatedAt`). */
  getListedAuthors: async (page: number, pageSize: number = SITEMAP_PAGE_SIZE) => {
    const db = await getDb();
    return db
      .select({ username: users.username, updatedAt: users.updatedAt })
      .from(users)
      .where(listedAuthorCondition(db))
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  },
};

/**
 * Render a sitemap index: the `static` part, then one entry per recipe page and per user page.
 * Pure string building; every `<loc>` is XML-escaped (`&` becomes `&amp;`).
 *
 * @param baseUrl - The public origin (no trailing slash).
 * @param recipePages - Number of recipe pages (0 omits the part).
 * @param userPages - Number of user pages (0 omits the part).
 * @returns The `<sitemapindex>` document.
 */
export function buildIndexXml(baseUrl: string, recipePages: number, userPages: number): string {
  const locs = [`${baseUrl}/sitemap.xml?part=static`];
  for (let page = 1; page <= recipePages; page++) {
    locs.push(`${baseUrl}/sitemap.xml?part=recipes&page=${page}`);
  }
  for (let page = 1; page <= userPages; page++) {
    locs.push(`${baseUrl}/sitemap.xml?part=users&page=${page}`);
  }
  const entries = locs.map(
    (loc) => `
  <sitemap>
    <loc>${escapeXml(loc)}</loc>
  </sitemap>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}
</sitemapindex>`;
}

/**
 * Render one sitemap page. Pure string building; URL segments are XML-escaped and `lastmod` is
 * emitted only for a valid date.
 *
 * @param baseUrl - The public origin (no trailing slash).
 * @param urls - The page's URLs (at most {@link SITEMAP_PAGE_SIZE}).
 * @returns The `<urlset>` document.
 */
export function buildUrlsetXml(baseUrl: string, urls: readonly SitemapUrl[]): string {
  const origin = escapeXml(baseUrl);
  const entries = urls.map((url) => {
    const lastmod = toW3CDate(url.lastmod);
    return `
  <url>
    <loc>${origin}${escapeXml(url.path)}</loc>${
      lastmod
        ? `
    <lastmod>${lastmod}</lastmod>`
        : ''
    }
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}
</urlset>`;
}

/**
 * Build one sitemap document from the database.
 *
 * @param baseUrl - The public origin.
 * @param part - The part, or `undefined` for the index.
 * @param page - The 1-based page of the part.
 * @returns The XML, or `null` when the page has no rows (404).
 */
async function buildDocument(
  baseUrl: string,
  part: SitemapPart | undefined,
  page: number,
): Promise<{ xml: string; urlCount: number } | null> {
  if (!part) {
    const [recipeCount, authorCount] = await Promise.all([
      deps.countPublicRecipes(),
      deps.countListedAuthors(),
    ]);
    const recipePages = Math.ceil(recipeCount / SITEMAP_PAGE_SIZE);
    const userPages = Math.ceil(authorCount / SITEMAP_PAGE_SIZE);
    return {
      xml: buildIndexXml(baseUrl, recipePages, userPages),
      urlCount: 1 + recipePages + userPages,
    };
  }
  let urls: SitemapUrl[];
  if (part === 'static') {
    urls = page === 1 ? [...STATIC_PAGES] : [];
  } else if (part === 'recipes') {
    urls = (await deps.getPublicRecipes(page)).map((recipe) => ({
      path: `/recipes/${recipe.slug}`,
      lastmod: recipe.updatedAt,
      changefreq: 'weekly',
      priority: '0.8',
    }));
  } else {
    urls = (await deps.getListedAuthors(page)).map((user) => ({
      path: `/u/${user.username}`,
      lastmod: user.updatedAt,
      changefreq: 'weekly',
      priority: '0.5',
    }));
  }
  if (urls.length === 0) return null;
  return { xml: buildUrlsetXml(baseUrl, urls), urlCount: urls.length };
}

/**
 * Serve one sitemap document from the cache, or build it once (concurrent requests for the same
 * document share the build) and cache it for {@link SITEMAP_CACHE_TTL}. An empty page is not
 * cached.
 *
 * @returns The XML, or `null` when the page has no rows.
 */
async function getDocument(part: SitemapPart | undefined, page: number): Promise<string | null> {
  const key = sitemapCacheKey(part, page);
  const cached = await cacheProvider.get<string>(key);
  if (cached) return cached;

  const flightKey = key.join(':');
  const pending = inFlightBuilds.get(flightKey);
  if (pending) return pending;

  const logIds = { part: part ?? 'index', page };
  const build = (async () => {
    try {
      log.debug(logIds, 'sitemap build started');
      const doc = await buildDocument(config.PUBLIC_APP_URL || config.APP_URL, part, page);
      if (!doc) return null;
      await cacheProvider.set(key, doc.xml, { ttlMs: SITEMAP_CACHE_TTL });
      log.debug({ ...logIds, urlCount: doc.urlCount }, 'sitemap build completed');
      return doc.xml;
    } finally {
      inFlightBuilds.delete(flightKey);
    }
  })();
  inFlightBuilds.set(flightKey, build);
  return build;
}

sitemap.get(
  '/sitemap.xml',
  describeRoute({
    tags: ['Sitemap'],
    summary: 'Get the sitemap index or one sitemap page',
    description:
      'Without `part`, returns a sitemaps.org sitemap index listing `?part=static` and one ' +
      '`?part=recipes&page=N` / `?part=users&page=N` entry per 50,000 rows. With `part`, returns ' +
      "that page as a `<urlset>` of at most 50,000 URLs (public recipes, live authors' profiles, " +
      'or the static pages). Served at the site root (proxied by the web edge) because search ' +
      'engines apply a sitemap only to URLs under its own directory. Each document is cached for ' +
      '24 hours. Responds with XML, not a JSON envelope.',
    parameters: [
      {
        name: 'part',
        in: 'query',
        required: false,
        description: 'The sitemap part; omit it for the sitemap index.',
        schema: { type: 'string', enum: [...SITEMAP_PARTS] },
      },
      {
        name: 'page',
        in: 'query',
        required: false,
        description: 'The 1-based page of the part (50,000 URLs per page).',
        schema: { type: 'integer', minimum: 1, maximum: SITEMAP_MAX_PAGE, default: 1 },
      },
    ],
    responses: {
      200: {
        description: 'The sitemap index (`<sitemapindex>`) or one page (`<urlset>`)',
        content: { 'application/xml': {} },
      },
      400: {
        description: 'Invalid `part` or `page`',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'The page has no rows',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  zValidator('query', SitemapQuerySchema, zodValidationHook),
  async (c) => {
    const { part, page } = c.req.valid('query');
    const xml = await getDocument(part, page);
    if (!xml) {
      log.debug({ part: part ?? 'index', page }, 'sitemap page not found');
      return error(c, 'NOT_FOUND', 'Sitemap page not found', 404);
    }
    return c.body(xml, 200, {
      'Content-Type': XML_CONTENT_TYPE,
      'Cache-Control': XML_CACHE_CONTROL,
    });
  },
);

sitemap.get(
  '/api/v1/sitemap.xml',
  describeRoute({
    tags: ['Sitemap'],
    summary: 'Redirect to /sitemap.xml',
    description:
      'Deprecated location of the sitemap. Answers 301 to `<public origin>/sitemap.xml`, so old ' +
      '`robots.txt` files and Search Console submissions keep working.',
    deprecated: true,
    responses: {
      301: {
        description: 'Moved permanently to the sitemap index',
        headers: {
          Location: {
            description: '`<public origin>/sitemap.xml`',
            schema: { type: 'string', format: 'uri' },
          },
        },
      },
    },
  }),
  (c) => c.redirect(`${config.PUBLIC_APP_URL || config.APP_URL}/sitemap.xml`, 301),
);

export default sitemap;
