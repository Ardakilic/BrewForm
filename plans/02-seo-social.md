# Plan 02 -- SEO & Social Sharing Fixes

**Date:** 2026-05-19
**Priority:** Critical / High
**Scope:** Crawler-visible OG meta tags, robots.txt + sitemap, enriched JSON-LD structured data
**Depends on:** None (can be implemented independently)

---

## Tech Stack Context

| Layer | Detail |
|-------|--------|
| Runtime | Deno 2.x on Deno Deploy |
| API | Hono v4.7 (`apps/api/`) |
| Frontend | React 19.1 + React Router v7.5 + Vite 8 (`apps/web/`) |
| Database | PostgreSQL + Drizzle ORM (`packages/db/`) |
| Shared | `@brewform/shared` -- Zod schemas, `escapeHtml`, `escapeHtmlAttr` utilities |

**IMPORTANT: This is a pure Deno project. Never use npm/npx/bun or other Node.js-specific tooling. Use `jsr:` packages and Deno-native alternatives.**

---

## Issues Overview

| ID | Severity | Title | Files Affected |
|----|----------|-------|----------------|
| C1 | Critical | OG meta tags invisible to crawlers | `SEOHead.tsx`, `index.html`, new `crawler.ts` |
| H2 | High | Missing robots.txt and sitemap.xml | new `robots.txt`, new sitemap route |
| M1 | Medium | JSON-LD structured data is thin | `JsonLd.tsx` |

---

## C1 -- OG Meta Tags Invisible to Crawlers (Social Sharing Broken)

**Severity:** Critical

### Evidence

- `apps/web/src/components/seo/SEOHead.tsx:21-50` -- All OG/twitter meta tag injection happens inside `useEffect(() => {...}, [deps])`. The component returns `null` (line 52). Since `useEffect` is a client-side-only React hook, social crawlers (which do not execute JavaScript) never see these tags.
- `apps/web/src/components/seo/SEOHead.tsx:55-63` -- `setMeta()` uses `document.querySelector()` + `document.createElement('meta')` + `document.head.appendChild()` -- all runtime DOM APIs unavailable to crawlers.
- `apps/web/index.html:1-20` -- Static HTML contains only `<title>BrewForm</title>` and `<link rel="icon">`. Zero `<meta name="description">`, zero `og:title`, `og:description`, `og:image`, `twitter:card` meta tags.
- `apps/web/src/components/seo/SEOHead.tsx:32` -- References `/og-default.png` but this file does not exist in `apps/web/public/`.
- `apps/api/src/routes/share.ts:49-81` -- A `/share/:slug` route already exists that returns pre-rendered OG tags for the share URL flow, proving the pattern works. But recipe pages themselves (`/recipes/:slug`) are not handled.
- `apps/api/src/modules/recipe/service.ts:418-435` -- `getRecipeMeta(slug)` exists and returns `{ id, title, slug, author, visibility, likeCount, commentCount, createdAt, productName, brewMethod, photoUrl }`.

### Impact

Sharing any recipe URL (`/recipes/:slug`) on Twitter/X, Facebook, WhatsApp, Discord, Slack, or LinkedIn produces a blank preview card with no title, description, or image. This completely breaks organic social sharing -- the primary growth vector for a recipe sharing app.

### Action Plan

#### Step 1: Create crawler middleware (`apps/api/src/middleware/crawler.ts`)

This middleware intercepts requests from known social media crawlers and returns a minimal HTML page with pre-rendered OG tags instead of the SPA shell. Normal browser requests pass through unmodified.

