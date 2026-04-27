# BrewForm — Full Implementation Validator

You are validating that the BrewForm project has been correctly implemented across all 12 phases. Your job is to systematically check each phase against its plan, the gap analysis, and the actual code. Report any discrepancies, missing features, or broken contracts.

## Instructions

1. Read `/Users/arda/projects/BrewForm/.opencode/plans/state.md` to understand what was claimed as completed.
2. For each phase below, read the phase plan file, then verify the actual implementation matches.
3. Read `/Users/arda/projects/BrewForm/.opencode/plans/gap-analysis.md` and verify each gap fix was applied.
4. Read `/Users/arda/projects/BrewForm/.opencode/plans/implementation-master-prompt.md` for architectural constraints and gotchas that must be respected.
5. Run verification commands (`make check`, `make lint`, `make fmt-check`) to confirm the codebase compiles and passes all checks.
6. Produce a structured report per phase with: **PASS** (fully implemented), **PARTIAL** (mostly done but with gaps), or **FAIL** (missing or broken).

## Project Root

`/Users/arda/projects/BrewForm`

All commands must run through Docker: `docker compose run --rm app <cmd>` or `docker compose exec app <cmd>`. Use the Makefile wrappers (`make check`, `make lint`, etc.).

---

## Phase 1: Infrastructure & Scaffolding

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase1-infrastructure.md`

### Verify:
- [ ] Root config files exist and are valid: `package.json` (workspaces + turbo), `turbo.json`, `deno.json` (lint/fmt/test config, NO import maps), `.env.example`, `.gitignore`
- [ ] `Dockerfile` is multi-stage (deps → build → runner) with Deno + Node.js
- [ ] `docker-compose.yml` defines app, postgres, mailpit, pgadmin services
- [ ] `Makefile` wraps all Docker commands (install, check, lint, fmt, test, db-*, dev, up, logs, ci)
- [ ] `apps/api/` has minimal Hono entry point (`src/main.ts`)
- [ ] `apps/web/` has React + Vite + Tailwind CSS v4 + BaseUI setup (`package.json`, `vite.config.ts`, `tsconfig.json`)
- [ ] `packages/shared/` has `package.json` with `@brewform/shared` name
- [ ] `packages/db/` has `package.json` with `@brewform/db` name, Prisma init
- [ ] `files/scaa-2.json` exists (SCAA flavor wheel data)
- [ ] `deno.json` has lint/fmt include paths `["apps/", "packages/"]` and excludes `["**/node_modules/", "**/dist/", "**/generated/", "**/.prisma/"]`
- [ ] `package.json` has `"packageManager": "npm@10.9.7"`
- [ ] `deno check --unstable-sloppy-imports apps/api/src/main.ts` passes

---

## Phase 2: Database Schema (Prisma)

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase2-database.md`

### Verify:
- [ ] `packages/db/prisma/schema.prisma` has all 24 models: User, UserPreferences, Recipe, RecipeVersion, RecipeTasteNote, RecipeEquipment, RecipeAdditionalPreparation, Photo, RecipeVersionPhoto, Equipment, Bean, Vendor, TasteNote, Setup, Comment, UserFollow, UserRecipeFavourite, UserRecipeLike, Badge, UserBadge, BrewMethodEquipmentRule, AuditLog, PasswordReset, Report
- [ ] All 12 enums exist: Visibility, BrewMethod, DrinkType, EquipmentType, EmojiTag, BadgeRule, UnitSystem, TemperatureUnit, Theme, DateFormat, AdditionalPreparationType, and one more
- [ ] All main entities have `deletedAt DateTime?` for soft deletes
- [ ] All IDs use `@default(uuid())` strings (no `@db.Uuid`)
- [ ] No `@db.JsonB` or `@db.Uuid` anywhere in the schema
- [ ] EmojiTag enum uses stable keys (`fire`, `rocket`, etc.) not emoji characters
- [ ] `Equipment.createdBy` has FK relation to `User`
- [ ] `Equipment` has reverse relations for Setup (portafilter, basket, puckScreen, paperFilter, tamper)
- [ ] `Report` model exists (gap C5)
- [ ] `packages/db/prisma/seed.cjs` exists and can seed the database (`make db-seed`)
- [ ] Migration directory exists under `packages/db/prisma/migrations/`

---

