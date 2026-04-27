# BrewForm — Implementation Validation Report

**Date**: 2026-04-27
**Scope**: All 12 phases of the BrewForm implementation, cross-referenced against
`/.opencode/plans/state.md`, `/.opencode/plans/gap-analysis.md`,
`/.opencode/plans/implementation-master-prompt.md`, and the per-phase plan files.

---

## Phase 1: Infrastructure & Scaffolding
**Status**: PASS
**Issues**: None of substance.

- All root config files present and valid (`package.json` with `packageManager: npm@10.9.7`,
  `deno.json` without import maps, `turbo.json`, `.env.example`, `Dockerfile`,
  `docker-compose.yml`, `Makefile`).
- Multi-stage Dockerfile (Deno 2.7.13 + Node 22) is correct.
- `docker-compose.yml` includes app, postgres, mailpit, pgadmin.
- `apps/api`, `apps/web`, `packages/shared`, `packages/db` scaffolded.
- `files/scaa-2.json` (~129 KB) present.

---

## Phase 2: Database Schema
**Status**: PARTIAL
**Issues**:

- Schema has **24 models** (correct) and **11 enums** (validation list expects 12;
  `state.md` claimed 13). Actual enums: `Visibility`, `BrewMethod`, `DrinkType`,
  `EquipmentType`, `EmojiTag`, `BadgeRule`, `UnitSystem`, `TemperatureUnit`, `Theme`,
  `DateFormat`, `AdditionalPreparationType`.
- `RecipeAdditionalPreparation.type` and `.preparationType` are stored as `String`
  rather than the existing `AdditionalPreparationType` enum — the enum is defined
  but unused.
- `EmojiTag` enum value is `nauseated`, but the shared package and Zod schemas use
  `sick` — see Phase 3 critical issue.
- All entities have soft-delete (`deletedAt`), all IDs are UUID strings, no
  `@db.Uuid` / `@db.JsonB`. Migration directory and `seed.cjs` exist. Equipment has
  `createdBy` FK plus all 5 Setup reverse relations. `Report` model present.

---

## Phase 3: Shared Package
**Status**: PARTIAL
**Issues**:

- ❗ **Critical: EmojiTag value mismatch with DB.** The DB enum uses `nauseated`
  (`schema.prisma:69`), but `packages/shared/src/types/recipe.ts:28`,
  `packages/shared/src/schemas/recipe.ts:32`, and
  `packages/shared/src/constants/emoji-tags.ts:7` all use `sick`. Any attempt to
  persist `emojiTag: 'sick'` will fail at the Prisma layer. Fix by aligning either
  side and adding a Prisma migration if the DB is changed.
- `RecipeCreateObjectSchema` is defined in `recipe.ts` but **not exported** from
  the schema or barrel. The validation prompt requires it to be exported separately
  so frontend code can call `.partial()` if needed; today only `RecipeUpdateSchema`
  benefits internally.
- i18n files have **142 keys** (en + tr); validation prompt expected ~170+. Likely
  cosmetic but below target.
- All other type/schema/constant/util files exist; `computeExtractionYield`,
  `generateSlug`, `ensureUniqueSlug`, `validateSoftWarnings` (with 7 checks — beats
  the "4 additional" minimum). Brew method rules has 30 entries. `EMOJI_TAGS` uses
  `{key, emoji, label}` shape with `EmojiTagKey`. Barrel re-exports omit `.ts`
  extensions.

---

## Phase 4: Backend Core
**Status**: PARTIAL
**Issues**:

- ❗ **Gap C3 (OpenAPI) only superficially implemented.**
  `apps/api/src/routes/openapi.ts` returns a hard-coded stub spec with `paths: {}`.
  There is no `hono-openapi` integration, no Zod-to-OpenAPI conversion, and no
  per-route documentation. Listed as completed in `state.md`, but is effectively
  non-functional.
- ❗ **Gap C7 (Photo thumbnails) not implemented.**
  `apps/api/src/utils/upload/index.ts:generateThumbnail()` throws
  `Error('Thumbnail generation not yet implemented…')` with a comment saying it is
  deferred.
- All other Phase-4 items present: env config (Zod-validated), Pino logger w/
  secret redaction, `CacheProvider` interface + `DenoKVCacheProvider`/
  `InMemoryCacheProvider`, `ContentfulStatusCode`-typed response helpers, QR
  generator, upload validators, `registerJob/startJobs/stopJobs`, all middleware
  (cors, requestId, errorHandler, auth/optionalAuth/admin, rateLimit), health/ready
  endpoints, `setup.ts` admin bootstrap. Hono variables (`requestId`, `cache`,
  `userId`, `user`) declared. `@prisma/client` versions aligned at `^6.19.3`.