```ts
// apps/api/src/middleware/crawler.ts
import type { Context, Next } from 'hono';
import { getRecipeMeta } from '../modules/recipe/service.ts';
import { escapeHtml, escapeHtmlAttr } from '@brewform/shared/utils';
import { config } from '../config/index.ts';

const CRAWLER_UA =
  /Twitterbot|facebookexternalhit|WhatsApp|Discordbot|Slackbot|LinkedInBot|Googlebot|bingbot|Pinterestbot|TelegramBot/i;

const RECIPE_PATH_RE = /^\/recipes\/([a-z0-9][\w-]*)$/i;

export const deps = { getRecipeMeta };

export async function crawlerMiddleware(c: Context, next: Next) {
  const ua = c.req.header('user-agent') ?? '';
  if (!CRAWLER_UA.test(ua)) return next();

  const url = new URL(c.req.url);
  const recipeMatch = url.pathname.match(RECIPE_PATH_RE);

  if (!recipeMatch) return next();

  const slug = recipeMatch[1];

  try {
    const meta = await deps.getRecipeMeta(slug);
    if (!meta || meta.visibility !== 'public') return next();

    const baseUrl = config.PUBLIC_APP_URL || config.APP_URL;
    const canonicalUrl = `${baseUrl}/recipes/${encodeURIComponent(meta.slug)}`;

    const description = meta.productName
      ? `${meta.brewMethod || 'Coffee'} recipe using ${meta.productName}`
      : `${meta.brewMethod || 'Coffee'} recipe by ${
          meta.author?.displayName || meta.author?.username || 'BrewForm user'
        }`;

    // NOTE: og:image:width/height are only included for the controlled og-default.png fallback.
    // User-uploaded photos have unknown dimensions, so we omit the hints to avoid
    // misleading platforms (Facebook, Discord) into incorrect cropping decisions.
    const imageTag = meta.photoUrl
      ? `
  <meta property="og:image" content="${escapeHtmlAttr(meta.photoUrl)}">
  <meta name="twitter:image" content="${escapeHtmlAttr(meta.photoUrl)}">`
      : `
  <meta property="og:image" content="${escapeHtmlAttr(baseUrl)}/og-default.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:image" content="${escapeHtmlAttr(baseUrl)}/og-default.png">`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(meta.title)} | BrewForm</title>
  <meta name="description" content="${escapeHtmlAttr(description)}">
  <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}">
  <meta property="og:title" content="${escapeHtmlAttr(meta.title)}">
  <meta property="og:description" content="${escapeHtmlAttr(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}">
  <meta property="og:site_name" content="BrewForm">${imageTag}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtmlAttr(meta.title)}">
  <meta name="twitter:description" content="${escapeHtmlAttr(description)}">
</head>
<body>
  <p>Redirecting to <a href="${escapeHtmlAttr(canonicalUrl)}">${escapeHtml(meta.title)}</a>...</p>
</body>
</html>`;

    return c.html(html);
  } catch {
    // Recipe not found or other error -- fall through to SPA
    return next();
  }
}
```

**Design notes:**
- The `deps` pattern matches the existing convention in `apps/api/src/routes/share.ts:9` for testability.
- `RECIPE_PATH_RE` is strict (`[a-z0-9][\w-]*`) to avoid matching static assets like `/recipes/styles.css`.
- The crawler list includes Googlebot/bingbot because while Google can execute JS, serving pre-rendered HTML is faster and more reliable for SEO indexing.
- Falls through to `next()` on any error, so the SPA still works if the middleware fails.
- Emits `og:image:width` (1200) and `og:image:height` (630) only for the controlled `og-default.png` fallback image, where dimensions are known. User-uploaded photos have unknown dimensions; asserting incorrect hints can cause platforms to crop or skip the image.

#### Step 2: Register middleware in `apps/api/src/main.ts`

Insert the crawler middleware **before** the SPA fallback but **after** CORS and rate limiting, so crawlers still respect rate limits.

```ts
// In apps/api/src/main.ts, add import:
import { crawlerMiddleware } from './middleware/crawler.ts';

// Register after the existing middleware stack (line 51), before routes (line 96):
app.use('*', crawlerMiddleware);
```

The middleware insertion point is between the cache injection middleware (line 48-51) and `app.route('/', routes)` (line 96). Since the middleware calls `next()` for non-crawler requests, it has zero overhead for normal users.

#### Step 3: Ensure `VITE_PUBLIC_APP_URL` is available for HTML placeholder replacement

Vite automatically replaces `%VITE_*%` placeholders in `index.html` with environment variables loaded at build time. The `define` block in vite.config.ts only affects JavaScript code, NOT HTML placeholders.

**`apps/web/vite.config.ts`** — ensure the environment variable is set with a fallback:
```ts
// Vite's HTML env interpolation reads from Deno.env automatically.
// Set a fallback if missing to prevent literal %VITE_PUBLIC_APP_URL% in output.
const publicAppUrl = Deno.env.get('VITE_PUBLIC_APP_URL') || 'http://localhost:5173';
if (!Deno.env.get('VITE_PUBLIC_APP_URL')) {
  console.warn('Warning: VITE_PUBLIC_APP_URL not set, using fallback:', publicAppUrl);
  Deno.env.set('VITE_PUBLIC_APP_URL', publicAppUrl);
}

// The define block is for JavaScript replacements only (not HTML):
define: {
  'import.meta.env.VITE_API_URL': JSON.stringify(
    Deno.env.get('VITE_API_URL') || '/api/v1',
  ),
  'import.meta.env.VITE_PUBLIC_APP_URL': JSON.stringify(publicAppUrl),
},
```

**Important:** Production builds MUST set the `VITE_PUBLIC_APP_URL` environment variable to the actual deployment URL before running `vite build`.

**`compose.yml`** — add to `web-dev` environment:
```yaml
environment:
  - VITE_API_URL=/api/v1
  - VITE_API_PROXY_TARGET=http://app:8000
  - VITE_PUBLIC_APP_URL=http://localhost:5173   # <-- add this
```

**Production/CI** — set `VITE_PUBLIC_APP_URL=https://brewform.cc` (or the actual domain) before running `vite build`.

#### Step 4: Add static OG fallbacks to `apps/web/index.html`

Even with the crawler middleware, the `index.html` itself should contain sensible defaults for:
- Search engines that index the homepage directly
- Social shares of non-recipe pages (homepage, `/recipes` list, etc.)
- Cases where the API is unreachable

