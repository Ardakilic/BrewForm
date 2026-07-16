# F31 — Embeddable Recipe Widgets

> **Validation status (2026-07-13): ✅ Valid**
>
> - Verified. `share.ts` serves `GET /:slug` mounted at `/share` (`routes/index.ts:41`, cited :40), returns `RECIPE_NOT_FOUND_HTML` unless `visibility === 'public'`, exports `OG_TEMPLATE`, and uses `escapeHtml`/`escapeHtmlAttr` + `config.PUBLIC_APP_URL || config.APP_URL`. `getRecipeMeta` returns exactly the documented shape (`recipe/service.ts:625-644`).
> - Recipe route order confirmed: catch-all `/:slugOrId` at `recipe/index.ts:300` — register `/:slug/embed` before it. The `oembed` route is net-new (absent from `routes/index.ts`). Visibility values `draft|private|unlisted|public` (`constants/visibility.ts`).
> - `ShareSection` matches: props `{ slug, title, visibility }`, returns `null` for `private`/`draft`, `copyState` pattern, QR via `/api/v1/qrcode/recipe/:slug.svg`, 4 social buttons (`ShareSection.tsx`). `getApiOrigin()` is not yet exported from `client.ts` — the plan's proposal to add it is correct (the client resolves `runtimeConfig.apiUrl → VITE_API_URL → /api/v1`, `client.ts:12-14`).

## Summary

Let public recipes be embedded anywhere on the web: `GET /api/v1/recipes/:slug/embed` returns a small, self-contained, sanitized HTML recipe card designed for an `<iframe>`; `GET /api/v1/oembed` implements the oEmbed provider protocol so platforms (WordPress, Notion, Discourse, etc.) auto-unfurl BrewForm links; and `ShareSection` gains a "Copy embed code" button. Public-visibility recipes only. Backlinks from embeds are an SEO channel.

## Motivation

Coffee content lives on blogs, forums, and newsletters. Today sharing a BrewForm recipe outside the app is a bare link (plus the OG preview page). A proper embed card keeps the recipe's key parameters readable in-place, carries attribution and a canonical backlink, and makes BrewForm the system of record for recipes quoted elsewhere.

## Current state (verified)

- Server-rendered share page already exists: `apps/api/src/routes/share.ts` serves `GET /share/:slug` (mounted in `apps/api/src/routes/index.ts:40`) — an OG/Twitter meta page that returns `RECIPE_NOT_FOUND_HTML` (404) unless `meta.visibility === 'public'`, built from `getRecipeMeta(slug)`.
- `getRecipeMeta` (`apps/api/src/modules/recipe/service.ts:625-644`) returns `{ id, title, slug, author, visibility, likeCount, commentCount, createdAt, productName, brewMethod, photoUrl }` — most of what a card needs; brew parameters (dose, time, temperature, ratio) would come from the same `findBySlug` result's latest version.
- HTML escaping helpers `escapeHtml` / `escapeHtmlAttr` from `@brewform/shared/utils` are already used by share.ts; base URL via `config.PUBLIC_APP_URL || config.APP_URL`.
- Recipe module route order (`apps/api/src/modules/recipe/index.ts`): GET `/`, `/starred`, `/meta/:slug`, `/:slug/versions`, then the **`/:slugOrId` catch-all at line 301**. New literal GET routes must be registered before it.
- `ShareSection` (`apps/web/src/components/recipe/ShareSection.tsx`): props `{ slug, title, visibility }`; returns `null` for `private`/`draft`; has copy-URL (clipboard + 3s state), QR download (`/api/v1/qrcode/recipe/:slug.svg`), and 4 social buttons. Visibility values are `draft | private | unlisted | public` (`packages/shared/src/constants/visibility.ts`).
- Caddy: neither `apps/web/Caddyfile` (SPA on `:80`) nor the root `Caddyfile` (`:8080`) sets `X-Frame-Options` or `Content-Security-Policy` today — nothing currently blocks framing, but the embed route must set its own explicit policy so a future hardening pass can't break it silently.

