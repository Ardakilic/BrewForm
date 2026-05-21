// deno-lint-ignore-file no-explicit-any
import '../test-setup.ts';
import { afterEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { crawlerMiddleware, deps } from './crawler.ts';

describe('Crawler Middleware', () => {
  const app = new Hono();
  app.use('*', crawlerMiddleware);
  app.get('*', (c) => c.text('SPA fallback'));

  const originalGetRecipeMeta = deps.getRecipeMeta;

  const publicMeta = {
    id: '1',
    title: 'V60 Ethiopian',
    slug: 'v60-ethiopian',
    author: { username: 'barista', displayName: 'Pro Barista' },
    visibility: 'public' as const,
    likeCount: 5,
    commentCount: 2,
    createdAt: new Date(),
    productName: 'Ethiopian Yirgacheffe',
    brewMethod: 'V60',
    photoUrl: 'https://cdn.brewform.cc/photos/v60.jpg',
  };

  afterEach(() => {
    deps.getRecipeMeta = originalGetRecipeMeta;
  });

  it('passes through for normal browser User-Agent', async () => {
    const res = await app.request('/recipes/v60-ethiopian', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('SPA fallback');
  });

  it('returns pre-rendered HTML for Twitterbot', async () => {
    const orig = deps.getRecipeMeta;
    try {
      deps.getRecipeMeta = async () => publicMeta;
      const res = await app.request('/recipes/v60-ethiopian', {
        headers: { 'User-Agent': 'Twitterbot/1.0' },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<meta property="og:title"');
      expect(html).toContain('V60 Ethiopian');
      expect(html).toContain('twitter:card');
    } finally {
      deps.getRecipeMeta = orig;
    }
  });

  it('returns pre-rendered HTML for facebookexternalhit', async () => {
    const orig = deps.getRecipeMeta;
    try {
      deps.getRecipeMeta = async () => publicMeta;
      const res = await app.request('/recipes/v60-ethiopian', {
        headers: { 'User-Agent': 'facebookexternalhit/1.1' },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('og:title');
    } finally {
      deps.getRecipeMeta = orig;
    }
  });

  it('falls through for non-recipe paths even with crawler UA', async () => {
    const res = await app.request('/login', {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
    });
    expect(await res.text()).toBe('SPA fallback');
  });

  it('falls through for private recipes', async () => {
    const orig = deps.getRecipeMeta;
    try {
      deps.getRecipeMeta = async () => ({ ...publicMeta, visibility: 'private' as const });
      const res = await app.request('/recipes/private-brew', {
        headers: { 'User-Agent': 'Twitterbot/1.0' },
      });
      expect(await res.text()).toBe('SPA fallback');
    } finally {
      deps.getRecipeMeta = orig;
    }
  });

  it('falls through when getRecipeMeta throws', async () => {
    const orig = deps.getRecipeMeta;
    try {
      deps.getRecipeMeta = async () => {
        throw new Error('RECIPE_NOT_FOUND');
      };
      const res = await app.request('/recipes/missing', {
        headers: { 'User-Agent': 'Discordbot/1.0' },
      });
      expect(await res.text()).toBe('SPA fallback');
    } finally {
      deps.getRecipeMeta = orig;
    }
  });

  it('includes og:image:width and og:image:height only for fallback image', async () => {
    const orig = deps.getRecipeMeta;
    try {
      deps.getRecipeMeta = async () => publicMeta;
      const resWithPhoto = await app.request('/recipes/v60-ethiopian', {
        headers: { 'User-Agent': 'WhatsApp/2.0' },
      });
      const htmlWithPhoto = await resWithPhoto.text();
      expect(htmlWithPhoto).not.toContain('content="1200"');
      expect(htmlWithPhoto).not.toContain('content="630"');

      deps.getRecipeMeta = async () => ({ ...publicMeta, photoUrl: null });
      const resFallback = await app.request('/recipes/v60-ethiopian', {
        headers: { 'User-Agent': 'WhatsApp/2.0' },
      });
      const htmlFallback = await resFallback.text();
      expect(htmlFallback).toContain('content="1200"');
      expect(htmlFallback).toContain('content="630"');
    } finally {
      deps.getRecipeMeta = orig;
    }
  });

  it('includes twitter meta tags', async () => {
    const orig = deps.getRecipeMeta;
    try {
      deps.getRecipeMeta = async () => publicMeta;
      const res = await app.request('/recipes/v60-ethiopian', {
        headers: { 'User-Agent': 'Slackbot-LinkExpanding 1.0' },
      });
      const html = await res.text();
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
      expect(html).toContain('<meta name="twitter:title"');
      expect(html).toContain('<meta name="twitter:description"');
      expect(html).toContain('<meta name="twitter:image"');
    } finally {
      deps.getRecipeMeta = orig;
    }
  });

  it('uses productName in description when available', async () => {
    const orig = deps.getRecipeMeta;
    try {
      deps.getRecipeMeta = async () => publicMeta;
      const res = await app.request('/recipes/v60-ethiopian', {
        headers: { 'User-Agent': 'Twitterbot/1.0' },
      });
      const html = await res.text();
      expect(html).toContain('V60 recipe using Ethiopian Yirgacheffe');
    } finally {
      deps.getRecipeMeta = orig;
    }
  });

  it('uses brewMethod and drinkType in description when productName is absent', async () => {
    const orig = deps.getRecipeMeta;
    try {
      deps.getRecipeMeta = async () => ({
        ...publicMeta,
        productName: null,
      });
      const res = await app.request('/recipes/v60-ethiopian', {
        headers: { 'User-Agent': 'Twitterbot/1.0' },
      });
      const html = await res.text();
      expect(html).toContain('V60 recipe by Pro Barista');
    } finally {
      deps.getRecipeMeta = orig;
    }
  });
});
