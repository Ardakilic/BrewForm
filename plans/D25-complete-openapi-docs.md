# D25 — Complete OpenAPI Documentation for All Route Modules

**Severity:** Low
**Status:** Open (validated & expanded 2026-06-13)
**Files:** `apps/api/src/modules/*/index.ts` (15 undocumented modules), `apps/api/src/routes/{share,sitemap,openapi}.ts`, `packages/shared/src/schemas/*` (new output schemas), docs.

---

## Issue Description

Only 4 of 20 mounted route groups carry `describeRoute()` metadata from `hono-openapi`.
Verified against the codebase on 2026-06-13.

### Documented today

| Route group | File | `describeRoute` | Notes |
|-------------|------|-----------------|-------|
| auth | `modules/auth/index.ts` | Yes | 9 routes |
| recipe | `modules/recipe/index.ts` | Yes | 14 routes |
| admin | `modules/admin/index.ts` | Yes | ~50 routes |
| health | `routes/health.ts` | Yes | liveness/readiness |

### Undocumented (this work)

| Module | File | Base path | Actual route count |
|--------|------|-----------|--------------------|
| bean | `modules/bean/index.ts` | `/api/v1/beans` | 5 |
| badge | `modules/badge/index.ts` | `/api/v1/badges` | 3 |
| coffee-variety | `modules/coffee-variety/index.ts` | `/api/v1/coffee-varieties` | 7 |
| comment | `modules/comment/index.ts` | `/api/v1/comments` | 3 |
| contact | `modules/contact/index.ts` | `/api/v1/contact` | 1 |
| equipment | `modules/equipment/index.ts` | `/api/v1/equipment` | 8 |
| follow | `modules/follow/index.ts` | `/api/v1/follow` | 5 |
| photo | `modules/photo/index.ts` | `/api/v1/photos` | 3 |
| preference | `modules/preference/index.ts` | `/api/v1/preferences` | 2 |
| qrcode | `modules/qrcode/index.ts` | `/api/v1/qrcode` | 1 |
| report | `modules/report/index.ts` | `/api/v1/reports` | 3 |
| setup | `modules/setup/index.ts` | `/api/v1/setups` | 6 |
| taste | `modules/taste/index.ts` | `/api/v1/taste-notes` | 6 |
| user | `modules/user/index.ts` | `/api/v1/users` | 4 |
| vendor | `modules/vendor/index.ts` | `/api/v1/vendors` | 6 |
| share | `routes/share.ts` | `/share` | 1 (HTML) |
| sitemap | `routes/sitemap.ts` | `/api/v1/sitemap.xml` | 1 (XML) |

**~63 JSON routes across the 15 modules + 2 non-JSON routes (share, sitemap).**

> The original plan listed approximate counts that did not match the code
> (e.g. taste 3→6, vendor 4→6, setup 5→6, coffee-variety 6→7, comment 5→3,
> contact 2→1, qrcode 2→1, follow 4→5, user 5→4) and omitted `share`/`sitemap`.

---

## Impact

- **Incomplete API docs:** the majority of endpoints are missing from `/api/v1/openapi.json`.
- **Developer experience:** consumers cannot discover or test these endpoints in the Scalar UI at `/api/v1/docs`.
- **Client generation:** auto-generated clients miss most endpoints and have no typed request/response bodies.
- **Stale documentation:** `docs/requirements-audit-report.md` §6.9 incorrectly claims `describeRoute` is on "all endpoints"; `docs/decisions.md` ADR-012 and `docs/architecture.md` reference only auth/recipe/admin/health.

---

## Root Cause

OpenAPI annotations were added to auth, recipe, admin, and health during initial
development (ADR-012). Remaining modules were added later without `describeRoute()`.

---

## Architectural Constraints (must hold)

1. **ADR-012 — keep `@hono/zod-validator`.** Do **not** replace `zValidator(...)`
   with `hono-openapi`'s `validator`. Request validation stays exactly as-is;
   OpenAPI metadata is added purely through `describeRoute()` + `resolver()`.
   This preserves the shape of `c.req.valid(...)` and the lint footprint.
