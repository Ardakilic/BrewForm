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

### Additional plan-alignment passes (post post-review-todo)

| Item | Status | Notes |
|------|--------|-------|
| OpenAPI URL alignment (§6.9) | completed | Moved spec from `/openapi.json` to `/api/v1/openapi.json`. Added `/api/v1/docs` HTML viewer (Scalar via CDN). Both gated by `OPENAPI_ENABLED`. |
| Social-event email notifications (gap H2, §3.5/§3.16) | completed | New `apps/api/src/utils/notify/index.ts` reads `UserPreferences` flags (`newFollower`, `recipeLiked`, `recipeCommented`, `followedUserPosted`) and renders MJML templates. Wired into `follow.followUser`, `recipe.toggleLike` (only on new like, not on un-like), `comment.createComment` (skips self-author), and `recipe.createRecipe` (fan-out to followers when visibility=public). All sends are fire-and-forget; failures are logged but never block the social action. |
| Notification templates | completed | New `new-follower.mjml`, `recipe-liked.mjml`, `recipe-commented.mjml`, `followed-user-posted.mjml` matching the existing welcome/reset palette. |

## Decisions

- **Task 1 (EmojiTag)**: chose shared-side rename. Rationale: lower blast radius (no DB migration, zero data risk). DB already used `nauseated`.
- **Task 2 (OpenAPI)**: kept existing `zValidator` middleware in place rather than replacing every site with `hono-openapi`'s `validator`. `describeRoute` is independent and yields a non-empty `paths` map without touching all 17 modules. Added `@hono/standard-validator@^0.1.5` because `hono-openapi` peer-depends on it at runtime. Smoke test (`apps/api/src/routes/openapi.test.ts`) verifies the integration end-to-end without needing a running DB.
- **Task 3 (thumbnails)**: chose Option B (client-side canvas resize). Rationale: avoids dragging a WASM image library into the Deno runtime; keeps server-side hot path slim. Backend retains `saveThumbnail()` so it can fall back to the original URL when no thumbnail is supplied (e.g. non-browser clients).
- **Task 4 (QR not-available)**: chose the frontend-redirect approach (heuristic via `?from=qr`) rather than server-side redirect. Cleaner separation; the QR module's responsibility ends at URL generation. Detail page redirects when (a) lookup fails or (b) the recipe is no longer public.
- **Task 6 (AdditionalPreparationType)**: chose Option A (wire enum to `type`). Rationale: spec-correct, DB had no rows for this table (verified with `\dt` showing empty schema before the migration). `preparationType` left as `String` since it represents a free-form sub-method (e.g. "steamed", "frothed").
- **Task 7 (i18n)**: kept namespace structure stable (`admin.*`, `settings.*`, etc.); only added keys, did not rename existing ones.
- **OpenAPI URL move**: chose to relocate to `/api/v1/openapi.json` (per §6.9) rather than keep the alias at root. The old `/openapi.json` is removed; clients must use the versioned path.
- **Notifications transport**: kept `nodemailer` directly in the `notify` utility instead of refactoring `auth/email.ts` into a shared transport. Two reasons: (1) avoids touching the auth module's stable surface; (2) the notify path needs the recipient's preference row, which the auth flows don't. Both modules share the same SMTP config.
- **Notification trigger points**: deliberately limited to *creation* events — new follow, new like (not unlike), new comment (not author's own), new public recipe (not visibility flips on update). Visibility-flip notifications are deferred to keep the surface tight.

## Verification log

After all changes (post-review-todo + plan-alignment pass):

```
make fmt-check  → Checked 239 files (PASS)
make lint       → Checked 224 files (PASS)
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
  - `apps/api/src/routes/openapi.ts` (rewrite, mounted under `/api/v1/`)
  - `apps/api/src/routes/openapi.test.ts` (new)
  - `apps/api/src/routes/index.ts`, `routes/health.ts`
  - `apps/api/src/modules/auth/index.ts`
  - `apps/api/src/modules/recipe/index.ts`, `recipe/service.ts`
  - `apps/api/src/modules/admin/index.ts`
  - `apps/api/src/modules/photo/{index,service}.ts`
  - `apps/api/src/modules/qrcode/service.ts`
  - `apps/api/src/modules/follow/service.ts`
  - `apps/api/src/modules/comment/service.ts`
  - `apps/api/src/utils/upload/index.ts`
  - `apps/api/src/utils/notify/index.ts` (new)
  - `apps/api/src/templates/email/{new-follower,recipe-liked,recipe-commented,followed-user-posted}.mjml` (new)
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

A second pass against `brewform-plan.md` and the per-phase plans surfaced two additional discrepancies, both addressed:

- **OpenAPI URL** — moved to the `/api/v1/openapi.json` path the plan §6.9 specifies, with the optional `/api/v1/docs` viewer added.
- **Gap H2 (email notifications)** — implemented for the four social events the plan calls out (follow, like, comment, new public recipe by followee). Each delivery is preference-gated and fire-and-forget so it never blocks the originating action.

`make fmt-check`, `make lint`, `make check`, `make test` all pass after all changes (45/45 suites, 316 steps).

### Items intentionally deferred

- **Gap M5 (refresh tokens in HTTP-only cookies)** — current implementation uses localStorage; switching transports requires SameSite/CORS reconfiguration and frontend-wide changes. Plan tags this as MEDIUM with "consider"; left for a future security pass.
- **Gap M6 (popular/trending recipe caching in Deno KV)** — performance optimization, not a correctness gap. The `CacheProvider` is in place; populating a popular-recipes cache is a small follow-up.
- **Visibility-flip notifications on update** — only *creation* fires the followers fan-out today. Adding flip detection in `updateRecipe` is straightforward but kept out to limit blast radius.