```html
<!DOCTYPE html>
<html lang="en" class="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BrewForm -- Coffee Brewing Recipes</title>
    <meta name="description" content="Digitalize, share, and discover coffee brewing recipes and tasting notes." />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

    <!-- Open Graph defaults (overridden at runtime by SEOHead.tsx for dynamic pages) -->
    <meta property="og:title" content="BrewForm" />
    <meta property="og:description" content="Digitalize, share, and discover coffee brewing recipes and tasting notes." />
    <meta property="og:type" content="website" />
    <!-- IMPORTANT: og:image and twitter:image MUST be absolute URLs. Social crawlers (Twitter, Facebook, Discord, etc.) fetch images from their own servers and cannot resolve relative paths. -->
    <!-- Vite replaces %VITE_PUBLIC_APP_URL% at build time from the env var (set in compose.yml and CI). -->
    <meta property="og:image" content="%VITE_PUBLIC_APP_URL%/og-default.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="BrewForm" />

    <!-- Twitter Card defaults -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="BrewForm" />
    <meta name="twitter:description" content="Digitalize, share, and discover coffee brewing recipes and tasting notes." />
    <meta name="twitter:image" content="%VITE_PUBLIC_APP_URL%/og-default.png" />
  </head>
  <body>
    <script>
      if (sessionStorage.redirect) {
        var redirect = sessionStorage.redirect;
        delete sessionStorage.redirect;
        history.replaceState(null, '', redirect);
      }
    </script>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### Step 5: Create `og-default.png`

A 1200x630 branded placeholder image must be added at `apps/web/public/og-default.png`. This is referenced by `SEOHead.tsx:32` and the static `index.html` tags but currently does not exist.

**Requirements:**
- Dimensions: 1200 x 630 px (standard OG image ratio)
- Content: BrewForm logo + tagline on a branded background
- Format: PNG (widest platform support; JPEG also acceptable)
- File size: Keep under 300 KB for fast crawler loads

#### Step 6: Write tests for crawler middleware

Create `apps/api/src/middleware/crawler.test.ts` following the pattern in `apps/api/src/routes/share.test.ts`:

```ts
// apps/api/src/middleware/crawler.test.ts
import '../test-setup.ts';
import { describe, it, afterEach } from 'jsr:@std/testing/bdd';
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
    deps.getRecipeMeta = async () => publicMeta;
    const res = await app.request('/recipes/v60-ethiopian', {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('V60 Ethiopian');
    expect(html).toContain('twitter:card');
  });

  it('returns pre-rendered HTML for facebookexternalhit', async () => {
    deps.getRecipeMeta = async () => publicMeta;
    const res = await app.request('/recipes/v60-ethiopian', {
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('og:title');
  });

  it('falls through for non-recipe paths even with crawler UA', async () => {
    const res = await app.request('/login', {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
    });
    expect(await res.text()).toBe('SPA fallback');
  });

  it('falls through for private recipes', async () => {
    deps.getRecipeMeta = async () => ({ ...publicMeta, visibility: 'private' as const });
    const res = await app.request('/recipes/private-brew', {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
    });
    expect(await res.text()).toBe('SPA fallback');
  });

  it('falls through when getRecipeMeta throws', async () => {
    deps.getRecipeMeta = async () => { throw new Error('RECIPE_NOT_FOUND'); };
    const res = await app.request('/recipes/missing', {
      headers: { 'User-Agent': 'Discordbot/1.0' },
    });
    expect(await res.text()).toBe('SPA fallback');
  });

  it('includes og:image:width and og:image:height only for fallback image', async () => {
    // With a user photo, dimensions should be omitted (unknown size)
    deps.getRecipeMeta = async () => publicMeta;
    const resWithPhoto = await app.request('/recipes/v60-ethiopian', {
      headers: { 'User-Agent': 'WhatsApp/2.0' },
    });
    const htmlWithPhoto = await resWithPhoto.text();
    expect(htmlWithPhoto).not.toContain('content="1200"');
    expect(htmlWithPhoto).not.toContain('content="630"');

    // Without a photo (fallback to og-default.png), dimensions should be present
    deps.getRecipeMeta = async () => ({ ...publicMeta, photoUrl: null });
    const resFallback = await app.request('/recipes/v60-ethiopian', {
      headers: { 'User-Agent': 'WhatsApp/2.0' },
    });
    const htmlFallback = await resFallback.text();
    expect(htmlFallback).toContain('content="1200"');
    expect(htmlFallback).toContain('content="630"');
  });

  it('includes twitter meta tags', async () => {
    deps.getRecipeMeta = async () => publicMeta;
    const res = await app.request('/recipes/v60-ethiopian', {
      headers: { 'User-Agent': 'Slackbot-LinkExpanding 1.0' },
    });
    const html = await res.text();
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="twitter:title"');
    expect(html).toContain('<meta name="twitter:description"');
    expect(html).toContain('<meta name="twitter:image"');
  });

  it('uses productName in description when available', async () => {
    deps.getRecipeMeta = async () => publicMeta;
    const res = await app.request('/recipes/v60-ethiopian', {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
    });
    const html = await res.text();
    expect(html).toContain('V60 recipe using Ethiopian Yirgacheffe');
  });

  it('uses brewMethod and drinkType in description when productName is absent', async () => {
    deps.getRecipeMeta = async () => ({
      ...publicMeta,
      productName: null,
    });
    const res = await app.request('/recipes/v60-ethiopian', {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
    });
    const html = await res.text();
    expect(html).toContain('V60 recipe by Pro Barista');
  });
});
```

### Checklist

- [ ] Create `apps/api/src/middleware/crawler.ts`
- [ ] Register `crawlerMiddleware` in `apps/api/src/main.ts` before SPA routes
- [ ] Add `VITE_PUBLIC_APP_URL` to `apps/web/vite.config.ts` `define` block
- [ ] Add `VITE_PUBLIC_APP_URL` to `compose.yml` `web-dev` environment
- [ ] Update `apps/web/index.html` with static OG/twitter meta tags (using `%VITE_PUBLIC_APP_URL%`)
- [ ] Create `apps/web/public/og-default.png` (1200x630 branded image)
- [ ] Write `apps/api/src/middleware/crawler.test.ts`
- [ ] Manual test: `curl -H "User-Agent: Twitterbot/1.0" https://brewform.cc/recipes/<slug>` returns OG tags
- [ ] Manual test: Share a recipe URL in Twitter/Discord/Slack and verify preview card renders

