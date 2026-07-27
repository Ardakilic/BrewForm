# BrewForm Architecture Map (reference card, audited 2026-07-19, branch chore/debt-fix @ fe9aad2)

Deno 2.9 workspace (`deno.json:3-5` members `apps/*`, `packages/*`; unstable: cron, kv; catalog pins
drizzle-orm ^0.45.2, bcryptjs ^3.0.3, zod ^4.4.3). Dependency rule: `apps/web → @brewform/shared`
ONLY; `apps/api → shared + db`; `db → shared`. Web must never import `@brewform/db` (AGENTS.md:64).

## 1. apps/api (Hono REST API, :8000)

### Module convention (confirmed by sampling comment, recipe, badge, contact)

Every domain module in `apps/api/src/modules/<name>/` is 3 layers:

- `index.ts` — Hono routes:
  `describeRoute({tags, summary, security, parameters, requestBody: jsonRequestBody(InputSchema), responses: resolver(successEnvelope|paginatedEnvelope|ErrorEnvelopeSchema)})` +
  `zValidator('json'|'query', SharedZodSchema)` + calls `service.ts`. E.g. comment/index.ts:27-60
  (per-route rateLimit 5/min on POST), badge/index.ts:18-25.
- `service.ts` — business logic; imports `* as model`, logger, notify, cross-module services. DI
  idiom: exported `deps = { model, recipeModel, notify*, ... }` proxy object for test stubbing
  (comment/service.ts:26-31).
- `model.ts` — Drizzle queries only (`db` from `@brewform/db`, tables from `@brewform/db/schema`,
  operators from `drizzle-orm`); soft-delete filtering via `isNull(t.deletedAt)`
  (comment/model.ts:8-10).
- Tests: `model.test.ts`, `service.test.ts`, `index.test.ts` per module — NAMING INCONSISTENT:
  collection uses `model_test.ts`/`service_test.ts`/`index_test.ts`, recipe & follow use
  `index_test.ts`, others use `.test.ts`. Recipe also has split test files:
  service.preservation/cursor/exploration/create.test.ts, model.create/cursor.test.ts,
  recipe.compatibility.test.ts, recipe-filter-deprecation.test.ts.

19 modules: auth (jwt.ts, email.ts, types.ts extra), user, recipe, equipment, bean, coffee-variety,
vendor, taste, photo, collection (exports `userCollections` sub-router too), comment, notification,
follow, badge, setup, preference, qrcode, report, admin, contact. DEVIATIONS: `contact/` has NO
service/model — inline transporter logic + LOCAL zod `contactSchema` (contact/index.ts:20), not in
shared. `recipe/index.ts:23` imports `* as model` directly (used at lines 285, 332-336, 554-555),
bypassing service layer.

### Route mounting (apps/api/src/routes/index.ts)

- `routes/index.ts:41-65` mounts: health + share + sitemap at `/`, `/share`, `/api/v1/sitemap.xml`;
  all modules under `/api/v1/<plural>`; `userCollections` mounted at `/api/v1/users` (index.ts:47)
  alongside `user`.
- `registerOpenApi(routes)` (index.ts:67); OpenAPI spec `/api/v1/openapi.json`, Scalar UI
  `/api/v1/docs`, gated by `OPENAPI_ENABLED`. Coverage enforced by `routes/openapi.coverage.test.ts`
  (every route documented/tagged, no orphan tags).
- Other routes/: `health.ts`, `openapi.ts` (tag registry lives here), `share.ts` (crawler share
  pages), `sitemap.ts`.

### Middleware stack — ACTUAL order (main.ts:41-76)

`cors → requestId → secureHeaders(CSP/HSTS/etc, main.ts:43-68) → rateLimit(100/min, :69) → bodyLimit(1MB, :70) → cache-injection (c.set('cache', cacheProvider), :71-74) → crawler (:75) → app.onError(errorHandler) (:76) → local /uploads/* static handler when STORAGE_DRIVER=local (:79-118, path-traversal guarded) → routes (:120)`.
NOTE: AGENTS.md:50 states a STALE order (omits secureHeaders/bodyLimit/crawler, calls errorHandler a
middleware). main.ts:18 docstring is accurate. Middleware files (apps/api/src/middleware/): cors.ts,
requestId.ts, rateLimit.ts (configurable window/max/keyPrefix, reused per-route e.g. comment 5/min),
bodyLimit.ts (excl. /api/v1/photos), crawler.ts, errorHandler.ts, auth.ts (`authMiddleware`,
`optionalAuthMiddleware`, `adminMiddleware`). All have co-located .test.ts. Typed context: `AppEnv`
(src/types/hono.ts) — userId, user, cache, requestId.