## Phase 3: Shared Package

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase3-shared.md`
**Gap analysis**: Apply Phase 3 fixes from gap-analysis.md

### Verify:
- [ ] `packages/shared/src/types/` has all type files: `api.ts`, `user.ts`, `recipe.ts`, `equipment.ts`, `taste.ts`, `bean.ts`, `setup.ts`, `comment.ts`, `follow.ts`, `badge.ts`, `photo.ts`, `audit.ts`, `password-reset.ts`, `additional-preparation.ts`, `brew-method-rule.ts`
- [ ] `packages/shared/src/types/index.ts` exports all types including `Visibility`, `BrewMethod`, `DrinkType`, `EmojiTag`
- [ ] `packages/shared/src/schemas/` has: `recipe.ts`, `auth.ts`, `equipment.ts`, `user.ts`, `taste.ts`, `common.ts`, `setup.ts`, `comment.ts`, `bean.ts`, `vendor.ts`, `badge.ts`, `admin.ts`, `photo.ts`, `follow.ts`, `search.ts`
- [ ] `RecipeCreateSchema` uses stable EmojiTag keys (not emoji characters)
- [ ] `RecipeCreateObjectSchema` is exported separately from `RecipeCreateSchema` (for `.partial()` to work)
- [ ] `packages/shared/src/constants/emoji-tags.ts` uses `{ key, emoji, label }` format with `EmojiTagKey` type
- [ ] `packages/shared/src/constants/brew-method-rules.ts` has ~30 brew method/equipment compatibility rules
- [ ] `packages/shared/src/utils/slug.ts` has `generateSlug()` and `ensureUniqueSlug()`
- [ ] `packages/shared/src/utils/metrics.ts` has `computeExtractionYield()` (gap M2)
- [ ] `packages/shared/src/utils/validation.ts` has extended soft validations with 4+ additional checks (gap M1)
- [ ] `packages/shared/src/i18n/` has `en.json` and `tr.json` with ~170+ keys
- [ ] Barrel file `packages/shared/src/index.ts` has NO `.ts` extensions in re-export paths
- [ ] `packages/shared/tsconfig.json` has `"module": "ESNext"` (for import attributes)

---

## Phase 4: Backend Core (Hono)

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase4-backend-core.md`
**Gap analysis**: Apply Phase 4 fixes (C2 rate limiting, C3 OpenAPI, C4 setup script, C7 photo upload, H5 background jobs)

### Verify:
- [ ] `apps/api/src/config/env.ts` has Zod-validated env config with all required vars (`DATABASE_URL`, `JWT_SECRET`) and defaults
- [ ] `apps/api/src/utils/logger/index.ts` has Pino structured logger with secret redaction
- [ ] `apps/api/src/utils/cache/index.ts` has `CacheProvider` interface with `get`, `set`, `delete`, `deleteByPrefix`; `DenoKVCacheProvider` and `InMemoryCacheProvider` implementations
- [ ] `apps/api/src/utils/response/index.ts` uses `ContentfulStatusCode` (not `StatusCode`) for response helpers
- [ ] `apps/api/src/utils/qrcode/index.ts` has QR code generation (PNG + SVG)
- [ ] `apps/api/src/utils/upload/index.ts` has photo upload validation, filename generation
- [ ] `apps/api/src/utils/jobs/index.ts` has `registerJob()`, `startJobs()`, `stopJobs()` (gap H5)
- [ ] `apps/api/src/middleware/cors.ts`, `requestId.ts`, `errorHandler.ts` exist
- [ ] `apps/api/src/middleware/auth.ts` has `authMiddleware`, `optionalAuthMiddleware`, `adminMiddleware`
- [ ] `apps/api/src/middleware/rateLimit.ts` exists (gap C2)
- [ ] `apps/api/src/routes/health.ts` has `/health` and `/ready` endpoints
- [ ] `apps/api/src/routes/openapi.ts` serves OpenAPI spec (gap C3)
- [ ] `apps/api/src/setup.ts` exists for admin setup (gap C4)
- [ ] `apps/api/src/main.ts` has graceful shutdown (SIGTERM/SIGINT), cache provider initialization, rate limiting, all middleware wired
- [ ] Hono type variables include `requestId`, `cache`, `userId`, `user`
- [ ] Root `package.json` `@prisma/client` version matches `packages/db/package.json`

---