---

## H2 -- Missing robots.txt and sitemap.xml

**Severity:** High

### Evidence

- `apps/web/public/` contains only `_redirects` and `404.html` -- no `robots.txt`.
- No sitemap endpoint exists in `apps/api/src/routes/index.ts` (lines 1-57 reviewed).
- Search engines have no machine-readable way to discover all public recipe pages or user profiles.

### Impact

Without `robots.txt`, crawlers rely on defaults (which is okay but not optimal). Without a sitemap, search engines must discover pages purely through link crawling, which means:
- New recipes may take weeks to get indexed instead of hours
- Deep pages (recipes with few inbound links) may never be discovered
- No `<lastmod>` signals means crawlers re-fetch unchanged pages unnecessarily

### Action Plan

#### Step 1: Create `apps/web/public/robots.txt`

```
# robots.txt for BrewForm
User-agent: *
Allow: /

# Disallow authenticated/private areas
Disallow: /settings
Disallow: /admin
Disallow: /onboarding
Disallow: /setups
Disallow: /beans
Disallow: /equipment

# Sitemap location
Sitemap: https://brewform.cc/api/v1/sitemap.xml
```

**Notes:**
- `/settings`, `/admin`, `/onboarding`, `/setups`, `/beans`, `/equipment` are all behind `<RequireAuth>` per `apps/web/src/router.tsx:53-113` -- no point indexing them.
- The `Sitemap:` directive must be an absolute URL per the sitemap protocol specification.
- The sitemap URL points to the API because it requires database access to list recipes dynamically.

#### Step 2: Create sitemap route (`apps/api/src/routes/sitemap.ts`)

