# BrewForm Implementation State

## Current Phase: 7 (Admin Module) — READY TO START

## Phase Progress

| Phase | Description | Status | Files |
|-------|-------------|--------|-------|
| 1 | Infrastructure & Scaffolding | ✅ Completed | All files created and verified |
| 2 | Database Schema (Prisma) | ✅ Completed | Schema, seed, migration |
| 3 | Shared Package | ✅ Completed | Types, schemas, constants, utils, i18n |
| 4 | Backend Core (Hono) | ✅ Completed | Config, logger, cache, response, middleware |
| 5 | Authentication Module | ✅ Completed | JWT, model, service, email, routes |
| 6 | Backend Domain Modules (14+) | ✅ Completed | 15 modules with model/service/controller pattern |
| 7 | Admin Module | 🔵 Ready | [plan](phase7-admin.md) |
| 8 | Frontend Foundation | ⬜ Pending | [plan](phase8-frontend-foundation.md) |
| 9 | Frontend Features | ⬜ Pending | [plan](phase9-frontend-features.md) |
| 10 | Testing | ⬜ Pending | [plan](phase10-testing.md) |
| 11 | CI/CD & Deployment | ⬜ Pending | [plan](phase11-cicd.md) |
| 12 | Documentation | ⬜ Pending | [plan](phase12-documentation.md) |

## Phase 1 — Completed

- [x] All root config files (`.gitignore`, `package.json`, `turbo.json`, `deno.json`, `.env.example`)
- [x] Docker files (`Dockerfile`, `docker-compose.yml`) — Multi-stage build with Deno + Node.js 22
- [x] `Makefile` — All Docker-wrapped commands
- [x] `apps/api/` — Hono backend with minimal entry point
- [x] `apps/web/` — React SPA with Vite, Tailwind CSS v4, BaseUI
- [x] `packages/shared/` — All type/schema/constant/util/i18n files (~40 files)
- [x] `packages/db/` — Initial Prisma schema stub, client singleton
- [x] `files/scaa-2.json` — SCAA flavor wheel data (128KB, 9 top-level categories)
- [x] Docker build and `deno check` verification passed

## Phase 2 — Completed

- [x] `packages/db/prisma/schema.prisma` — Full schema with 24 models and 13 enums
  - Enums: Visibility, BrewMethod, DrinkType, EquipmentType, EmojiTag, BadgeRule, UnitSystem, TemperatureUnit, Theme, DateFormat, AdditionalPreparationType
  - Models: User, UserPreferences, Recipe, RecipeVersion, RecipeTasteNote, RecipeEquipment, RecipeAdditionalPreparation, Photo, RecipeVersionPhoto, Equipment, Bean, Vendor, TasteNote, Setup, Comment, UserFollow, UserRecipeFavourite, UserRecipeLike, Badge, UserBadge, BrewMethodEquipmentRule, AuditLog, PasswordReset, Report
  - All models use UUID string IDs, soft deletes, proper indexes
  - EmojiTag enum stores stable keys (fire, rocket, etc.) not emoji characters
- [x] `packages/db/prisma/seed.cjs` — Node.js seed script with SCAA taste notes, brew methods, badges, users, recipes
- [x] `packages/db/prisma/migrations/20260425181027_init/` — Initial migration
- [x] Schema validated, Prisma client generated
- [x] Database seeded successfully
- [x] Added `Report` model (from gap analysis C5)
- [x] `Equipment.createdBy` now has proper FK relation to `User`
- [x] `Equipment` has reverse relations for Setup (portafilter, basket, puckScreen, paperFilter, tamper)

## Phase 3 — Completed