## Phase 5: Authentication Module

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase5-auth.md`

### Verify:
- [ ] `apps/api/src/modules/auth/jwt.ts` uses `hono/jwt` (`sign`, `verify`, `decode`) with HS256
- [ ] `AccessPayload` has `sub`, `email`, `username`, `isAdmin`, `type: 'access'`
- [ ] `RefreshPayload` has `sub`, `type: 'refresh'`
- [ ] `signAccessToken()` and `signRefreshToken()` use configurable expiry from env
- [ ] `verifyJwt()` takes 3 args: `token, secret, 'HS256'`
- [ ] `parseExpiry()` supports `s/m/h/d` suffixes
- [ ] `apps/api/src/modules/auth/model.ts` has: `findUserByEmail`, `findUserByUsername`, `findUserById`, `createUser` (with bcryptjs), `verifyPassword`, `updateUserPassword`, password reset methods
- [ ] `apps/api/src/modules/auth/service.ts` has: `register`, `login`, `refreshAccessToken`, `requestPasswordReset`, `confirmPasswordReset`, `getAuthenticatedUser`
- [ ] `apps/api/src/modules/auth/email.ts` sends MJML templates via nodemailer
- [ ] `apps/api/src/modules/auth/index.ts` has routes: POST register, login, refresh, forgot-password, reset-password
- [ ] `apps/api/src/templates/email/welcome.mjml` and `reset-password.mjml` exist
- [ ] `apps/api/src/types/mjml.d.ts` exists for MJML type declaration
- [ ] `apps/api/src/middleware/auth.ts` checks `payload.type === 'access'` to reject refresh tokens

---

## Phase 6: Backend Domain Modules (14+)

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase6-backend-core.md`
**Gap analysis**: Apply Phase 6 fixes (C1 like/favourite, H3 feature toggle, H6 recipe meta, H1 precision_brewer badge, M7 OP-only reply)

### Verify each module exists with model.ts, service.ts, index.ts:
- [ ] `user/` — CRUD, public profile by username
- [ ] `recipe/` — CRUD + fork + like toggle + favourite toggle + feature toggle + meta endpoint (gaps C1, H3, H6)
- [ ] `equipment/` — CRUD + search/autocomplete
- [ ] `bean/` — CRUD scoped to user
- [ ] `vendor/` — CRUD + search (admin-only delete)
- [ ] `taste/` — hierarchy, flat, search, CUD (admin), cache integration
- [ ] `photo/` — upload with validation, list by recipe, delete
- [ ] `comment/` — create with OP-only reply enforcement (gap M7), list by recipe, delete
- [ ] `follow/` — follow/unfollow, followers/following, feed
- [ ] `badge/` — list badges, user badges, evaluate with `precision_brewer` logic (gap H1)
- [ ] `setup/` — CRUD + set-default
- [ ] `preference/` — get/update preferences with email notification flattening
- [ ] `search/` — search recipes with SearchSchema validation
- [ ] `qrcode/` — PNG and SVG QR code generation using `APP_URL`
- [ ] `report/` — create, list (admin), resolve (admin) (gap C5)

### Verify route mounting:
- [ ] `apps/api/src/routes/index.ts` mounts all 16 module routes + health + openapi at `/api/v1/*`

### Verify sub-router typing:
- [ ] Each module index.ts uses `new Hono<AppEnv>()` with shared AppEnv type from `types/hono.ts`

---

## Phase 7: Admin Module

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase7-admin.md`
**Gap analysis**: Apply Phase 7 fixes (C5 reports, C6 analytics, H4 create user)

### Verify:
- [ ] `apps/api/src/modules/admin/model.ts` has: user management, recipe management, equipment/vendor management, compatibility rules, reports, audit log, analytics
- [ ] `apps/api/src/modules/admin/service.ts` creates AuditLog entries for every admin mutation
- [ ] `apps/api/src/modules/admin/index.ts` has all routes with `authMiddleware` + `adminMiddleware`:
  - [ ] Analytics: GET stats, GET analytics/users, GET analytics/recipes, GET analytics/top-recipes, GET analytics/top-users
  - [ ] Users: GET /users, GET /users/:id, POST /users (gap H4), POST /users/:id/ban, PATCH /users/:id/admin, DELETE /users/:id
  - [ ] Recipes: GET /recipes, PATCH /recipes/:id/visibility, DELETE /recipes/:id
  - [ ] Equipment: full CRUD
  - [ ] Vendors: full CRUD
  - [ ] Taste Notes: full CUD (with cache flush)
  - [ ] Reports: GET /reports, PATCH /reports/:id/resolve, PATCH /reports/:id/dismiss (gap C5)
  - [ ] Compatibility: CRUD
  - [ ] Audit Log: GET /audit-log
  - [ ] Cache: POST /cache/flush
- [ ] All admin routes mounted at `/api/v1/admin`
- [ ] Cache invalidation on compatibility rule changes

---

## Phase 8: Frontend Foundation

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase8-frontend-foundation.md`
**Gap analysis**: Apply Phase 8 fix (H8 useTranslation hook)

