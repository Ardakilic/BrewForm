// deno-lint-ignore-file no-explicit-any
import '../test-setup.ts';
import { describe, it, afterEach } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import sitemap, { deps } from './sitemap.ts';

describe('Sitemap Route', () => {
  const app = new Hono();
  app.route('/api/v1/sitemap.xml', sitemap);

  const originalGetPublicRecipes = deps.getPublicRecipes;
  const originalGetActiveUsers = deps.getActiveUsers;

  afterEach(() => {
    deps.getPublicRecipes = originalGetPublicRecipes;
    deps.getActiveUsers = originalGetActiveUsers;
  });

  const mockRecipes = [
    { slug: 'v60-ethiopian', updatedAt: new Date('2025-06-01') },
    { slug: 'french-press-blend', updatedAt: new Date('2025-05-15') },
  ];

  const mockUsers = [
    { username: 'barista', updatedAt: new Date('2025-06-01') },
  ];

  it('returns valid XML with correct content type', async () => {
    deps.getPublicRecipes = async () => mockRecipes;
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
    deps.getPublicRecipes = async () => [];
    deps.getActiveUsers = async () => [];

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).toContain('/recipes</loc>');
    expect(body).toContain('/taste-notes</loc>');
    expect(body).toContain('/privacy</loc>');
    expect(body).toContain('/terms</loc>');
  });

  it('sets cache-control header', async () => {
    deps.getPublicRecipes = async () => [];
    deps.getActiveUsers = async () => [];

    const res = await app.request('/api/v1/sitemap.xml');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
  });

  it('does not include authenticated-only paths', async () => {
    deps.getPublicRecipes = async () => [];
    deps.getActiveUsers = async () => [];

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).not.toContain('/settings');
    expect(body).not.toContain('/admin');
    expect(body).not.toContain('/onboarding');
  });

  it('includes recipe pages with lastmod dates', async () => {
    deps.getPublicRecipes = async () => mockRecipes;
    deps.getActiveUsers = async () => [];

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).toContain('/recipes/v60-ethiopian</loc>');
    expect(body).toContain('<lastmod>2025-06-01</lastmod>');
    expect(body).toContain('/recipes/french-press-blend</loc>');
    expect(body).toContain('<lastmod>2025-05-15</lastmod>');
  });

  it('includes user profile pages', async () => {
    deps.getPublicRecipes = async () => [];
    deps.getActiveUsers = async () => mockUsers;

    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).toContain('/u/barista</loc>');
    expect(body).toContain('<lastmod>2025-06-01</lastmod>');
  });
});