### Startup/shutdown (main.ts:124-183)

KV cache: `CACHE_DRIVER=deno-kv` → `Deno.openKv(DENO_KV_URL ?? http://denokv:4512)` else in-memory
(main.ts:127-136). Cron jobs registered by side-effect import `./utils/jobs/cron.ts` (main.ts:35).
Graceful shutdown closes server → KV → postgres client → SMTP transporter (main.ts:148-168).
`export { app }` for tests (main.ts:183).

### Utils inventory (apps/api/src/utils/)

- `cache/index.ts` — `CacheProvider` interface (:9), `DenoKVCacheProvider` (:24),
  `InMemoryCacheProvider` (:56), `createCacheProvider(driver, kv?)` (:96); `cache/singleton.ts` —
  `cacheProvider` + `setCacheProvider` (DI; never call Deno.openKv directly).
- `response/index.ts` — envelope helpers: `success` (:14), `paginated` (:39), `cursorPaginated`
  (:72), `invalidCursor` (:98), `error` (:103),
  `notFound`/`unauthorized`/`forbidden`/`validationError` (:122-137), `isEmailVerified(c)` (:142),
  `zodValidationHook` (:152).
- `notify/index.ts` — nodemailer SMTP: `getTransporter` (:53), `closeTransporter` (:69),
  `appBaseUrl` (:98),
  `notifyNewFollower`/`notifyRecipeLiked`/`notifyRecipeCommented`/`notifyMentioned`/`notifyFollowersOfNewRecipe`
  (:125-222). Suppressed when APP_ENV=test.
- `openapi/index.ts` — single export `jsonRequestBody(schema)` (:18) = Zod v4 `z.toJSONSchema` for
  request bodies (never use hono-openapi `resolver()` for requests; ADR-012 keeps zValidator as
  runtime validator).
- `sanitize.ts` — `sanitizeText` (:33), `sanitizeName` (:48).
- `logger/index.ts` — pino-based `createLogger(module)` (:20) implementing shared `CreateLogger`;
  env LOG_LEVEL/LOG_FORMAT.
- `storage/` — `createStorageDriver()` (index.ts:10) → `local.ts` | `s3.ts` behind `StorageDriver`
  (types.ts).
- `upload/index.ts` — image validation/filenames/thumbnails (:40-100).
- `qrcode/index.ts` — `generateQRCodePng`/`Svg` (:4,:14).
- `jobs/cron.ts` — Deno.cron registrations (badge evaluation, cache refresh), no exports; imported
  for side effects.
- `templates/email/*.mjml` → compiled to `templates/email/generated/*.ts` via
  `scripts/build-email-templates.ts` (8 templates; must run before API starts: `make email-build`).
- `config/env.ts` + `config/index.ts` — validated env config (DATABASE_URL, JWT_SECRET, APP_PORT,
  CACHE_DRIVER, STORAGE_DRIVER, UPLOAD_DIR, OPENAPI_ENABLED, ...).

## 2. apps/web (React SPA, Vite, :5173)

### Entry & routing

`main.tsx` → `App.tsx` → providers → `RouterProvider(router)`. `router.tsx` (433 lines) = single
`createBrowserRouter`:

- Root route `/` with `<Layout/>` + `RootErrorBoundary` errorElement (router.tsx:63-67).
- Eager imports for high-traffic pages, each exporting `{ Page, loader }` (router.tsx:6-53):
  HomePage, RecipeList/Starred/Detail, Collections (list/detail/edit/browse), UserProfile, Settings,
  NotificationList.
- `lazy:` dynamic imports for heavy/rare pages (RecipeCreate/Compare/Fork/Edit, entire admin subtree
  router.tsx:315-433).
- Auth-gating via `<RequireAuth>` wrapper components (components/auth/RequireAuth.tsx).
- Resource routes (action-only, no element) router.tsx:298-308: `recipes/:id/like|favourite|rate`,
  `follow/:userId`, `comments/*` — actions/loaders in
  `src/routes/{like,favourite,rate,follow,comments}.ts` (react-router actions pattern for
  mutations).

### pages/ layout