### Verify:
- [ ] `apps/web/src/styles/globals.css` has light/dark/coffee theme with CSS custom properties
- [ ] `apps/web/src/api/client.ts` has token management, auto-refresh on 401, `ApiError` class, convenience methods
- [ ] `apps/web/src/api/index.ts` has typed API functions (authApi, userApi, recipeApi, tasteApi)
- [ ] `apps/web/src/contexts/AuthContext.tsx` has `AuthProvider`, `useAuth()` hook, localStorage token persistence
- [ ] `apps/web/src/contexts/ThemeContext.tsx` has `ThemeProvider`, `useTheme()` hook, system preference detection
- [ ] `apps/web/src/contexts/I18nContext.tsx` has `I18nProvider`, `useTranslation()` hook (gap H8)
- [ ] `apps/web/src/components/layout/Navbar.tsx`, `Footer.tsx`, `Layout.tsx` exist
- [ ] `apps/web/src/components/CookieConsent.tsx` exists
- [ ] `apps/web/src/router.tsx` uses `createBrowserRouter` + `RouterProvider`
- [ ] `apps/web/src/App.tsx` nests ThemeProvider → I18nProvider → AuthProvider → RouterProvider
- [ ] `apps/web/src/pages/HomePage.tsx` and `NotFoundPage.tsx` exist
- [ ] Auth pages exist: `LoginPage.tsx`, `RegisterPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`
- [ ] `apps/web/tsconfig.json` has `"module": "ESNext"`
- [ ] Frontend imports have NO `.ts`/`.tsx` extensions
- [ ] `tsc --noEmit` passes for web app
- [ ] `vite build` succeeds

---

## Phase 9: Frontend Features

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase9-frontend-features.md`
**Gap analysis**: Apply Phase 9 fixes (M3 QR not available page, M4 JSON-LD structured data)

### Verify:
- [ ] `RequireAuth` component with `requireAdmin` prop
- [ ] `SEOHead` and `RecipeJsonLd` components (gap M4)
- [ ] Error pages: `NotFoundPage`, `ServerErrorPage`, `ForbiddenPage`
- [ ] `TasteAutocomplete` with 3-char debounce, hierarchy display, removable chips
- [ ] Recipe pages: List, Detail, Create, Edit, Compare, PrintView, FocusMode
- [ ] Social components: `LikeButton`, `FavouriteButton`, `CommentSection`, `FollowButton`
- [ ] `PhotoUpload` with drag & drop, validation, preview
- [ ] `RecipeQRCode` with PNG/SVG download
- [ ] `PrintButton`, `FocusModeButton`
- [ ] `UserProfilePage` with tabs, follow button, badges
- [ ] `OnboardingWizard` with 5 steps, skippable
- [ ] `SettingsPage` with units, theme, locale, notifications, danger zone
- [ ] `SearchPage` with filter sidebar, URL params
- [ ] Setup/Bean/Equipment list pages
- [ ] Admin: `AdminLayout`, `AdminDashboard`, `AdminUsersPage`, `AdminRecipesPage`, `AdminEquipmentPage`, `AdminVendorsPage`, `AdminTasteNotesPage`, `AdminCompatibilityPage`, `AdminBadgesPage`, `AdminAuditLogPage`, `AdminCachePage`
- [ ] Legal pages: `PrivacyPage`, `TermsPage`
- [ ] `TasteNotesPage` for browsing
- [ ] QR "not available" route (gap M3)
- [ ] `router.tsx` updated with all routes including admin
- [ ] Print CSS with `@media print` and focus mode CSS
- [ ] Frontend uses `any` type for API response data
- [ ] React 19 `useRef` calls have initial value (`null`)

---

## Phase 10: Testing

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase10-testing.md`

### Verify:
- [ ] Shared package tests: `conversion.test.ts`, `metrics.test.ts`, `validation.test.ts`, `date.test.ts`, `slug.test.ts`
- [ ] Shared schema tests: `recipe.test.ts`, `auth.test.ts`, `equipment.test.ts`, `user.test.ts`
- [ ] API util tests: `cache.test.ts`, `response.test.ts`, `qrcode.test.ts`, `env.test.ts`, `logger.test.ts`
- [ ] API middleware tests: `errorHandler.test.ts`, `cors.test.ts`
- [ ] API module tests for: auth/jwt, auth/service, taste/service, taste/model, user/service, recipe/service, equipment/service, comment/service, follow/service, badge/service, setup/service, preference/service, search/service, qrcode/service, photo/service, bean/service, vendor/service, admin/service
- [ ] API route test: `health.test.ts`
- [ ] `deno.json` test config includes `apps/api/src/` and `packages/shared/src/`
- [ ] Tests use `jsr:@std/testing/bdd`, `jsr:@std/expect`, `jsr:@std/assert` (no import maps)
- [ ] `make test` passes (all 44 test suites, 315+ steps)
- [ ] Tests require `--unstable-sloppy-imports` and `--no-check`

