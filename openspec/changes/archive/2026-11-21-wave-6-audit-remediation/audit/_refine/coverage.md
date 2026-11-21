# Refine fragment: coverage (D1 + OQ3 notes, D2 audit-missed findings, U1 providers, U2 search, U3 data loading, U4 read-only)

Owned folders edited in place: `specs/recipe-personal-notes/`, `specs/recipe-write/`,
`specs/photo-upload-security/`, `specs/web-data-loading/`, `specs/web-shared-components/`,
`specs/advanced-search/`, `specs/recipe-list/`. No edits were needed in `specs/web-url-state/` or
`specs/web-page-logging/` (both already consistent with loaders/actions/fetchers).
`openspec validate wave-6-audit-remediation --strict` passes after the edits.

## 1. Findings

### 1.1 Notes (D1, OQ3)
- The IDOR is confirmed in code: `apps/api/src/modules/recipe/index.ts:846-873` registers
  `POST /:id/notes` (summary "Save personal notes for a recipe", description "Saves personal notes to
  the current version of the recipe") and calls `service.saveNotes(recipeId, notes)` without reading
  `userId`. `apps/web/src/components/recipe/RecipeNotesSection.tsx:15-31` takes `initialNotes`
  (pre-filled from the author's `currentVersion.personalNotes`) and calls `recipeApi.saveNotes` with a
  `catch { // silently fail }`.
- Hono behaviour for the removed method: without the `methodNotAllowed` middleware Hono answers a
  method that has no handler on a matched path with `404 Not Found` (Context7, honojs/website
  `docs/middleware/builtin/method-not-allowed.md`: "Without this middleware, Hono returns a 404 Not
  Found in that case"). `rg methodNotAllowed apps/api/src` finds nothing, and `apps/api/src/main.ts`
  defines no `app.notFound`, so a POST to `/api/v1/recipes/:id/notes` with only GET/PUT/DELETE
  registered returns Hono's default 404 before any auth guard runs (anonymous POST is 404, not 401).
- `apps/api/src/routes/openapi.coverage.test.ts:58-79` (`IN_SCOPE_BASE_PATHS`) does NOT include
  `/api/v1/recipes`, so "the coverage test stays green" proves nothing about the notes routes. A
  dedicated `apps/api/src/routes/openapi.notes.test.ts` is added (tasks below) to assert GET/PUT/DELETE
  are documented and that no `post` operation exists.
- Spec edits (`specs/recipe-personal-notes/spec.md`):
  - "Legacy notes endpoint is a caller-scoped deprecated alias" is replaced in place (it is an ADDED
    requirement) by "The legacy notes POST endpoint is removed": no handler, no describeRoute, no
    `recipeApi.saveNotes`, 404 with no row changed, anonymous 404, OpenAPI has no `post`,
    `grep -rnwE "saveNotes|updateVersionNotes"` empty.
  - "Author brewer notes are writable only through the recipe write flow" now scopes the rule to the
    author on create/PATCH, says fork/merge only write the NEW version, says the private-notes
    endpoints never touch `recipe_version`, and adds two scenarios (private-note writes never touch
    brewer notes; fork does not modify the source).
  - The detail-page requirement now deletes `initialNotes`, names the resource route and intents, adds
    the "saving never targets the brewer note" scenario, prints nothing when the viewer has no note.
  - i18n: adds `recipe.myNotes.placeholder`; removes `recipe.notes.placeholder`
    (`packages/shared/src/i18n/en.json:105`, "Add your personal notes about this recipe...", wrong for
    a private field) along with the two keys already listed; keeps `recipe.notes.saved` (`:106`).
  - The docs/tests requirement drops POST from the requestBody list and its scenarios.

### 1.2 D2(a) PATCH defaults (recipe-write)
- Confirmed: `packages/shared/src/schemas/recipe.ts:121` is
  `RecipeCreateObjectSchema.partial().extend({ bumpVersion: z.boolean().default(false) })`, with
  `visibility: VisibilityEnum.default('draft')` (`:26`) and `isFavourite: z.boolean().default(false)`
  (`:47`). The service then does `visibility: data.visibility ?? recipe.visibility`
  (`apps/api/src/modules/recipe/service.ts:349,357`) and
  `isFavourite: data.isFavourite ?? latestVersion.isFavourite` (`:325`), so the injected defaults
  always win. `updateRecipe` sends no follower notification (only `createRecipe` does, `:232-242`).
- The existing ADDED requirement covered the behaviour only through two scenarios. Added a dedicated
  requirement "An update never resets omitted visibility or favourite state" with: the root cause and
  line evidence, `RecipeUpdateSchema.parse({ title: 'x' })` deep-equals `{ title: 'x',
  bumpVersion: false }` (no `visibility`/`isFavourite` key), the drift guard
  `Object.keys(RecipeUpdateSchema.parse({})) == ['bumpVersion']`, title-only amend keeps public,
  amend keeps `isFavourite`, bump keeps both, explicit values still apply. The regression-test
  requirement now lists the two schema tests and points the old `POST /:id/notes` test block at the
  removal test.

### 1.3 D2(b) S3 request integrity (photo-upload-security)
- Confirmed in code: `apps/api/src/utils/storage/s3.ts:27-33` builds
  `` `${this.endpoint}/${this.bucket}/${filename}` `` unencoded; `signRequest` signs
  `parsedUrl.pathname` and `parsedUrl.search.slice(1)` (`:113-114`); no `content-type` header
  (`:94-109`). `audit/t4a-upload-security.md` rows 3a (bucket-subresource PUT via
  `a.x/%2e%2e?policy=`), 3c (overwrite via `a.x/%2e%2e/victim-key`) and the table at `:47-54`
  (`a.x?tagging=` → object-tagging PUT).
- The existing spec already covered server keys, the key guard, signed-path equality and Content-Type.
  Gaps closed in place:
  - New requirement "No client-supplied filename can alter a signed S3 request": the controller never
    reads `File.name` (test with a throwing `name` getter), and a crafted-filename table
    (`?policy=`, `?cors=`, `?acl=`, `?tagging=`, `?uploads=`, `?partNumber=1&uploadId=1`, traversal to
    another bucket, `../<legacy-key>`) must produce only `PUT /<bucket>/<uuid>.<ext>` with an empty
    canonical query.
  - New requirement "Uploads never overwrite an existing object": only same-request generated keys
    are written; `LocalStorageDriver.save` uses `writeFile(..., { flag: 'wx' })`; S3 relies on
    UUIDv4 and deliberately does not send `If-None-Match` (conditional PutObject support could not be
    confirmed for Garage, the dev S3 backend; AWS added it in 2024, several providers support it).
  - New scenario under "S3 request target integrity": `S3_ENDPOINT` with a path, query or fragment is
    refused in the driver constructor (otherwise the pathname check would fail every upload, or a
    bucket path in the endpoint would double the bucket).
  - New requirement "Operators are guided to audit buckets exposed to pre-change versions": exact
    `aws s3api get-bucket-*` commands, the object-key audit against both key patterns, the photo-row
    comparison, rotate-on-finding, and per-provider credential scoping (R2 Object Read & Write on the
    bucket; Garage `bucket allow --read --write` without `--owner`; AWS/MinIO object-only policy).
    Today only `docs/deployment_coolify.md` §10 is tasked (5.31); compose docs are added.
  - The "Traversal regression test" scenario moved from `service.test.ts` to `index.test.ts`, because
    task 5.21 removes the `name` field from `uploadPhoto`, so a service-level filename test cannot
    survive the refactor (task 5.2 had this latent conflict).

### 1.4 U1 providers (web-shared-components)
- Confirmed against `audit/t5-web-state.md` §1 V1-V6: `router.tsx:69-73` vs `:351-363`,
  `Layout.tsx:23-24`, `Toast.tsx:99-102`; crashing pages `AdminRecipesPage.tsx:26`,
  `AdminVendorsPage.tsx:18`, `AdminUserDetailPage.tsx:25`, `AdminCompatibilityPage.tsx:21`,
  `AdminCoffeeVarietiesPage.tsx:124`; raw-key confirm on `/admin/equipment` and `/admin/taste-notes`.
- `apps/web/src/router.tsx` has 14 admin element routes today: index, `users`, `users/new`,
  `users/:id`, `users/:id/edit`, `recipes`, `equipment`, `vendors`, `taste-notes`,
  `coffee-varieties`, `compatibility`, `badges`, `audit-log`, `cache` (`router.tsx:352-461`), plus
  action-only routes `recipes/:id/like|favourite|rate`, `follow/:userId`, `comments/*` (`:337-346`).
- Spec edits: the ADDED smoke-test requirement now names the five pages with file:line, walks nested
  routes, skips action-only and `resources/` routes, tolerates a loader-driven 404 page, and asserts a
  lower bound of the 14 admin paths (so a broken walk cannot skip `/admin`). Two new scenarios: every
  admin route renders; every public/guarded route renders.
- Contradiction fixed: the main-spec requirement "useBanUser hook owns the ban/unban state machine and
  API calls" (`openspec/specs/web-shared-components/spec.md:108-167`) mandates direct
  `adminApi.banUser`, and "New shared components have Vitest test coverage" mandates mocking
  `adminApi` in the hook test; both conflict with U3's enforcement test. Now RENAMED to "...and
  submits through the admin user route action" and MODIFIED (fetcher submit with
  `defaultShouldRevalidate: false`, verified in Context7 `/remix-run/react-router`
  `docs/how-to/optimize-revalidation.md`), the test-coverage and logging requirements MODIFIED
  accordingly. The precedence clause in web-data-loading now points at the rewritten requirement.
- Stale content fixed: the HomePage requirements in `web-shared-components` and `recipe-list` claimed
  the shared card adds a `currentVersion` badge row. The real card
  (`apps/web/src/components/recipe-list/RecipeCard.tsx:68,81-89`) renders the strip only when a
  `version` prop is passed, and t7 drops `versions[]` from list items, so the scenario was false. Rewritten.

### 1.5 U2 search (advanced-search)
- Already present and kept: DB-side score/order/LIMIT/OFFSET + COUNT, `findAllForRanking` removed,
  `pg_trgm` GIN indexes via `schema.ts` + `--custom` extension migration, statement timeout → 503
  `QUERY_TIMEOUT`, 200-char bound, deterministic `id` tie-break, real rating sort with unrated last.
- Gaps closed in place:
  - 1000-match scenario: the "large search" scenario is now 1000 matches (two versions each) with the
    issued SQL captured by a Drizzle `logger` (exactly two statements: page ≤ 10 rows, count 1 row) and
    no version columns in any returned row; the past-the-end scenario uses 1000/page 101.
  - LIKE metacharacters: the spec STRIPPED `%`, `_`, `\` (design t7 D5, task 10.9), so `a_c` matched
    `ac` and `100%` matched `100`. The job requires escaping. Now: `normalizeSearchTerm` = trim only;
    `toContainsPattern` escapes `\`→`\\`, `%`→`\%`, `_`→`\_` and wraps in `%…%`. PostgreSQL's
    default LIKE escape character is `\`, the pattern is a bound parameter of Drizzle's `ilike()`, so
    no `ESCAPE` clause or raw SQL is needed, and pg_trgm honours escapes in LIKE patterns. Scenarios:
    underscore, percent and backslash match literally; whitespace-only = no search; helper escape
    order; index/seqscan parity for escaped patterns. This changes the shared `recipe-filter` delta
    (not owned): cross-folder request below.
  - Pre-flight: design Risks (`design.md:837`) promised "a pre-flight check" but only task 10.1 (a
    manual psql query with a conditional fallback) existed. Added requirement "Migrations pre-flight
    the trigram extension": `packages/db/src/preflight.ts` `assertMigrationPreflight(client)` checks
    `pg_extension`, `pg_available_extensions` and `has_database_privilege(..., 'CREATE')` (pg_trgm is
    trusted, `audit/t7-search.md:133-134`), wired into `packages/db/src/migrate.ts` (created by task
    19.1), exits 1 with fixed messages before `migrate()`.
  - Visibility: added "Search never widens the listing's visibility scope" (subset of the unfiltered
    listing; same `finalWhere` for page and count; hidden recipes including unlisted never match, also
    via older versions). It defers the visibility rule itself to the unlisted agent's
    recipe-visibility capability and does not define it. Current code: non-admin listings are
    `visibility = 'public'` (`apps/api/src/modules/recipe/model.ts:289-294`, starred `:1200`).

### 1.6 U3 data loading (web-data-loading)
- Re-scan (2026-11-19) with a block-level scanner over every non-test `.ts/.tsx` in `apps/web/src`
  (useEffect bodies calling `*Api.*`, `api.*` incl. multi-line chains and generics, `fetch(`,
  `get*Cached(`, directly or through a local function): **42 `useEffect` fetch blocks in 39 files**,
  identical to `audit/t5-web-state.md` §4. The full list:
  `components/brew-log/BrewHistorySection.tsx:25`, `components/brew-log/RecipeBrewStats.tsx:20`,
  `components/collections/AddToCollectionModal.tsx:34`, `components/layout/Navbar.tsx:195`,
  `components/layout/NotificationBell.tsx:37`, `components/layout/NotificationDropdown.tsx:32`,
  `components/onboarding/OnboardingWizard.tsx:106`, `components/taste/TasteAutocomplete.tsx:41`,
  `contexts/AuthContext.tsx:85` (allowlisted), `pages/TasteNotesPage.tsx:217`,
  `pages/admin/AdminAuditLogPage.tsx:38`, `AdminBadgesPage.tsx:22`, `AdminCoffeeVarietiesPage.tsx:173`,
  `AdminCompatibilityPage.tsx:33`, `AdminDashboard.tsx:33`, `AdminEquipmentPage.tsx:32`,
  `AdminRecipesPage.tsx:37`, `AdminTasteNotesPage.tsx:31`, `AdminUserDetailPage.tsx:50`,
  `AdminUserEditPage.tsx:46`, `AdminUsersPage.tsx:79`, `AdminVendorsPage.tsx:33`,
  `pages/auth/RegisterPage.tsx:39`, `pages/auth/VerifyEmailPage.tsx:29`,
  `pages/beans/BeanListPage.tsx:41`, `pages/coffee-varieties/CoffeeVarietiesPage.tsx:52`,
  `CoffeeVarietyDetailPage.tsx:37`, `pages/equipment/EquipmentCatalogPage.tsx:56`,
  `EquipmentDetailPage.tsx:31`, `EquipmentListPage.tsx:38`, `pages/recipes/RecipeComparePage.tsx:52`,
  `RecipeCreatePage.tsx:74`, `RecipeCreatePage.tsx:100`, `RecipeEditPage.tsx:68`,
  `RecipeFocusModePage.tsx:36`, `RecipeFocusModePage.tsx:47`, `RecipeForkPage.tsx:33`,
  `RecipeVersionsPage.tsx:48`, `VersionDiffPage.tsx:108`, `useCoffeeVarietyFilter.tsx:40`,
  `useCoffeeVarietyFilter.tsx:76`, `pages/setups/SetupListPage.tsx:37`.
- Import scan: 70 non-test modules outside `apps/web/src/api/` import `api/client.ts`,
  `api/index.ts` or `api/static-cache.ts`. Minus 38 effect files, `AuthContext`, 5 `routes/*.ts`
  action modules and `hooks/useStaticCacheSync.ts` (cache-bust only) leaves **25** files with direct
  client calls outside effects: 13 inline-loader pages (`HomePage`, `RecipeListPage`,
  `StarredRecipesPage`, `RecipeDetailPage`, `CollectionListPage`, `CollectionsBrowsePage`,
  `CollectionDetailPage`, `CollectionEditPage`, `BrewLogListPage`, `BrewLogFormPage`,
  `UserProfilePage`, `SettingsPage`, `NotificationListPage`) and 12 mutation-only modules
  (`CollectionRecipeList`, `EmailVerificationBanner`, `NotificationItem`, `PhotoUpload`,
  `RecipeNotesSection`, `useBanUser`, `AdminCachePage`, `AdminUserCreatePage`, `ForgotPasswordPage`,
  `ResetPasswordPage`, `CollectionCreatePage`, `ContactPage`).
- Raw `fetch(` outside `api/`: **2** sites the audit inventory missed,
  `components/qrcode/RecipeQRCode.tsx:34` and `components/recipe/ShareSection.tsx:48` (QR SVG download
  in click handlers; `ShareSection` swallows errors with `// Silently fail`; both bypass the runtime
  `VITE_API_URL` base).
- **Migrated-site count recorded in the spec: 65 modules** (38 effect files + 25 direct-call files +
  2 raw-fetch files), i.e. 41 effect blocks + 13 inline loaders + 12 mutation modules + 2 raw
  fetches. Allowed afterwards: `api/**`, `*.data.ts`, `routes/**`, `contexts/AuthContext.tsx`,
  `hooks/useStaticCacheSync.ts` (only `CACHE_BUST_KEY`, `clearStaticCache`).
- Coverage of existing tasks: every effect site is covered by 13.1-13.11, 14.1-14.14 and 16.4 (mapping
  verified one by one). Gaps found and tasked below: the inline loaders of `BrewLogListPage`,
  `NotificationListPage` and `SettingsPage` are never moved to `*.data.ts` (14.8 lists only five
  pages, 14.10 collections, 14.7 BrewLogForm); the two raw-fetch QR sites; the Biome override and the
  architecture test would flag `hooks/useStaticCacheSync.ts` (it imports `static-cache.ts`, task 15.5)
  without an allowlist entry; no test enforces import placement (the Biome rule is suppressible and
  the architecture test only scans `useEffect` bodies).
- Spec edits: the paradigm requirement names the `useStaticCacheSync` exception; the loader
  requirement forbids loader/action exports from page modules and records the inventory; the fetcher
  requirement adds the private note and the QR download (`useRecipeQrDownload`,
  `resources/qrcode/recipe/:slug`, `qrcodeApi.recipeSvg` on a new `api.getText`); the Biome guard
  allowlist adds `useStaticCacheSync`; new requirement "A static enforcement test keeps API access
  inside loaders, actions and resource routes" (`apps/web/src/data-loading.enforcement.test.ts`, four
  rules, self-check fixtures, shrink-only `PENDING` list).

### 1.7 U4 (read only, `specs/ci-image-publishing/spec.md`)
- Present: `publish` only on `push` to `main`/`v*`, `needs:` "every quality, test and image-build
  job", PR build + boot smoke test of both images (`/ready` 200, non-root, `healthy`, web `/healthz`,
  SPA, proxied API), no PR publish.
- Gaps (cross-folder requests §5): `needs:` does not name the `doc-drift` job that `design.md`
  (cross-track item 1 and t4b) adds to `ci.yml`; nothing enforces that a job added later is added to
  `publish.needs`; no scenario states that publication never overlaps a running test job.

## 2. Design text

Paste into `design.md` as noted.

### Into "Personal notes and recipe write integrity (t1)", replacing decision 5

5. **Remove `POST /:id/notes` outright (user decision OQ3, 2026-11-19).**
   - Choice: delete the route, its `describeRoute` entry, `service.saveNotes`, `model.updateVersionNotes` and `recipeApi.saveNotes`. The `recipe-note` router registers only `GET`, `PUT` and `DELETE` on `/:id/notes`, so Hono answers a `POST` with its default 404 (it emits 405 only with the `methodNotAllowed` middleware, which the app does not use). A test through the composed `routes` app asserts 404 and that no `recipe_version` or `user_recipe_note` row changes. `apps/api/src/routes/openapi.notes.test.ts` asserts the spec lists no `post` on the path, because `openapi.coverage.test.ts` does not cover `/api/v1/recipes`.
   - Alternatives: a caller-scoped deprecated alias of `PUT` for one release (the previous choice), or `410 Gone`.
   - Rationale: the user said the endpoint is deprecated and must be removed. An alias keeps a write path alive on the URL that was the IDOR, and the only caller is the SPA, which ships in the same release. An open tab from before the deploy gets a 404 on save, and the rewritten `RecipeNotesSection` surfaces failures instead of swallowing them.

### Into t1, after decision 11

11a. **The update schema carries no defaults, and a test pins it.**
   - Choice: besides building `RecipeUpdateObjectSchema` field by field, `packages/shared/src/schemas/recipe.test.ts` asserts `RecipeUpdateSchema.parse({ title: 'x' })` deep-equals `{ title: 'x', bumpVersion: false }` and `Object.keys(RecipeUpdateSchema.parse({}))` equals `['bumpVersion']`. The service decides "provided" by key presence.
   - Alternatives: rely on review, or strip defaults in the handler.
   - Rationale: Zod 4 keeps `.default()` through `.partial()`/`.optional()`; the bug unpublished recipes and cleared favourites silently. A key-set assertion fails the moment anyone adds a `.default()` to an update field.

### Into "Upload storage keys and file validation (t4a)", after decision 8

8a. **The filename is never read, and no upload can overwrite an object.**
   - Choice: the controller passes only `{ declaredType, size, data }`; a route test uses a `File` whose `name` getter throws. Keys come only from `generateStorageKey`/`thumbnailKey` in the same request. `LocalStorageDriver.save` writes with `{ flag: 'wx' }` (exclusive create). The S3 driver constructor rejects an `S3_ENDPOINT` with a path, query or fragment. A route-level table test drives crafted filenames (`?policy=`, `?cors=`, `?acl=`, `?tagging=`, `?uploads=`, `?partNumber=&uploadId=`, other-bucket traversal, `../<legacy-key>`) through a mocked `fetch` and asserts only `PUT /<bucket>/<uuid>.<ext>` with an empty canonical query.
   - Alternatives: send `If-None-Match: *` on S3 PUTs (rejected: conditional `PutObject` support is not confirmed for Garage, the dev backend, and varies across S3-compatibles; a 501 would break uploads); a `HEAD` before `PUT` (racy and an extra round trip).
   - Rationale: UUIDv4 keys (122 random bits) make collisions negligible; exclusive create makes the local driver fail closed; the table test proves the audit-missed subresource and overwrite paths are closed end to end.

8b. **Operators audit buckets that pre-wave-6 versions could reach.**
   - Choice: `docs/deployment_coolify.md` §10 and `docs/deployment_compose.md` get a "Photo storage security check" with `aws s3api get-bucket-{policy,acl,cors,tagging,lifecycle-configuration,versioning,website}`, a `list-objects-v2` audit against both key patterns, a photo-row comparison, rotate-on-finding, and per-provider credential scoping (R2 Object Read & Write on one bucket; Garage `bucket allow --read --write` without `--owner`; AWS/MinIO object-only policy).
   - Alternatives: a scripted auditor in the repo (rejected: provider-specific, needs credentials the app should not hold for bucket config).
   - Rationale: the fix stops new abuse but cannot undo configuration a crafted upload may already have changed.

### Into "Search ranking and database-side pagination (t7)", replacing decision 5

5. **Search bounds and literal matching.**
   - Choice: `search: z.string().trim().max(200)`. `normalizeSearchTerm(raw)` trims (empty means no search). `toContainsPattern(term)` escapes `\` → `\\`, `%` → `\%`, `_` → `\_` (in that order) and wraps in `%…%`. The pattern is a bound parameter of Drizzle `ilike()`; PostgreSQL's default LIKE escape is `\`, so no `ESCAPE` clause or `sql` fragment is needed, and pg_trgm honours escaped characters. The same helper serves `search`, `mainBrewer` and `author`. No minimum length: memory is bounded and the statement timeout caps cost.
   - Alternatives: strip the metacharacters (the previous choice: `a_c` matched `ac`, `100%` matched `100`, `\` silently became no search), or an explicit `ESCAPE` clause (needs raw SQL).
   - Rationale: users can search for literal `%`, `_` and `\`, the predicate stays index-assisted, and the filter, score and count share one pattern.

### Into t7, after decision 2

2a. **Migration pre-flight for `pg_trgm`.**
   - Choice: `packages/db/src/preflight.ts` exports `assertMigrationPreflight(client)`, called by `packages/db/src/migrate.ts` before `migrate()`. It reads `pg_extension`, `pg_available_extensions` and `has_database_privilege(current_user, current_database(), 'CREATE')`, and exits 1 with a fixed message (not available → use the official image or install contrib; no CREATE → run `CREATE EXTENSION pg_trgm;` as the owner). Task 10.1 verifies both official images once and records versions.
   - Alternatives: a manual check only (the previous plan, which also kept a "ship without indexes" fallback branch), or letting the migration fail mid-run.
   - Rationale: both official images ship contrib, so the check protects managed or custom servers, where a mid-migration failure is hardest to diagnose. It runs in the compose `migrate` one-shot service, so the API never starts against a half-migrated schema.

2b. **Search never widens visibility.** The search union and score are ANDed onto the listing's existing visibility condition (owned by the recipe-visibility capability), and the count uses the same `finalWhere`. A DB test asserts that private, draft, unlisted and soft-deleted recipes never match, including through older versions.

### Into "Web providers, shareable URL state and data-loading standard (t5)", after decision 13

13a. **A lint-independent enforcement test.**
   - Choice: `apps/web/src/data-loading.enforcement.test.ts` scans every non-test `.ts/.tsx` under `apps/web/src` and fails on: (1) value imports (incl. multi-line, `export … from`, dynamic `import()`) of `api/client.ts`, `api/index.ts`, `api/static-cache.ts` outside `api/**`, `*.data.ts`, `routes/**`, `contexts/AuthContext.tsx` and `hooks/useStaticCacheSync.ts` (only `CACHE_BUST_KEY`, `clearStaticCache`); `import type` is allowed everywhere; (2) `fetch(`, `XMLHttpRequest`, `new EventSource(`, `navigator.sendBeacon(` outside `api/**`; (3) `export … loader|action` in a `.tsx` outside `routes/`; (4) value imports from `*.data.ts` outside `router.tsx`, `routes/**` and other data modules. It carries self-check fixtures and a shrink-only `PENDING` list that must be empty before archive.
   - Alternatives: rely on the Biome `noRestrictedImports` override alone (suppressible with a `biome-ignore` line, and blind to raw `fetch` and loader placement), or only the `useEffect` architecture test (misses event-handler calls and direct mutations).
   - Rationale: the user made loaders, actions and fetchers the only mechanism; this test makes that a CI fact. The 2026-11-19 inventory is 65 modules: 41 effect blocks in 38 files, 13 inline loaders, 12 mutation-only modules and 2 raw-fetch QR downloads the audit missed.

13b. **The QR download goes through a resource route.** `useRecipeQrDownload(slug)` calls `fetcher.load('/resources/qrcode/recipe/<slug>')`, whose loader returns `{ ok: true, svg }` from `qrcodeApi.recipeSvg(slug, { signal })` (on a new `api.getText`, so `VITE_API_URL` applies). The hook builds the Blob download and toasts `qrcode.downloadFailed` on failure. This replaces the raw `fetch` in `RecipeQRCode.tsx:34` and `ShareSection.tsx:48`.

13c. **`useBanUser` is rewritten in place, not overridden by precedence.** The web-shared-components requirement is renamed and modified: the hook submits `intent=ban|unban` to the `/admin/users/:id` action with `defaultShouldRevalidate: false`, which keeps the "patch local state, no re-fetch" contract of both admin pages.

### Into "Risks / Trade-offs", replacing the t1 line "[The deprecated POST alias lingers] → …"

- [A browser tab opened before the deploy still posts to the removed `POST /notes`] → Mitigation: it gets a 404, the rewritten editor shows the error and keeps the typed text, and a reload loads the new client.

### Into "Risks / Trade-offs", replacing the t7 line "[`pg_trgm` is unavailable in some image or managed DB] → …"

- [`pg_trgm` is unavailable, or the role cannot create it, on a managed DB] → Mitigation: the migration pre-flight fails before any migration with a message naming the remedy; both official images pass it.

## 3. Tasks to add

Group 4 (notes API):
- [ ] 4.? (after task 4.17) Add `apps/api/src/routes/openapi.notes.test.ts`, built like `openapi.coverage.test.ts` (set `OPENAPI_ENABLED=true`, `APP_ENV=test`, `CACHE_DRIVER=memory` before the dynamic import of `routes/index.ts`, then request `/api/v1/openapi.json`). Assert `paths['/api/v1/recipes/{id}/notes']` has `get`, `put` and `delete`, each with `tags: ['Recipes']`, a `summary`, `security` containing `bearerAuth`, the `id` path parameter and `401`/`404` responses; `put` has a `requestBody` and a `400` response; and the path has no `post` key. This is needed because `IN_SCOPE_BASE_PATHS` in `openapi.coverage.test.ts:58-79` excludes `/api/v1/recipes`.
- [ ] 4.? (after the previous task) Run `grep -rnwE "saveNotes|updateVersionNotes" apps/api/src` and confirm no matches (the web side is checked again in task 16.19).

Group 5 (uploads):
- [ ] 5.? (after task 5.17) Add to `apps/api/src/utils/storage/s3.test.ts`: constructing `S3StorageDriver` with `S3_ENDPOINT` set to `https://s3.example.com/brewform-uploads`, `https://s3.example.com/?x=1` or `https://s3.example.com/#f` throws an error naming `S3_ENDPOINT`; `https://s3.example.com` and `https://s3.example.com/` are accepted.
- [ ] 5.? (after task 5.24) Add `apps/api/src/modules/photo/index.s3.test.ts` (same harness as task 5.24: router with `app.onError(errorHandler)`, seeded user and recipe, `signAccessToken` Bearer token, `afterEach` cleanup). Mutate S3 config (`S3_ENDPOINT=https://s3.test`, `S3_BUCKET=test-bucket`), set `storageDeps.driver = new S3StorageDriver()`, and `vi.spyOn(globalThis, 'fetch')` resolving `new Response(null, { status: 200 })` (preceded `// biome-ignore` rationale comment as in `storage.test.ts`). For each multipart filename `a.x/%2e%2e?policy=`, `a.x/%2e%2e?cors=`, `a.x?acl=`, `a.x?tagging=`, `a.x?uploads=`, `a.x?partNumber=1&uploadId=1`, `a.x/%2e%2e/%2e%2e/other-bucket/payload` and `../1731000000000-abcd1234.jpeg`, upload `JPEG_1x1` and assert: 201; every `fetch` call is a `PUT`; `new URL(call.url).pathname` matches `^/test-bucket/<uuidv4>(_medium)?\.(jpg|png|webp)$`; `search === ''`; the `authorization` header's canonical request (recomputed in the test from the sent headers) has an empty query line; and no call targets `/test-bucket/` or `/other-bucket/`.
- [ ] 5.? (after the previous task) Add to `apps/api/src/modules/photo/index.test.ts`: (a) a multipart upload whose `file` part is `class EvilFile extends File { get name(): string { throw new Error('name read'); } }` built from `JPEG_1x1` succeeds with 201; (b) with `STORAGE_DRIVER=local` and a temp `UPLOAD_DIR` pre-populated with `1731000000000-abcd1234.jpeg` and `<uuid-A>.jpg` (random bytes), uploads named after both files return new `<uuid>.jpg` URLs and both pre-existing files are byte-identical afterwards (compare with `readFile`).
- [ ] 5.? (after task 5.31) Write the "Photo storage security check (installs that ran before wave 6)" section in `docs/deployment_coolify.md` §10, exactly as listed in the `photo-upload-security` requirement "Operators are guided to audit buckets exposed to pre-change versions": the seven `aws s3api get-bucket-*` commands with `--bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"` and how to read `NoSuch…` errors; `aws s3api list-objects-v2` plus a `jq` filter flagging keys matching neither `^[0-9]{13}-[0-9a-f]{8}(_medium)?\.[A-Za-z0-9]+$` nor `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(_medium)?\.(jpg|png|webp)$`; `get-object-tagging` on a sample; a `psql` query listing `photo.url`/`thumbnail_url` with `created_at` to compare against `LastModified`; the delete-configuration, restore-from-backup and rotate-on-finding steps; and the per-provider credential scoping (R2, Garage without `--owner`, AWS/MinIO object-only IAM policy JSON).

Group 8 (recipe write): none beyond the modifications in §4.

Group 10 (search):
- [ ] 10.? (after task 10.3) Add to `apps/api/src/modules/recipe/model.search.test.ts`: (j) a 1000-recipe fixture (two versions each, bulk-inserted in one `db.insert(...).values([...])` per table, deleted in `afterAll`) where `findListPage({ search: 'espresso', page: 3, perPage: 10, … })` run on a test `drizzle(client, { schema, logger: { logQuery: (q) => queries.push(q) } })` instance issues exactly two statements, returns 10 rows and `total` 1000, and no row has `versions`, `productName` or `personalNotes`; page 101 is empty with `total` 1000. (k) literal matching: `a_c` returns `a_c` not `abc`; `100%` returns `100% Arabica` not `1000 Arabica`; `\` returns only the recipe whose productName is `C:\beans`; `'   '` behaves as no search. (l) visibility: private, draft, unlisted and soft-deleted recipes titled `zq7hidden`, and a private recipe whose older version's productName is `zq7legacy`, never match for an anonymous viewer or a non-author; a search result set is a subset of the same listing without `search`.
- [ ] 10.? (after task 10.20) Write failing `packages/db/src/preflight.test.ts` with a stub client (a function returning canned catalog rows) for the three outcomes in the `advanced-search` requirement "Migrations pre-flight the trigram extension" (not available → exact message; available, not installed, no CREATE → exact message naming role and database; installed with no CREATE → passes). Then implement `packages/db/src/preflight.ts` exporting `assertMigrationPreflight(client)`: one catalog query selecting `exists(select 1 from pg_extension where extname = 'pg_trgm')`, `exists(select 1 from pg_available_extensions where name = 'pg_trgm')`, `has_database_privilege(current_user, current_database(), 'CREATE')`, `current_user` and `current_database()`, with a `// D03 raw-SQL exception:` comment (catalog pre-flight in the migration runner, not application query code), a docblock, and `console` entry/exit lines matching the runner's style (no credentials). Run `make test-specific filter=packages/db/src/preflight.test.ts` (or `pnpm --filter @brewform/db exec vitest run src/preflight.test.ts` inside Docker).

Group 11 (web foundations): none beyond the modification of 11.6 in §4.

Group 14 (data loading):
- [ ] 14.? (after task 14.8) Move the inline loaders of `apps/web/src/pages/brew-logs/BrewLogListPage.tsx`, `apps/web/src/pages/notifications/NotificationListPage.tsx` and `apps/web/src/pages/settings/SettingsPage.tsx` into `BrewLogListPage.data.ts`, `NotificationListPage.data.ts` and `SettingsPage.data.ts` (keeping the `requireAuth` wrapping from task 11.19), pass `request.signal` to every client call (`brewLogApi.list`, `notificationApi.list`, the preferences read via the typed method from task 11.14), switch the components to `import type { loader }` + `useLoaderData<typeof loader>()`, wire the routes in `router.tsx`, and add a loader test per module asserting the signal is forwarded.
- [ ] 14.? (after task 14.13) Replace the two raw `fetch(` QR downloads: add `api.getText(endpoint, opts?: RequestOptions): Promise<string>` to `apps/web/src/api/client.ts` (same base URL, auth refresh and error parsing as the JSON helpers, returns `response.text()`), `qrcodeApi.recipeSvg(slug, opts)` to `apps/web/src/api/index.ts` (`GET /qrcode/recipe/<slug>.svg`), and the resource route `apps/web/src/routes/resources/qrcode.ts` (path `resources/qrcode/recipe/:slug`, loader returning `{ ok: true, svg } | { ok: false, error }`, entry/exit/failure logs with `slug` only) registered in `router.tsx`. Add `apps/web/src/components/qrcode/useRecipeQrDownload.ts` (uses `useFetcher()`, exposes `download()` and `downloading`, on `{ ok: true }` creates a `Blob` of type `image/svg+xml` and clicks an anchor named `brewform-<slug>-qr.svg`, on `{ ok: false }` calls `toast.error('qrcode.downloadFailed')`, mount/unmount debug logs). Use it in `components/qrcode/RecipeQRCode.tsx` and `components/recipe/ShareSection.tsx` (deleting the silent `catch`). Tests: `routes/resources/qrcode.test.ts` (ok and error results, signal forwarded), `useRecipeQrDownload.test.tsx` (download on success, toast on failure), and update `RecipeQRCode.test.tsx` / `ShareSection.test.tsx`. No new i18n keys (`qrcode.downloadFailed` exists in both locales).

Group 15 (guards):
- [ ] 15.? (after task 15.6) Add `apps/web/src/data-loading.enforcement.test.ts` implementing the four rules of the `web-data-loading` requirement "A static enforcement test keeps API access inside loaders, actions and resource routes": read files with `node:fs` (`readdirSync` recursive, skip `*.test.ts(x)`, `test-setup.ts`, `test-utils/**`), resolve relative and `@/` specifiers to `apps/web/src` paths, parse multi-line `import`/`export … from`/dynamic `import()` statements and their named bindings, and report every violation as `<relative path>:<line> <rule>`. Include the self-check `describe` block with the inline fixtures listed in the requirement. Seed a `PENDING` set with the 65 modules from `audit/_refine/coverage.md` §1.6 (minus any already migrated), and fail when a `PENDING` file no longer violates. Each migration task in groups 13, 14 and 16 removes its files from `PENDING`.
- [ ] 15.? (after task 15.8) Confirm `PENDING` in `apps/web/src/data-loading.enforcement.test.ts` is empty and delete the set, run `make test-web`, and record in the PR description: "Data-loading migration: 41 useEffect fetch blocks in 38 files, 13 inline loaders moved to `*.data.ts`, 12 mutation-only modules moved to actions, 2 raw-fetch QR downloads moved to a resource route (65 modules); AuthContext is the only API-client exception."

Group 19 (deploy):
- [ ] 19.? (after task 19.1) In `packages/db/src/migrate.ts`, call `await assertMigrationPreflight(client)` (from `./preflight.ts`, task in group 10) before `migrate()`; on a thrown pre-flight error print the message to stderr and exit 1 without applying migrations. Add a runner test (or extend the runner's test) with a stub that fails the pre-flight and asserts `migrate` is never called. Verify `make test-db-provision` still passes on `postgres:18-trixie`.

Group 21 (deploy docs):
- [ ] 21.? (after task 21.7) Add the same "Photo storage security check (installs that ran before wave 6)" section to `docs/deployment_compose.md` inside "Upgrading from the pre-wave-6 compose file", for installs that used `STORAGE_DRIVER=s3` (copy the commands from the `docs/deployment_coolify.md` §10 section written in group 5, and add the Garage credential command first since compose users commonly self-host Garage or MinIO). Link it from the release notes drafted in task 16.17.

## 4. Tasks to modify or remove

- 4.1 → `- [ ] 4.1 Add a failing test file \`apps/api/src/routes/recipe-notes-post-removed.test.ts\` that mounts the composed \`routes\` app from \`apps/api/src/routes/index.ts\` with \`app.onError(errorHandler)\`, seeds users A and B and A's public recipe R through \`@brewform/db\`, authenticates with \`signAccessToken\` Bearer tokens, and cleans up in \`afterEach\`. Assert that B's \`POST /api/v1/recipes/R/notes\` with \`{ "notes": "x" }\` returns 404, that every \`recipe_version.personal_notes\` of R is byte-identical afterwards, and that no \`user_recipe_note\` row exists for (B, R). It fails today (200 and an overwrite).`
- 4.2 → `- [ ] 4.2 In the same file, assert that B's \`POST /:id/notes\` on A's \`private\` recipe returns 404 and writes nothing, and that an anonymous \`POST /:id/notes\` returns 404 (not 401). After task 4.16 mounts the \`recipe-note\` router with only GET, PUT and DELETE, the file must still pass (Hono returns 404 for an unmatched method; the app does not use \`methodNotAllowed\`).`
- 4.3 → `- [ ] 4.3 Delete the obsolete \`describe('saveNotes')\` block in \`apps/api/src/modules/recipe/service.test.ts:848-864\` and the \`POST /:id/notes\` block in \`apps/api/src/modules/recipe/index.test.ts:906-927\`; they are replaced by the removal test (tasks 4.1-4.2) and the \`recipe-note\` module tests below.`
- 4.14 → `- [ ] 4.14 Create \`apps/api/src/modules/recipe-note/index.ts\` (Hono \`<AppEnv>\` router) with \`GET\`, \`PUT\` and \`DELETE /:id/notes\` only (no \`POST\` handler):` keeping the bullets `authGuard` via a `deps` proxy; `zValidator('param', z.object({ id: z.uuid() }))` and `zValidator('json', RecipeNotesSchema, zodValidationHook)` on PUT; `Cache-Control: private, no-store` on every response; map `RECIPE_NOT_FOUND`→404 and `VALIDATION_ERROR`→400. Delete the bullet "`Deprecation: true` and a `Link` successor header on POST." and change "on PUT and POST" to "on PUT".
- 4.15 → `- [ ] 4.15 Add full \`describeRoute()\` metadata to the GET, PUT and DELETE notes routes: tag \`Recipes\`, summary, description, \`security\`, the \`id\` parameter, \`jsonRequestBody(RecipeNotesSchema)\` on PUT, 200 as \`resolver(successEnvelope(RecipeUserNoteOutputSchema))\`, and 400/401/404 as \`resolver(ErrorEnvelopeSchema)\`.`
- 4.16 → `- [ ] 4.16 Mount the router in \`apps/api/src/routes/index.ts\` with \`routes.route('/api/v1/recipes', recipeNote)\`. Delete the old \`POST /:id/notes\` route and its \`describeRoute()\` entry (\`apps/api/src/modules/recipe/index.ts:846-873\`) and the \`RecipeNotesSchema\` import there. Delete \`saveNotes\` from \`recipe/service.ts\` and \`updateVersionNotes\` from \`recipe/model.ts\`. No module registers a \`POST\` on \`/:id/notes\`. Run \`make test-specific filter=src/routes/recipe-notes-post-removed.test.ts\` and confirm it now passes.`
- 4.17 → replace the first bullet with "The IDOR regression: B cannot change A's brewer note or A's private note via `PUT`, and `PUT`/`DELETE` by A or B never change any `recipe_version.personal_notes`." and replace "Idempotent DELETE, the `Cache-Control` header, and the `Deprecation` header on POST." with "Idempotent DELETE and the `Cache-Control` header." (the POST removal is covered by tasks 4.1-4.2).
- 5.2 → `- [ ] 5.2 Add a failing route test to \`apps/api/src/modules/photo/index.test.ts\` (harness as in task 5.24; set it up here if 5.24 has not run): as the recipe author, upload \`JPEG_1x1\` as multipart with filename \`a.x/%2e%2e/%2e%2e/other-bucket/payload\` and assert 201, \`url\` matches \`/uploads/<uuidv4>.jpg\`, contains none of \`other-bucket\`, \`%2e\`, \`..\`, and \`thumbnailUrl === url\`. Add a second case for filename \`a.x/%2e%2e?policy=\`. Confirm both fail on the current \`generateFilename\`. (Route level, because task 5.21 removes the \`name\` field from \`uploadPhoto\`.)`
- 5.16 → append: "Change `save` to `writeFile(path, data, { flag: 'wx' })` so an existing file is never replaced, and add a `storage.test.ts` case: saving twice to the same safe key throws on the second call and the file keeps the first bytes."
- 5.18 → append a bullet: "in the constructor, parse `S3_ENDPOINT` with `new URL()` and throw `Error('S3_ENDPOINT must be the account endpoint with no path, query or fragment')` when `pathname` is not `''`/`'/'` or `search`/`hash` is non-empty; strip a trailing `/` as today."
- 5.28 → replace "Optionally send fixed part names (`photo`, `thumbnail.jpg`) so local filenames are not transmitted." with "Send fixed multipart filenames (`photo.<ext>` from the selected file's MIME type, and `thumbnail.jpg`) so local filenames are never transmitted; assert the sent filenames in `PhotoUpload.test.tsx`."
- 5.31 → `- [ ] 5.31 \`docs/deployment_coolify.md\` §10: step 3 scopes the R2 token to the \`brewform-uploads\` bucket only ("Object Read & Write", specific bucket, never "Admin Read & Write"); the full "Photo storage security check" section is written by the task added after this one.`
- 8.1 → add two bullets after the first: "`Object.keys(RecipeUpdateSchema.parse({}))` equals `['bumpVersion']` (drift guard against any future `.default()` on an update field)." and change the first bullet to "`RecipeUpdateSchema.parse({ title: 'x' })` deep-equals `{ title: 'x', bumpVersion: false }` (no `visibility` or `isFavourite` key)."
- 8.11 → add the bullet "An amend (`bumpVersion: false`) that omits `isFavourite` and `visibility` keeps both (current version `isFavourite: true` stays true; a `public` recipe stays `public`)." after "A bump keeps `isFavourite`."
- 10.1 → `- [ ] 10.1 Verify \`pg_trgm\` is available in both official images: \`docker compose exec -T postgres psql -U brewform -d brewform -c "SELECT name, default_version FROM pg_available_extensions WHERE name = 'pg_trgm'"\` (compose, \`postgres:18-trixie\`) and the same query in a throwaway \`postgres:18-alpine\` container (CI image). Both ship the contrib modules; assert one row in each and record \`default_version\` in the PR description. The permanent guard is the migration pre-flight (group 10 and group 19 tasks).` (removes the conditional "switch to the documented fallback" branch).
- 10.3 → in item (e) replace "250 matches, `page=3&perPage=10`: 10 rows, `total` 250" with "1000 matches (two versions each), `page=3&perPage=10`: 10 rows, `total` 1000"; in item (f) replace "Page 30 is empty with `total` 250" with "Page 101 is empty with `total` 1000".
- 10.6 → replace "`search=%5C` → 200 and the same result as no search." with "`search=%20%20%20` → 200 and the same result as no search; `search=%5C` → 200 containing only the fixture recipe whose productName contains a backslash; `search=a_c` returns `a_c` and not `abc`."
- 10.9 → `- [ ] 10.9 Add exported pure \`normalizeSearchTerm(raw: string | undefined): string\` (trim only; \`undefined\` → \`''\`) and \`toContainsPattern(term: string): string\` (escape \`\\\` → \`\\\\\`, then \`%\` → \`\\%\`, then \`_\` → \`\\_\`, wrap in \`%…%\`) to \`apps/api/src/modules/recipe/model.ts\`, with docblocks naming PostgreSQL's default \`\\\` LIKE escape. Unit-test both in \`model.test.ts\` (including \`toContainsPattern('50%_\\\\')\` → \`%50\\%\\_\\\\%\`). Use them in the \`search\`, \`mainBrewer\` and \`author\` branches of \`buildRecipeFilters\` and in the score.`
- 10.10 → replace the last sentence's scenario text "and `' 50%_\\ '` producing only `%50%` patterns while `'\\'` yields no search condition" with "and `' 50%_\\ '` producing only `%50\%\_\\%` patterns while `'   '` yields no search condition and `'\\'` yields the pattern `%\\%`".
- 10.22 → append: "Also assert seqscan on/off parity for the escaped searches `a_c`, `100%` and `\`."
- 11.6 → `- [ ] 11.6 Extend \`router.smoke.test.tsx\` to walk every nested route in \`routes\`, render every route with an \`element\`, \`Component\` or \`lazy\` component (skip action-only routes and \`resources/*\`), substitute fixture values for \`:slug\`, \`:id\`, \`:username\`, \`:userId\`, \`:recipeId\`, \`:slug1/:slug2\`, stub \`fetch\` with an empty-success-envelope factory, render public routes signed-out and guarded/admin routes as an admin, and assert no \`error.boundary.oops\` (a loader-driven not-found page is allowed). Assert the derived list contains all 14 admin paths (\`/admin\`, \`/admin/users\`, \`/admin/users/new\`, \`/admin/users/:id\`, \`/admin/users/:id/edit\`, \`/admin/recipes\`, \`/admin/equipment\`, \`/admin/vendors\`, \`/admin/taste-notes\`, \`/admin/coffee-varieties\`, \`/admin/compatibility\`, \`/admin/badges\`, \`/admin/audit-log\`, \`/admin/cache\`). Confirm it fails when \`ToastProvider\` is removed from \`AppProviders.tsx\`, then restore. Add \`rg -n "<ToastProvider|<ConfirmProvider" apps/web/src --glob '!*.test.*'\` to the group check and expect only \`AppProviders.tsx\`.`
- 13.3 → `- [ ] 13.3 Migrate \`AdminUserDetailPage\` and \`AdminUserEditPage\` to \`/admin/users/:id\` and \`/admin/users/:id/edit\` loaders (404 → not-found) and intent actions in \`AdminUserDetailPage.data.ts\` (\`delete\`, \`ban\`, \`unban\`) and \`AdminUserEditPage.data.ts\` (\`update\`), each returning \`{ ok: true } | { ok: false, error }\` and passing \`request.signal\`. Rewrite \`hooks/useBanUser.ts\` per the renamed \`web-shared-components\` requirement "useBanUser hook owns the ban/unban state machine and submits through the admin user route action": no API-client import, \`useFetcher().submit({ intent, reason }, { method: 'post', action: '/admin/users/<id>', defaultShouldRevalidate: false })\`, same returned state and \`onSuccess\` contract, logs per the modified logging requirement. Rewrite \`useBanUser.test.ts\` to drive a \`createMemoryRouter\` route whose \`action\` is a \`vi.fn()\` (no \`adminApi\` mock) and add \`AdminUserDetailPage.data.test.ts\` for the ban/unban/delete intents (mocking \`adminApi\`). The \`/admin/users/:id\` loader keeps \`log.error({ err }, 'AdminUserDetailPage loadData failed')\` before rethrowing non-404 errors (modified \`web-page-logging\` requirement).`
- 14.15 → `- [ ] 14.15 Group check: run \`make check-web\` and \`make test-web\`. The architecture test's pending list and the enforcement test's \`PENDING\` set shrink with each migrated file.`
- 15.7 → add `apps/web/src/hooks/useStaticCacheSync.ts` to the re-allowed list (it imports only `CACHE_BUST_KEY` and `clearStaticCache`), and append "The Vitest enforcement test (task added after 15.6) is the authoritative check; the Biome rule is the editor-time hint."
- 15.8 → `- [ ] 15.8 After all migration tasks: empty the architecture test's pending list and the enforcement test's \`PENDING\` set (delete both), and raise the Biome rule to \`error\`.`
- 16.1 → add `recipe.myNotes.placeholder` to the added keys and `recipe.notes.placeholder` to the removed keys (both `en.json` and `tr.json`).
- 16.2 → append: "Assert in `api/index.test.ts` that `'saveNotes' in recipeApi` is `false` and that no client method issues `POST` to `/recipes/:id/notes`."
- 16.4 → append the bullet "Saving sends exactly one `PUT /api/v1/recipes/:id/notes` (never `POST /notes`, never `PATCH /recipes/:id`); assert this in `RecipeNotesSection.test.tsx`."
- 16.14 → replace the bullet "Mark `POST /recipes/:id/notes` as deprecated." with "State that `POST /recipes/:id/notes` was removed in wave 6 (it returns 404) and that clients use `PUT /recipes/:id/notes` for the caller's private note."
- 16.16 → `- [ ] 16.16 Update \`plans/TECHNICAL_DEBT.md\` (and \`plans/ROADMAP.md\` if it lists open items) with two entries: merge field parity (intensities, \`tds\`, variety); and the \`SetupUpdateSchema\` \`.partial()\` default trap (\`setup.ts:17,24\`) if no other track owns it. Do not add a notes-POST removal entry (the endpoint is removed in this change).`
- 16.17 → append: "State that `POST /api/v1/recipes/:id/notes` was removed (404) and link the photo storage security check for S3 deployments."
- 16.19 → append: "Run `grep -rnwE \"saveNotes|updateVersionNotes\" apps/api/src apps/web/src` and confirm no matches."

## 5. Cross-folder requests

### 5.1 `proposal.md`
- Line 9, replace
  "- **BREAKING** `POST /api/v1/recipes/:id/notes` no longer edits the author's public notes. It becomes a deprecated, caller-scoped alias of `PUT` (sends `Deprecation: true`; removal is tracked in the debt ledger). Author notes (`personalNotes`, relabelled "Brewer's notes") change only through create/PATCH. Existing values are left untouched."
  with
  "- **BREAKING** `POST /api/v1/recipes/:id/notes` is removed (it now returns 404); it was the IDOR that let any signed-in user overwrite the author's public notes. Author notes (`personalNotes`, relabelled "Brewer's notes") change only through create/PATCH by the author. Existing values are left untouched."
- Line 47, replace "and `%`/`_`/`\` are never wildcards." with "and `%`/`_`/`\` are escaped, so they match literally and are never wildcards."
- Line 39, replace "migrates 42 `useEffect` fetch blocks and about 35 direct-mutation files." with "migrates 65 modules (41 `useEffect` fetch blocks in 38 files, 13 inline page loaders, 12 mutation-only modules and 2 raw-fetch QR downloads), enforced by a static test that allows the API client only in `*.data.ts`, `routes/**` and the `AuthContext` session bootstrap."
- Under "Photo upload security (t4a)", append to the first bullet: "The controller never reads the client filename, the local driver never replaces an existing file, and the deployment docs give a bucket audit and credential-scoping runbook for S3 installs that ran earlier versions."
- Non-Goals, delete the line "  - Removal of the deprecated notes `POST` alias."
- Impact → APIs, replace "  - Changed: `POST /recipes/:id/notes` (deprecated alias), `PATCH /recipes/:id`" with "  - Removed: `POST /recipes/:id/notes`.\n  - Changed: `PATCH /recipes/:id`".

### 5.2 `design.md`
- t1 decision 2, replace "   - Routes: `GET|PUT|DELETE /:id/notes`, plus the deprecated `POST`." with "   - Routes: `GET|PUT|DELETE /:id/notes`. There is no `POST` (see decision 5)."
- t1 decision 5: replace the whole decision (the five lines starting "5. **Keep `POST /:id/notes` for one release as a caller-scoped deprecated alias.**") with the decision 5 text in §2 above. Insert §2's 11a after decision 11.
- t4a: insert §2's 8a and 8b after decision 8.
- t5: insert §2's 13a, 13b and 13c after decision 13. In the t5 Context bullet "13 page loaders, 1 resource loader and 5 resource actions coexist with **42 `useEffect` fetch blocks in 39 files**", append ", plus 25 files calling the client outside effects and 2 raw `fetch(` QR downloads (re-verified 2026-11-19; `audit/_refine/coverage.md` §1.6)".
- t7 decision 5: replace with §2's decision 5. Insert §2's 2a and 2b after decision 2.
- Risks: replace "- [The deprecated POST alias lingers] → Mitigation: a ledger entry targets the next release." and "- [`pg_trgm` is unavailable in some image or managed DB] → Mitigation: a pre-flight check on `postgres:18-trixie` and `postgres:18-alpine`. The fallback ships SQL ranking without the indexes." with the two §2 Risk lines.
- Open Questions → Still open → t1: delete "  - Should the deprecated notes `POST` be removed next release (the design's assumption) or after one minor cycle?" (answered: removed now). Under t7, replace "  - `pg_trgm` availability on `postgres:18-alpine` (CI) and any non-compose production DB is checked by a pre-flight task." with "  - (Resolved) `pg_trgm` availability is enforced by the migration pre-flight."
- Cross-track item 5, bullet `recipe-filter`, append: "Patterns are escaped (`toContainsPattern`), not stripped."

### 5.3 `specs/recipe-filter/spec.md` (owner: not me)
In "Shared recipe filter-building helper", replace
"Every `ilike` pattern built from `search`, `mainBrewer` or `author` SHALL use the shared `normalizeSearchTerm` helper (trim, then strip `%`, `_` and `\`), so user input never acts as a wildcard."
with
"Every `ilike` pattern built from `search`, `mainBrewer` or `author` SHALL be `toContainsPattern(normalizeSearchTerm(value))` (trim, then escape `\` → `\\`, `%` → `\%`, `_` → `\_` and wrap in `%…%`; PostgreSQL's default LIKE escape is `\`), so user input matches literally and never acts as a wildcard; a value that is empty after trimming adds no condition."
Any scenario there that expects `' 50%_\ '` to produce `%50%`, or `'\'` to produce no condition, SHALL instead expect `%50\%\_\\%` and `%\\%` respectively, and `'   '` to produce no condition (matches task 10.10 as modified).

### 5.4 `specs/ci-image-publishing/spec.md` (owner: ops agent) — U4 gaps
- In "Images are published only after CI succeeds", replace "declares `needs:` on every quality, test and image-build job of the same run" with "declares `needs:` on every other job of the workflow that runs for `push` events (the quality job, every test job, the image-build job and the `doc-drift` job), so publication never starts while any check of that commit is still running and never happens when one failed or was skipped". Add scenarios:
  - "Doc-drift failure blocks publication — WHEN a commit is pushed to `main` and the `doc-drift` job fails THEN the `publish` job is skipped."
  - "Publication waits for the slowest check — WHEN the image-build job finishes before the test jobs THEN `publish` does not start until every test job has succeeded."
- Add a requirement (or a bullet with a scenario) "`publish.needs` is complete": a `quality`-job step runs `scripts/ci/check-publish-needs.sh`, which uses `yq` (preinstalled on GitHub-hosted Ubuntu runners) to compare `.jobs.publish.needs` with every job id in `.github/workflows/ci.yml` except `publish` and jobs whose `if:` limits them to `pull_request` (the coverage-comment job), and fails listing any missing job. Scenario: "WHEN a contributor adds a job to `ci.yml` without adding it to `publish.needs` THEN the quality job fails naming the job."

### 5.5 `tasks.md`
All task additions and modifications are in §3 and §4 (groups 4, 5, 8, 10, 11, 13, 14, 15, 16, 19, 21).

## 6. Remaining open questions (defaults applied; nothing blocks implementation)

1. **Status code for the removed POST.** Default: 404 (Hono's behaviour without `methodNotAllowed`). If the app later adds Hono's `methodNotAllowed` middleware, the removal test changes to 405 with `Allow: GET, PUT, DELETE`; no such change is planned in wave 6.
2. **S3 conditional writes.** Default: no `If-None-Match` on S3 PUTs (UUIDv4 keys; local driver uses exclusive create). Revisit if Garage's conditional `PutObject` support is confirmed for the versions BrewForm documents.
3. **LIKE escaping instead of stripping.** Default: escape (the user's approved search fix asked for bounded input with metacharacters neutralised; escaping keeps literal `%`, `_`, `\` searchable). This reverses t7's stripping choice; the `recipe-filter` delta needs the §5.3 edit to stay consistent.
4. **Unlisted interpretation (OQ1) in search.** Default: search never returns unlisted, private, draft or soft-deleted recipes to non-admins, and never widens the listing's visibility condition; the author's own listings and admin surfaces follow the recipe-visibility capability (owned by the unlisted agent). Flag: the "own favourites/starred may keep an unlisted entry the viewer saved" interpretation, if adopted there, changes the starred listing's visibility condition, and the search requirement inherits it automatically (it only ANDs onto that condition).
5. **QR download path.** Default: a resource-route fetcher (`resources/qrcode/recipe/:slug`) returning SVG text, so `VITE_API_URL` applies and the enforcement test has no raw-`fetch` exception. The `<img>` preview keeps its relative `src` (not a script fetch); a cross-origin split deployment that does not route `/api` through the web edge would need an absolute `src`, which is out of scope here.
6. **`useBanUser` revalidation.** Default: `defaultShouldRevalidate: false` on ban/unban submissions to keep the existing "patch local state, no server re-fetch" scenarios of `AdminUsersPage` and `AdminUserDetailPage`.
7. **Pre-flight raw SQL.** Default: the catalog query in `packages/db/src/preflight.ts` is allowed as a migration-runner exception with a `// D03 raw-SQL exception:` comment (it is not application query code and Drizzle has no catalog builder).
