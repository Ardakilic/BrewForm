# Plan 02: SEO & Social Sharing

**Priority:** 2
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 2
**Issues:** C1 (Crawler OG Tags), H2 (robots.txt + sitemap), M1 (Rich JsonLd)
**Effort:** ~7–11 hours
**Impact:** 📢 Social sharing previews, 🔍 Search engine indexing, ⭐ Rich search results

---

## C1 — OG Meta Tags Invisible to Crawlers (Social Sharing Broken)

**Background:** All OG/twitter meta tags injected via `useEffect()` using DOM APIs — invisible to crawlers. Sharing any recipe URL produces a blank preview card.

### Tasks
1. **Crawler Middleware:** Create `apps/api/src/middleware/crawler.ts` that:
   - Checks `User-Agent` for social crawler signatures (`Twitterbot`, `facebookexternalhit`, etc.)
   - For matching requests to `/recipes/:slug`, fetches recipe meta via `getRecipeMeta(slug)`
   - Returns minimal HTML with pre-rendered `<meta property="og:*">` and `<meta name="twitter:*">` tags
2. Register middleware in `apps/api/src/main.ts` before SPA fallback
3. Add missing tags to `SEOHead.tsx`: `og:site_name`, `twitter:title`, `twitter:description`, `twitter:image`
4. Add static `<meta name="description">` fallback in `index.html`

---

## H2 — Missing robots.txt and sitemap.xml

**Background:** No guidance for search engine crawlers. Zero discoverability via organic search.

### Tasks
1. Create `apps/web/public/robots.txt`:
   ```
   User-agent: *
   Allow: /
   Sitemap: https://brewform.app/sitemap.xml
   ```
2. Create `apps/api/src/routes/sitemap.ts` — `GET /api/v1/sitemap.xml` that lists:
   - Public recipe pages (`/recipes/:slug`) with `<lastmod>` from `updatedAt`
   - Public user profiles (`/u/:username`)
   - Static pages: `/`, `/privacy`, `/terms`, `/recipes`
3. Register route in `apps/api/src/routes/index.ts`

---

## M1 — JsonLd Structured Data Thin, Not Validated

**Background:** Only `name`, `description`, `author`, `url`, `datePublished`, `image` — missing Schema.org Recipe fields needed for rich results.

### Tasks
1. Map coffee recipe data to Schema.org Recipe fields:
   - `cookTime` → `extractionTimeSeconds` (ISO 8601 duration)
   - `recipeYield` → `extractionVolumeMl`
   - `recipeIngredient` → bean name + grind size + water
   - `recipeInstructions` → recipe steps/notes
   - `aggregateRating` → `ratingCount` + `avgRating`
2. Add `@type: 'BreadcrumbList'` JSON-LD for breadcrumb navigation
3. Validate output with Google's Rich Results Test

---

## Dependencies

- C1 crawler middleware must be registered before SPA fallback in main.ts
- H2 sitemap needs API route registration
- M1 is independent — can be done in parallel
