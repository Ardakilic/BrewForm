import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { recipes, users } from '@brewform/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { config } from '../config/index.ts';
import type { AppEnv } from '../types/hono.ts';
import { cacheProvider } from '../utils/cache/singleton.ts';
import type { db as DbType } from '@brewform/db';

const sitemap = new Hono<AppEnv>();

export const SITEMAP_CACHE_KEY = ['sitemap'];
export const SITEMAP_CACHE_TTL = 24 * 60 * 60 * 1000;

let inFlightSitemapBuildPromise: Promise<string> | null = null;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toW3CDate(date: Date | null | undefined): string {
  if (date && !isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  return '';
}

let _db: typeof DbType | null = null;
async function getDb() {
  if (!_db) {
    const mod = await import('@brewform/db');
    _db = mod.db;
  }
  return _db;
}

export const deps = {
  getPublicRecipes: async () => {
    const db = await getDb();
    return db
      .select({
        slug: recipes.slug,
        updatedAt: recipes.updatedAt,
      })
      .from(recipes)
      .where(
        and(eq(recipes.visibility, 'public'), isNull(recipes.deletedAt)),
      )
      .orderBy(desc(recipes.updatedAt));
  },
  getActiveUsers: async () => {
    const db = await getDb();
    return db
      .selectDistinct({
        username: users.username,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .innerJoin(recipes, eq(recipes.authorId, users.id))
      .where(
        and(eq(recipes.visibility, 'public'), isNull(recipes.deletedAt)),
      );
  },
};

export function buildXml(
  baseUrl: string,
  publicRecipes: Array<{ slug: string; updatedAt: Date }>,
  activeUsers: Array<{ username: string; updatedAt: Date }>,
): string {
  const staticPages = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/recipes', priority: '0.9', changefreq: 'daily' },
    { path: '/taste-notes', priority: '0.6', changefreq: 'weekly' },
    { path: '/privacy', priority: '0.3', changefreq: 'monthly' },
    { path: '/terms', priority: '0.3', changefreq: 'monthly' },
  ];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  for (const page of staticPages) {
    xml += `
  <url>
    <loc>${escapeXml(baseUrl)}${escapeXml(page.path)}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  }

  for (const recipe of publicRecipes) {
    const lastmod = toW3CDate(recipe.updatedAt);
    xml += `
  <url>
    <loc>${escapeXml(baseUrl)}/recipes/${escapeXml(recipe.slug)}</loc>${
      lastmod
        ? `
    <lastmod>${lastmod}</lastmod>`
        : ''
    }
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  for (const user of activeUsers) {
    const lastmod = toW3CDate(user.updatedAt);
    xml += `
  <url>
    <loc>${escapeXml(baseUrl)}/u/${escapeXml(user.username)}</loc>${
      lastmod
        ? `
    <lastmod>${lastmod}</lastmod>`
        : ''
    }
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`;
  }

  xml += `
</urlset>`;

  return xml;
}

sitemap.get(
  '/',
  describeRoute({
    tags: ['Sitemap'],
    summary: 'Get the XML sitemap',
    description:
      'Returns the XML sitemap listing static pages, public recipes, and active user profiles for ' +
      'crawlers. Responds with XML, not a JSON envelope.',
    responses: {
      200: {
        description: 'XML sitemap',
        content: { 'application/xml': {} },
      },
    },
  }),
  async (_c) => {
    const baseUrl = (config.PUBLIC_APP_URL || config.APP_URL).replace(/\/+$/, '');

    const cached = await cacheProvider.get<string>(SITEMAP_CACHE_KEY);
    if (cached) {
      return new Response(cached, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      });
    }

    if (inFlightSitemapBuildPromise) {
      return inFlightSitemapBuildPromise.then((xml) =>
        new Response(xml, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          },
        })
      );
    }

    inFlightSitemapBuildPromise = (async () => {
      try {
        const [publicRecipes, activeUsers] = await Promise.all([
          deps.getPublicRecipes(),
          deps.getActiveUsers(),
        ]);

        const xml = buildXml(baseUrl, publicRecipes, activeUsers);

        await cacheProvider.set(SITEMAP_CACHE_KEY, xml, { ttlMs: SITEMAP_CACHE_TTL });

        return xml;
      } finally {
        inFlightSitemapBuildPromise = null;
      }
    })();

    const xml = await inFlightSitemapBuildPromise;
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  },
);

export default sitemap;
