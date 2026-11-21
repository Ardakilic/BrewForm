import '../test-setup.ts';
import { db } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../config/index.ts';
import { VisibilityFixtures, type VisibilityScenario } from '../modules/recipe/test-helpers.ts';
import { cacheProvider } from '../utils/cache/singleton.ts';
import sitemap, {
  buildUrlsetXml,
  deps,
  log,
  SITEMAP_PAGE_SIZE,
  type SitemapUrl,
  STATIC_PAGES,
  sitemapCacheKey,
} from './sitemap.ts';

/** The public origin the sitemap writes into every `<loc>`. */
const BASE = config.PUBLIC_APP_URL || config.APP_URL;

/** Stub the four `deps` with fixed results; returns the spies. */
function stubDeps(
  opts: {
    recipeCount?: number;
    authorCount?: number;
    recipeRows?: Array<{ slug: string; updatedAt: Date }>;
    authorRows?: Array<{ username: string; updatedAt: Date }>;
  } = {},
) {
  return {
    countPublicRecipes: vi
      .spyOn(deps, 'countPublicRecipes')
      .mockResolvedValue(opts.recipeCount ?? 0),
    countListedAuthors: vi
      .spyOn(deps, 'countListedAuthors')
      .mockResolvedValue(opts.authorCount ?? 0),
    getPublicRecipes: vi.spyOn(deps, 'getPublicRecipes').mockResolvedValue(opts.recipeRows ?? []),
    getListedAuthors: vi.spyOn(deps, 'getListedAuthors').mockResolvedValue(opts.authorRows ?? []),
  };
}

