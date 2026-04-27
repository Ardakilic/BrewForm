# BrewForm — Post-Review Fix State

| Task | Status | Notes |
|------|--------|-------|
| 1. EmojiTag DB/shared alignment    | completed | Shared-side rename: `sick` → `nauseated` in types / Zod / constants. No DB migration. |
| 2. OpenAPI spec real generation    | completed | `hono-openapi` v1 + `@hono/standard-validator` wired. `describeRoute` on auth (5), recipe (11), admin analytics (5), health (2). Spec exposed via `openAPIRouteHandler` at `/openapi.json`. Smoke test added. |
| 3. Photo thumbnail generation      | completed | Client-side resize via `<canvas>` (max 600px, JPEG q=0.85) in `PhotoUpload`. Server stores both via new `saveThumbnail()` helper; `Photo.thumbnailUrl` now populated. |
| 4. QR "not available" route        | completed | New `RecipeNotAvailablePage`, route at `/recipes/unavailable`. QR service appends `?from=qr`; `RecipeDetailPage` redirects on lookup failure or non-public visibility. |
| 5. RecipeCreateObjectSchema export | completed | `export const RecipeCreateObjectSchema` + barrel re-export. |
| 6. AdditionalPreparationType enum  | completed | `type` column now uses the `AdditionalPreparationType` Postgres enum. Migration `20260427194537_use_additional_preparation_type_enum` applied; Zod tightened to `z.enum`. |
| 7. i18n key expansion              | completed | en.json / tr.json: 142 → **185 keys each** (>= 170 target). Added admin.*, settings.*, recipe.unavailable.*, error.*, common.* coverage. |

## Decisions

- **Task 1 (EmojiTag)**: chose shared-side rename. Rationale: lower blast radius (no DB migration, zero data risk). DB already used `nauseated`.
- **Task 2 (OpenAPI)**: kept existing `zValidator` middleware in place rather than replacing every site with `hono-openapi`'s `validator`. `describeRoute` is independent and yields a non-empty `paths` map without touching all 17 modules. Added `@hono/standard-validator@^0.1.5` because `hono-openapi` peer-depends on it at runtime. Smoke test (`apps/api/src/routes/openapi.test.ts`) verifies the integration end-to-end without needing a running DB.
- **Task 3 (thumbnails)**: chose Option B (client-side canvas resize). Rationale: avoids dragging a WASM image library into the Deno runtime; keeps server-side hot path slim. Backend retains `saveThumbnail()` so it can fall back to the original URL when no thumbnail is supplied (e.g. non-browser clients).
- **Task 4 (QR not-available)**: chose the frontend-redirect approach (heuristic via `?from=qr`) rather than server-side redirect. Cleaner separation; the QR module's responsibility ends at URL generation. Detail page redirects when (a) lookup fails or (b) the recipe is no longer public.
- **Task 6 (AdditionalPreparationType)**: chose Option A (wire enum to `type`). Rationale: spec-correct, DB had no rows for this table (verified with `\dt` showing empty schema before the migration). `preparationType` left as `String` since it represents a free-form sub-method (e.g. "steamed", "frothed").
- **Task 7 (i18n)**: kept namespace structure stable (`admin.*`, `settings.*`, etc.); only added keys, did not rename existing ones.

## Verification log

```
make fmt-check  → Checked 238 files (PASS)
make lint       → Checked 223 files (PASS)
make check      → Check apps/api/src/main.ts (PASS)
make test       → ok | 45 passed (316 steps) | 0 failed
```

## Files touched

- DB: `packages/db/prisma/schema.prisma`, new migration `20260427194537_use_additional_preparation_type_enum/`
- Shared:
  - `packages/shared/src/types/recipe.ts`
  - `packages/shared/src/types/additional-preparation.ts`
  - `packages/shared/src/constants/emoji-tags.ts`
  - `packages/shared/src/schemas/recipe.ts`
  - `packages/shared/src/schemas/index.ts`
  - `packages/shared/src/i18n/en.json`, `tr.json`
- API:
  - `apps/api/package.json` (added `@hono/standard-validator`)
  - `apps/api/src/routes/openapi.ts` (rewrite)
  - `apps/api/src/routes/openapi.test.ts` (new)
  - `apps/api/src/routes/index.ts`, `routes/health.ts`
  - `apps/api/src/modules/auth/index.ts`
  - `apps/api/src/modules/recipe/index.ts`
  - `apps/api/src/modules/admin/index.ts`
  - `apps/api/src/modules/photo/{index,service}.ts`
  - `apps/api/src/modules/qrcode/service.ts`
  - `apps/api/src/utils/upload/index.ts`
- Web:
  - `apps/web/src/router.tsx`
  - `apps/web/src/pages/recipes/RecipeNotAvailablePage.tsx` (new)
  - `apps/web/src/pages/recipes/RecipeDetailPage.tsx`
  - `apps/web/src/components/photos/PhotoUpload.tsx`
- Plans / state: `.opencode/plans/state.md` (count + EmojiTag note updates)

## Summary

All 7 issues from `validation-report.md` are resolved:

- **Critical** issues (EmojiTag mismatch, OpenAPI stub, thumbnail stub, QR not-available route) are functionally complete with verification.
- **Lower-priority** issues (`RecipeCreateObjectSchema` export, dead `AdditionalPreparationType` enum, i18n key gap) addressed.

`make fmt-check`, `make lint`, `make check`, `make test` all pass after the changes (45/45 suites, 316 steps).