2. **`hono-openapi` v1.3.0, Zod v4.** `resolver(zodSchema)` converts a Zod schema
   to an OpenAPI schema object for **responses**. `jsonRequestBody(zodSchema)` (from
   `apps/api/src/utils/openapi/index.ts`) converts a Zod schema to a JSON Schema object
   for **request bodies** via `z.toJSONSchema` — because `hono-openapi` v1.3.0's `resolver()`
   only processes response schemas. Confirmed pattern:
   ```ts
   import { describeRoute, resolver } from 'hono-openapi';
   import { jsonRequestBody } from '../../utils/openapi/index.ts';
   route.post(
     '/',
     describeRoute({
       tags: ['Beans'],
       summary: '...',
       security: [{ bearerAuth: [] }],
       requestBody: jsonRequestBody(BeanCreateSchema),
       responses: {
         201: {
           description: 'Bean created',
           content: { 'application/json': { schema: resolver(successEnvelope(BeanOutputSchema)) } },
         },
         401: {
           description: 'Unauthorized',
           content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
         },
       },
     }),
     authMiddleware,
     zValidator('json', BeanCreateSchema), // unchanged
     handler,
   );
   ```
3. **Tags must be registered.** `routes/openapi.ts` declares only 5 tags today
   (Auth, Recipes, Users, Admin, Health). Every new tag must be added to that
   `tags` array with a description, or modules render ungrouped/undescribed.
4. **Schema-from-request is preferred over duplication.** Reuse the existing
   shared input schemas (`*CreateSchema`, `*UpdateSchema`, `*FilterSchema`,
   `PaginationSchema`) for request bodies / query params via `resolver()`.

---

## Scope (confirmed with stakeholder)

- **A) Coverage:** ALL mounted routes — the 15 modules **plus** `share` and
  `sitemap`. Re-verify the mounted list in `routes/index.ts` so nothing new is
  missed.
- **B) Depth: full ("go deeper").** Document request bodies, query params, path
  params, **and** response bodies with concrete schemas via `resolver()`.
- **C) Response payloads: full entity output schemas (Option 2).** Author output
  schemas for every entity returned by the API and embed them in typed response
  envelopes. No generic `data` placeholders.
- **D) Testing:** add an automated spec-coverage test that introspects the real
  app (no manual `curl`).

---

## Response Envelope Schemas (new, shared)

The API uses two envelopes (`apps/api/src/utils/response/index.ts`):

```jsonc
// success
{ "success": true, "data": <T | T[]>, "meta": { "requestId": "..", "pagination?": {..} } }
// error
{ "success": false, "error": { "code": "..", "message": "..", "details?": [..], "requestId": ".." } }
```

Create reusable Zod schemas (location: `packages/shared/src/schemas/response.ts`)
that mirror these exactly:

- `ErrorEnvelopeSchema` — `{ success: false, error: { code, message, details?, requestId } }`
- `PaginationMetaSchema` — `{ page, perPage, total, totalPages }` (match `@brewform/shared/types`).
- `successEnvelope(dataSchema)` — helper returning `{ success: true, data: dataSchema, meta: { requestId } }`.
- `paginatedEnvelope(itemSchema)` — `{ success: true, data: itemSchema[], meta: { requestId, pagination } }`.

These must stay consistent with the runtime `success`/`paginated`/`error` helpers;
add a unit test that asserts a sample runtime response validates against the schema.

---

## Entity Output Schemas (new, shared)

> **Critical:** API responses are **not** raw Drizzle rows. Services return joined
> and computed fields (author objects, equipment lists, taste notes, like/favourite
> counts, `isLiked`/`isFavourited` flags, version data, etc.). Output schemas MUST
> match the **actual service return shape**, derived by reading each `service.ts`
> return type — not by copying table columns.

`drizzle-zod` is **not** currently a dependency. Two acceptable approaches
(implementer to pick, document choice in the spec/ADR):
- Hand-author output schemas in `packages/shared/src/schemas/responses/` (no new dep), OR
- Add `drizzle-zod` to derive base select schemas, then `.extend()` with computed
  fields (reduces drift, adds a dependency — requires sign-off).

Entities needing output schemas (from `packages/db/src/schema.ts`, main entities):
`user` (public + self variants), `recipe` (+ list/detail/meta/version variants),
`bean`, `equipment`, `vendor`, `coffeeVariety`, `tasteNote` (+ hierarchy node),
`comment`, `photo`, `setup`, `badge` (+ userBadge), `report`, `userPreferences`,
`follow` (follower/following list item), `equipmentDeleteRequest`, admin
aggregate/leaderboard/time-series payloads (reuse where recipe/admin already
return shapes), `qrcode` (binary/data-URL response).

Every output schema gets a co-located unit test asserting a representative
service payload parses successfully.

---

## Non-JSON Routes