- [x] New type files: `audit.ts`, `password-reset.ts`, `additional-preparation.ts`, `brew-method-rule.ts`
- [x] Updated `types/index.ts` — exports all new types including `BadgeRule`, `AdditionalPreparation`
- [x] Fixed `EmojiTag` type to use stable keys (`fire`, `rocket`, etc.) instead of emoji characters
- [x] Updated `emoji-tags.ts` constants — now uses `{ key, emoji, label }` format with `EmojiTagKey` type
- [x] Fixed `RecipeCreateSchema` / `RecipeUpdateSchema` — separated base object schema from refined schema
- [x] New schema files: `setup.ts`, `comment.ts`, `bean.ts`, `vendor.ts`, `badge.ts`, `admin.ts`, `photo.ts`, `follow.ts`, `search.ts`
- [x] Updated `schemas/index.ts` — exports all new schemas
- [x] New `constants/brew-method-rules.ts` — 30 brew method/equipment compatibility rules
- [x] New `utils/slug.ts` — `generateSlug()` and `ensureUniqueSlug()`
- [x] Added `computeExtractionYield()` to `utils/metrics.ts`
- [x] Extended `validateSoftWarnings()` with 4 new soft validations
- [x] Updated `schemas/recipe.ts` EmojiTagEnum to stable keys
- [x] Added ~50 new i18n keys to `en.json` and `tr.json`
- [x] `deno check` passes for both `packages/shared` and `apps/api`

## Phase 4 — Completed

- [x] `apps/api/src/config/env.ts` — Zod-validated environment config
- [x] `apps/api/src/config/index.ts` — Config barrel export
- [x] `apps/api/src/utils/logger/index.ts` — Pino structured logger with secret redaction
- [x] `apps/api/src/utils/cache/index.ts` — CacheProvider interface, DenoKVCacheProvider, InMemoryCacheProvider
- [x] `apps/api/src/utils/response/index.ts` — API response envelope helpers
- [x] `apps/api/src/utils/qrcode/index.ts` — QR code generation (PNG + SVG)
- [x] `apps/api/src/utils/upload/index.ts` — Photo upload validation, filename generation, directory management
- [x] `apps/api/src/utils/jobs/index.ts` — Background job runner/scheduler
- [x] `apps/api/src/middleware/cors.ts` — CORS middleware
- [x] `apps/api/src/middleware/requestId.ts` — Request ID middleware
- [x] `apps/api/src/middleware/errorHandler.ts` — Global error handler (Prisma, Zod, JWT errors)
- [x] `apps/api/src/middleware/auth.ts` — Auth middleware (required, optional, admin modes)
- [x] `apps/api/src/middleware/rateLimit.ts` — Rate limiting middleware
- [x] `apps/api/src/routes/health.ts` — Health and readiness endpoints
- [x] `apps/api/src/routes/index.ts` — Route aggregator
- [x] `apps/api/src/modules/auth/jwt.ts` — JWT stub
- [x] `apps/api/src/modules/auth/types.ts` — JwtPayload type
- [x] `apps/api/src/modules/auth/index.ts` — Auth module barrel
- [x] `apps/api/src/setup.ts` — Admin setup script
- [x] `apps/api/src/main.ts` — Full Hono app with graceful shutdown, cache provider, rate limiting
- [x] Hono type variables for custom context (requestId, cache, userId, user)
- [x] Fixed root `package.json` — aligned `@prisma/client` version to `^6.19.3`

## Phase 5 — Completed

- [x] `apps/api/src/modules/auth/jwt.ts` — Full JWT implementation using Hono's `hono/jwt` (`sign`, `verify`, `decode`)
  - `AccessPayload` and `RefreshPayload` types with `type` discriminator
  - `signAccessToken()` and `signRefreshToken()` using HS256
  - `verifyJwt()` and `decodeJwt()` utilities
  - `parseExpiry()` helper for human-readable expiry strings
  - Token types: access (15m) and refresh (7d) from env config
- [x] `apps/api/src/modules/auth/model.ts` — Prisma wrapper for auth DB operations
  - `findUserByEmail`, `findUserByUsername`, `findUserById` (all with soft-delete filter)
  - `createUser` (with bcryptjs password hashing and auto-create preferences)
  - `verifyPassword`, `updateUserPassword`
  - `createPasswordReset`, `findPasswordResetByToken`, `markPasswordResetUsed`
  - `markOnboardingComplete`
  - `as any` type assertions for Prisma fields that lag behind schema generation
  - File-level `deno-lint-ignore-file no-explicit-any require-await` to suppress known Prisma type lags