```ts
// apps/api/src/routes/sitemap.ts
import { Hono } from 'hono';
import { db } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
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
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

sitemap.get('/', async (c) => {
  const baseUrl = config.PUBLIC_APP_URL || config.APP_URL;

  // Fetch all public, non-deleted recipes
  const publicRecipes = await db
    .select({
      slug: recipes.slug,
      updatedAt: recipes.updatedAt,
    })
    .from(recipes)
    .where(
      and(eq(recipes.visibility, 'public'), isNull(recipes.deletedAt)),
    )
    .orderBy(desc(recipes.updatedAt));

  // Fetch all non-deleted users with at least one public, non-deleted recipe
  // (no point indexing users with zero public content)
  const activeUsers = await db
    .selectDistinct({
      username: users.username,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .innerJoin(recipes, eq(recipes.authorId, users.id))
    .where(
      and(eq(recipes.visibility, 'public'), isNull(recipes.deletedAt)),
    );

  // Static pages
  const staticPages = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/recipes', priority: '0.9', changefreq: 'daily' },
    { path: '/taste-notes', priority: '0.6', changefreq: 'weekly' },
    { path: '/privacy', priority: '0.3', changefreq: 'monthly' },
    { path: '/terms', priority: '0.3', changefreq: 'monthly' },
  ];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  // Static pages
  for (const page of staticPages) {
    xml += `
  <url>
    <loc>${escapeXml(baseUrl)}${escapeXml(page.path)}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  }

  // Recipe pages
  for (const recipe of publicRecipes) {
    xml += `
  <url>
    <loc>${escapeXml(baseUrl)}/recipes/${escapeXml(recipe.slug)}</loc>
    <lastmod>${toW3CDate(recipe.updatedAt)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  // User profile pages
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
```

**Design notes:**
- Returns `application/xml` content type, not `text/xml`, per best practices.
- Includes `Cache-Control: max-age=3600` (1 hour) to avoid hitting the database on every crawler request. Sitemap data does not need to be real-time.
- The `visibility='public'` AND `isNull(recipes.deletedAt)` filters ensure only publicly visible, non-deleted recipes appear. Defense-in-depth: even if a delete-handler bug leaves visibility='public' on a soft-deleted recipe, it won't leak into the sitemap.
- User profiles are included only if the user has at least one public recipe, preventing indexing of empty profile pages.
- `toW3CDate()` outputs `YYYY-MM-DD` format which is the recommended `<lastmod>` format per the sitemap protocol.

#### Step 3: Register the sitemap route in `apps/api/src/routes/index.ts`

```ts
// Add import at top of apps/api/src/routes/index.ts:
import sitemap from './sitemap.ts';

// Add route registration after the health route (line 36):
routes.route('/api/v1/sitemap.xml', sitemap);
```

This mounts the sitemap at `/api/v1/sitemap.xml` matching the `Sitemap:` directive in `robots.txt`.

#### Step 4: Write tests for sitemap route

Create `apps/api/src/routes/sitemap.test.ts`:

```ts
// apps/api/src/routes/sitemap.test.ts
import '../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import sitemap from './sitemap.ts';

describe('Sitemap Route', () => {
  const app = new Hono();
  app.route('/api/v1/sitemap.xml', sitemap);

  it('returns valid XML with correct content type', async () => {
    const res = await app.request('/api/v1/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');

    const body = await res.text();
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(body).toContain('</urlset>');
  });

  it('includes static pages', async () => {
    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).toContain('/recipes</loc>');
    expect(body).toContain('/taste-notes</loc>');
    expect(body).toContain('/privacy</loc>');
    expect(body).toContain('/terms</loc>');
  });

  it('sets cache-control header', async () => {
    const res = await app.request('/api/v1/sitemap.xml');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
  });

  it('does not include authenticated-only paths', async () => {
    const res = await app.request('/api/v1/sitemap.xml');
    const body = await res.text();
    expect(body).not.toContain('/settings');
    expect(body).not.toContain('/admin');
    expect(body).not.toContain('/onboarding');
  });
});
```

### Checklist

- [ ] Create `apps/web/public/robots.txt`
- [ ] Create `apps/api/src/routes/sitemap.ts`
- [ ] Register sitemap route in `apps/api/src/routes/index.ts`
- [ ] Write `apps/api/src/routes/sitemap.test.ts`
- [ ] Verify `robots.txt` is served at `https://brewform.cc/robots.txt`
- [ ] Verify sitemap at `https://brewform.cc/api/v1/sitemap.xml` returns valid XML
- [ ] Submit sitemap URL to Google Search Console and Bing Webmaster Tools

---

## M1 -- JSON-LD Structured Data is Thin

**Severity:** Medium

### Evidence

- `apps/web/src/components/seo/JsonLd.tsx:13-25` -- The current `RecipeJsonLd` component only includes:
  - `@type: Recipe`
  - `name` (title)
  - `description`
  - `author` (Person with name only)
  - `url`
  - `datePublished`
  - `image` (optional)
- Missing fields that Schema.org recommends for Recipe and that Google's Rich Results eligibility requires:
  - `cookTime` -- `extractionTimeSeconds` in the DB (`recipeVersions.extractionTimeSeconds`, schema.ts line 230)
  - `recipeYield` -- `extractionVolumeMl` in the DB (`recipeVersions.extractionVolumeMl`, schema.ts line 231)
  - `recipeIngredient` -- can be assembled from `productName`, `groundWeightGrams`, `grindSize`, water amount
  - `recipeInstructions` -- `preparationNotes` (`recipeVersions.preparationNotes`, schema.ts line 238) + `additionalPreparations` array
  - `aggregateRating` -- exists via `model.getRecipeRatingStats(recipeId)` returning `{ avgRating, ratingCount }`
  - `keywords` -- derivable from `brewMethod`, `drinkType`, taste note names
  - `recipeCategory` -- maps to `drinkType` or `brewMethod`
- No `BreadcrumbList` JSON-LD despite `BreadcrumbNav` component being rendered on detail pages (`RecipeDetailPage.tsx:122`)

### Impact

Without complete structured data:
- Google will not show Recipe rich results (carousel, rating stars, cooking time) in search results
- The recipe will not appear in Google's recipe search filter
- Click-through rates from search are significantly lower without rich snippets
- No breadcrumb trail in search results despite the UI already showing one

### Action Plan

#### Step 1: Expand the `RecipeJsonLdProps` interface

The component needs access to more recipe data. Looking at `RecipeDetailPage.tsx:83-89`, the full recipe object is available, including `currentVersion` with all version fields and related `tasteNotes` array.

#### Step 2: Update `RecipeJsonLd` component (`apps/web/src/components/seo/JsonLd.tsx`)

```tsx
// apps/web/src/components/seo/JsonLd.tsx

interface RecipeJsonLdProps {
  title: string;
  description: string;
  slug: string;
  authorName: string;
  authorUsername?: string;
  datePublished: string;
  image?: string;
  // New fields for enriched structured data
  extractionTimeSeconds?: number | null;
  extractionVolumeMl?: number | null;
  groundWeightGrams?: number | null;
  grindSize?: string | null;
  productName?: string | null;
  brewMethod?: string | null;
  drinkType?: string | null;
  preparationNotes?: string | null;
  temperatureCelsius?: number | null;
  tasteNoteNames?: string[];
  additionalPreparations?: Array<{
    name: string;
    inputAmount: string;
    type: string;
  }>;
  avgRating?: number | null;
  ratingCount?: number;
}

/**
 * Converts seconds to ISO 8601 duration format (PT#M#S).
 * Example: 150 seconds -> "PT2M30S"
 */
function toIsoDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0 && s > 0) return `PT${m}M${s}S`;
  if (m > 0) return `PT${m}M`;
  return `PT${s}S`;
}

/**
 * Formats brew method enum value for display.
 * Example: "french_press" -> "French Press"
 */
function formatBrewMethod(method: string): string {
  return method
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function RecipeJsonLd(props: RecipeJsonLdProps) {
  const {
    title,
    description,
    slug,
    authorName,
    authorUsername,
    datePublished,
    image,
    extractionTimeSeconds,
    extractionVolumeMl,
    groundWeightGrams,
    grindSize,
    productName,
    brewMethod,
    drinkType,
    preparationNotes,
    // temperatureCelsius intentionally omitted from destructuring — kept in interface
    // and call site for future use (e.g., "Brew at 93°C" instruction step).
    tasteNoteNames,
    additionalPreparations,
    avgRating,
    ratingCount,
  } = props;

  // Build recipeIngredient array
  const ingredients: string[] = [];
  if (productName) {
    ingredients.push(productName);
  }
  if (groundWeightGrams) {
    const grindLabel = grindSize ? ` (${grindSize} grind)` : '';
    ingredients.push(`${groundWeightGrams}g ground coffee${grindLabel}`);
  }
  // NOTE: extractionVolumeMl is the OUTPUT volume (brewed coffee), NOT the input water.
  // In coffee brewing, input water > output due to grounds absorption and evaporation.
  // Since there's no separate waterVolumeMl field in the schema, we omit water from ingredients.
  // extractionVolumeMl is used only for recipeYield below.
  if (additionalPreparations?.length) {
    for (const prep of additionalPreparations) {
      ingredients.push(`${prep.inputAmount} ${prep.name} (${prep.type})`);
    }
  }

  // Build recipeInstructions
  const instructions: Array<{ '@type': string; text: string }> = [];
  if (preparationNotes) {
    // Split preparation notes by newlines into individual steps
    const steps = preparationNotes.split(/\n+/).filter((s) => s.trim());
    for (const step of steps) {
      instructions.push({
        '@type': 'HowToStep',
        text: step.trim(),
      });
    }
  }

  // Build keywords from brew method, drink type, and taste notes
  const keywords: string[] = [];
  if (brewMethod) keywords.push(formatBrewMethod(brewMethod));
  if (drinkType) keywords.push(formatBrewMethod(drinkType));
  if (tasteNoteNames?.length) keywords.push(...tasteNoteNames);
  keywords.push('coffee', 'brewing', 'recipe');

  // Main Recipe JSON-LD
  const recipeJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'Recipe',
    name: title,
    description,
    author: {
      '@type': 'Person',
      name: authorName,
      ...(authorUsername
        ? { url: `${globalThis.location.origin}/u/${authorUsername}` }
        : {}),
    },
    url: `${globalThis.location.origin}/recipes/${slug}`,
    datePublished,
    keywords: keywords.join(', '),
    recipeCategory: brewMethod ? formatBrewMethod(brewMethod) : 'Coffee',
    ...(image ? { image } : {}),
    // NOTE: Only cookTime is set (not totalTime) because we lack prepTime data
    // (grinding, heating water, etc.). Setting totalTime === cookTime would be misleading.
    ...(extractionTimeSeconds
      ? { cookTime: toIsoDuration(extractionTimeSeconds) }
      : {}),
    ...(extractionVolumeMl ? { recipeYield: `${extractionVolumeMl}ml` } : {}),
    ...(ingredients.length ? { recipeIngredient: ingredients } : {}),
    ...(instructions.length ? { recipeInstructions: instructions } : {}),
    ...(avgRating && ratingCount && ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: avgRating,
            ratingCount,
            bestRating: 10,
            worstRating: 1,
          },
        }
      : {}),
    // NOTE: temperatureCelsius is NOT included as cookingMethod.
    // schema.org's cookingMethod expects a technique category (e.g., "Pour Over", "Immersion"),
    // not a temperature. The brew method already covers the technique via recipeCategory/keywords.
    // Temperature belongs in recipeInstructions steps if relevant.
  };

  // BreadcrumbList JSON-LD
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: globalThis.location.origin,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Recipes',
        item: `${globalThis.location.origin}/recipes`,
      },
      ...(brewMethod
        ? [
            {
              '@type': 'ListItem',
              position: 3,
              name: formatBrewMethod(brewMethod),
              item: `${globalThis.location.origin}/recipes?brewMethod=${brewMethod}`,
            },
            {
              '@type': 'ListItem',
              position: 4,
              name: title,
            },
          ]
        : [
            {
              '@type': 'ListItem',
              position: 3,
              name: title,
            },
          ]),
    ],
  };

  return (
    <>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(recipeJsonLd) }}
      />
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </>
  );
}
```

#### Step 3: Update `RecipeDetailPage.tsx` to pass new props

In `apps/web/src/pages/recipes/RecipeDetailPage.tsx`, the `<RecipeJsonLd>` call (lines 103-109) needs to pass the expanded props:

```tsx
// Replace lines 103-109 of RecipeDetailPage.tsx with:
<RecipeJsonLd
  title={recipe.title}
  description={v.personalNotes?.trim() || [v.brewMethod, v.drinkType, 'recipe'].filter(Boolean).join(' ')}
  slug={recipe.slug}
  authorName={recipe.author?.displayName || recipe.author?.username || ''}
  authorUsername={recipe.author?.username}
  datePublished={recipe.createdAt.toISOString()}
  image={recipe.photos?.[0]?.url}
  extractionTimeSeconds={v.extractionTimeSeconds}
  extractionVolumeMl={v.extractionVolumeMl}
  groundWeightGrams={v.groundWeightGrams}
  grindSize={v.grindSize}
  productName={v.productName}
  brewMethod={v.brewMethod}
  drinkType={v.drinkType}
  preparationNotes={v.preparationNotes}
  temperatureCelsius={v.temperatureCelsius}
  tasteNoteNames={tasteNotes
    .map((tn: { tasteNote?: { name: string } | null }) => tn.tasteNote?.name)
    .filter((n): n is string => Boolean(n))}
  additionalPreparations={v.additionalPreparations}
  avgRating={recipe.avgRating}
  ratingCount={recipe.ratingCount}
/>
```

**Note:** `avgRating` and `ratingCount` need to be fetched. The API already has `model.getRecipeRatingStats(recipeId)` (at `apps/api/src/modules/recipe/model.ts:272-283`). If the recipe detail API endpoint does not currently include these fields in its response, they should be added to the recipe GET controller response.

#### Step 4: Write tests for JsonLd component

Create `apps/web/src/components/seo/JsonLd.test.tsx`:

```tsx
// apps/web/src/components/seo/JsonLd.test.tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RecipeJsonLd } from './JsonLd.tsx';

describe('RecipeJsonLd', () => {
  const baseProps = {
    title: 'V60 Ethiopian',
    description: 'A bright pour-over',
    slug: 'v60-ethiopian',
    authorName: 'Barista',
    datePublished: '2025-01-15T00:00:00Z',
  };

  it('renders basic Recipe schema', () => {
    const { container } = render(<RecipeJsonLd {...baseProps} />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    // Should have Recipe + BreadcrumbList
    expect(scripts.length).toBe(2);

    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe['@type']).toBe('Recipe');
    expect(recipe.name).toBe('V60 Ethiopian');
    expect(recipe.author.name).toBe('Barista');
  });

  it('includes cookTime (but NOT totalTime) when extractionTimeSeconds provided', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} extractionTimeSeconds={150} />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.cookTime).toBe('PT2M30S');
    // totalTime is intentionally omitted -- we lack prepTime data (grinding, heating water)
    expect(recipe.totalTime).toBeUndefined();
  });

  it('includes recipeYield from extractionVolumeMl', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} extractionVolumeMl={36} />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.recipeYield).toBe('36ml');
  });

  it('builds recipeIngredient from coffee data', () => {
    const { container } = render(
      <RecipeJsonLd
        {...baseProps}
        productName="Ethiopian Yirgacheffe"
        groundWeightGrams={18}
        grindSize="fine"
        extractionVolumeMl={250}
      />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.recipeIngredient).toContain('Ethiopian Yirgacheffe');
    expect(recipe.recipeIngredient).toContain('18g ground coffee (fine grind)');
    // extractionVolumeMl is OUTPUT volume, not input water -- so it should NOT appear in ingredients
    expect(recipe.recipeIngredient).not.toContain('250ml water');
    // But it SHOULD appear as recipeYield
    expect(recipe.recipeYield).toBe('250ml');
  });

  it('includes aggregateRating when available', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} avgRating={8.5} ratingCount={12} />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.aggregateRating['@type']).toBe('AggregateRating');
    expect(recipe.aggregateRating.ratingValue).toBe(8.5);
    expect(recipe.aggregateRating.ratingCount).toBe(12);
    expect(recipe.aggregateRating.bestRating).toBe(10);
  });

  it('renders BreadcrumbList JSON-LD', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} brewMethod="v60" />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const breadcrumb = JSON.parse(scripts[1].textContent || '');
    expect(breadcrumb['@type']).toBe('BreadcrumbList');
    expect(breadcrumb.itemListElement.length).toBe(4);
    expect(breadcrumb.itemListElement[0].name).toBe('Home');
    expect(breadcrumb.itemListElement[1].name).toBe('Recipes');
  });

  it('includes keywords from brew method, drink type, and taste notes', () => {
    const { container } = render(
      <RecipeJsonLd
        {...baseProps}
        brewMethod="v60"
        drinkType="pour_over"
        tasteNoteNames={['Chocolate', 'Berry']}
      />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.keywords).toContain('V60');
    expect(recipe.keywords).toContain('Pour Over');
    expect(recipe.keywords).toContain('Chocolate');
    expect(recipe.keywords).toContain('Berry');
  });

  it('omits aggregateRating when ratingCount is zero', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} avgRating={null} ratingCount={0} />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.aggregateRating).toBeUndefined();
  });
});
```

### Checklist

- [ ] Update `RecipeJsonLdProps` interface with all new fields
- [ ] Implement `toIsoDuration()` and `formatBrewMethod()` helpers
- [ ] Add `recipeIngredient` assembly logic
- [ ] Add `recipeInstructions` from `preparationNotes`
- [ ] Add `aggregateRating` conditional block (bestRating: 10, worstRating: 1 per DB schema)
- [ ] Add `keywords` generation from brew method, drink type, taste notes
- [ ] Add `BreadcrumbList` JSON-LD output
- [ ] Update `RecipeDetailPage.tsx` to pass all new props to `RecipeJsonLd`
- [ ] Ensure recipe detail API includes `avgRating` and `ratingCount` in response
- [ ] Write `apps/web/src/components/seo/JsonLd.test.tsx`
- [ ] Validate output with [Google Rich Results Test](https://search.google.com/test/rich-results)
- [ ] Validate output with [Schema.org Validator](https://validator.schema.org/)

---

## Dependencies & Integration Notes

### Cross-issue dependencies

```
C1 (crawler middleware) --> no dependencies, can be implemented first
H2 (robots.txt + sitemap) --> no dependencies, parallel with C1
M1 (enriched JSON-LD) --> may need recipe API to include avgRating/ratingCount
```

All three issues can be developed in parallel. The only potential blocker is M1's `aggregateRating` field -- verify whether the recipe detail API response already includes `avgRating` and `ratingCount`. If not, add a call to `getRecipeRatingStats()` in the recipe detail controller.

### Existing infrastructure to leverage

| What | Where | Used by |
|------|-------|---------|
| `getRecipeMeta(slug)` | `apps/api/src/modules/recipe/service.ts:418-435` | C1 crawler middleware |
| `escapeHtml()` / `escapeHtmlAttr()` | `packages/shared/src/utils/html.ts` | C1 crawler middleware |
| `OG_TEMPLATE` pattern | `apps/api/src/routes/share.ts:14-47` | C1 reference implementation |
| `deps` testability pattern | `apps/api/src/routes/share.ts:9` | C1 test mocking |
| `getRecipeRatingStats()` | `apps/api/src/modules/recipe/model.ts:272-283` | M1 aggregateRating |
| `BreadcrumbNav` component | `apps/web/src/components/recipe/BreadcrumbNav.tsx` | M1 BreadcrumbList schema mirrors this UI |

### File changes summary

| File | Action | Issue |
|------|--------|-------|
| `apps/api/src/middleware/crawler.ts` | **Create** | C1 |
| `apps/api/src/middleware/crawler.test.ts` | **Create** | C1 |
| `apps/api/src/main.ts` | **Modify** -- add import + middleware registration | C1 |
| `apps/web/index.html` | **Modify** -- add meta tags | C1 |
| `apps/web/public/og-default.png` | **Create** -- design asset | C1 |
| `apps/web/public/robots.txt` | **Create** | H2 |
| `apps/api/src/routes/sitemap.ts` | **Create** | H2 |
| `apps/api/src/routes/sitemap.test.ts` | **Create** | H2 |
| `apps/api/src/routes/index.ts` | **Modify** -- add sitemap import + route | H2 |
| `apps/web/src/components/seo/JsonLd.tsx` | **Modify** -- full rewrite | M1 |
| `apps/web/src/components/seo/JsonLd.test.tsx` | **Create** | M1 |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | **Modify** -- update RecipeJsonLd props | M1 |

### Implementation order (recommended)

1. **C1** -- Crawler middleware (highest impact, most urgent)
2. **H2** -- robots.txt + sitemap (quick win, independent)
3. **M1** -- Enriched JSON-LD (depends on understanding recipe API response shape)

### Validation checklist

- [ ] `curl -H "User-Agent: Twitterbot/1.0" https://brewform.cc/recipes/<slug>` returns full OG tags
- [ ] `curl https://brewform.cc/robots.txt` returns valid robots.txt with Sitemap directive
- [ ] `curl https://brewform.cc/api/v1/sitemap.xml` returns valid XML sitemap with recipe URLs
- [ ] Share a recipe URL on Twitter/X and verify preview card shows title, description, and image
- [ ] Share a recipe URL on Discord and verify embed renders correctly
- [ ] [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) shows correct OG tags
- [ ] [Google Rich Results Test](https://search.google.com/test/rich-results) shows Recipe and BreadcrumbList as eligible
- [ ] [Schema.org Validator](https://validator.schema.org/) reports no errors on recipe pages
- [ ] Normal browser requests to `/recipes/:slug` still serve the SPA (no regression)
- [ ] All new tests pass: `deno test apps/api/src/middleware/crawler.test.ts`
- [ ] All new tests pass: `deno test apps/api/src/routes/sitemap.test.ts`
- [ ] All existing tests still pass: `deno task test`