Top-level singles: HomePage, ErrorPage (NotFoundPage), ContactPage, TasteNotesPage, PrivacyPage,
TermsPage. Dirs: auth/ (Login, Register, Forgot/ResetPassword, VerifyEmail), recipes/ (List, Detail,
Create, Edit, Fork, Compare, Versions, FocusMode, Starred, NotAvailable +
useCoffeeVarietyFilter.tsx), collections/ (List, Detail, Create, Edit, Browse), users/
(UserProfilePage), settings/, setups/, beans/, equipment/ (List, Catalog, Detail), coffee-varieties/
(List, Detail), notifications/, admin/ (AdminLayout + Dashboard, Users, UserDetail/Create/Edit,
Recipes, Equipment, Vendors, Badges, TasteNotes, CoffeeVarieties, Compatibility, Cache, AuditLog).

### components/ inventory (one line each)

- `layout/`: Layout (shell+Outlet), Navbar, Footer, NotificationBell/Dropdown/Item,
  LanguageSelector.
- `auth/RequireAuth` — redirect-to-login guard.
- `recipe/` (detail-page pieces): BeanSection, EquipmentSection, TastingNotesSection,
  RecipeNotesSection, CommentSection, BrewTimeline, ScaaRadarChart, IntensityDots, StarRating,
  LikeButton, FavouriteButton, ShareSection, ForkCard, StatCards, MetadataBadges, BreadcrumbNav,
  TasteNotesFilter, RecipeCard.styles.ts (styles only).
- `recipe-list/`: RecipeListView, RecipeCard, FilterField, ActiveFilterBadge, PaginationControls,
  useRecipeFilters hook, constants.ts, barrel index.ts. (Note: second RecipeCard distinct from
  recipe/RecipeCard.styles.ts.)
- `collections/`: CollectionCard, CollectionRecipeList, AddToCollectionModal, AddToCollectionButton.
- `user/FollowButton`; `admin/BanDialog`; `form/` (Field, Section, barrel); `ui/Skeleton`;
  `taste/TasteAutocomplete`; `photos/PhotoUpload`; `qrcode/RecipeQRCode`; `seo/` (SEOHead, JsonLd);
  `onboarding/OnboardingWizard`; `icons/equipment/` (12 SVG icon components + barrel); root:
  ErrorBoundary (RootErrorBoundary), CookieConsent, EmailVerificationBanner, SessionRestoreBanner.

### contexts (3)

- `AuthContext.tsx:26-29` — session restore via userApi.me(), login/register/logout/refreshUser;
  `useAuth()` throws outside provider (:141).
- `ThemeContext.tsx:15-18` — light/dark/coffee theme, localStorage + OS scheme, class on root.
- `I18nContext.tsx:27-45` — locale en|tr in localStorage (`brewform_locale`), syncs
  `<html lang/dir>`, locale-bound `t()` wrapping shared `t(key, locale)`.

### hooks (5)

