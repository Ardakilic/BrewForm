import '../test-setup.ts';
import { afterEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import sitemap, { buildXml, deps, SITEMAP_CACHE_KEY } from './sitemap.ts';
import { cacheProvider } from '../utils/cache/singleton.ts';

describe('Sitemap Route', () => {
  const app = new Hono();
  app.route('/api/v1/sitemap.xml', sitemap);

  const originalGetPublicRecipes = deps.getPublicRecipes;
  const originalGetActiveUsers = deps.getActiveUsers;

  afterEach(async () => {
    deps.getPublicRecipes = originalGetPublicRecipes;
    deps.getActiveUsers = originalGetActiveUsers;
    await cacheProvider.delete(SITEMAP_CACHE_KEY);
  });

  const mockRecipes = [
    { slug: 'v60-ethiopian', updatedAt: new Date('2025-06-01') },
    { slug: 'french-press-blend', updatedAt: new Date('2025-05-15') },
  ];

  const mockUsers = [
    { username: 'barista', updatedAt: new Date('2025-06-01') },
  ];

  it('returns valid XML with correct content type', async () => {
    // deno-lint-ignore require-await -- test mock async signature
    deps.getPublicRecipes = async () => mockRecipes;
    // deno-lint-ignore require-await -- test mock async signature
    deps.getActiveUsers = async () => mockUsers;

    const res = await app.request('/api/v1/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');

    const body = await res.text();
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(body).toContain('</urlset>');
  });

  it('includes static pages', async () => {
    // deno-lint-ignore require-await -- test mock async signature
    deps.getPublicRecipes = async () => [];
    // deno-lint-ignore require-await -- test mock async signature
    deps.getActiveUsers = async () => [];

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).toContain('/recipes</loc>');
    expect(body).toContain('/taste-notes</loc>');
    expect(body).toContain('/privacy</loc>');
    expect(body).toContain('/terms</loc>');
  });

  it('sets cache-control header', async () => {
    // deno-lint-ignore require-await -- test mock async signature
    deps.getPublicRecipes = async () => [];
    // deno-lint-ignore require-await -- test mock async signature
    deps.getActiveUsers = async () => [];

    const res = await app.request('/api/v1/sitemap.xml');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
  });

  it('does not include authenticated-only paths', async () => {
    // deno-lint-ignore require-await -- test mock async signature
    deps.getPublicRecipes = async () => [];
    // deno-lint-ignore require-await -- test mock async signature
    deps.getActiveUsers = async () => [];

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).not.toContain('/settings');
    expect(body).not.toContain('/admin');
    expect(body).not.toContain('/onboarding');
  });

  it('includes recipe pages with lastmod dates', async () => {
    // deno-lint-ignore require-await -- test mock async signature
    deps.getPublicRecipes = async () => mockRecipes;
    // deno-lint-ignore require-await -- test mock async signature
    deps.getActiveUsers = async () => [];

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).toContain('/recipes/v60-ethiopian</loc>');
    expect(body).toContain('<lastmod>2025-06-01</lastmod>');
    expect(body).toContain('/recipes/french-press-blend</loc>');
    expect(body).toContain('<lastmod>2025-05-15</lastmod>');
  });

  it('includes user profile pages', async () => {
    // deno-lint-ignore require-await -- test mock async signature
    deps.getPublicRecipes = async () => [];
    // deno-lint-ignore require-await -- test mock async signature
    deps.getActiveUsers = async () => mockUsers;

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).toContain('/u/barista</loc>');
    expect(body).toContain('<lastmod>2025-06-01</lastmod>');
  });

  it('returns cached XML on cache hit without calling deps', async () => {
    await cacheProvider.set(SITEMAP_CACHE_KEY, '<cached>stale-xml</cached>', {
      ttlMs: 3600000,
    });

    let getPublicRecipesCalled = false;
    let getActiveUsersCalled = false;
    // deno-lint-ignore require-await -- test mock async signature
    deps.getPublicRecipes = async () => {
      getPublicRecipesCalled = true;
      return [];
    };
    // deno-lint-ignore require-await -- test mock async signature
    deps.getActiveUsers = async () => {
      getActiveUsersCalled = true;
      return [];
    };

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).toContain('<cached>stale-xml</cached>');
    expect(getPublicRecipesCalled).toBe(false);
    expect(getActiveUsersCalled).toBe(false);
  });

  it('caches generated XML after a cache miss', async () => {
    // deno-lint-ignore require-await -- test mock async signature
    deps.getPublicRecipes = async () => [];
    // deno-lint-ignore require-await -- test mock async signature
    deps.getActiveUsers = async () => [];

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).toContain('</urlset>');

    const cached = await cacheProvider.get<string>(SITEMAP_CACHE_KEY);
    expect(cached).not.toBeNull();
    expect(cached!).toBe(body);
  });

  it('second request returns cached data without querying DB deps', async () => {
    let callCount = 0;
    // deno-lint-ignore require-await -- test mock async signature
    deps.getPublicRecipes = async () => {
      callCount++;
      return [{ slug: 'only-recipe', updatedAt: new Date('2025-01-01') }];
    };
    // deno-lint-ignore require-await -- test mock async signature
    deps.getActiveUsers = async () => [];

    const res1 = await app.request('/api/v1/sitemap.xml');
    expect(res1.status).toBe(200);
    expect(callCount).toBe(1);

    const res2 = await app.request('/api/v1/sitemap.xml');
    expect(res2.status).toBe(200);
    expect(callCount).toBe(1);

    const body = await res2.text();
    expect(body).toContain('/recipes/only-recipe</loc>');
  });

  it('buildXml includes all sections', () => {
    const xml = buildXml(
      'https://brewform.cc',
      [{ slug: 'test-recipe', updatedAt: new Date('2025-03-15') }],
      [{ username: 'coffee-lover', updatedAt: new Date('2025-04-01') }],
    );
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<loc>https://brewform.cc/</loc>');
    expect(xml).toContain('<loc>https://brewform.cc/recipes</loc>');
    expect(xml).toContain('<loc>https://brewform.cc/recipes/test-recipe</loc>');
    expect(xml).toContain('<loc>https://brewform.cc/u/coffee-lover</loc>');
    expect(xml).toContain('<lastmod>2025-03-15</lastmod>');
    expect(xml).toContain('<priority>0.5</priority>');
  });
});
