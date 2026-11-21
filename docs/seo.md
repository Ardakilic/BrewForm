# SEO

This document describes how BrewForm presents itself to search engines and link-preview crawlers:
the `SEOHead` component, canonical URLs, which pages are never indexed, the sitemap and robots
rules, and the share/Open Graph pages.

`${VITE_PUBLIC_APP_URL}` below stands for the public origin of the web app. The SPA builds its URLs
from `location.origin`, which is that origin in production. The web image bakes
`VITE_PUBLIC_APP_URL` in at build time and the container's runtime `PUBLIC_APP_URL` can override it
(see [Sitemap and robots](#sitemap-and-robots)). The API builds absolute URLs from its own
`PUBLIC_APP_URL` (falling back to `APP_URL`).

---

## SEOHead Component

**Location:** `apps/web/src/components/seo/SEOHead.tsx`

`SEOHead` renders nothing and syncs `<head>` metadata in a `useEffect`. It accepts the following
props:

| Prop          | Type      | Default                        | Description                                                                 |
| ------------- | --------- | ------------------------------ | --------------------------------------------------------------------------- |
| `title`       | `string`  | `'BrewForm — Coffee Brewing…'` | Page title. Rendered as `{title} \| BrewForm` in `document.title`.          |
| `description` | `string`  | App default description        | Used for `<meta name="description">` and `og:description`.                  |
| `image`       | `string`  | `/og-default.png`              | Used for `og:image`.                                                        |
| `url`         | `string`  | `location.href`                | Used for `og:url`.                                                          |
| `type`        | `string`  | `'website'`                    | Used for `og:type`.                                                         |
| `noIndex`     | `boolean` | `false`                        | When `true`, inserts `<meta name="robots" content="noindex, nofollow">`; when `false`, removes it. |
| `canonical`   | `string`  | —                              | When provided, inserts/updates `<link rel="canonical" href="...">`; when absent, removes it. |

All tags are managed idempotently: re-rendering with different props updates the existing elements
rather than appending duplicates.

`RecipeJsonLd` (`apps/web/src/components/seo/JsonLd.tsx`) adds the schema.org `Recipe` and
`BreadcrumbList` JSON-LD for a recipe.

---

## Canonical URLs

A **canonical URL** tells search engines which URL is the authoritative version of a page when the
same content is accessible at multiple URLs.

### Recipe Detail Page (`/recipes/:slug`)

The detail page of a **public** recipe is its one indexable URL. It sets:

```tsx
<SEOHead
  title={recipe.title}
  url={recipeUrl}
  noIndex={!isPublic}
  canonical={isPublic ? recipeUrl : undefined}
/>
```

- **Canonical:** `${VITE_PUBLIC_APP_URL}/recipes/:slug`
- **Robots:** not set; the page is indexed normally
- **JSON-LD:** `RecipeJsonLd` is rendered

### Focus Mode Page (`/recipes/:slug/focus`)

The focus mode page renders the same recipe in a distraction-free layout. Because it duplicates the
detail page, it is never indexed on its own:

```tsx
<SEOHead title={recipe.title} noIndex canonical={`${location.origin}/recipes/${slug}`} />
```

- **Canonical:** `${VITE_PUBLIC_APP_URL}/recipes/:slug`, pointing back to the detail page
- **Robots:** `noindex, nofollow`

### Why noindex + canonical?

- `noindex` keeps the focus mode URL out of search results.
- `canonical` attributes any link equity the focus mode URL picks up to the detail page.

### Printing

There is no separate print route. The detail page's Print button calls the browser's print dialog,
and a print stylesheet (`@media print` in `globals.css`) hides only elements marked with the
`print-hidden` class: the site chrome (navbar, footer, breadcrumb, banners, toasts) and the real
controls (the action buttons, the sidebar, the comments, "Brew again"). Content that renders as
buttons or links, such as the equipment items and the taste chips, still prints
(`apps/web/src/styles/print-rules.test.ts`).

---

## Pages that are never indexed

Non-public content must not reach search results (capability `recipe-visibility`):

| Page | Robots | Canonical | JSON-LD |
| --- | --- | --- | --- |
| Recipe detail, visibility `public` | indexed | yes | yes |
| Recipe detail, `unlisted`, `private` or `draft` (seen by the author or a link holder) | `noindex, nofollow` | none | none |
| Version history (`/recipes/:slug/versions`) | always `noindex, nofollow` | none | none |
| Version diff (`/recipes/:slug/versions/diff`) | always `noindex, nofollow` | none | none |
| Compare (`/recipes/compare/:slug1/:slug2`) | always `noindex, nofollow` | none | none |
| Focus mode, fork, "recipe not available", error pages | always `noindex, nofollow` | focus mode only | none |
| Collection detail (`/collections/:id`) | `noindex, nofollow` unless the collection is `public` | none | none |

Versions, diff and compare pages are always noindex because they are derived views and their
payloads carry no visibility.

Googlebot renders the SPA, so the robots meta covers it. The API adds a header for the JSON and HTML
it serves itself: `X-Robots-Tag: noindex, nofollow` (`ROBOTS_TAG_HEADER` / `NOINDEX_NOFOLLOW`
in `apps/api/src/utils/response`) is sent

- by `noIndexUnlessPublic(c, visibility)` on the non-public recipe detail
  (`GET /api/v1/recipes/:slugOrId`), its versions and version-diff responses, and the non-public
  collection detail (`GET /api/v1/collections/:id`);
- on every `/share/:slug` 404;
- on every crawler-middleware fall-through for a recipe path (missing, non-public, or a failed
  lookup).

Missing and non-public items get the same status, body and header, so the header is no existence
oracle.

---

## Sitemap and robots

### Sitemap

`GET /sitemap.xml` (`apps/api/src/routes/sitemap.ts`) is a [sitemaps.org](https://www.sitemaps.org/protocol.html)
**sitemap index**. Without a query it lists one entry per sitemap page, each served by the same
route with `?part=…&page=…`:

| Part | Page URL | Lists |
|---|---|---|
| `static` | `/sitemap.xml?part=static` | the static pages `/`, `/recipes`, `/taste-notes`, `/privacy` and `/terms` (always listed, a single page) |
| `recipes` | `/sitemap.xml?part=recipes&page=N` | every non-deleted **public** recipe (`/recipes/:slug`, with `lastmod`), selected with `listableRecipeCondition(null)`, so unlisted, private and draft recipes never appear |
| `users` | `/sitemap.xml?part=users&page=N` | the profile (`/u/:username`, with `lastmod`) of every live user who authors at least one public recipe; soft-deleted accounts are never listed (their public recipes stay listed) |

- **Pages of 50,000 URLs.** A sitemap file may hold at most 50,000 URLs and 50 MB, and an index at
  most 50,000 sitemaps. Each `recipes`/`users` page holds up to `SITEMAP_PAGE_SIZE` (50,000) URLs,
  read with a SQL `limit`/`offset` ordered by `createdAt`, then `id` (new rows land on the last
  page); the index lists `ceil(count / 50,000)` pages per part, from `count()` queries with the same
  conditions. A full page stays near 25 MB even with 255-character slugs. A part without rows is
  left out of the index, a page past the end answers 404 `NOT_FOUND`, and an invalid `part` or a
  `page` outside 1-50,000 answers 400 `VALIDATION_ERROR` (`SitemapQuerySchema` in
  `@brewform/shared/schemas`).
- **At the site root.** Search engines apply a sitemap only to URLs under its own directory, and
  the children of an index must sit in the index's directory or lower. The index, its pages and the
  `/recipes/…` and `/u/…` URLs they list therefore all live at the root: the API serves
  `/sitemap.xml` outside `/api/v1`, and the web edge and the Vite dev server proxy it. The old
  location, `GET /api/v1/sitemap.xml`, answers **301** to `${PUBLIC_APP_URL}/sitemap.xml`, so older
  `robots.txt` files and Search Console submissions keep working.
- **Caching.** The index and every page are cached separately for 24 hours through the injected
  `CacheProvider` (keys `sitemap:index` and `sitemap:<part>:<page>`), with one in-flight build per
  document; a 404 is not cached. Responses carry `Cache-Control: public, max-age=3600`.

URLs use the API's `PUBLIC_APP_URL` (falling back to `APP_URL`).

### robots.txt

The web app serves `robots.txt` from two sources that must agree (guarded by
`apps/web/src/robots.test.ts`, which also rejects the old `/api/v1/sitemap.xml`):

- `apps/web/public/robots.txt`, served by the Vite dev server, with a relative
  `Sitemap: /sitemap.xml`;
- the `build-robots-txt` plugin in `apps/web/vite.config.ts`, which emits the production file with
  `Sitemap: ${VITE_PUBLIC_APP_URL}/sitemap.xml`.

The rules allow everything except private areas:

```text
User-agent: *
Allow: /

Disallow: /settings
Disallow: /admin
Disallow: /onboarding
Disallow: /setups
Disallow: /beans
Allow: /equipments
Allow: /equipment/
Disallow: /equipment
```

`/equipment` is the signed-in user's own equipment list, while `/equipments` (the public catalog)
and `/equipment/:id` (equipment detail) are public. Crawlers apply the longest matching rule, so
the two `Allow` lines keep the public pages crawlable next to `Disallow: /equipment`.

At container start, `docker-web-entrypoint.sh` replaces the build-time origin with a valid runtime
`PUBLIC_APP_URL` in `robots.txt` (the `Sitemap:` line) and in `index.html` (`og:image`,
`twitter:image`), always starting from pristine copies, so no rebuild is needed to change the
domain. Only the `Sitemap:` line changes; the rules stay as built.

---

## Share and Open Graph pages

Link-preview crawlers do not run JavaScript, so per-recipe Open Graph tags come from the API, and
only for **public** recipes:

- **`GET /share/:slug`** (`apps/api/src/routes/share.ts`): server-rendered HTML with `og:*` and
  `twitter:*` tags (title, description, first photo) that redirects browsers to `/recipes/:slug`.
  A missing or non-public recipe gets the same static 404 page with `X-Robots-Tag: noindex,
  nofollow`.
- **Crawler middleware** (`apps/api/src/middleware/crawler.ts`): when a known crawler user agent
  (Twitterbot, facebookexternalhit, WhatsApp, Discordbot, Slackbot, LinkedInBot, Googlebot, bingbot,
  Pinterestbot, TelegramBot) requests `/recipes/:slug` **from the API**, it answers with OG HTML
  (canonical `/recipes/:slug`, `Cache-Control: public, max-age=300`, `Vary: User-Agent`). Any other
  case falls through to the normal handler, marked noindex for recipe paths.

How these are reached depends on the deployment topology:

- **Same-origin edge** (`API_UPSTREAM` set on the web container, the compose default): the web
  Caddy reverse-proxies `/api/*`, `/uploads/*`, `/share/*` and the exact paths `/health` and
  `/sitemap.xml` (with its query) to the API. So `${VITE_PUBLIC_APP_URL}/share/:slug` serves the OG
  page and the sitemap index is reachable at `${VITE_PUBLIC_APP_URL}/sitemap.xml`. `/recipes/*` is
  not proxied: it is the SPA, whose `index.html` carries only the site-wide default OG tags.
- **Split domains** (`API_UPSTREAM` unset, e.g. Coolify): the web container serves static files
  only, and the share page and the sitemap live on the API host (`https://<api-host>/share/:slug`,
  `https://<api-host>/sitemap.xml`). The `Sitemap:` line still names the web origin, where
  `/sitemap.xml` falls back to the SPA, and a sitemap on the API host lists URLs of another host,
  so on this topology submit the API-host sitemap URL in Search Console (for a property that covers
  the web origin) or, better, enable same-origin mode (`API_UPSTREAM`).

The share buttons on the recipe page (`ShareSection`) copy and share
`${VITE_PUBLIC_APP_URL}/recipes/:slug`; they are hidden for private and draft recipes.

---

## Adding SEO to New Pages

1. Import `SEOHead` from `components/seo/SEOHead.tsx`.
2. Render it at the top of the page's JSX return.
3. For pages that duplicate content from another URL, pass `noIndex` and `canonical`.
4. For primary indexable pages, pass only `canonical` (no `noIndex`).
5. For pages that can show non-public content, pass `noIndex` unless the item is `public`, and
   render no canonical link or JSON-LD in that case.

```tsx
// Primary page: indexed, canonical set
<SEOHead title='My Page' canonical={`${location.origin}/my-page`} />

// Duplicate/utility page: not indexed, canonical points to primary
<SEOHead title='My Page — Utility View' noIndex canonical={`${location.origin}/my-page`} />
```