- [x] `apps/api/src/modules/auth/service.ts` — Auth business logic
  - `register()` — checks duplicate email/username, creates user, signs tokens, sends welcome email
  - `login()` — validates credentials, checks banned status, signs tokens
  - `refreshAccessToken()` — verifies refresh token, re-issues both tokens
  - `requestPasswordReset()` — creates reset token, sends email (silently succeeds for non-existent emails)
  - `confirmPasswordReset()` — validates token, checks expiry/usage, updates password
  - `getAuthenticatedUser()` — fetches user by ID
  - Uses `toAuthUser()` helper to cast Prisma results to full `AuthUser` interface
- [x] `apps/api/src/modules/auth/email.ts` — Email sending with MJML templates via nodemailer
  - `sendEmail()` — sends via `nodemailer` with SMTP config from env
  - `loadTemplate()` — reads `.mjml` files from `templates/email/` using `import.meta.dirname`
  - `sendWelcomeEmail()` — renders welcome.mjml template
  - `sendPasswordResetEmail()` — renders reset-password.mjml with reset URL
  - Skips sending in test environment
- [x] `apps/api/src/modules/auth/index.ts` — Hono routes controller
- [x] `apps/api/src/modules/auth/types.ts` — Re-exports JWT payload types from jwt.ts
- [x] `apps/api/src/templates/email/welcome.mjml` — Welcome email template
- [x] `apps/api/src/templates/email/reset-password.mjml` — Password reset email template
- [x] `apps/api/src/routes/index.ts` — Updated to mount auth routes at `/api/v1/auth`
- [x] `apps/api/src/middleware/auth.ts` — Updated to check `payload.type === 'access'` for proper token type validation
- [x] `apps/api/src/modules/auth/jwt.ts` — Replaced stub with full implementation
- [x] `apps/api/src/utils/response/index.ts` — Changed `StatusCode` to `ContentfulStatusCode` for proper Hono type narrowing
- [x] `apps/api/src/types/mjml.d.ts` — Type declaration for `mjml` module
- [x] `deno.json` — Added `"types"` in compilerOptions for custom type declarations
- [x] `Makefile` — Updated `db-generate` to clear `.prisma` cache before regenerating
- [x] `deno check` passes for all API files
- [x] `deno lint` passes for auth module (pre-existing lint issues in cache module remain)

## Phase 6 — Completed

- [x] `apps/api/src/types/hono.ts` — Shared AppEnv type for Hono context variables
- [x] `apps/api/src/config/env.ts` — Added `APP_URL` env variable for QR code generation
- [x] **User module** (`apps/api/src/modules/user/`)
  - model.ts: findById, findByUsername, updateProfile, deleteUser, getUserStats, searchUsers
  - service.ts: getProfile, getPublicProfile, updateProfile, deleteAccount
  - index.ts: GET /me, PATCH /me, DELETE /me, GET /:username
- [x] **Recipe module** (`apps/api/src/modules/recipe/`)
  - model.ts: create, findById, findBySlug, findMany, update, softDelete, createVersion, forkRecipe, toggleLike, toggleFavourite, toggleFeature, incrementLikes, decrementLikes, incrementComments, decrementComments, getFeed
  - service.ts: getRecipe, createRecipe, updateRecipe, deleteRecipe, forkRecipe, listRecipes, toggleLike, toggleFavourite, toggleFeature, getRecipeMeta
  - index.ts: CRUD + fork + like/favourite/feature toggle + meta endpoint for OG tags + compare
  - Gap analysis C1: Like/favourite toggle endpoints added
  - Gap analysis H3: Feature toggle endpoint added
  - Gap analysis H6: `/recipes/:slug/meta` endpoint for OG tags