---

## Phase 11: CI/CD & Deployment

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase11-cicd.md`

### Verify:
- [ ] `.github/workflows/ci.yml` has: quality job (fmt, lint, check), test job (postgres service, migrations, seed), deploy-backend (Deno Deploy), deploy-frontend (GitHub Pages)
- [ ] `.github/workflows/pr.yml` has: format check, lint, type check, shared unit tests
- [ ] `apps/web/vite.config.ts` has `define` for `VITE_API_URL` injection
- [ ] `apps/web/public/404.html` has SPA redirect trick with sessionStorage
- [ ] `apps/web/index.html` has SPA redirect restore script
- [ ] `apps/web/public/_redirects` exists (Netlify fallback)
- [ ] `deno.json` lint/fmt include paths are `["apps/", "packages/"]` with proper excludes
- [ ] `deno.json` has lint rule exclusions for npm-monorepo false positives
- [ ] `package.json` has `"packageManager": "npm@10.9.7"`
- [ ] `make check` uses `--unstable-sloppy-imports`

---

## Phase 12: Documentation

**Plan file**: `/Users/arda/projects/BrewForm/.opencode/plans/phase12-documentation.md`

### Verify:
- [ ] `README.md` has: features, tech stack, quick start, dev commands, database commands, architecture diagram, project structure, API link, documentation table, license
- [ ] `docs/api.md` has: complete endpoint reference (100+ endpoints), response envelope, error codes, pagination, all modules documented with auth requirements
- [ ] `docs/auth.md` has: token strategy, registration, login, refresh, password reset, middleware descriptions, env config
- [ ] `docs/recipes.md` has: two-layer model, versioning, forking, visibility, validation (hard/soft), canonical units, comparison, like/favourite/feature, meta
- [ ] `docs/taste-notes.md` has: hierarchy, autocomplete rules, caching, emoji tags, API endpoints, recipe integration
- [ ] `docs/deployment.md` has: architecture diagram, Deno Deploy, GitHub Pages, CI/CD, dev services, env vars reference
- [ ] `docs/architecture.md` has: monorepo structure, dependency graph, module pattern, cache architecture, validation, portability rules, database, middleware, background jobs, graceful shutdown, testing
- [ ] JSDoc comments on key modules: cache provider, response helpers, env config, auth middleware, JWT, main.ts, shared barrel, route aggregator

---

## Cross-Cutting Verification

After checking individual phases, verify these cross-cutting concerns:

### Type Checking
```bash
make check
```
Must pass with zero errors.

### Lint & Format
```bash
make lint
make fmt-check
```
Must pass with zero errors.

### No Import Maps
- [ ] `deno.json` does NOT contain `"imports"` field

### Portability Rules (§6.2)
- [ ] No `@db.Uuid` or `@db.JsonB` in Prisma schema
- [ ] No raw SQL queries — all via Prisma Client
- [ ] Services import from model files, never from `@prisma/client` directly
- [ ] No `mode: 'insensitive'` or Postgres-specific query operators

### Frontend Never Imports DB
- [ ] `apps/web/` has zero imports from `@brewform/db`

### Shared Package Barrel Files
- [ ] No `.ts` extensions in barrel file re-export paths

### Zod Schemas Shared
- [ ] Backend and frontend both import schemas from `@brewform/shared/schemas`

### Deno Lint Rule Exclusions
- [ ] `deno.json` excludes: `no-import-prefix`, `no-unversioned-import`, `no-explicit-any`, `require-await`, `no-empty`

### Workspace Protocol
- [ ] Root `package.json` uses `*` (not `workspace:*`) for workspace dependencies

---

## Output Format

Produce a report with this structure:

```
## Phase 1: Infrastructure & Scaffolding
**Status**: PASS / PARTIAL / FAIL
**Issues**:
- [list any issues found]

## Phase 2: Database Schema
**Status**: PASS / PARTIAL / FAIL
**Issues**:
- [list any issues found]

[... continue for all 12 phases ...]

## Cross-Cutting Verification
**make check**: PASS / FAIL
**make lint**: PASS / FAIL
**make fmt-check**: PASS / FAIL
**No import maps**: PASS / FAIL
**Portability rules**: PASS / FAIL
**Frontend ≠ DB imports**: PASS / FAIL
**Barrel file extensions**: PASS / FAIL

## Summary
Total phases: 12
Passed: X
Partial: Y
Failed: Z
Critical issues: [list]
```