- **`share` (`GET /share/:slug`)** returns `text/html` (OG redirect page) or a 404
  HTML page. Document with `responses: { 200: { content: { 'text/html': {} } }, 404: { content: { 'text/html': {} } } }` and a `slug` path param. Tag: `Share`.
- **`sitemap` (`GET /api/v1/sitemap.xml`)** returns `application/xml`. Document with
  `responses: { 200: { content: { 'application/xml': {} } } }`. Tag: `Sitemap`.
- **`qrcode` (`GET /api/v1/qrcode/recipe/:filename`)** returns a binary image. Document with
  `responses: { 200: { content: { 'image/png': { schema: { type: 'string', format: 'binary' } }, 'image/svg+xml': { schema: { type: 'string', format: 'binary' } } } } }` and a `filename` path param. The 403/404 error responses remain JSON envelopes (returned by the `error()` helper). Do not wrap the 200 success response in a JSON envelope. Tag: `QR Codes`.

---

## Tag Registry (to add in `routes/openapi.ts`)

Existing: Auth, Recipes, Users, Admin, Health.
Add: Beans, Badges, Coffee Varieties, Comments, Contact, Equipment, Follow,
Photos, Preferences, QR Codes, Reports, Setups, Taste Notes, Vendors, Share, Sitemap.
(`Users` already exists — reuse it for the `user` module.)

---

## Implementation Steps

1. **Re-verify inventory** from `routes/index.ts`; confirm no module is missed.
2. **Add response envelope + entity output schemas** in `@brewform/shared/schemas`,
   each derived from the real service return shape, each with a unit test.
3. **Register new tags** in `routes/openapi.ts`.
4. **Per module:** import `describeRoute`/`resolver`, add metadata to every route —
   `tags`, `summary`, `description`, `security` (where auth-guarded), `requestBody`
   (reuse input schema), parameters (path/query), and typed `responses` (success +
   error envelopes). Leave all `zValidator(...)` calls untouched.
5. **Annotate `share` and `sitemap`** with correct non-JSON content types.
6. **Update stale docs:** `docs/requirements-audit-report.md` §6.9,
   `docs/decisions.md` ADR-012, `docs/architecture.md`.
7. **Add automated coverage test** (see below).
8. `make check-api` (type-check), `make lint`, `make test` — all pass.

---

## Testing Strategy

### Automated spec-coverage test (new) — replaces manual `curl`

Build the **real** router and introspect the generated spec. Feasibility verified:
`postgres-js` connects lazily and the cache singleton defaults to in-memory, so
importing `routes/index.ts` does not require a live DB/KV (tests already set
`DATABASE_URL`, `JWT_SECRET`, `CACHE_DRIVER=memory`, `APP_ENV=test`).

File: `apps/api/src/routes/openapi.coverage.test.ts` (extends existing
`openapi.test.ts` smoke test, which stays as-is).

Assertions:
| Check | Expected |
|-------|----------|
| Spec `paths` includes every base path | all 17 new groups present |
| Each documented operation has ≥1 `tags` entry | no untagged operations |
| Every tag used by an operation is declared in the top-level `tags` array | no orphan tags |
| Representative routes expose `requestBody`/`responses` content schemas | `resolver` output present |
| Existing auth/recipe/admin/health operations | unchanged |

### Schema unit tests (new)

| Test | Expected |
|------|----------|
| Each entity output schema parses a representative service payload | passes |
| `ErrorEnvelopeSchema` parses a real `error()` response | passes |
| `paginatedEnvelope(...)` parses a real `paginated()` response | passes |

### Manual smoke (optional, dev only)

`curl http://localhost:8000/api/v1/openapi.json | jq '.paths | keys | length'`
should reflect the full endpoint count; `/api/v1/docs` shows all tags.

---

## Risk Assessment

**Risk: Low–Medium** (raised from original "Low" due to Option 2 scope).

- `describeRoute`/`resolver` add metadata only — no runtime behaviour change to handlers.
- `zValidator` is untouched, so request validation behaviour is unchanged (ADR-012 preserved).
- **Main risk: output-schema drift.** Output schemas are hand-derived from service
  return shapes and can diverge from reality. Mitigated by per-schema unit tests
  against representative payloads and the coverage test.
- New shared schemas are additive; no existing schema is modified.
- Can be delivered incrementally per module after the shared schemas land.

---

## Dependencies

- Shared output/envelope schemas must land **before** module annotation (step 2 → step 4).
- Tag registration (step 3) is independent.
- Optional: `drizzle-zod` (only if the derive-from-table approach is chosen — needs sign-off).