useUnitSystem (user's unit pref from AuthContext), useBanUser (admin ban dialog state),
useMediaQuery (reactive matchMedia), useStaticCacheSync (cross-tab storage-event →
invalidateStaticCache), useDebounce.

### api client (src/api/)

- `client.ts` — `API_BASE` resolution: runtime `globalThis.__BREWFORM_CONFIG__.apiUrl` (from
  /config.js written by docker-web-entrypoint.sh) → `import.meta.env.VITE_API_URL` → `/api/v1`
  (client.ts:12-14). `requestInternal`: X-Request-ID header = sessionId, credentials:'include'
  cookies, auto-refresh on 401 via POST /auth/refresh then retry (client.ts:34-49), throws
  `ApiError(code, message, details, status)`. `request<T>` unwraps `.data`; `requestWithMeta<T>`
  returns full envelope.
- `index.ts` (318 lines) — typed API namespaces: authApi (:54), userApi (:73), recipeApi (:84),
  tasteApi, setupApi, beanApi, equipmentApi, coffeeVarietyApi, adminApi (:152), followApi,
  commentApi, notificationApi, collectionApi (:262); all typed with `*Output`/`*Create` types from
  `@brewform/shared/schemas` (D42 typed boundary).
- `static-cache.ts` — client-side cache for static reference data (+ invalidateStaticCache).
- utils/: logger.ts (console createLogger, VITE_LOG_LEVEL), sessionId.ts, relative-date.ts,
  recipe-filters.ts, stat-cards.ts, radar-chart-data.ts, notification-events.ts.

### i18n wiring

`packages/shared/src/i18n/index.ts:10-19` — `t(key, locale)` with en fallback then key,
`getAvailableLocales()`, exports en/tr JSON (en.json, tr.json). Web consumes via I18nContext; API
can call `t()` directly.

## 3. packages/shared & packages/db

### packages/shared (exports map: `.`,`/types`,`/schemas`,`/constants`,`/utils`,`/i18n`,`/logger` — deno.json)

- `schemas/` = REQUEST/input schemas per entity (recipe.ts, equipment.ts, coffee-variety.ts,
  auth.ts, user.ts, taste.ts, common.ts [Pagination/SearchQuery/Slug/SortOrder], bean.ts, setup.ts,
  vendor.ts, comment.ts, collection.ts, follow.ts, notification.ts, badge.ts, photo.ts, report.ts,
  admin.ts, compatibility.ts, response.ts [envelopes: successEnvelope, paginatedEnvelope,
  cursorEnvelope, ErrorEnvelopeSchema, MessageResponseSchema]) + barrel index.ts (137 lines).
- `schemas/responses/` = OUTPUT schemas `<Entity>OutputSchema` per entity mirroring ACTUAL service
  return shapes (_shared.ts helpers; one file per entity + tests + pbt acceptance tests). Derive new
  ones from service.ts returns; register tags in apps/api/src/routes/openapi.ts.
- `constants/` — canonical enum single-source: rich option objects (BREW_METHODS etc.) + `*_VALUES`
  tuples consumed by Drizzle pgEnum AND Zod z.enum (constants/index.ts:1-14; type aliases
  re-exported only via /types to avoid collisions).
- `types/` — hand-written interfaces per entity + api.ts (PaginatedResponse etc.); where names
  collide with schema-inferred types, schemas versions are canonical (src/index.ts:8-15 explicit
  re-export override).
- `utils/` — cursor.ts (cursor pagination encode/decode), slug.ts, date.ts, mention.ts
  (parseMentions), username.ts, validation.ts, conversion.ts (units/TDS), metrics.ts, html.ts.
- `logger/` — Logger/ChildLogger/CreateLogger interfaces shared by API (pino) + web (console).
- Oddities: `workspace.test.ts`, `compose-config.test.ts` at src root; `utils/cursor_test.ts`
  underscore naming.

### packages/db

- `src/index.ts` — postgres-js client `max: 10`, `db = drizzle(client, {schema})`, exports `db`,
  `client`.
- `src/schema.ts` (~1,600 lines) — 15 pgEnums (visibility:43, brew_method:47, drink_type:48,
  equipment_type:49, emoji_tag:50, badge_rule:51, unit_system:52, temperature_unit:53, theme:54,
  date_format:55, additional_preparation_type:56, report_status:60, coffee_variety_category:417,
  equipment_delete_request_status:733, notification_type:904) — all built from shared `*_VALUES`.
- 31 tables (schema.ts line): users:66 (accounts, soft-delete), userPreferences:92 (1:1
  units/theme/locale), recipes:112 (core entity, slug/visibility/method), recipeVersions:177
  (immutable version snapshots), recipeTasteNotes:242 (join→tasteNotes), recipeEquipment:266
  (join→equipment), recipeAdditionalPreparations:288, photos:309, recipeVersionPhotos:335 (join),
  equipment:358 (catalog), beans:387, coffeeVarieties:422, vendors:470, tasteNotes:488 (hierarchical
  SCAA wheel), setups:527 (named equipment sets), comments:559 (threaded, flattened replies),
  userFollows:601, userRecipeFavourites:631, userRecipeLikes:647, userRecipeRatings:663 (1-5
  constraint), badges:681, userBadges:699, brewMethodEquipmentRules:714 (compatibility matrix),
  equipmentDeleteRequests:738, auditLogs:756 (admin actions), passwordResets:774,
  emailVerificationTokens:791, reports:809 (moderation), collections:846 (F01), collectionItems:874,
  notifications:920 (F04 mentions).
- `drizzle/` — 12 migrations (0000_opposite_switch … 0011_thankful_wilson_fisk) + meta/. NEVER
  hand-edit; regenerate via schema.ts → `make db-generate && make db-migrate`.
- Seed: `src/seed.ts` (idempotent — onConflictDoNothing, `import.meta.main` guard) + data files
  seed-coffee-varieties.ts, seed-equipment-catalog.ts, seed-users-recipes.ts (source JSON in
  /files). Schema tests: schema-columns/constraints/indexes.test.ts, seed.idempotent.test.ts.

## 4. Conventions (AGENTS.md) + Makefile + CI

### Key rules (AGENTS.md, 181 lines)

- Everything via Docker + `make`; no local Deno needed. Serena MCP project name `brewform`.
- Services never import drizzle-orm directly (only model.ts does). No raw SQL, no JSONB/UUID cols;
  soft deletes everywhere (deletedAt). Schema changes ONLY in schema.ts then db-generate/migrate.
- OpenAPI mandatory on every route (describeRoute + envelopes + jsonRequestBody); keep zValidator
  (ADR-012); never `import 'zod-openapi/extend'`.
- Structured logging mandatory: API services entry/exit debug logs; web pages mount/unmount logs;
  never log PII/tokens; `log.error({err,...})`.
- fmt: lineWidth 100, indent 2, singleQuote, semicolons; `make fmt` before commit (CI runs
  `deno fmt --check`). Lint excludes: no-explicit-any, require-await, no-empty, no-import-prefix,
  no-unversioned-import. Explicit .ts/.tsx import extensions.
- Tests: @std/testing/bdd + @std/expect, run `--no-check`; need DATABASE_URL, JWT_SECRET;
  CACHE_DRIVER=memory + APP_ENV=test.
- Cache via CacheProvider DI only. Pre-commit hooks: `make setup-hooks` (.githooks/).

### Makefile targets (grouped)

infra: up/down/build/logs/restart; deps: install, lockfile-update, email-build; quality: lint, fmt,
fmt-check, check(-api/-web/-db/-shared; NOTE check-web = lint+tsc), check-tests; build:
build-api/web/shared; test: test, test-coverage, test-api, test-shared, test-web (Vitest),
test-specific filter=; db: db-migrate/generate/push/seed/studio, flush-db, flush-cache,
flush-contents, db-reset; dev: dev, dev-api, web-dev, preview, setup; `ci` (Makefile:194) =
fmt-check lint check build-web check-tests test-coverage test-web; serena-*;
images/images-push/prod-up/release.

### CI (deno task ci, deno.json) + GitHub Actions

- `deno task ci` = fmt-check && lint && check && build && test-coverage && test:db && web test. NOTE
  `test-coverage` only covers apps/api/src + packages/shared/src (no web/db coverage).
- `deno task check:web` = `deno lint src/ && tsc --noEmit` (apps/web/deno.json); api check =
  `deno check src/main.ts`.
- `.github/workflows/pr.yml` — check job (deno ci install → db:generate → email-build → fmt --check
  → lint → check → build:web), shared-test job, test-api job with postgres:18-alpine service +
  "Assert no uncommitted migrations" (`db:generate && git diff --exit-code`), migrate, seed, API
  tests w/ coverage. Deno pinned v2.9.0.
- `.github/workflows/ci.yml` ("CI & Deploy") — same steps + coverage lcov artifact. `release.yml` —
  GHCR image publishing (web image runtime-config via VITE_API_URL → /config.js).

### Ancillary

- `openspec/` — specs/ (38 capability specs) + changes/ (+ archive); managed via opsx:* skills.
  `plans/` — D01+ debt plan ledger (all resolved per 2026-07 audit; D99 = open deferred ledger).
  `docs/` incl. deployment_coolify.md.

## Notable structural oddities (also reported as findings)

1. AGENTS.md:50 middleware order is stale vs main.ts:41-76 (missing secureHeaders/bodyLimit/crawler;
   errorHandler is `app.onError`, not stack middleware).
2. Test naming split: `*_test.ts` (collection module all 3, recipe/index_test.ts,
   follow/index_test.ts, shared/utils/cursor_test.ts) vs dominant `*.test.ts`.
3. contact module breaks 3-layer convention: no service/model, local zod schema
   (contact/index.ts:20) instead of shared.
4. recipe/index.ts:23 controller imports model directly (lines 285, 332-336, 554-555), bypassing
   service layer.
5. Root `test-coverage` task excludes apps/web and packages/db from coverage (deno.json).
6. Two distinct RecipeCard artifacts: components/recipe/RecipeCard.styles.ts (styles-only) and
   components/recipe-list/RecipeCard.tsx.
