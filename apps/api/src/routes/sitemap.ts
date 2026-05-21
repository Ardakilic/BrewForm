import { Hono } from 'hono';
import { recipes, users } from '@brewform/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { config } from '../config/index.ts';
import type { AppEnv } from '../types/hono.ts';

const sitemap = new Hono<AppEnv>();

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toW3CDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

let _db: any = null;
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

sitemap.get('/', async (_c) => {
  const baseUrl = config.PUBLIC_APP_URL || config.APP_URL;

  const publicRecipes = await deps.getPublicRecipes();
  const activeUsers = await deps.getActiveUsers();

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
    xml += `
  <url>
    <loc>${escapeXml(baseUrl)}/recipes/${escapeXml(recipe.slug)}</loc>
    <lastmod>${toW3CDate(recipe.updatedAt)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  for (const user of activeUsers) {
    xml += `
  <url>
    <loc>${escapeXml(baseUrl)}/u/${escapeXml(user.username)}</loc>
    <lastmod>${toW3CDate(user.updatedAt)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`;
  }

  xml += `
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
});

export default sitemap;