describe('Sitemap route (sitemap index at the site root)', () => {
  const app = new Hono();
  app.route('/', sitemap);

  afterEach(async () => {
    vi.restoreAllMocks();
    await cacheProvider.deleteByPrefix(['sitemap']);
  });

  const recipeRows = [
    { slug: 'v60-ethiopian', updatedAt: new Date('2025-06-01') },
    { slug: 'french-press-blend', updatedAt: new Date('2025-05-15') },
  ];

  it('GET /sitemap.xml answers a sitemap index with one recipe page per 50,000 rows', async () => {
    const spies = stubDeps({ recipeCount: 100_001, authorCount: 0 });

    const res = await app.request('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
    const body = await res.text();
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(body).toContain(`<loc>${BASE}/sitemap.xml?part=static</loc>`);
    for (const page of [1, 2, 3]) {
      expect(body).toContain(`<loc>${BASE}/sitemap.xml?part=recipes&amp;page=${page}</loc>`);
    }
    expect(body).not.toContain('part=recipes&amp;page=4');
    expect(body).not.toContain('part=users');
    expect(body.match(/<sitemap>/g)).toHaveLength(4);
    expect(body).toContain('</sitemapindex>');
    expect(spies.getPublicRecipes).not.toHaveBeenCalled();
  });

  it('lists user pages in the index when listed authors exist', async () => {
    stubDeps({ recipeCount: 1, authorCount: 50_001 });
    const body = await (await app.request('/sitemap.xml')).text();
    expect(body).toContain(`<loc>${BASE}/sitemap.xml?part=recipes&amp;page=1</loc>`);
    expect(body).toContain(`<loc>${BASE}/sitemap.xml?part=users&amp;page=1</loc>`);
    expect(body).toContain(`<loc>${BASE}/sitemap.xml?part=users&amp;page=2</loc>`);
    expect(body).not.toContain('part=users&amp;page=3');
  });

  it('?part=static lists the 5 static pages; page 2 is 404', async () => {
    const spies = stubDeps();
    const res = await app.request('/sitemap.xml?part=static');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(STATIC_PAGES).toHaveLength(5);
    for (const path of ['/', '/recipes', '/taste-notes', '/privacy', '/terms']) {
      expect(body).toContain(`<loc>${BASE}${path}</loc>`);
    }
    expect(body.match(/<url>/g)).toHaveLength(5);
    for (const privatePath of ['/settings', '/admin', '/onboarding']) {
      expect(body).not.toContain(privatePath);
    }
    expect(spies.getPublicRecipes).not.toHaveBeenCalled();

    const page2 = await app.request('/sitemap.xml?part=static&page=2');
    expect(page2.status).toBe(404);
    expect(((await page2.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  it('?part=recipes&page=2 reads page 2 and lists its rows with lastmod', async () => {
    const spies = stubDeps({ recipeRows });
    const res = await app.request('/sitemap.xml?part=recipes&page=2');
    expect(res.status).toBe(200);
    expect(spies.getPublicRecipes).toHaveBeenCalledWith(2);
    const body = await res.text();
    expect(body).toContain(`<loc>${BASE}/recipes/v60-ethiopian</loc>`);
    expect(body).toContain('<lastmod>2025-06-01</lastmod>');
    expect(body).toContain(`<loc>${BASE}/recipes/french-press-blend</loc>`);
    expect(body).toContain('<lastmod>2025-05-15</lastmod>');
    expect(body.match(/<url>/g)).toHaveLength(2);
  });

  it('?part=users&page=1 lists the profile pages', async () => {
    const spies = stubDeps({
      authorRows: [{ username: 'barista', updatedAt: new Date('2025-06-01') }],
    });
    const body = await (await app.request('/sitemap.xml?part=users')).text();
    expect(spies.getListedAuthors).toHaveBeenCalledWith(1);
    expect(body).toContain(`<loc>${BASE}/u/barista</loc>`);
    expect(body).toContain('<lastmod>2025-06-01</lastmod>');
    expect(body).toContain('<priority>0.5</priority>');
  });

  it('an empty page is 404, logged and not cached', async () => {
    const spies = stubDeps({ recipeRows: [] });
    const debug = vi.spyOn(log, 'debug');

    const res = await app.request('/sitemap.xml?part=recipes&page=5');
    expect(res.status).toBe(404);
    const json = (await res.json()) as { success: boolean; error: { code: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
    expect(debug).toHaveBeenCalledWith({ part: 'recipes', page: 5 }, 'sitemap page not found');
    expect(await cacheProvider.get(sitemapCacheKey('recipes', 5))).toBeNull();

    await app.request('/sitemap.xml?part=recipes&page=5');
    expect(spies.getPublicRecipes).toHaveBeenCalledTimes(2);
  });

  it('answers 400 VALIDATION_ERROR for an unknown part or a page outside 1-50,000', async () => {
    const spies = stubDeps();
    for (const query of ['?part=bogus', '?page=0', '?page=50001', '?part=recipes&page=abc']) {
      const res = await app.request(`/sitemap.xml${query}`);
      expect(res.status, query).toBe(400);
      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code, query).toBe('VALIDATION_ERROR');
    }
    expect(spies.countPublicRecipes).not.toHaveBeenCalled();
    expect(spies.getPublicRecipes).not.toHaveBeenCalled();
  });

  it('GET /api/v1/sitemap.xml answers 301 to <base>/sitemap.xml', async () => {
    const spies = stubDeps();
    const res = await app.request('/api/v1/sitemap.xml');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${BASE}/sitemap.xml`);
    expect(spies.countPublicRecipes).not.toHaveBeenCalled();
  });

  it('serves a second index request from the cache without calling deps', async () => {
    const spies = stubDeps({ recipeCount: 3 });
    const first = await (await app.request('/sitemap.xml')).text();
    const second = await (await app.request('/sitemap.xml')).text();
    expect(second).toBe(first);
    expect(spies.countPublicRecipes).toHaveBeenCalledTimes(1);
    expect(spies.countListedAuthors).toHaveBeenCalledTimes(1);
    expect(await cacheProvider.get<string>(sitemapCacheKey())).toBe(first);
  });

  it('serves a second recipes/1 request from the cache without calling deps', async () => {
    const spies = stubDeps({ recipeRows: [{ slug: 'only-recipe', updatedAt: new Date() }] });
    const res1 = await app.request('/sitemap.xml?part=recipes&page=1');
    expect(res1.status).toBe(200);
    const res2 = await app.request('/sitemap.xml?part=recipes');
    expect(res2.status).toBe(200);
    expect(spies.getPublicRecipes).toHaveBeenCalledTimes(1);
    expect(await res2.text()).toContain(`<loc>${BASE}/recipes/only-recipe</loc>`);
    expect(await cacheProvider.get<string>(sitemapCacheKey('recipes', 1))).toContain(
      '/recipes/only-recipe',
    );
  });

  it('returns the cached XML of the requested document on a hit', async () => {
    const spies = stubDeps();
    await cacheProvider.set(sitemapCacheKey(), '<cached>index</cached>', { ttlMs: 3_600_000 });
    await cacheProvider.set(sitemapCacheKey('users', 2), '<cached>users-2</cached>', {
      ttlMs: 3_600_000,
    });

    expect(await (await app.request('/sitemap.xml')).text()).toBe('<cached>index</cached>');
    expect(await (await app.request('/sitemap.xml?part=users&page=2')).text()).toBe(
      '<cached>users-2</cached>',
    );
    expect(spies.countPublicRecipes).not.toHaveBeenCalled();
    expect(spies.getListedAuthors).not.toHaveBeenCalled();
  });

  it('uses a distinct cache key per part and page', () => {
    const keys = [
      sitemapCacheKey(),
      sitemapCacheKey('static'),
      sitemapCacheKey('recipes', 1),
      sitemapCacheKey('recipes', 2),
      sitemapCacheKey('users', 1),
    ].map((key) => key.join(':'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(sitemapCacheKey('static')).toEqual(sitemapCacheKey('static', 1));
    expect(keys.every((key) => key.startsWith('sitemap:'))).toBe(true);
  });

  it('builds a document once for concurrent requests (one in-flight build per key)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spies = stubDeps();
    spies.getPublicRecipes.mockImplementation(async () => {
      await gate;
      return recipeRows;
    });

    const pending = [
      app.request('/sitemap.xml?part=recipes&page=1'),
      app.request('/sitemap.xml?part=recipes&page=1'),
    ];
    // Both requests are past the cache lookup and waiting before the build may finish.
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const [a, b] = await Promise.all(pending);
    expect(await a.text()).toBe(await b.text());
    expect(spies.getPublicRecipes).toHaveBeenCalledTimes(1);
  });

  it('keeps a full page within the protocol limits (50,000 URLs, under 50 MB)', () => {
    expect(SITEMAP_PAGE_SIZE).toBe(50_000);
    const base = `https://${'b'.repeat(100 - 'https://'.length)}`;
    expect(base).toHaveLength(100);
    const slug = 's'.repeat(255);
    const urls: SitemapUrl[] = Array.from({ length: SITEMAP_PAGE_SIZE }, () => ({
      path: `/recipes/${slug}`,
      lastmod: new Date('2025-06-01'),
      changefreq: 'weekly',
      priority: '0.8',
    }));
    const xml = buildUrlsetXml(base, urls);
    expect(xml.match(/<url>/g)).toHaveLength(SITEMAP_PAGE_SIZE);
    expect(Buffer.byteLength(xml, 'utf8')).toBeLessThan(52_428_800);
  });
});

/**
 * Regression lock for capability `recipe-visibility` against the real database: the sitemap
 * pages list public recipes only, page them by `createdAt` then `id`, and list a user only when
 * they have a listable recipe and a live account.
 */
describe('Sitemap deps — paging, unlisted recipes and deleted accounts (recipe-visibility)', () => {
  const fixtures = new VisibilityFixtures();
  let scenario: VisibilityScenario;
  let userC: Awaited<ReturnType<VisibilityFixtures['user']>>;
  let unlistedOfC: Awaited<ReturnType<VisibilityFixtures['recipe']>>;

  beforeAll(async () => {
    scenario = await fixtures.scenario('vis-sitemap');
    userC = await fixtures.user('vis-sitemap-c');
    unlistedOfC = await fixtures.recipe(userC.id, 'unlisted');
  });

  afterAll(async () => {
    await fixtures.cleanup();
  });

  it('getPublicRecipes returns the public recipe and never an unlisted one', async () => {
    const slugs = (await deps.getPublicRecipes(1)).map((r) => r.slug);
    expect(slugs).toContain(scenario.publicP.slug);
    expect(slugs).not.toContain(scenario.unlistedU.slug);
    expect(slugs).not.toContain(unlistedOfC.slug);
  });

  it('getListedAuthors lists an author of a public recipe but not a user whose only recipe is unlisted', async () => {
    const usernames = (await deps.getListedAuthors(1)).map((u) => u.username);
    expect(usernames).toContain(scenario.authorA.username);
    expect(usernames).not.toContain(userC.username);
  });

  it('pages public recipes by createdAt, then id, with limit and offset', async () => {
    const oldest = await fixtures.recipe(scenario.authorA.id, 'public');
    await db
      .update(recipes)
      .set({ createdAt: new Date('2000-01-01T00:00:00Z') })
      .where(eq(recipes.id, oldest.id));

    expect((await deps.getPublicRecipes(1, 1)).map((r) => r.slug)).toEqual([oldest.slug]);
    expect((await deps.getPublicRecipes(2, 1)).map((r) => r.slug)).not.toContain(oldest.slug);
  });

  it('countPublicRecipes grows by one for a public recipe and not for an unlisted one', async () => {
    const before = await deps.countPublicRecipes();
    await fixtures.recipe(userC.id, 'unlisted');
    expect(await deps.countPublicRecipes()).toBe(before);
    await fixtures.recipe(userC.id, 'public');
    expect(await deps.countPublicRecipes()).toBe(before + 1);
  });

  it('a soft-deleted author of a public recipe is neither listed nor counted', async () => {
    const userD = await fixtures.user('vis-sitemap-d');
    const publicOfD = await fixtures.recipe(userD.id, 'public');
    const countLive = await deps.countListedAuthors();
    expect((await deps.getListedAuthors(1)).map((u) => u.username)).toContain(userD.username);

    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userD.id));

    expect((await deps.getListedAuthors(1)).map((u) => u.username)).not.toContain(userD.username);
    expect(await deps.countListedAuthors()).toBe(countLive - 1);
    // The account's public recipe stays listed (E11 keeps the content).
    expect((await deps.getPublicRecipes(1)).map((r) => r.slug)).toContain(publicOfD.slug);
  });
});
