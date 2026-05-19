# Plan 02: SEO & Social Sharing

**Priority:** 2
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 2
**Issues:** C1 (Crawler OG Tags), H2 (robots.txt + sitemap), M1 (Rich JsonLd)
**Effort:** ~7–11 hours
**Impact:** 📢 Social sharing previews, 🔍 Search engine indexing, ⭐ Rich search results

---

## C1 — OG Meta Tags Invisible to Crawlers (Social Sharing Broken) ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/components/seo/SEOHead.tsx:21-50`](apps/web/src/components/seo/SEOHead.tsx) — All OG/twitter meta tag injection happens inside `useEffect(() => {...}, [deps])`. The component returns `null` (line 52).
- [`apps/web/src/components/seo/SEOHead.tsx:55-68`](apps/web/src/components/seo/SEOHead.tsx) — `setMeta()` uses `document.querySelector()` + `document.createElement('meta')` + `document.head.appendChild()` — all runtime DOM APIs unavailable to crawlers.
- [`apps/web/index.html:1-20`](apps/web/index.html) — Static HTML contains only `<title>BrewForm</title>`. Zero `og:title`, `og:description`, `og:image`, `twitter:card` meta tags.
- [`apps/api/src/modules/recipe/index.ts:74-99`](apps/api/src/modules/recipe/index.ts) — `GET /meta/:slug` endpoint exists and returns `{ title, slug, author, photoUrl, productName, brewMethod }` — useful data source for server-rendered meta tags.

**Impact:** Sharing any recipe URL on Twitter/X, Facebook, WhatsApp, Discord, Slack produces a blank preview card. Core social sharing feature is broken.

**Action Plan:**
1. Create `apps/api/src/middleware/crawler.ts` — middleware that:
   - Checks `User-Agent` header against known social crawlers (`Twitterbot`, `facebookexternalhit`, `WhatsApp`, `Discordbot`, `Slackbot`, `LinkedInBot`)
   - For matching requests to `/recipes/:slug`, fetches recipe meta via `getRecipeMeta(slug)`
   - Returns a minimal HTML page with pre-rendered `<meta property="og:*">` and `<meta name="twitter:*">` tags in the `<head>`
2. Register middleware in `apps/api/src/main.ts` before the SPA fallback, so crawler requests never reach the Vite SPA
3. Add missing tags to `SEOHead.tsx`: `og:site_name`, `twitter:title`, `twitter:description`, `twitter:image`
4. Add a static `<meta name="description">` fallback in `index.html` for the home page

**Estimated effort:** Medium (4-6 hours)

---

## H2 — Missing robots.txt and sitemap.xml ✅ CONFIRMED

**Evidence:**
- [`apps/web/public/`](apps/web/public/) contains only `_redirects` and `404.html`. No `robots.txt`.
- Search for `"sitemap"` across `apps/api/src/` — **zero matches**. No sitemap endpoint.

**Impact:** Search engine crawlers have no guidance on which pages to index or crawl frequency. Zero discoverability via organic search.

**Action Plan:**
1. Create `apps/web/public/robots.txt`:
   ```
   User-agent: *
   Allow: /
   Sitemap: https://brewform.app/sitemap.xml
   ```
2. Create `apps/api/src/routes/sitemap.ts` — `GET /api/v1/sitemap.xml` that dynamically lists:
   - All public recipe pages (`/recipes/:slug`) with `<lastmod>` from `updatedAt`
   - All public user profiles (`/u/:username`)
   - Static pages: `/`, `/privacy`, `/terms`, `/recipes`
3. Register the route in `apps/api/src/routes/index.ts`

**Estimated effort:** Small (2-3 hours)

---

## M1 — JsonLd Structured Data Thin, Not Validated ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/components/seo/JsonLd.tsx:15-24`](apps/web/src/components/seo/JsonLd.tsx) — Outputs only: `@type: 'Recipe'`, `name`, `description`, `author { @type: Person, name }`, `url`, `datePublished`, `image` (conditional).
- **Missing Schema.org Recipe fields:** `cookTime`/`totalTime`, `recipeYield`, `recipeIngredient`, `recipeInstructions`, `nutrition`, `aggregateRating`, `keywords`.

**Impact:** Search engines cannot surface rich recipe results (cook time, ingredients, ratings) in SERP. Competitors with rich results get higher CTR.

**Action Plan:**
1. Map coffee recipe data to Schema.org Recipe fields:
   - `cookTime` → `extractionTimeSeconds` (ISO 8601 duration)
   - `recipeYield` → `extractionVolumeMl` (e.g., "250ml")
   - `recipeIngredient` → bean name + grind size + water
   - `recipeInstructions` → recipe steps/notes
   - `aggregateRating` → `ratingCount` + `avgRating`
2. Add `@type: 'BreadcrumbList'` JSON-LD for breadcrumb navigation
3. Validate output with Google's Rich Results Test
4. Add `@type: 'Person'` for author profile (currently just `{ @type: Person, name }`)

**Estimated effort:** Small (1-2 hours)

---

## Dependencies

- C1 crawler middleware must be registered before SPA fallback in main.ts
- H2 sitemap needs API route registration in `apps/api/src/routes/index.ts`
- M1 is independent — can be done in parallel
