# SEO

This document describes BrewForm's client-side SEO strategy: how pages signal their canonical URL
to search engines, which pages are excluded from indexing, and how the `SEOHead` component works.

---

## SEOHead Component

**Location:** `apps/web/src/components/seo/SEOHead.tsx`

`SEOHead` is a React component that manages `<head>` metadata imperatively via `useEffect`. It
accepts the following props:

| Prop          | Type      | Default                        | Description                                                                 |
| ------------- | --------- | ------------------------------ | --------------------------------------------------------------------------- |
| `title`       | `string`  | `'BrewForm — Coffee Brewing…'` | Page title. Rendered as `{title} \| BrewForm` in `document.title`.          |
| `description` | `string`  | App default description        | Used for `<meta name="description">` and `og:description`.                  |
| `image`       | `string`  | `/og-default.png`              | Used for `og:image`.                                                        |
| `url`         | `string`  | `location.href`                | Used for `og:url`.                                                          |
| `type`        | `string`  | `'website'`                    | Used for `og:type`.                                                         |
| `noIndex`     | `boolean` | `false`                        | When `true`, inserts `<meta name="robots" content="noindex, nofollow">`.    |
| `canonical`   | `string`  | —                              | When provided, inserts/updates `<link rel="canonical" href="...">`.         |

All tags are managed idempotently: re-rendering with different props updates the existing elements
rather than appending duplicates.

---

## Canonical URLs

A **canonical URL** tells search engines which URL is the authoritative version of a page when the
same content is accessible at multiple URLs. BrewForm uses canonical links to prevent duplicate
content penalties.

### Recipe Detail Page (`/recipes/:slug`)

The recipe detail page is the primary indexable URL for a recipe. It sets:

```tsx
<SEOHead
  title={recipe.title}
  canonical={`${location.origin}/recipes/${recipe.slug}`}
/>
```

- **Canonical:** `https://brewform.app/recipes/:slug`
- **Robots:** not set — page is indexed normally

### Focus Mode Page (`/recipes/:slug/focus`)

The focus mode page renders the same recipe content in a distraction-free layout. Because it
duplicates the recipe detail page's content, it must not be indexed independently. It sets:

```tsx
<SEOHead
  title={recipe.title}
  noIndex
  canonical={`${location.origin}/recipes/${recipe.slug}`}
/>
```

- **Canonical:** `https://brewform.app/recipes/:slug` — points back to the recipe detail page
- **Robots:** `noindex, nofollow` — excluded from search engine indexes

This combination tells crawlers: "the content here is a duplicate; the real page is at `/recipes/:slug`."

---

## Why noindex + canonical?

Using both together is intentional and recommended:

- `noindex` prevents the focus mode URL from appearing in search results directly.
- `canonical` ensures any link equity accidentally accumulated by the focus mode URL is attributed
  to the recipe detail page.

Using only `canonical` without `noindex` would still allow the focus mode page to appear in search
results if a crawler chose to ignore the canonical hint. Using both provides belt-and-suspenders
protection.

---

## Print View Page (`/recipes/:slug/print`)

The print view page opens in a new tab and is intended for browser printing only. It should also
carry `noIndex` and a canonical pointing to `/recipes/:slug` if a `SEOHead` is added to it in the
future.

---

## Adding SEO to New Pages

1. Import `SEOHead` from `../../components/seo/SEOHead`.
2. Render it at the top of the page's JSX return.
3. For pages that duplicate content from another URL, pass `noIndex` and `canonical`.
4. For primary indexable pages, pass only `canonical` (no `noIndex`).

```tsx
// Primary page — indexed, canonical set
<SEOHead title='My Page' canonical={`${location.origin}/my-page`} />

// Duplicate/utility page — not indexed, canonical points to primary
<SEOHead title='My Page — Utility View' noIndex canonical={`${location.origin}/my-page`} />
```
