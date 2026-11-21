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
and a print stylesheet (`@media print` in `globals.css`) hides the interactive parts.

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

`GET /api/v1/sitemap.xml` (`apps/api/src/routes/sitemap.ts`) returns
`application/xml` listing:

- the static pages `/`, `/recipes`, `/taste-notes`, `/privacy` and `/terms`;
- every non-deleted **public** recipe (`/recipes/:slug`, with `lastmod`), selected with
  `listableRecipeCondition(null)`, so unlisted, private and draft recipes never appear;
- the profile (`/u/:username`) of every user who authors at least one public recipe.

URLs use the API's `PUBLIC_APP_URL` (falling back to `APP_URL`). The rendered XML is cached for 24
hours through the injected `CacheProvider`.

### robots.txt

The web app serves `robots.txt` from two sources that must agree (guarded by
`apps/web/src/robots.test.ts`):

- `apps/web/public/robots.txt`, served by the Vite dev server, with a relative
  `Sitemap: /api/v1/sitemap.xml`;
- the `build-robots-txt` plugin in `apps/web/vite.config.ts`, which emits the production file with
  `Sitemap: ${VITE_PUBLIC_APP_URL}/api/v1/sitemap.xml`.

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
  Caddy reverse-proxies `/api/*`, `/uploads/*`, `/share/*` and `/health` to the API. So
  `${VITE_PUBLIC_APP_URL}/share/:slug` serves the OG page and the sitemap is reachable at
  `${VITE_PUBLIC_APP_URL}/api/v1/sitemap.xml`. `/recipes/*` is not proxied: it is the SPA, whose
  `index.html` carries only the site-wide default OG tags.
- **Split domains** (`API_UPSTREAM` unset, e.g. Coolify): the web container serves static files
  only, and the share page and the sitemap live on the API host (`https://<api-host>/share/:slug`,
  `https://<api-host>/api/v1/sitemap.xml`). The `Sitemap:` line still names the web origin, where
  `/api/v1/sitemap.xml` falls back to the SPA, so on this topology submit the API-host sitemap URL
  to search consoles or enable same-origin mode (`API_UPSTREAM`).

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
