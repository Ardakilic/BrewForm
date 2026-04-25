# BrewForm — Complete Gap Analysis & Fix Plan

## Gaps Found (Cross-referencing brewform-plan.md vs all phase plans)

### CRITICAL (Must fix before implementation)

| # | Gap | Source Section | Fix |
|---|-----|---------------|-----|
| C1 | **Like/Favourite toggle API endpoints missing** | S3.4 | Add like/favourite toggle routes + service + model to Phase 6 recipe module |
| C2 | **Rate limiting middleware missing** | S10.1 | Add rate-limit middleware using CacheProvider to Phase 4 |
| C3 | **OpenAPI spec routes missing** (env var exists but unused) | S6.9 | Add hono-openapi integration with Zod schemas to Phase 4 |
| C4 | **First admin setup script** referenced in Makefile but no file created | S8 | Add `apps/api/src/setup.ts` to Phase 4 or 5 |
| C5 | **Content reporting & moderation** completely missing | S10.3 | Add Report model + admin moderation endpoints to Phase 7 |
| C6 | **Analytics** (recipe views, likes over time, admin usage stats) missing | S10.4 | Add analytics endpoints to Phase 6, admin analytics to Phase 7 |
| C7 | **Photo thumbnail generation** not implemented | S2.9 | Add image resize/thumbnail logic to upload utility in Phase 4 |

### HIGH (Should fix)

| # | Gap | Source Section | Fix |
|---|-----|---------------|-----|
| H1 | **Precision Brewer badge logic** only checks count, not "all optional fields filled" | S3.13 | Update badge evaluation to check optional fields for precision_brewer rule |
| H2 | **Email notifications for social events** (follow, like, comment) missing | S3.5, S3.16 | Add notification email sending logic to Phase 6 |
| H3 | **Feature recipe on profile** — type defined but no toggle API | S3.4 | Add `PATCH /api/v1/recipes/:id/feature` endpoint |
| H4 | **Admin "create user" endpoint** missing | S8 | Add admin user creation to Phase 7 |
| H5 | **Background job mechanism** for badge evaluation & cache refresh | S3.13, S10.2 | Add simple job runner/scheduler to Phase 4 |
| H6 | **`/recipes/:slug/meta` endpoint** for social crawler OG tags | S9.5 | Add to Phase 6 recipe module |
| H7 | **Slug utility** (`slug.ts`) referenced but not in shared package exports | S13 | Already in Phase 3 plan (verified) |
| H8 | **i18n React integration** — no `useTranslation` hook defined | S13 | Add `useTranslation` hook to Phase 8 frontend foundation |

### MEDIUM (Should note for later)

| # | Gap | Source Section | Fix |
|---|-----|---------------|-----|
| M1 | **4 missing soft validations** (missing optional fields, grind size, milk for non-milk drinks, referenced entities must exist) | S5.3 | Extend `validation.ts` |
| M2 | **Extraction yield metric** not implemented | S3.12 | Add `extractionYield()` to `metrics.ts` |
| M3 | **QR "not available" page** on frontend | S3.14 | Add route in Phase 9 |
| M4 | **JSON-LD structured data** for SEO | S9.5 | Add to Phase 9 SEO components |
| M5 | **Refresh token stored in localStorage** vs HTTP-only cookie (plan recommends cookie) | S6.6 | Consider switching in Phase 8/9 |
| M6 | **Popular/trending recipe caching** in Deno KV | S10.2 | Add to Phase 6 recipe module |
| M7 | **Comment OP reply restriction** — needs explicit enforcement in service | S3.4 | Add authorization check in comment service |
| M8 | **Prisma schema indexes** need explicit specification | S12.1 | Phase 2 already has `@@index` directives (verified) |

### VERIFIED — Already Correctly Covered

- SCAA taste notes import (Phase 2 seed script has full parser)
- Brew Method Compatibility Matrix (Phase 2 seed + shared constants + Phase 7 admin)
- All Zod schemas for recipe, auth, user, equipment, etc.
- DenoKV CacheProvider with interface + concrete implementation
- Pino logger with secret redaction
- CORS, request ID, error handler middleware
- JWT auth with access + refresh tokens
- Graceful shutdown
- Response envelope helpers
- All 14 domain modules in Phase 6 with routes
- Admin CRUD with audit logging + cache flush
- Phase 2 Prisma schema is comprehensive (23 models, 13 enums, soft deletes, indexes)

## Action Items for Implementation

When implementation begins, these fixes need to be applied during the relevant phases:

### During Phase 4 (Backend Core):
- Add rate limiting middleware
- Add OpenAPI integration (hono-openapi + Zod resolver)
- Add admin setup script (`apps/api/src/setup.ts`)
- Add photo resize/thumbnail generation utility
- Add background job runner (simple scheduler)

### During Phase 5 (Auth):
- No changes needed (auth is complete per plan)

### During Phase 6 (Domain Modules):
- Add like/favourite toggle to recipe module
- Add recipe feature toggle endpoint
- Add `/recipes/:slug/meta` endpoint for OG tags
- Add analytics endpoints (view tracking)
- Add notification email sending for social events
- Add Report model + content reporting endpoint
- Enhance badge evaluation for precision_brewer rule
- Add Deno KV caching for popular/trending recipes
- Enforce OP-only reply in comment service

### During Phase 7 (Admin):
- Add admin "create user" endpoint
- Add content moderation tools
- Add admin analytics dashboard endpoints

### During Phase 8 (Frontend Foundation):
- Add `useTranslation` hook for i18n
- Consider HTTP-only cookies for refresh tokens instead of localStorage

### During Phase 9 (Frontend Features):
- Add JSON-LD structured data to SEO components
- Add QR "not available" page route

### During Phase 3 (Shared):
- Add `extractionYield()` to metrics.ts
- Extend soft validations with 4 missing checks