- [x] **Equipment module** (`apps/api/src/modules/equipment/`)
  - model.ts: findById, findMany, search, create, update, softDelete
  - service.ts: getEquipment, listEquipment, searchEquipment, createEquipment, updateEquipment, deleteEquipment
  - index.ts: Full CRUD + search/autocomplete
- [x] **Bean module** (`apps/api/src/modules/bean/`)
  - model.ts: findById, findByUser, create, update, softDelete
  - service.ts: listBeans, getBean, createBean, updateBean, deleteBean
  - index.ts: Full CRUD scoped to user
- [x] **Vendor module** (`apps/api/src/modules/vendor/`)
  - model.ts: findById, findMany, search, create, update, softDelete
  - service.ts: listVendors, searchVendors, getVendor, createVendor, updateVendor, deleteVendor
  - index.ts: CRUD + search, admin-only delete
- [x] **Taste module** (`apps/api/src/modules/taste/`)
  - model.ts: findAll, findChildren, searchByName, getHierarchy, findById, create, update, remove
  - service.ts: getHierarchy (cached), searchTasteNotes, getFlatList (cached), createTasteNote, updateTasteNote, deleteTasteNote
  - index.ts: GET hierarchy, GET search, GET flat, POST (admin), PATCH (admin), DELETE (admin)
  - CacheProvider integration with Deno KV for caching
- [x] **Photo module** (`apps/api/src/modules/photo/`)
  - model.ts: findById, findByRecipe, create, softDelete
  - service.ts: uploadPhoto (with validation), listPhotos, deletePhoto
  - index.ts: POST multipart upload, GET by recipe, DELETE (auth required)
- [x] **Comment module** (`apps/api/src/modules/comment/`)
  - model.ts: findById, findByRecipe, create, softDelete, getRecipeAuthorId
  - service.ts: createComment (OP-only reply enforcement per gap M7), listComments, deleteComment
  - index.ts: POST /recipe/:recipeId, GET /recipe/:recipeId, DELETE /:id
- [x] **Follow module** (`apps/api/src/modules/follow/`)
  - model.ts: findFollow, createFollow, deleteFollow, getFollowers, getFollowing, getFollowingIds, isFollowing
  - service.ts: followUser, unfollowUser, getFollowers, getFollowing, getFeed
  - index.ts: POST /:userId, DELETE /:userId, GET /:userId/followers, GET /:userId/following, GET /feed
- [x] **Badge module** (`apps/api/src/modules/badge/`)
  - model.ts: listBadges, getUserBadges, evaluateBadges (with precision_brewer logic per gap H1)
  - service.ts: listBadges, getUserBadges, evaluateBadges
  - index.ts: GET /, GET /user/:userId, POST /evaluate/:userId (admin)
- [x] **Setup module** (`apps/api/src/modules/setup/`)
  - model.ts: findById, findByUser, create, update, softDelete, clearDefaultForUser
  - service.ts: listSetups, getSetup, createSetup, updateSetup, deleteSetup, setDefault
  - index.ts: Full CRUD + POST /:id/set-default
- [x] **Preference module** (`apps/api/src/modules/preference/`)
  - model.ts: findByUserId, upsert
  - service.ts: getPreferences, updatePreferences
  - index.ts: GET /, PATCH / (with email notification flattening)
- [x] **Search module** (`apps/api/src/modules/search/`)
  - model.ts: searchRecipes with dynamic where clause construction
  - service.ts: search (delegates to model)
  - index.ts: GET / with SearchSchema validation
- [x] **QR Code module** (`apps/api/src/modules/qrcode/`)
  - model.ts: findBySlug
  - service.ts: getRecipeQRCode (PNG or SVG format)
  - index.ts: GET /recipe/:slug.png, GET /recipe/:slug.svg
- [x] **Report module** (`apps/api/src/modules/report/`) — Gap analysis C5
  - model.ts: create, findById, findMany, resolve
  - service.ts: createReport, listReports, resolveReport
  - index.ts: POST / (auth), GET / (admin), PATCH /:id/resolve (admin)