---

## Phase 5: Authentication
**Status**: PASS

- JWT module uses `hono/jwt` (sign/verify/decode), HS256, with
  `AccessPayload`/`RefreshPayload` discriminated by `type`. `parseExpiry` supports
  `s/m/h/d`.
- `model.ts` provides all required user/password-reset functions. `service.ts`
  implements `register`, `login`, `refreshAccessToken`, `requestPasswordReset`,
  `confirmPasswordReset`, `getAuthenticatedUser`. `email.ts` renders MJML via
  nodemailer (SMTP from env, skipped in test). `welcome.mjml` and
  `reset-password.mjml` present. `mjml.d.ts` declared. `auth.ts` middleware
  enforces `payload.type === 'access'`.

---

## Phase 6: Backend Domain Modules
**Status**: PASS

- All 16 modules present (user, recipe, equipment, bean, vendor, taste, photo,
  comment, follow, badge, setup, preference, search, qrcode, report, admin) each
  with `model.ts`, `service.ts`, `index.ts`.
- Recipe module includes like/favourite/feature toggles (gaps C1, H3) and
  `/meta/:slug` (gap H6).
- Comment service enforces OP-only reply (gap M7) — checks `recipeAuthorId === userId`
  for any reply.
- Badge module's `precision_brewer` evaluates that all six brewing fields are
  non-null on every version (gap H1).
- Report module exists (gap C5). Routes mounted at `/api/v1/*` in `routes/index.ts`.
  Each sub-router uses `Hono<AppEnv>`.

---

## Phase 7: Admin Module
**Status**: PASS

- All admin routes present with `authMiddleware + adminMiddleware`: analytics
  (stats, users/recipes growth, top-recipes/users), user CRUD including create
  (gap H4) + ban + admin role + delete, recipe visibility/delete, full
  equipment/vendor/taste-notes CRUD with cache flush on taste-notes, report
  list/resolve/dismiss (gap C5), brew-method compatibility CRUD with cache
  invalidation, audit-log list, cache-flush. `service.ts` writes `AuditLog` entries
  on every mutation.

---

## Phase 8: Frontend Foundation
**Status**: PASS

- `globals.css` defines `:root` (light), `.dark`, `.coffee` themes with CSS custom
  properties and a `@theme` block.
- `api/client.ts` with token management, auto-refresh on 401, `ApiError`,
  `get/post/patch/put/delete/upload`.
- `AuthContext`, `ThemeContext`, `I18nContext` (gap H8 `useTranslation`) all
  present. `App.tsx` nests Theme → I18n → Auth → RouterProvider.
- Layout/Navbar/Footer/CookieConsent present. router uses `createBrowserRouter`.
  All four auth pages, `HomePage`, `NotFoundPage` exist. tsconfig has
  `"module": "ESNext"`. Imports omit `.ts/.tsx` extensions.

---

## Phase 9: Frontend Features
**Status**: PARTIAL
**Issues**:

- ❗ **Gap M3 (QR "not available" page) not in router.** `state.md` claims the
  route was added, but `router.tsx` has no path for it and `grep` finds no
  `not-available` page component anywhere under `apps/web/src/`. Public-only QR
  codes that target non-public recipes will silently 404 to the generic
  `NotFoundPage`.
- All other Phase-9 items present: `RequireAuth` (with `requireAdmin`), `SEOHead` +
  `JsonLd.tsx` (with `RecipeJsonLd` for gap M4), `ErrorPage` exporting
  `NotFoundPage`/`ServerErrorPage`/`ForbiddenPage`, `TasteAutocomplete`, all 7
  recipe pages, `LikeButton`/`FavouriteButton`/`CommentSection`/`FollowButton`,
  `PhotoUpload`, `RecipeQRCode`, `PrintButton` + `FocusModeButton` (in same file),
  `UserProfilePage`, `OnboardingWizard`, `SettingsPage`, `SearchPage`, Setup/Bean/
  Equipment list pages, all 11 admin pages, Privacy/Terms pages, `TasteNotesPage`.
  `globals.css` has `@media print` and `.focus-mode` rules.

---

## Phase 10: Testing
**Status**: PASS