## Proposed design

### DB schema

**None.** Embeds are a read-only projection of existing recipe data.

### API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/recipes/:slug/embed` | None | Self-contained HTML card (`text/html`), public recipes only |
| `GET` | `/api/v1/oembed` | None | oEmbed provider (JSON, `type: "rich"`) |

**Embed card** — new handler in `apps/api/src/modules/recipe/index.ts`, registered **before** the `/:slugOrId` catch-all (line 301), next to `/:slug/versions`:

- Service: `getRecipeEmbedData(slug)` in `recipe/service.ts` — reuses `model.findBySlug`, throws `RECIPE_NOT_FOUND`; returns meta + latest-version brew parameters (`brewMethod`, `groundWeightGrams`, `extractionTimeSeconds`, `temperatureCelsius`, `brewRatio`, `rating`).
- Template: `EMBED_TEMPLATE` exported from a small `apps/api/src/routes/embed-template.ts` (mirroring `OG_TEMPLATE` in `share.ts`): inline CSS only, no scripts, no external requests except the recipe photo (same origin), every interpolation through `escapeHtml`/`escapeHtmlAttr`. Footer: "View on BrewForm →" anchor with `target="_top"` and `rel="noopener"` to `${baseUrl}/recipes/{slug}` — the SEO backlink.
- Non-public (`draft`/`private`/`unlisted` — unlisted excluded deliberately, matching share.ts's public-only rule) or missing recipe → 404 HTML (reuse `RECIPE_NOT_FOUND_HTML` pattern).
- Response headers set **on this route only**:
  - `Content-Security-Policy: frame-ancestors *; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'` — explicitly allow framing while locking the document down.
  - No `X-Frame-Options` (it cannot express "allow all"; CSP `frame-ancestors` supersedes it).
  - `Cache-Control: public, max-age=300` — embeds are hot, anonymous, and tolerate 5-minute staleness.

**oEmbed** — new `apps/api/src/routes/oembed.ts` mounted in `apps/api/src/routes/index.ts` as `routes.route('/api/v1/oembed', oembed);`:

```ts
// zValidator('query', OEmbedQuerySchema) with zodValidationHook
export const OEmbedQuerySchema = z.object({
  url: z.string().url(),                       // must match ${appBaseUrl()}/recipes/:slug
  format: z.enum(['json']).default('json'),    // xml unsupported → 501 per spec
  maxwidth: z.coerce.number().int().positive().optional(),
  maxheight: z.coerce.number().int().positive().optional(),
});
```

Response (plain `c.json`, since oEmbed consumers expect the bare spec object, not the `{ success, data }` envelope — same precedent as share.ts returning raw HTML):

```json
{
  "version": "1.0", "type": "rich",
  "provider_name": "BrewForm", "provider_url": "https://brewform.cc",
  "title": "…", "author_name": "…", "author_url": "…/u/…",
  "html": "<iframe src=\"…/api/v1/recipes/{slug}/embed\" width=\"480\" height=\"320\" style=\"border:0;border-radius:12px;overflow:hidden\" title=\"…\" loading=\"lazy\"></iframe>",
  "width": 480, "height": 320,
  "thumbnail_url": "…"
}
```

URL parsing: extract slug only from paths matching `/recipes/:slug` on our own origin; anything else → 404 (`NOT_FOUND` envelope). Non-public recipe → 404 (never leak existence).

**Discovery**: add `<link rel="alternate" type="application/json+oembed" …>` to the share page template (`OG_TEMPLATE` in `apps/api/src/routes/share.ts`) and to `SEOHead` on `RecipeDetailPage` for public recipes.

### Frontend

- `ShareSection.tsx` (`apps/web/src/components/recipe/ShareSection.tsx`): add a "Copy embed code" button beside "Copy URL", reusing the existing `copyState` pattern (separate state for the second button). Copies:

```html
<iframe src="{API origin}/api/v1/recipes/{slug}/embed" width="480" height="320"
  style="border:0;border-radius:12px" title="{title} — BrewForm recipe" loading="lazy"></iframe>
```

  The API origin comes from the same resolution the `api` client uses (`apps/web/src/api/client.ts`: runtime config → `VITE_API_URL` → same-origin) — export a small `getApiOrigin()` from the client rather than duplicating the logic. Component already returns `null` for `private`/`draft`; additionally hide the embed button for `unlisted` (embed endpoint is public-only).
- No loader changes — `ShareSection` already receives `slug`/`title`/`visibility` from `RecipeDetailPage`'s loader data.

### Deployment / security notes (Caddy)

- The SPA Caddyfiles (`apps/web/Caddyfile`, root `Caddyfile`) currently set no frame-related headers. If a hardening pass later adds `X-Frame-Options: DENY` or a CSP to the **web** app, embeds are unaffected (they are served by the **API**, which sets its own per-route CSP above). Document in the Caddyfile comment that `/api/v1/recipes/*/embed` must remain frameable if a reverse proxy ever adds global headers in front of the API.
- Embed page contains zero scripts and no cookies-dependent content; it is safe cross-origin. `credentials` are irrelevant (route is unauthenticated).

### i18n & logging

- Web keys: `recipe.share.copyEmbed`, `recipe.share.embedCopied` in `packages/shared/src/i18n/en.json` / `tr.json`.
- Embed HTML itself stays English-only (static template like share.ts/OG); parameter labels are short and mostly numeric-symbolic (`g`, `°C`, `s`).
- API: `createLogger('embed')` in the oEmbed route and embed handler (D26) — log `{ slug }` at debug on render, `{ url }` at info for rejected oEmbed URLs.

## Test plan

- `apps/api/src/routes/oembed.test.ts`: valid public recipe URL → spec-shaped JSON with iframe html; foreign-origin URL → 404; non-public recipe → 404; `format=xml` → 501; maxwidth clamps returned width.
- Recipe module `index.test.ts` (extend): `/:slug/embed` returns `text/html` with `frame-ancestors *` CSP and `Cache-Control`; draft/private/unlisted → 404; output contains escaped title (fixture with `<script>` in title must render escaped); backlink present with `target="_top"`.
- Template unit test (pattern: share.ts exports `OG_TEMPLATE` for testing): `EMBED_TEMPLATE` escapes every field, no `<script>` tags in output.
- Web: `ShareSection.test.tsx` (extend): embed button copies iframe snippet, shows copied state, hidden for `unlisted`/`private`/`draft`.

## Acceptance criteria

- [ ] `GET /api/v1/recipes/:slug/embed` renders a script-free, fully escaped HTML card for public recipes; 404 otherwise
- [ ] Route registered before the `/:slugOrId` catch-all; oEmbed mounted via `routes.route(...)` in `apps/api/src/routes/index.ts`
- [ ] Embed route sets `frame-ancestors *` CSP + cache headers; no `X-Frame-Options`
- [ ] oEmbed endpoint spec-compliant (`version`, `type: rich`, `html`, provider fields) and rejects foreign URLs
- [ ] oEmbed discovery `<link>` on share page and recipe detail SEO head
- [ ] "Copy embed code" in ShareSection with i18n'd labels (en + tr)
- [ ] Card includes canonical backlink to the recipe page
- [ ] `make check && make lint && make test` pass

## Effort

**M** (3 days): embed template + handler, oEmbed route + URL validation, ShareSection button, header/security review, tests.

## Priority

**Medium** — growth/SEO play; independent of F27–F30, can ship anytime after review of the CSP notes.

## Dependencies

- `getRecipeMeta` / `findBySlug` in the recipe module (verified)
- `escapeHtml` / `escapeHtmlAttr` (`@brewform/shared/utils`); `config.PUBLIC_APP_URL`
- Existing share route precedent (`apps/api/src/routes/share.ts`) for non-envelope HTML responses
- `ShareSection` component and recipe detail loader data