- [x] `apps/api/src/routes/index.ts` — Updated to mount all 16 route groups
- [x] `deno check` passes for all API files
- [x] `APP_URL` added to env config for QR code baseUrl

## Key Decisions

- **Deno version**: 2.7.13
- **CSS framework**: Tailwind CSS v4
- **UI library**: BaseUI
- **No import maps** — explicit specifiers only
- **All commands via Docker** — no local runtime needed
- **Package manager**: npm (with workspaces)
- **Workspace protocol**: Uses `*` instead of pnpm's `workspace:*` for npm compatibility
- **Dockerfile**: Node.js 22 installed alongside Deno for npm/npx commands
- **Seed script**: Uses Node.js (`.cjs`) since Prisma Client is a Node module
- **Report model**: Added from gap analysis (C5) for content moderation
- **EmojiTag stable keys**: Uses `fire`, `rocket`, `thumbsup`, `neutral`, `thumbsdown`, `sick` instead of emoji characters (per §6.2 DB portability)
- **RecipeCreateSchema refactored**: Base object schema extracted to `RecipeCreateObjectSchema` so `RecipeUpdateSchema` can use `.partial()` on the unwrapped ZodObject
- **Hono type variables**: Custom `Variables` type for context (`requestId`, `cache`, `userId`, `user`)
- **Response helper types**: Use Hono's `ContentfulStatusCode` type (not `StatusCode`) for proper type narrowing — `StatusCode` includes informational 1xx codes which aren't valid for JSON responses
- **Auth middleware**: Checks `payload.type === 'access'` to reject refresh tokens used as access tokens
- **Prisma client generation**: Must run `cd packages/db && npx prisma generate` from within that directory. Docker anonymous volume `/app/node_modules` caches stale types — use `rm -rf node_modules/.prisma` before regeneration. `make db-generate` now handles this.
- **Prisma type assertions**: Generated Prisma types may lag behind schema changes. Use `as any` on the full query options object (not individual fields) and file-level `deno-lint-ignore-file no-explicit-any` in model files. The `data: {...}, include: {...}` pattern causes TypeScript to infer `include` as `never` when `data` is cast to `any`, so cast the entire options object instead.
- **Background jobs**: Simple interval-based scheduler; jobs registered with `registerJob()`, started/stopped with `startJobs()`/`stopJobs()`
- **Rate limiting**: Uses CacheProvider for distributed rate limiting; auth routes use separate in-memory rate limiter
- **JWT**: Uses Hono's built-in `hono/jwt` module (`sign`, `verify`, `decode`), not `hono/utils/jwt`. The `verify` function requires 3 arguments: `verify(token, secret, alg)`.
- **Password hashing**: Uses `bcryptjs` (not native `bcrypt`) for Deno compatibility. `hashSync`/`compareSync` for synchronous hashing (10 rounds).
- **Email**: MJML templates rendered server-side. In development, only SMTP connection is verified (Mailpit at port 1025). No actual email sending beyond connection check.
- **Deno lint**: `deno-lint-ignore` comments must NOT contain explanatory text after the rule codes — Deno parses subsequent words as additional rule codes. Use `// deno-lint-ignore no-explicit-any` only, with explanations on a separate comment line. Use `deno-lint-ignore-file` for file-wide suppressions.
- **Hono sub-router typing**: Each sub-router must use `new Hono<AppEnv>()` with the shared `AppEnv` type from `types/hono.ts` to properly type `c.get('userId')`, `c.get('cache')`, etc. Without this, TypeScript can't resolve the context variable types.
- **Route params**: `c.req.param('id')` returns `string | undefined`. Use `!` assertion (`c.req.param('id')!`) since route params are guaranteed by route patterns.
- **c.get('userId')**: Returns `string | null` per our Variables type. After authMiddleware, it's guaranteed to be non-null. Use `as string` assertion: `c.get('userId') as string`.
- **Module pattern**: Each domain module follows `model.ts` → `service.ts` → `index.ts` pattern. Model wraps Prisma calls with `as any` casts. Service contains business logic. Index defines Hono routes with Zod validation.