- `make test` ran successfully: **44 passed, 315 steps, 0 failed**.
- Test files counted: 35 on disk (state.md says 44; the discrepancy is in *files*,
  not *test suites* — the runner counted 44 logical suites). All required suites
  are present: shared utils (conversion, metrics, validation, date, slug), shared
  schemas (auth, equipment, recipe, user), API utils (cache, response, qrcode,
  env, logger), API middleware (cors, errorHandler), API modules (auth/jwt,
  auth/service, taste/service, taste/model, user, recipe, equipment, comment,
  follow, badge, setup, preference, search, qrcode, photo, bean, vendor, admin),
  API health route. Tests use `jsr:@std/...` specifiers; `--unstable-sloppy-imports
  --no-check` flags used.

---

## Phase 11: CI/CD & Deployment
**Status**: PASS

- `.github/workflows/ci.yml` has quality, test (with postgres service +
  migrations + seed), deploy-backend (denoland/deployctl@v1, OIDC),
  deploy-frontend (GitHub Pages) jobs.
- `.github/workflows/pr.yml` has format/lint/check + shared unit tests.
- `vite.config.ts` injects `VITE_API_URL` at build time.
- `apps/web/public/404.html` SPA redirect, `index.html` restore script,
  `_redirects` Netlify fallback all present.
- `deno.json` paths `["apps/", "packages/"]` with proper excludes and lint-rule
  exclusions. `packageManager: npm@10.9.7`. `make check` uses
  `--unstable-sloppy-imports`.

---

## Phase 12: Documentation
**Status**: PASS

- `README.md` (162 lines) with features, tech stack, quick-start, dev commands,
  architecture, project structure.
- `docs/api.md` (483 lines), `auth.md` (109), `recipes.md` (128),
  `taste-notes.md` (94), `deployment.md` (129), `architecture.md` (178). Total
  ≈ 1,121 lines of docs.
- JSDoc on key modules (`main.ts`, `env.ts`, `cache/index.ts`, `response/index.ts`,
  `auth.ts` middleware, `jwt.ts`, `routes/index.ts`, shared `index.ts`) confirmed.

---

## Cross-Cutting Verification

| Check | Result |
|---|---|
| `make fmt-check` | **PASS** (235 files) |
| `make lint` | **PASS** (221 files) |
| `make check` | **PASS** (deno check on `apps/api/src/main.ts` clean) |
| `make test` | **PASS** (44/44 suites, 315 steps) |
| No import maps in `deno.json` | **PASS** |
| No `@db.Uuid` / `@db.JsonB` / raw SQL / `mode: 'insensitive'` | **PASS** |
| Frontend has zero `@brewform/db` imports | **PASS** |
| Barrel files have no `.ts` extensions | **PASS** |
| No `workspace:*` protocol (uses `*`) | **PASS** |
| Services import only from model files | **PASS** (only `equipment/model.ts` imports `Prisma` type — model layer is allowed) |

---

## Summary

| Metric | Count |
|---|---|
| Total phases | 12 |
| **PASS** | 8 (Phases 1, 5, 6, 7, 8, 10, 11, 12) |
| **PARTIAL** | 4 (Phases 2, 3, 4, 9) |
| **FAIL** | 0 |

### Critical Issues (must fix before production)

1. **EmojiTag DB/shared mismatch** — `schema.prisma` uses `nauseated`; shared
   types/schemas/constants use `sick`. Will cause runtime Prisma rejection on any
   save with `emojiTag: 'sick'`. Fix by aligning either side and adding a Prisma
   migration.
2. **OpenAPI spec is a stub (gap C3)** — `apps/api/src/routes/openapi.ts` returns
   `paths: {}` and there is no `hono-openapi` integration with the Zod schemas.
   The env flag `OPENAPI_ENABLED` is wired but the implementation is inert.
3. **Photo thumbnail generation not implemented (gap C7)** —
   `generateThumbnail()` in `apps/api/src/utils/upload/index.ts` throws "not yet
   implemented". The `Photo.thumbnailUrl` column will never be populated
   server-side.
4. **QR "not available" route missing (gap M3)** — Router has no fallback page
   for public-only QR scans of private/draft recipes; falls through to the
   catch-all `NotFoundPage`.

### Lower-priority issues

- 11 enums present vs. 12+ claimed; `AdditionalPreparationType` enum exists but
  is unused (`type` and `preparationType` stored as `String`).
- `RecipeCreateObjectSchema` defined but not exported.
- i18n key count is 142 (~170+ expected).
- All checks (`fmt-check`, `lint`, `check`, `test`) pass — the codebase compiles
  and runs cleanly.
