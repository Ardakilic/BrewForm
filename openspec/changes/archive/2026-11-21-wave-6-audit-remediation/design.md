## Context

The 2026-11-18 audit (`plans/AUDIT-2026-11-18.md`) ran seven parallel auditors and two adversarial verifiers over the whole repository. It reported 131 findings, and none of the 42 high/critical findings was refuted. The user then answered each top-10 item and each design item. Nine research tracks re-validated the selected findings against HEAD `ada9f6e`, researched options (Context7, web sources and sandbox prototypes), and wrote spec deltas, design fragments and task fragments. Each track's full evidence (file:line tables, reproductions, library comparisons and sources) is in `audit/<track>.md`:

| Track | Scope | Evidence |
|---|---|---|
| t1 | Private notes (IDOR) and recipe write integrity | `audit/t1-notes-recipe-write.md` |
| t2 | Rate limiting and cache driver hardening | `audit/t2-rate-limiting.md` |
| t3 | Slugs, collection visibility and API error mapping | `audit/t3-api-correctness.md` |
| t4a | Upload storage keys and file validation | `audit/t4a-upload-security.md` |
| t4b | Production compose, env config and CI image pipeline | `audit/t4b-deploy-ci.md` |
| t5 | Web providers, shareable URL state and data loading | `audit/t5-web-state.md` |
| t6 | Chart and visualization bounds | `audit/t6-charts.md` |
| t7 | Search ranking and database-side pagination | `audit/t7-search.md` |
| t8 | Documentation and OpenSpec truth | `audit/t8-docs-specs.md` |
| refine | Unlisted visibility across every surface (OQ1, D4) | `audit/_refine/unlisted-visibility.md` |
| refine | Slugs and identifier uniqueness (D3, OQ2) | `audit/_refine/slug-uniqueness.md` |
| refine | Local storage volumes, health and readiness, CI publishing (D5, OQ4, U4) | `audit/_refine/ops-health-storage.md` |
| refine | Notes removal, audit-missed findings, providers, search, data loading (D1, D2, OQ3, U1-U3) | `audit/_refine/coverage.md` |
| refine | Implementation-readiness critic pass (decision coverage, contradictions, group checks) | `audit/_refine/critic.md` |

On 2026-11-19 the user answered every open decision. Four refinement passes re-verified the affected code and folded the answers into the specs, the decisions below and `tasks.md`. The answers and where each is specified are listed under Open Questions → "Resolved by the user (2026-11-19)".

Constraints that apply everywhere:
- AGENTS.md rules: model → service → index layering; no `drizzle-orm` in services; Drizzle only, with soft deletes; OpenAPI `describeRoute()` on every route with `zValidator` kept (ADR-012); structured logging without PII; en/tr i18n parity; Biome formatting.
- Generated migrations are never hand-edited.
- The user prefers built-in methods over new dependencies. The only new runtime dependency is `rate-limiter-flexible` (t2).
- Everything lands as one pull request on a feature branch, in the dependency order of `tasks.md`.

## Goals / Non-Goals

**Goals**
- Close the security gaps the user selected: the notes IDOR (and the legacy notes `POST`), the spoofable and cache-coupled rate limiter, client-controlled S3 keys and filename-driven S3 subresource requests, and unbounded photo bodies.
- Fix the broken user-facing features:
  - recipe edit data loss and default traps;
  - slug 500s and case-sensitive account identifiers;
  - collection leaks and unlisted recipes appearing in listings;
  - 500s that should be 400/409;
  - admin page crashes;
  - pagination and shareable list URLs;
  - unbounded search;
  - out-of-bounds charts.
- Make self-hosting with `compose.production.yml` boot, keep photos (named volume or host folder), route same-origin, report liveness and readiness, and back up data. Gate image publishing on CI and smoke-test images on PRs.
- Standardise the web data layer on React Router data APIs and make the URL the source of truth for list state.
- Make `AGENTS.md`, `docs/`, `plans/` and `openspec/specs` truthful again, and add guards (doc-drift check, docblock scan, lint policy test, generated API reference) so they stay truthful.

**Non-Goals**
- The production demo-account seed: the user answered "No problems".
- Admin module parallel CRUD: the user answered "No problems I believe, admin has more access". Only its unique-violation unwrapping moves to the shared helper.
- Items each track deferred, and audit findings with no wave-6 owner. Both are listed in `proposal.md` → Non-Goals and in Open Questions → "Follow-ups recorded in the debt ledger" below. They go to the debt ledger, not into this change.

## Decisions

### Cross-track integration

These decisions were made when the nine tracks were merged into one change.

1. **One ordered task list.** `tasks.md` follows the dependency order below. These are phases; `tasks.md` splits them into 29 numbered groups. Every group ends with a group-check task (focused tests, type-check, lint and format for code groups; `openspec validate` or the doc-drift script for spec and docs groups), and a single final verification group runs every suite individually, builds and boot-tests both images, and opens the one pull request.
   1. OpenSpec housekeeping (group 1).
   2. Shared foundations: t3 error mapping, t4b env parsing and storage startup (groups 2-3).
   3. Security: t1 notes API and the legacy `POST` removal, t4a uploads and S3 request integrity, t2 rate limiting (groups 4-6).
   4. Slugs and identifier uniqueness, then recipe write (groups 7-8).
   5. Collections and the shared visibility helpers (group 9).
   6. Search (group 10).
   7. Unlisted visibility on every discovery surface (group 11). It needs group 9's helpers and edits group 10's `findListPage`/`findStarred`.
   8. Web foundations, URL state and data loading (groups 12-16). The data-loading guards land first (group 14) with a pending list that each migration shrinks; the t1 web work follows and the guards flip to error after the last migration (group 17).
   9. Charts (groups 18-19).
   10. Deploy: migration runner, health and readiness, runtime image, edge, compose volumes, CI (groups 20-22).
   11. Docs and specs, ending with the wave-6 archive (groups 23-28).
   12. Final verification and the ONE pull request (group 29).
2. **The env parsing change lands with the foundations.**
   - Choice: t4b's blank-as-unset preprocessing and range checks in `apps/api/src/config/env.ts` move ahead of t2 and t4a, which both add or tighten env vars in the same schema.
   - The compose, operations and CI parts of t4b stay in the deploy group.
3. **One error vocabulary.**
   - t1's service errors use t3's typed `ValidationError`/`ForbiddenError`/`NotFoundError` from `apps/api/src/utils/errors.ts` instead of new `VALIDATION_ERROR: …` strings.
   - t7's statement-timeout mapping (`57014` → 503 `QUERY_TIMEOUT`) is a row in t3's SQLSTATE table, so the error-handling and advanced-search specs agree.
4. **Single editor for shared docs, with pre-allocated ADR numbers.**
   - t8 performs one consolidation pass over `AGENTS.md`, README, `docs/` (except the deploy and docker docs, which belong to t4b) and `plans/`, after the code tracks.
   - Every `AGENTS.md` edit the tracks asked for is folded into t8's AGENTS.md group:
     - t4a: the body-limit line;
     - t5: the "Web data loading" section;
     - t6: the "Charts" rule;
     - t7: the database rules;
     - t2 and t4b: the deploy and cache lines.
     - refinement (2026-11-19): the shared visibility rule, case-insensitive identifier lookups and the in-transaction slug claim (task 25.5); the health, readiness and compose data-location lines (task 25.12).
   - ADR numbers:

     | ADR | Subject | Track |
     |---|---|---|
     | 015 | Cache driver | t2 |
     | 016 | Rate-limit store and client identity | t2 |
     | 017 | `pg_trgm` search ranking | t7 |
     | 018 | Web data loading | t5 |
     | 019 | Server-generated upload keys | t4a |
     | 020 | Docblocks (supersedes ADR-013) | t8 |
     | 021 | Generated API reference | t8 |
5. **Integration fixes to the spec deltas** (fixed during merging; each is minimal):
   - `error-handling`: the `57014` row.
   - `request-body-limit`: the photo body cap, the global rate-limit policy in the stack order, and a Vitest test list. This is t4a's drafted block, using the `validateImagePart()` name from its tasks.
   - `logging-test-coverage`: the rate-limit test scenario uses `rateLimit`/`rateLimitFailures` and `{ policy, limit }`. At the critic pass, its separate "Rate limit test verifies both IP-based and user-ID-based rate limit logging" requirement (which still named the deleted `rateLimitMiddleware`/`authRateLimitMiddleware` factories) was also modified.
   - `container-deployment`: a startup-log line rephrased so it no longer trips the doc-drift token check.
   - New MODIFIED deltas for three specs no track owned:
     - `api-middleware-logging`: the exceeded-limit log gains `policy`.
     - `static-cache`: the cross-tab listener calls `clearStaticCache()` instead of re-broadcasting. This is t5's drafted fix for the confirmed ping-pong.
     - `text-sanitization`: Vitest imports replace `jsr:`, so the doc-drift guard passes.
     - `recipe-filter`: the shared helper's search branch is the single `inArray(recipes.id, union(...))` condition t7 builds, with normalised patterns (its old scenario required an `or()` shape). Patterns are escaped (`toContainsPattern`), not stripped.
     - `cursor-pagination`: the search-fallback rationale says ranking happens in SQL; behaviour is unchanged.
     - `web-page-logging` (RENAMED + MODIFIED) and `recipe-collections` ("Frontend components…"): they required `useEffect` fetching and direct client calls, which contradicts `web-data-loading`. They now put the same log lines and behaviour in loaders, actions and fetchers. `web-data-loading` also gains a precedence clause covering `useBanUser` and any other pre-wave-6 page description.
     - `web-api-boundary` and `model-test-coverage`: two historical requirements and one test-coverage row named functions wave 6 deletes (`recipeApi.saveNotes`, `generateFilename`, `generateThumbnailFilename`, `validateImageUpload`); they now name the replacements.
   - Added at the critic pass: a `doc-drift-check` requirement that pins the `AGENTS.md` idioms (soft-delete `isNull`, the Biome lint policy instead of Deno lint rule names, the en/tr i18n rule) and a `stale-idiom` rule in the doc-drift script, so those fixes cannot regress silently.
6. **Refinement integration (2026-11-19).** The refinement passes edited their own spec folders; the integrator applied their cross-folder requests:
   - `error-handling`: the slug bullet now forbids catching unique violations (the slug is claimed with `ON CONFLICT DO NOTHING`), registration and admin map the `_lower_unique` constraints too, and the "Re-register after deletion" row names the availability pre-check.
   - `recipe-write`: duplicate relation ids are rejected with 400 (new requirement).
   - `advanced-search`: the visibility clause names `listableRecipeCondition(null)` and `viewableRecipeCondition(userId)`, and the hidden-recipe scenario includes the author.
   - `recipe-filter`: `toContainsPattern(normalizeSearchTerm(value))` escaping replaces stripping.
   - `ci-image-publishing`: the `publish.needs` completeness guard and two ordering scenarios.
   - `node-runtime`: shutdown flips readiness first and ignores a second signal.
   - Sequencing fixes found at integration: `publish.needs` gains `doc-drift` only when task 28.6 adds that job (a `needs:` entry for a missing job is a workflow error); the data-loading guards moved ahead of the migrations (tasks 14.1-14.3) and their flip to error moved after the private-notes rewrite (task 17.18), because the notes editor is the last migrated module; task 10.14 keeps Starred public-only so the failing tests of task 11.2 fail first.
7. **Implementation-readiness pass (2026-11-19).** A final critic pass checked every user decision against a requirement, a scenario and a task, and made `tasks.md` executable as written:
   - Group-check tasks were appended where a group lacked one (1.7, 4.22, 13.8, 14.15, 20.15, 21.20, 23.20, 25.13, 26.21, 27.10). Appending kept every existing task number.
   - Group 29 gained the CI-equivalent image build and boot test (29.8); the later tasks moved up by one (PR creation is 29.13). Nothing outside group 29 referenced those numbers.
   - The private-notes editor rewrite (17.4) now starts with its failing component tests; the `main` wiring test of the limiter has one fixed file (6.20); the visibility enforcement scan names its unit boundaries, including non-exported `async function` units.
   - Wording fixes: the unlisted rule inside collections (`proposal.md`), the host-folder rule in `.env.production.example` (task 22.12), the web image health check in AGENTS.md (task 25.12), the demo-seed description in the README (task 26.3) and the Purpose-placeholder count measured in the sandbox archive (task 28.4).
8. **The wave-6 archive is part of the pull request.**
   - The doc-drift CI job and its repository-root test can pass only after the deltas reach `openspec/specs` and every "Purpose: TBD" is backfilled.
   - So the last groups delete the three retired folders, run `openspec archive wave-6-audit-remediation -y`, backfill purposes, and wire the `doc-drift` job.
   - After the archive, `tasks.md` lives under `openspec/changes/archive/<date>-wave-6-audit-remediation/`, and the remaining boxes are checked there.

### Personal notes and recipe write integrity (t1)

**Context**

*Notes IDOR (confirmed).*
- `RecipeDetailPage.tsx:330-332` shows `RecipeNotesSection` to every signed-in viewer, pre-filled with the author's `currentVersion.personalNotes`.
- Saving calls `POST /api/v1/recipes/:id/notes` (`recipe/index.ts:846-873`). That route never reads `userId`. It calls `service.saveNotes(recipeId, notes)` (`service.ts:711-718`), which checks neither author nor visibility and does not sanitize.
- The write is an in-place `UPDATE recipe_version SET personal_notes` (`model.updateVersionNotes`, `model.ts:1029-1035`). Any account can overwrite any author's notes, including on private and draft recipes reachable by UUID.
- The overwritten column is the author's **public** note. It feeds the tasting-notes card (`TastingNotesSection.tsx:157-163`), the SEO and JSON-LD descriptions (`RecipeDetailPage.tsx:139-154`), search filtering and ranking (`model.ts:128-147`, `service.ts:444-465`), diff, merge and fork.
- The UI copy promises a private per-viewer note that was never built.

*Recipe write data loss (all five claims hold).*
- Non-bump edits write only title and visibility (`service.ts:352-358`).
- A bump copies only scalars and photos (`:271-351`).
- `tds` is never written, and the current spec codifies that omission.
- `coffeeVarietyId` is absent from the create schema and from every writer except the seed.
- The edit page sends `undefined` for cleared fields.

*Further findings during validation.*
- Zod 4 `.partial()` keeps `.default('draft')`, so a PATCH without `visibility` unpublishes the recipe, and a bump resets `isFavourite`. Reproduced on zod 4.6.7.
- The bump is non-transactional: it commits the version before title validation, which leaves orphan versions, and it races on `versionNumber`.
- Service `VALIDATION_ERROR` and FK violations return 500.
- `brewRatio`/`flowRate`, `setupId` (on update) and the bump `brewDate` are accepted but ignored.
- PATCH skips the email-verified gate.
- The create page drops `?beanId`.

`docs/recipes.md:26` already documents that a non-bump update "modifies the current version in place".

**Decisions**

1. **Private notes get their own table; the author's version notes stay public.**
   - Choice: a new `user_recipe_note` table with a unique `(user_id, recipe_id)` constraint, soft delete, and a CHECK capping length at 10,000. It follows the `user_recipe_rating`/favourite naming and FK patterns.
   - Alternatives: (a) an author-only `POST /notes`, as the audit first suggested; (b) making version notes author-private.
   - Rationale: matches the user's "notes are personal". Public brewer notes keep their SEO and search role. The new endpoints carry no user id, so no request can address another user's row.
2. **Caller-scoped endpoints in a new `recipe-note` module.**
   - Choice: `apps/api/src/modules/recipe-note/{model,service,index}.ts`, mounted at `/api/v1/recipes` next to the recipe router. Precedent: `user` and `userCollections` both mount at `/api/v1/users` (`routes/index.ts:48-49`).
   - Routes: `GET|PUT|DELETE /:id/notes`. There is no `POST` (see decision 5).
   - The service loads a minimal projection (`id, authorId, visibility, deletedAt`) and calls the pure `canViewRecipe` exported by `recipe/service.ts`.
   - The upsert uses `onConflictDoUpdate({ target: [userId, recipeId], set: { notes, updatedAt, deletedAt: null } })`.
   - Alternative: more code in `recipe/{model,service}.ts`. Rejected: those files are already about 1,300 and 1,000 lines, and a separate module keeps the privacy boundary auditable.
3. **Soft delete scrubs the text.**
   - Choice: `DELETE` sets `deleted_at` and `notes = ''`. A later `PUT` revives the same row.
   - Alternatives: hard delete (as favourites do), or soft delete that keeps the text.
   - Rationale: this follows the soft-delete rule and keeps one row per pair. Unlike comments, private notes need no moderation, so keeping deleted text is only a liability.
4. **No email-verification gate on private notes.** The gate applies to content other people see. Personal state (ratings, favourites, collections) is not gated. Rate limiting and the body limit still apply.
5. **Remove `POST /:id/notes` outright (user decision OQ3, 2026-11-19).**
   - Choice: delete the route, its `describeRoute` entry, `service.saveNotes`, `model.updateVersionNotes` and `recipeApi.saveNotes`. The `recipe-note` router registers only `GET`, `PUT` and `DELETE` on `/:id/notes`, so Hono answers a `POST` with its default 404 (it emits 405 only with the `methodNotAllowed` middleware, which the app does not use). A test through the composed `routes` app asserts 404 and that no `recipe_version` or `user_recipe_note` row changes. `apps/api/src/routes/openapi.notes.test.ts` asserts the spec lists no `post` on the path, because `openapi.coverage.test.ts` does not cover `/api/v1/recipes`.
   - Alternatives: a caller-scoped deprecated alias of `PUT` for one release (the previous choice), or `410 Gone`.
   - Rationale: the user said the endpoint is deprecated and must be removed. An alias keeps a write path alive on the URL that was the IDOR, and the only caller is the SPA, which ships in the same release. An open tab from before the deploy gets a 404 on save, and the rewritten `RecipeNotesSection` surfaces failures instead of swallowing them.
6. **Private notes are not embedded in the recipe detail payload.**
   - Choice: a separate request with `Cache-Control: private, no-store`. The web loads it through `useFetcher().load('/resources/recipes/:id/notes')` only when signed in, and writes through that route's action (intents `save`/`delete`, returning `{ ok }`), per web-data-loading.
   - Alternative: add `userNote` to `GET /recipes/:slugOrId`, as `userRating` already is.
   - Rationale: the detail payload stays free of private text that crawler, OG or cache paths could leak.
7. **Keep the API name `personalNotes`; relabel the UI** as "Brewer's notes" (public) and "My private notes". A column and field rename would be a breaking API change with no behavioural gain. Revisit with the next API version.
8. **Non-bump edits amend the current version.**
   - Choice: `bumpVersion: false` writes every provided field to the current version in one transaction and replaces only the relations that were provided. Earlier versions stay immutable.
   - Alternatives: reject version fields without a bump (400), or auto-bump on any change. Auto-bumping needs fragile value diffing (float4, numeric strings, timestamptz, relation sets) and spams versions.
   - The docblock at `schema.ts:208` becomes "the current version may be amended by its author; earlier versions are immutable".
9. **One transactional writer for amend and bump.** `model.updateRecipeWithVersion({ mode: 'amend' | 'bump' })` runs one `db.transaction`:
   1. Lock the recipe row with `.for('update')`.
   2. Read the current version and its relations.
   3. Amend: update the version and replace each provided relation. Bump: insert version `max + 1`, then copy or replace taste notes (with intensities), equipment, preparations (`sortOrder`) and photos.
   4. Update `recipes` (title, visibility, `currentVersionId`, `updatedAt`).
   5. Return `findById` after commit.

   The service validates everything first: sanitized title, merged cross-field rules, references, equipment compatibility on merged values, and variety-name resolution. Rationale: no partial writes and no orphan versions, and the row lock serializes concurrent edits so neither request gets a 23505.
10. **One version-column mapping, with a drift guard.** `versionColumnsFrom(resolved)` and `copyVersionColumns(source)` are shared by create, amend, bump and fork. A `model.test.ts` drift guard compares the helper's keys with `getTableColumns(recipeVersions)`. The original bugs were per-path column lists drifting apart (`tds` was missing in three places).
11. **Update schema without injected defaults; explicit absent/null/[] semantics.**
    - `RecipeUpdateObjectSchema` is built field by field: `.nullish()` on clearable fields, `.optional()` on required ones, and no `.default()` except `bumpVersion`. It follows `UserPreferencesPatchSchema`.
    - Cross-field rules move to an exported pure `recipeCrossFieldIssues(data)`. Both schemas use it, and the service also runs it on merged values. The rules include pre-infusion < extraction, which t6 relies on.
    - `brewRatio`/`flowRate` leave the input schemas.
    - `coffeeVarietyId` is added (optional on create, nullish on update).
    - Alternative: keep `.partial()` and strip defaults in the handler. Rejected: fragile, and invisible in OpenAPI.
11a. **The update schema carries no defaults, and a test pins it.**
   - Choice: besides building `RecipeUpdateObjectSchema` field by field, `packages/shared/src/schemas/recipe.test.ts` asserts `RecipeUpdateSchema.parse({ title: 'x' })` deep-equals `{ title: 'x', bumpVersion: false }` and `Object.keys(RecipeUpdateSchema.parse({}))` equals `['bumpVersion']`. The service decides "provided" by key presence.
   - Alternatives: rely on review, or strip defaults in the handler.
   - Rationale: Zod 4 keeps `.default()` through `.partial()`/`.optional()`; the bug unpublished recipes and cleared favourites silently. A key-set assertion fails the moment anyone adds a `.default()` to an update field.
12. **Variety name resolved server-side; `tds` stays a string.**
    - `coffeeVarietyName` is copied from the variety row on every write and never accepted from clients.
    - `tds` is written as `String(n)`; Postgres rounds to scale 2. It stays in Drizzle's string mode.
13. **Reference validation in the service.** Model lookups (non-deleted taste notes, equipment, vendor, variety, and an author-owned bean when newly set) run before any write and return field-level 400 details. t3's 23503 → 400 mapping remains the backstop.
14. **PATCH gets the email gate, full OpenAPI metadata and error mapping.**
    - `ValidationError` → 400 with details, `ForbiddenError` → 403, not found → 404, and 422/409 via `errorHandler`.
    - Fork stays ungated: drafts are owner-only, and the gated PATCH blocks publishing.
15. **Existing data is left untouched.** There is no wipe, move or backfill of `recipe_version.personal_notes`. The release note asks authors to review their brewer notes, because overwrites by other users cannot be identified.

### Rate limiting and cache driver hardening (t2)

**Context** (validated against `ada9f6e`. Every claim is confirmed, with two corrections: "silently disabled" is documented in `.env.example:33`, and spoofability depends on topology. Six further defects, N1–N6, are in the notes.)
- **Identity.** `middleware/rateLimit.ts:37-38,89-90` keys on the raw `x-forwarded-for || x-real-ip || 'unknown'`, and `getConnInfo` is never used.
  - Direct exposure, or a proxy that appends (Cloudflare): bypass by rotating XFF.
  - Default Traefik/Caddy trust behind Cloudflare: one shared edge bucket.
  - No proxy: one global `'unknown'` bucket.
- **State.**
  - Counters use the cache singleton with a non-atomic get-mutate-set (`rateLimit.ts:41-51`).
  - `CACHE_ENABLED=false` installs `NullCacheProvider`, which switches limiting off (`main.ts:132-136`, `utils/cache/index.ts:75-95`).
  - The redis driver uses ioredis defaults (an offline queue, 20 retries; `utils/cache/redis.ts:88-89`). The limiter runs on `'*'` with no try/catch (`main.ts:75`), so a Valkey outage stalls and then 500s every request, including `/health`.
  - `InMemoryCacheProvider` evicts only on re-read (`utils/cache/index.ts:28-51`), so it grows without bound.
- **Policy.**
  - One `authRateLimit` with the key `auth-ratelimit:${ip}` is shared by login, register and forgot-password, and counts successes (`auth/index.ts:27`, `rateLimit.ts:90`). Five normal actions lock a user out.
  - `send-verification` is unlimited (`auth/index.ts:273-297`).
  - Comment and report limits are IP-only.
  - `/health`, `/ready` and `/uploads/*` count against the global 100/min.
- **Contract and hygiene.**
  - Only `X-RateLimit-*` is sent: no `Retry-After` and no CORS `exposeHeaders` (`cors.ts:16-22`). The 429 message says "login" on every auth route.
  - The registration-disabled warn log records the IP (`auth/index.ts:94-96`).
  - The auth tests spoof `x-forwarded-for: test-<uuid>` to bypass the limiter (`auth/index.test.ts:153-181`).
  - Stale docs and specs: `docs/deployment_coolify.md:282-285`, `docs/architecture.md:96-101,179`, `docs/request-lifecycle.md:17,58`, ADR-006, `openspec/specs/report-rate-limit` (raw-XFF keying) and `remote-cache` (Deno KV).

**Decisions**

1. **`rate-limiter-flexible` 11.5.0 behind an in-house Hono adapter.**
   - Engine: `RateLimiterRedis` (an atomic Lua INCR+TTL on a dedicated ioredis client) with `insuranceLimiter: new RateLimiterMemory(sameOpts)` and `rejectIfRedisNotReady: true`. `RateLimiterMemory` alone serves the memory store.
   - The adapter owns key derivation, policy lookup, headers, the 429 envelope, logging and fail-open. Its pieces:
     - `middleware/rateLimit.ts`: `rateLimit(policy, opts?)` and `rateLimitFailures(policy, { key, isFailure, resetOnSuccess })`.
     - `utils/rate-limit/backend.ts`: `RateLimitBackend`, `createMemoryBackend` and `createRedisBackend`.
     - `utils/rate-limit/registry.ts`, `policies.ts` and `headers.ts`.
   - Alternatives:
     - `hono-rate-limiter` 0.5.4: a store error becomes a 500, it supports only header drafts 6 and 7, and it is pre-1.0.
     - Fixing the custom limiter with a `MULTI INCR/PEXPIRE NX/PTTL` store: this reimplements insurance and failure semantics.
   - Rationale: it is the only option where a Valkey outage degrades to per-process limiting. It is mature (ISC licence, zero runtime deps) and supports the OWASP login pattern natively (`get`/`penalty`/`delete`). The backend seam keeps the Lua-free MULTI store as a fallback if a managed Valkey forbids `EVAL`.
2. **One client-IP helper, with `TRUST_PROXY=none|hops|cloudflare`.** `utils/client-ip/index.ts` exports `getClientIp(c, trust?)` and `rateLimitIpKey(ip)`.
   - `none`: `getConnInfo(c).remote.address`.
   - `hops`: the chain `[...validXffEntries, socketPeer]` indexed at `len - 1 - TRUST_PROXY_HOPS`, clamped to 0.
   - `cloudflare`: the `hops` candidate, replaced by `CF-Connecting-IP` only when the candidate is in the bundled Cloudflare ranges or `TRUST_PROXY_CIDRS` (checked with `net.BlockList`).
   - Addresses are normalised (zone stripped, IPv4-mapped converted to IPv4, lower-cased), and IPv6 is bucketed by /64.
   - Alternatives: a CIDR-walk `TRUSTED_PROXIES` list (needs Docker/Traefik subnets that Coolify hides), Express-style trust strings, or trusting `CF-Connecting-IP` blindly (forgeable directly against the origin).
   - Rationale: one number the operator can reason about. Taking the right-most entry minus N ignores every client-controlled prefix, as MDN prescribes.
3. **Secure default `TRUST_PROXY=none`, set explicitly in the deployment templates.**
   - `compose.production.yml` sets `hops`/`1`. `apps/api/.env.example` (the Coolify template) sets `hops`/`1`, with a commented `cloudflare` line.
   - The first XFF-bearing request under `none` logs one warn line.
   - Rationale: a wrong default should fail toward visible shared buckets, not toward a silent bypass.
4. **Rate-limit state lives in its own backend.**
   - `RATE_LIMIT_STORE=memory|redis` (default `memory`) reuses `REDIS_URL`. `RATE_LIMIT_ENABLED` is the only off switch.
   - Keys live under `brewform-rl:`, outside the cache's `brewform:` namespace, so cache flushes never touch them.
   - Route modules create middleware at import time, so the middleware resolves the backend lazily from the registry on each request and memoises one limiter per policy per backend.
   - Alternatives: derive the store from `CACHE_DRIVER` (the coupling being fixed), or keep `CacheProvider` (it has no atomic increment).
5. **Fail-soft, then fail-open. No custom circuit breaker.**
   - The limiter's client uses `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `commandTimeout: 500` and `connectTimeout: 2000`.
   - The insurance limiter takes over on any store error, and immediately while the client is not ready.
   - If the adapter itself catches an `Error`, it logs `error` and calls `next()`.
   - One warn on entering degraded mode and one info on recovery (with `fallbackDecisions`).
   - Alternatives: fail-closed (an outage), pure fail-open (no protection), or a hand-rolled breaker (it only saves the 500 ms timeout).
6. **Named policies; failure-only login counters per OWASP.**
   - The policy table is in the `api-rate-limiting` spec. IP-keyed policies run before the body parser and auth. Email-keyed policies run after `zValidator` (trimmed, lower-cased email). User-keyed policies run after `authMiddleware`.
   - Login uses four policies: per IP for all attempts (20/15 min), per IP for failures (100/day), per (email, IP) for consecutive failures (5/15 min, deleted on 2xx), and per email across IPs (20/h).
   - Failure counting: `get` before the handler (429 at the limit), `penalty` after a 401, `delete` after a 2xx. Unknown emails are counted the same way.
   - `confirmPasswordReset` returns the normalised email, so the reset route can clear both account counters. Wave 6 has no separate auth-session track, so t2 owns this change.
   - Alternatives: the shared 5/15 min (locks out legitimate users), a hard account lockout (DoS), or CAPTCHA (OWASP: not a substitute, and a third-party dependency).
7. **Response contract.**
   - IETF draft-11 `RateLimit-Policy`/`RateLimit` list items, appended per evaluated policy.
   - Legacy `X-RateLimit-*` headers for the last policy.
   - `Retry-After` on every 429, a message per policy, and the envelope `{ success:false, error:{ code:'RATE_LIMITED', message, requestId } }`.
   - CORS `exposeHeaders` lists all six headers.
8. **Keys and privacy.**
   - The key is `<policy-id>:<dimension>` (`brewform-rl:` prefix on Redis).
   - Emails become the first 32 hex characters of their SHA-256, and IPs are normalised.
   - Logs carry only `policy`, `limit`, `userId` and `err`. The `ip` field is dropped from the registration-disabled log.
   - Alternative: HMAC keys. Rejected: they need key rotation, and the keys are never exposed anyway.
9. **Bounded memory cache with a built-in Map LRU.**
   - `InMemoryCacheProvider({ maxEntries = CACHE_MEMORY_MAX_ENTRIES ?? 10_000, sweepIntervalMs = 60_000 })`.
   - Recency is refreshed by delete and re-insert on `get`, and the oldest key is evicted at the cap.
   - An `unref()`'d sweep runs on the interval, and `close()` clears the timer and the store.
   - Alternative: `lru-cache`. Rejected: about 40 lines of Map code with no dependency fits the user's preference.
10. **Fail-soft cache with reconciliation.**
    - A `FailSoftCacheProvider` (`utils/cache/failSoft.ts`) wraps the redis provider: a failed read becomes a miss and a failed write a no-op, with one warn per outage and one info on recovery (`droppedOps`).
    - If any invalidation was dropped, it runs one asynchronous flush of the cache namespace after recovery.
    - A shared `createRedisClient()` (`utils/redis/client.ts`) applies the fast-fail options.
    - Alternative: serve stale data until TTL (up to 24 h).
11. **`/ready` reports `cache` and `rateLimitStore`** (`ok`|`degraded`|`memory`|`disabled`). The status code still depends only on the DB.
12. **Tests simulate client IPs through connection info.**
    - A `peerEnv(ip)` helper (`utils/client-ip/test-helpers.ts`) is passed as the `app.request()` env, and `resetRateLimitBackend()` runs in `beforeEach`.
    - The Valkey integration suite runs only when `REDIS_TEST_URL` is set.
    - Tests stop depending on the very header we stop trusting.
13. **Web 429 UX.** `ApiError.retryAfterSeconds` is parsed from `Retry-After`. The auth forms, the verification resend and the contact form show `t('error.rateLimited', { seconds })` in en and tr.

### Slugs, collection visibility and error mapping (t3)

**Context** (all confirmed; reproductions are in `audit/t3-api-correctness.md`)

*Slugs.*
- `generateUniqueSlug` (`recipe/service.ts:58-63`) and `forkRecipe` (`:396-398`) call `ensureUniqueSlug(slug, [])`. With an empty list, no suffix is ever added (`packages/shared/src/utils/slug.ts:13-14`).
- `recipe_slug_unique` (`schema.ts:139`) is global and covers soft-deleted rows, but the pre-check `findBySlug` ignores deleted rows (`model.ts:338-341`).
- Result: a duplicate title, a title that matches a deleted recipe, a second fork or a second merge all return 500.
- `generateSlug` strips non-ASCII (`Türk Kahvesi` → `trk-kahvesi`; CJK → `''`), keeps `_` (which breaks the QR filename regex in `schemas/common.ts:22-24`), and can emit reserved words (`new`, `starred`, `unavailable`) that static routes shadow.
- Fork titles skip `sanitizeText`.
- The recipe insert is the first statement of both creation transactions (`model.ts:694-704`,
  `:478-488`). A `23505` there aborts the transaction, so a retry inside it needs either a savepoint
  or a statement that cannot fail on the slug. `forkRecipe` also increments the source `forkCount`
  in the same transaction (`:598`).
- `ensureUniqueSlug` is also imported by `apps/api/src/utils/qrcode/qrcode.test.ts` and
  `recipe/service.test.ts`.
- The QR route repeats the filename regex inline (`qrcode/index.ts:56`). Neither copy accepts `_`.
  The old generator could store `slug = ''` once (all-CJK or all-Cyrillic title).
- Account identifiers: `user.email` and `user.username` are unique but case-sensitive. Inputs are
  not normalized, the availability checks ignore soft-deleted rows although the constraints do not,
  and the "one default setup per user" rule has no database guarantee. Full table:
  `audit/_refine/slug-uniqueness.md` §1.2.

*Collections.*
- `collection/model.ts:10-34` loads every item's recipe with no `deletedAt` or visibility filter. `service.ts:57-102` maps all of them and sets `recipeCount = items.length`.
- The detail is cached for 10 minutes (`:13`, `:207-242`), and nothing invalidates it when a recipe is deleted or its visibility changes.
- List counts count raw rows (`model.ts:71-77,159-165`).
- Reorder requires the full item list (`service.ts:452-461`), while the web sends only the displayed ids.
- The leak is titles, slugs, authors and counts, not recipe content.

*Errors.*
- `errorHandler.ts:40` tests `err.name === 'PostgresError'`, but drizzle-orm 0.45 wraps every driver error in `DrizzleQueryError` with the original on `.cause`. Verified in source and via Context7.
- There is no `HTTPException` branch, so Hono's malformed-JSON 400 becomes a 500.
- Admin (`admin/model.ts:143-160`) and collections (`collection/service.ts:394-404`) unwrap by hand.
- `DrizzleQueryError` embeds query parameters in its message and in `params`, so logs carry emails and bcrypt hashes, and non-production 500s echo them.

**Decisions**

1. **Built-in slug pipeline, no plugin.**
   - Choice: strip apostrophes → `toLowerCase()` → a 9-entry map (`ı ß æ œ ø đ ð ł þ`) → `normalize('NFKD')` with `\p{M}` stripped → non-`[a-z0-9]` runs become `-` → trim → cap at 93 characters at a hyphen boundary. An empty result becomes `recipe-<suffix>`.
   - Alternatives: `slugify`, `@sindresorhus/slugify`, `transliteration`, or Unicode slugs.
   - Rationale: the user prefers built-ins. NFKD covers every Latin script, including Turkish. Libraries add Renovate churn and do not fix the real bug, which is uniqueness. Unicode slugs would break `SlugSchema`, the QR regex and share URLs.
2. **Clean base first, random suffixes after, claimed in the transaction with `ON CONFLICT (slug) DO NOTHING`.**
   - Choice:
     - Candidates come from `slugCandidates(title, suffixes)`: the bare base (unless it is empty,
       reserved or UUID-shaped), then `<base>-<suffix>` for 5 fresh `randomSlugSuffix()` values.
     - Model helper `claimRecipeSlug(tx, row, candidates)` runs
       `tx.insert(recipes).values({ …row, slug }).onConflictDoNothing({ target: recipes.slug }).returning()`
       per candidate, as the FIRST write of `createRecipeWithRelations` and `forkRecipe`.
     - An empty result moves to the next candidate. If every candidate is taken, the model returns
       `null` and the service throws `ConflictError('SLUG_CONFLICT')` (409).
     - Suffix: 6 characters from `23456789bcdfghjkmnpqrstvwxz` (27 characters, no vowels, no
       look-alikes), drawn with `globalThis.crypto.getRandomValues` and rejection of bytes `>= 243`.
   - Alternatives:
     - Check-then-insert (the current shape): racy, costs an extra query, and the soft-delete
       filter in `findBySlug` caused the bug.
     - Catch `23505` and re-run the whole transaction from the service: works today, but breaks if
       creation ever runs inside an outer transaction (that transaction stays aborted). It also
       turns every collision into a logged DB error and depends on error parsing.
     - A savepoint per attempt (nested `tx.transaction()`): correct, but it uses exceptions for
       control flow and adds two round trips per attempt.
     - Advisory locks: Postgres-specific.
     - Numeric `-2/-3`: race-prone, and leaks counts of private or deleted recipes.
     - Always suffixing: every URL is uglier and the claim is still needed.
     - `[a-z0-9]` suffixes: can spell words, and `0/o` and `1/l` are ambiguous on printed QR labels.
     - `node:crypto.randomInt`: breaks the web bundle of `@brewform/shared`.
   - Rationale: `ON CONFLICT DO NOTHING` never raises, so the transaction stays usable.
     - Under READ COMMITTED, a concurrent uncommitted holder of the same slug makes the insert wait,
       then skip (holder committed) or insert (holder rolled back). Concurrent requests always end
       with distinct slugs and no error.
     - Claiming first means a waiting transaction holds no other locks.
     - With 27^6 = 387,420,489 suffixes and 1,000 recipes on the same base, a suffixed candidate is
       taken with probability about 2.6e-6, and all five with about 1e-28.
     - The seed already uses the same mechanism (`seed.ts:502`). No pre-check query is needed, so
       `model.slugExists` is not added.
3. **Reserved and UUID-shaped bases are always suffixed, with drift guards.**
   - `RESERVED_RECIPE_SLUGS` = `new`, `edit`, `starred`, `unavailable`, `compare`, `meta`, `merge`,
     `versions`, `diff`, `focus`, `fork`, `search`, `feed`, `share`, `recipe`, `recipes`.
   - Two tests fail when a new static sibling of `:slug` lands without a reserved word: one walks the
     Hono recipe router's `routes`, the other parses the `recipes/...` paths in `router.tsx`.
   - This keeps `getRecipe(slugOrId)` unambiguous without renaming routes.
4. **Global uniqueness (soft-deleted rows included), immutable slugs, no history table, slug-only URLs.**
   - Choice: keep `recipe_slug_unique` global. Never rewrite an issued slug. Keep `/recipes/<slug>`,
     with `getRecipe` still accepting a UUID.
   - Alternatives:
     - A partial unique index `WHERE deleted_at IS NULL`: allows reuse, but old links, QR codes and
       notifications for a deleted recipe would then open a different recipe. `ON CONFLICT` would
       also need `targetWhere`.
     - A slug-history redirect table: there is no rename-URL feature, and it adds a lookup to every
       miss.
     - ID-plus-cosmetic-slug URLs (`/recipes/<id>-<slug>`): collision-free by construction, but it
       changes every existing URL, the sitemap, QR codes and notifications, and is unnecessary once
       collisions are handled.
5. **Fork and merge reuse the pipeline; legacy slugs stay addressable.**
   - The fork title is sanitized, falling back to `Fork of <source title>`. Merge keeps delegating
     to `createRecipe`.
   - `QR_CODE_FILENAME_PATTERN` (`^([a-z0-9_]+(?:-[a-z0-9_]+)*)\.(png|svg)$`, case-insensitive) is
     exported once and used by both the schema and the route. `SlugSchema` stays strict for new
     slugs.
   - A legacy `slug = ''` is reported by `check-identifiers.ts` and rewritten to `recipe-<sfx>` only
     with `--fix-empty-slugs`. This is the single exception to immutability, because that slug
     never worked as a link.
6. **Collection item predicate = `canListRecipe` (from `recipe-visibility`) + not soft-deleted.**
   - Public recipes are visible to everyone; unlisted, draft and private recipes only to the recipe's author (user decisions OQ1 and D4, 2026-11-19).
   - Collection ownership grants nothing extra, and the admin flag is not passed.
   - Alternatives: let the owner see everything in their own collection (an owner would see another author's now-hidden recipe, which is itself a leak), or `canViewRecipe` (shows unlisted recipes to everyone, which the user rejected).
7. **Viewer-independent cached shape, a per-request filter, and a cached-hit state refresh.**
   - The cache stores every item whose recipe was not deleted at fill time, keeping its `visibility`/`authorId`.
   - Every response passes through `filterItemsForViewer(detail, viewerId, states)`. On both paths, one `model.getRecipeVisibilityStates([...recipeIds, ...forkSourceIds])` call (one PK `inArray`, 4 columns) supplies fresh state for the item filter and the fork-source mask.
   - Alternatives: per-viewer keys, an anonymous-only cache, invalidation hooks on every recipe write path (admin writes already bypass them, and memory caches are per replica), or dropping the cache.
8. **Counts by audience, via Drizzle `innerJoin(recipes)` in the batched count.**
   - Detail: the number of items after filtering.
   - Owner list: `listableRecipeCondition(ownerId)` (non-deleted, public or authored by the owner).
   - Public lists: `listableRecipeCondition(null)` (non-deleted public only).
   - `containsRecipe` stays raw membership.
9. **Reorder over the visible set.** `itemIds` must equal the owner-listable set (`canListRecipe(recipe, ownerId)`). Hidden items keep their relative order and get the trailing `sortOrder` values in the same transaction. Removal by `recipeId` still works. Tombstones would need a nullable `recipe` and would leak existence.
10. **The add rule stays the same and becomes explicit.** The owner may add their own recipes of any visibility, and other authors' public recipes. When the recipe is draft, private or unlisted, the modal shows `collection.modal.hiddenRecipeNote` (en and tr), using a `recipeVisibility` prop passed from `RecipeDetailPage`.
11. **Structural Postgres detection along the `cause` chain** (`getPostgresError`, depth ≤ 5, `name === 'PostgresError'` plus a 5-char `code`). This avoids a new `postgres` dependency and any `drizzle-orm` import outside models, and it handles wrapped, bare and re-thrown errors.
12. **SQLSTATE mapping.**
    - `23505` → 409 `CONFLICT`.
    - `23503` → 400 `VALIDATION_ERROR` on insert/update, or 409 on delete. The statement kind comes from the wrapper's `query` prefix, defaulting to 400.
    - `23502`/`23514`/class `22` → 400.
    - `57014` → 503 `QUERY_TIMEOUT` (t7).
    - Anything else → 500.
    - Responses never include SQL, params or constraint names.
13. **`HTTPException` is checked first.** Its status is kept, the envelope is built with `c.json` (which keeps CORS and request-id headers), a custom `res` is honoured, and 4xx is logged at warn.
14. **A small typed `AppError` hierarchy plus a legacy convention fallback.**
    - `AppError(code, status, message, details?)` with `NotFoundError`, `ForbiddenError`, `ConflictError` and `ValidationError`.
    - Unhandled string codes map by convention (`FORBIDDEN`, `*_NOT_FOUND`, `ALREADY_*`/`*_ALREADY_EXISTS`, `VALIDATION_ERROR…`), with a warn log.
    - Alternatives: migrate all 121 throw sites now, or leave strings alone. This fixes every reproduced 500 without a repo-wide rewrite, and the full migration is a follow-up.
15. **Log sanitization.** `toLoggableError` keeps the name, the SQL text without params, the SQLSTATE, the constraint and the stack. Mapped DB errors log `{ pgCode, constraint, table }` at warn. The non-production 500 message for DB errors becomes `Database error`.
16. **Race paths.**
    - `upsertUserRating` becomes one `insert … onConflictDoUpdate`.
    - Double-follow and version-bump races rely on the global 409.
    - Registration and admin user writes map `23505` on `user_email_unique`/`user_email_lower_unique` →
      `EMAIL_ALREADY_EXISTS` and `user_username_unique`/`user_username_lower_unique` →
      `USERNAME_ALREADY_EXISTS`, using `USER_EMAIL_CONSTRAINTS`/`USER_USERNAME_CONSTRAINTS` from
      `auth/model.ts`. The availability pre-checks cover soft-deleted rows (decision I4), so this
      mapping is only the race fallback. Freeing a self-deleted account's email is deferred to the
      account-deletion anonymisation work.
    - Admin and collection duplicate checks use `isUniqueViolation`.


**Identifier uniqueness decisions (refinement 2026-11-19, D3)**

- **I1 Emails are normalized once, in the shared schema.**
  - Choice: `EmailSchema = z.string().trim().toLowerCase().max(255).pipe(z.email())` in
    `packages/shared/src/schemas/common.ts`, used by register, login, forgot-password and admin
    create/update. The seed normalizes `ADMIN_EMAIL` the same way.
  - Alternatives: `z.email().trim()` (Zod 4 runs the format check first, so padded input is
    rejected); normalizing in each service (easy to miss a path).
  - Rationale: one definition. It also matches t2's `emailKey` normalization.
- **I2 Case-insensitive uniqueness through expression unique indexes; the exact constraints stay.**
  - Choice: `lower()` helper exported from `schema.ts` (with a `// D03 raw-SQL exception:` comment),
    plus `uniqueIndex('user_email_lower_unique').on(lower(table.email))` and the username
    equivalent. The migration is generated by `make db-generate`.
  - Alternatives:
    - `citext`: an extension, Postgres-specific, and needs an ADR.
    - `CHECK (email = lower(email))` plus a backfill: needs a hand-written data migration, which
      AGENTS.md forbids, and legacy mixed-case logins break until the backfill runs.
    - Lowercasing usernames on write: loses the user's chosen display case and changes existing
      profile URLs.
    - Dropping the exact constraints: breaks the seed's `ON CONFLICT (email)` inference.
  - Rationale: this is the pattern Drizzle documents, it needs no data rewrite, and legacy rows
    keep working.
- **I3 Every identifier lookup uses `eq(lower(col), v.toLowerCase())`.** The lookups are login,
  forgot password, the profile route, mention targets and the availability checks. They are served
  by the expression index, so no backfill is needed. `parseMentions` de-duplicates
  case-insensitively. The web own-profile check compares ids.
- **I4 Identifiers of soft-deleted accounts stay reserved; pre-checks agree with the indexes.**
  - Choice: `isEmailTaken` and `isUsernameTaken` stop filtering `deletedAt` (a documented
    exception). Registration answers 409 with the existing messages before any insert.
  - Alternatives:
    - A partial unique index `WHERE deleted_at IS NULL`: frees identifiers, but keeps PII on
      deleted rows, lets a stranger inherit a deleted user's profile links and mentions, and breaks
      the seed's conflict target.
    - Tombstoning the email on self-deletion: the recommended follow-up, together with
      account-deletion anonymisation (D99.20+).
  - Rationale: keeps the current data semantics, removes the failed-insert path, and blocks
    username takeover.
- **I5 Reserved usernames at self-registration.**
  - Choice: `RESERVED_USERNAMES` (17 names) plus the `deleted-` prefix, refused with
    `USERNAME_ALREADY_EXISTS` (the list is not revealed). Admin and seed writes are exempt.
  - Alternative: a client-side-only check.
  - Rationale: cheap protection against impersonating the operator or the project.
- **I6 One active default setup per user.**
  - Choice: partial unique index `setup_user_default_unique` and a transactional switch in the
    setup model.
  - Alternative: row locks only (no database guarantee).
  - Rationale: the database states the invariant, and the rare race surfaces as 409, never as two
    defaults.
- **I7 Join tables.**
  - Hard delete (likes, favourites, follows, collection items, badges) or upsert (ratings) stays.
  - `user_recipe_note` revives by upsert.
  - Any future soft-deleted join table must use the same revive-on-conflict upsert.
  - Re-add regression tests lock this in.
- **I8 Data safety before stricter constraints.**
  - Choice: `packages/db/src/check-identifiers.ts` (`make db-check-identifiers`).
    - It reports email and username case duplicates, multiple active defaults and empty slugs,
      with ids only and never emails.
    - It exits 1 on blocking issues.
    - Opt-in fixes: `--fix-deleted-duplicates` (tombstones only soft-deleted members),
      `--fix-setup-defaults`, `--fix-empty-slugs`.
    - Groups of two or more active accounts get a printed manual path (admin rename after contact).
  - Rationale: all pending migrations apply in one transaction, so a violation rolls back
    everything. The script lets an operator fix data first instead of reading a raw Postgres error.
- **I9 Not changed in wave 6.**
  - Plaintext reset tokens (D99 auth-session).
  - Catalog name uniqueness (community data; needs a de-duplication UI).
  - Duplicate collection and setup names (legitimate).
  - The redundant plain indexes (follow-up perf cleanup).
  - `generateUniqueUsername` (unused).

### Unlisted visibility everywhere (user decisions OQ1 and D4)

**Context.** The user decided (2026-11-19): "Unlisted means unlisted from everywhere. Only with the absolute link can find it. Should not be visible even from search and categories etc." and "Collections hide deleted, private and draft recipes from everyone except the recipe's author." The audit of every surface (`audit/_refine/unlisted-visibility.md` §1) found the following:
- Most discovery surfaces already filter `visibility = 'public'`, but through six hand-written copies.
- Collection items leak deleted, private, draft and unlisted recipes.
- Fork attribution publishes a non-public source's id, slug and title. The id works as a link.
- The QR landing breaks every unlisted QR code.
- No non-public page is marked `noindex`.

1. **One meaning per visibility value, applied by surface class.**
   - Choice: `public` is listed and indexable; `unlisted` is reachable only by its URL or id and never listed or indexed; `private` and `draft` are author-only. The same applies to collections. Each surface is classified as discovery, collection items, direct link, viewer-only record, owner-only list or admin. The class decides the filter (`recipe-visibility` spec table).
   - Alternatives: keep per-surface rules (status quo, six drifting copies), or YouTube-style semantics where unlisted items still appear on the owner's public profile.
   - Rationale: one table settles every future surface, and the user explicitly ruled out every listing.
2. **A shared SQL condition pair and pure predicate pair in the recipe module.**
   - Choice: `listableRecipeCondition(viewerId)` and `viewableRecipeCondition(viewerId)` live in `recipe/model.ts`, next to the existing exported `recipeCoffeeVarietyCondition`. Drizzle builders only, and `deletedAt` is included. `canListRecipe(recipe, viewerId)` lives beside `canViewRecipe` in `recipe/service.ts`. Other models import the conditions, and services import the predicates. A DB-backed parity test proves the SQL and the predicate agree.
   - Alternatives: a `utils/visibility` module (it would import `drizzle-orm` outside a model file), a Postgres view (no raw SQL), or per-module copies.
   - Rationale: the predicate mirrors `canViewRecipe` (the `comment-authz` precedent). Keeping the SQL in a model file respects the 3-layer rule. Model-to-model imports of a pure SQL builder have no side effects.
3. **Discovery surfaces are viewer-independent.**
   - Choice: every discovery query calls `listableRecipeCondition(null)`, so authors do not see their own unlisted, draft or private recipes in browse, search, feed, category pages, profile or sitemap. No author "My recipes" listing is added.
   - Alternatives: pass the viewer, so authors see their own non-public recipes in search and on their profile.
   - Rationale: this is the literal reading of "only with the absolute link". It keeps every list response shareable and cache-safe, and it matches today's behaviour (no regression). A self-listing is a separate feature (ledger follow-up).
4. **Collection items use `canListRecipe` (t3 decision 6 applies it to collection items).**
   - Choice: an item is shown when its recipe is not deleted and is `public`, or the viewer is the recipe's author. The collection owner gains nothing. Counts follow the audience: `listableRecipeCondition(ownerId)` on the owner's list and `listableRecipeCondition(null)` on public lists. The modal note covers draft, private and unlisted.
   - Alternatives: `canViewRecipe` (shows unlisted to everyone, rejected by the user), or hiding items even from the recipe's author (contradicts D4's "except the recipe's author").
   - Rationale: a collection is a listing, not a link.
5. **Fork attribution is masked unless the source is listable.**
   - Choice: list rows go through `maskUnlistableForkSources(rows)` (one PK `inArray` query, viewer-independent). Collection items use the state lookup they already run. The detail uses `resolveForkAttribution(source, viewerId)`, so the source's author still sees it. Stored data, `forkCount` and response schemas are unchanged, because the fields are already nullable.
   - Alternatives: forbid forking unlisted recipes (it breaks a link-holder action and does not cover private or deleted sources); refuse UUID lookups of unlisted recipes (fork, comments and photos are keyed by id and would break); drop `forkedFromId` from `RecipeRowSchema` (a breaking schema change for every list).
   - Rationale: the id of an unlisted recipe is as good as its link, so it must not appear on any surface a stranger can read.
6. **Viewer-only records.**
   - Choice: Starred uses `viewableRecipeCondition(userId)`. Favourited unlisted recipes now appear, and recipes that became private or draft drop out. The brew journal list is unchanged. `createBrewLog` uses `canViewRecipe`, so "Brew again" works for link holders. Both surfaces were verified viewer-only.
   - Alternatives: keep Starred public-only (the literal reading; favouriting an unlisted recipe then appears to do nothing), or hide brew logs of recipes that are hidden now (the user's own history would vanish).
   - Rationale: these lists show only what the viewer saved, and expose nothing to anyone else (the interpretation applied for OQ1; see Open Questions → "Resolved by the user").
7. **Non-public pages are never indexed.**
   - Choice:
     - Non-public recipe detail: `noindex, nofollow` robots meta, no canonical link and no JSON-LD.
     - Versions, diff and compare pages: always `noindex`, because their payloads carry no visibility and the pages are derived views.
     - Collection detail: noindex unless public.
     - API: `X-Robots-Tag: noindex, nofollow` on non-public recipe and collection JSON details, on every share 404, and on crawler fall-throughs for recipe paths. Missing and non-public cases look identical, so the header is no existence oracle.
     - Share and crawler stay public-only.
   - Alternatives: a Caddy header (Caddy cannot know visibility), or server-side rendering (out of scope).
   - Rationale: Googlebot renders the SPA, and the headers cover the API origin.
8. **The QR landing redirects only on 404.**
   - Choice: `?from=qr` plus a `404` from the API redirects to `/recipes/unavailable`. A viewable recipe renders.
   - Rationale: this matches the gap-M3 intent ("delisted since printing") and stops breaking unlisted QR codes.
9. **A static enforcement test.**
   - Choice: `apps/api/src/modules/recipe/visibility.enforcement.test.ts` scans model and route files. It rejects inline `recipes.visibility` comparisons and requires every recipe listing unit to reference a helper, with an explicit exemption map that is checked for stale keys.
   - Alternatives: a custom Biome rule (not available), or code review only.
   - Rationale: the same pattern as the OpenAPI coverage test and t5's `architecture.test.ts`. It fails at the exact `file:line`.
10. **Deferred:** an author-only "My recipes" listing, unguessable unlisted URLs, and draft/private gating of like, favourite, rate and photo-list (all in `proposal.md` → Non-Goals → Deferred).

### Upload storage keys and file validation (t4a)

**Context** (validated on Node v26.13.1; the severity stays high)
- **Key derivation.** `utils/upload/index.ts:53-58` builds `${Date.now()}-${uuid.slice(0,8)}.${originalName.split('.').pop()}` from the raw multipart filename (`photo/index.ts:117` → `service.ts:57`). The thumbnail key copies that tail (`:61-68`).
- **S3 request.**
  - `utils/storage/s3.ts:28-29` concatenates `${endpoint}/${bucket}/${filename}` unencoded, then signs `new URL(url).pathname` and `.search` (`:88,113-114`).
  - `a.x/%2e%2e/%2e%2e/other-bucket/payload` was signed and sent as `/other-bucket/payload`.
  - Validation found the claim understated: `a.x/%2e%2e?policy=` yields a signed **bucket-subresource PUT**, which reaches `?cors=`, `?acl=` and `?tagging=` (subject to the token's scope).
  - No `Content-Type` is sent or signed (`:94-109`).
- **Type check.** Only the client-declared `file.type` is checked (`upload/index.ts:42-50`), and the rejection message echoes it back.
- **Body size.** `/api/v1/photos` skips the 1 MB `bodyLimit` with no replacement (`bodyLimit.ts:15,61-66`). `c.req.formData()` buffers everything before any check, and thumbnails are never validated (`upload/index.ts:102-114`).
- **Errors.** The catch-all returns `400 UPLOAD_ERROR` with `err.message` (`photo/index.ts:127-132`), which leaks S3 bodies, SQL and absolute `ENOENT` paths. `local.ts:28-37` blocks only `..`, so a key like `x/sub/evil` reaches `writeFile`.
- **Out of scope by evidence.** The local read handler (`main.ts:84-125`) is traversal-safe. There is no avatar upload. `StorageDriver.delete()` has no production caller. Photo rows store full URLs.
- **Config.** `UPLOAD_ALLOWED_TYPES` is split without trimming, and `UPLOAD_MAX_SIZE_BYTES` is unbounded (`config/env.ts:73-74`).

**Decisions**

1. **Fully server-generated keys: `<uuidv4>.<ext>` and `<uuidv4>_medium.<ext>`.**
   - Choice: `crypto.randomUUID()` plus an extension from a fixed table (`image/jpeg` → `jpg`, `png`, `webp`). `generateStorageKey(mime)` returns `{ id, key }`, and `thumbnailKey(id, mime)` derives the thumbnail key. The client filename is not a parameter.
   - Alternatives: sanitising the client extension (still trusts input), `randomBytes` base64url, content-hash keys (shared objects and content-equality leaks), keeping the timestamp (leaks upload time), or a `photos/` prefix (deferred, because the driver guard forbids `/`).
   - Rationale: removes the whole class of client-controlled-path bugs, as the user asked.
2. **A built-in magic-byte detector with header-dimension parsing** (`utils/upload/sniff.ts`, pure, about 80 lines).
   - It covers the JPEG marker walk to SOF0–15 (excluding C4/C8/CC), PNG IHDR, and WebP VP8/VP8L/VP8X.
   - A scratch prototype matched `sips` on a 9.3 MB 6016×6016 JPEG, PNG and WebP, and returned null for HTML and SVG.
   - Alternatives:
     - `file-type` v21: ESM-only, 4 transitive deps, called "a best-effort hint" by its README, and returns no dimensions.
     - `image-size`: the documented fallback.
     - `sharp`: belongs to F23.
3. **The declared Content-Type is advisory.**
   - Reject when it is non-empty, not `application/octet-stream` and not allowed.
   - Otherwise the detected type decides the extension and the stored Content-Type. An allowed mismatch is logged at debug.
   - Rationale: browsers derive `file.type` from the extension, and nothing client-declared is persisted.
4. **Dimension limits are code constants** in `utils/upload/limits.ts`, which imports only `config` so `bodyLimit.ts` can use it without constructing the storage driver.
   - Originals: at most 16,384 px per side and 50 MP.
   - Thumbnails: at most 1,200 px.
   - 50 MP accepts 48–50 MP phone photos and rejects PNG bomb headers such as 65535×65535.
5. **Bounded photo body.** `bodyLimitMiddleware` gets a second `hono/body-limit` instance: `PHOTO_BODY_MAX = UPLOAD_MAX_SIZE_BYTES + min(1 MiB, UPLOAD_MAX_SIZE_BYTES) + 64 KiB` (about 11.06 MiB by default), returning 413 `PAYLOAD_TOO_LARGE`.
   - The stack slot is unchanged.
   - Hono checks `Content-Length` without reading the body, and otherwise aborts the stream once the size exceeds the cap.
   - Alternatives: a streaming parser such as busboy (a new dependency and a handler rewrite), a route-only limit, or relying on an edge cap (100 MB at Cloudflare, and none in compose).
6. **Status and error codes.**
   - 413 `PAYLOAD_TOO_LARGE`: the transport cap.
   - 400 `FILE_TOO_LARGE`: a part over its limit. Not 413, to stay consistent with the existing request-body-limit scenario.
   - 415 `UNSUPPORTED_MEDIA_TYPE`: an unknown or disallowed type.
   - 400 `INVALID_IMAGE`: malformed images, zero dimensions or dimensions over the limits.
   - 400 `VALIDATION_ERROR`: a missing file or bad form fields.
   - Part errors carry `details: [{ field: 'file'|'thumbnail', message }]`.
7. **A typed `UploadValidationError`** (`utils/upload/errors.ts`) with fixed, safe messages. The controller maps it, `RECIPE_NOT_FOUND` and `FORBIDDEN`, and rethrows everything else to `app.onError`, which returns 500 `INTERNAL_ERROR` with the message hidden in production.
8. **Defence in depth in the drivers.**
   - `assertSafeStorageKey` (`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}(\.[A-Za-z0-9]{1,8})?$`) runs on save and delete in both drivers before any I/O.
   - The S3 driver URI-encodes the bucket and each segment once per SigV4 rules, and signs that exact string with an empty query.
   - After `new URL()`, it asserts `pathname === signedPath && search === ''`.
   - It adds `content-type` to the headers and to `SignedHeaders`.
   - The interface becomes `StorageDriver.save(data, key, { contentType })`.
8a. **The filename is never read, and no upload can overwrite an object.**
   - Choice: the controller passes only `{ declaredType, size, data }`; a route test uses a `File` whose `name` getter throws. Keys come only from `generateStorageKey`/`thumbnailKey` in the same request. `LocalStorageDriver.save` writes with `{ flag: 'wx' }` (exclusive create). The S3 driver constructor rejects an `S3_ENDPOINT` with a path, query or fragment. A route-level table test drives crafted filenames (`?policy=`, `?cors=`, `?acl=`, `?tagging=`, `?uploads=`, `?partNumber=&uploadId=`, other-bucket traversal, `../<legacy-key>`) through a mocked `fetch` and asserts only `PUT /<bucket>/<uuid>.<ext>` with an empty canonical query.
   - Alternatives: send `If-None-Match: *` on S3 PUTs (rejected: conditional `PutObject` support is not confirmed for Garage, the dev backend, and varies across S3-compatibles; a 501 would break uploads); a `HEAD` before `PUT` (racy and an extra round trip).
   - Rationale: UUIDv4 keys (122 random bits) make collisions negligible; exclusive create makes the local driver fail closed; the table test proves the audit-missed subresource and overwrite paths are closed end to end.

8b. **Operators audit buckets that pre-wave-6 versions could reach.**
   - Choice: `docs/deployment_coolify.md` §10 and `docs/deployment_compose.md` get a "Photo storage security check" with `aws s3api get-bucket-{policy,acl,cors,tagging,lifecycle-configuration,versioning,website}`, a `list-objects-v2` audit against both key patterns, a photo-row comparison, rotate-on-finding, and per-provider credential scoping (R2 Object Read & Write on one bucket; Garage `bucket allow --read --write` without `--owner`; AWS/MinIO object-only policy).
   - Alternatives: a scripted auditor in the repo (rejected: provider-specific, needs credentials the app should not hold for bucket config).
   - Rationale: the fix stops new abuse but cannot undo configuration a crafted upload may already have changed.
9. **Strict thumbnail policy.** An invalid thumbnail fails the whole upload, and nothing is stored.
10. **Validate first, then write, with best-effort cleanup.** Ownership and both parts are validated, then the original, the thumbnail and the DB row are written in that order. If a later step fails, `driver.delete()` runs on the keys already written (warn on cleanup failure), and the original error is rethrown.
11. **Config validation.** `UPLOAD_MAX_SIZE_BYTES` must be an int and positive. `UPLOAD_ALLOWED_TYPES` is trimmed, lower-cased and split into an array, then refined to a subset of `SUPPORTED_IMAGE_MIME_TYPES`, failing at boot with a message naming the bad entry. This sits on top of t4b's blank-as-unset preprocessing.
12. **No EXIF stripping here.** Stripping without re-encoding loses EXIF orientation. GPS/EXIF privacy is a follow-up for F23 (sharp).

### Production compose, env config and CI image pipeline (t4b)

**Context** (all validated; evidence is in `audit/t4b-deploy-ci.md`)
- **Boot failure.** `compose.production.yml:107,112` inject empty `S3_ENDPOINT`/`S3_PUBLIC_URL`. `env.ts:64,69` (`z.url().optional()`) rejects `''`, and `env.ts:115-121` throws (reproduced on zod 4.4.3). Blank `APP_PORT`/`UPLOAD_MAX_SIZE_BYTES` coerce to `0`.
- **Photo loss.** `docker-entrypoint.sh:32` runs the API with cwd `/app/apps/api`. `UPLOAD_DIR=./uploads` (`compose.production.yml:113`) therefore resolves to `/app/apps/api/uploads`, outside the `/app/uploads` volume (`:117`).
- **No routing.** The web image only serves files (`apps/web/Caddyfile:1-14`), the SPA targets `https://${API_DOMAIN}/api/v1` (`:127`), and the api publishes no port. Coolify is unaffected.
- **Ungated release.** `release.yml` runs in parallel with CI and pushed `:latest` first (#168: 1m29s vs 3m40s). Nothing builds images on PRs, and `ci.yml` and `pr.yml` both run on every PR.
  - *Plain explanation of the user's design question 6.* "Images are never built on PRs" is about the **Docker images** (the API and web containers), not photo uploads. A pull request runs lint, type-check and tests, but nobody runs `docker build` on it. A change that breaks the `Dockerfile`, the entrypoint or the Caddy config is first noticed after merge, when `release.yml` builds and pushes the image. Because `release.yml` runs at the same time as CI rather than after it, a broken or untested image can become `:latest` on GHCR even when CI later fails. The fix runs the steps in order, as the user chose: every PR builds both images and smoke-tests them (boot, health, one page and one API call) without pushing anything, and on `main` the `publish` job pushes only after every check has passed.
- **Operations gaps.** There are no backups, no api/web healthchecks, no log rotation and no limits. A second, broken prod definition exists (`compose.yml:214-246`, `Makefile:238-247`).
- **Image.** The image runs as root with no `HEALTHCHECK`, ships the whole builder tree, and has pnpm as PID 1 (`Dockerfile:48-57`). `.dockerignore` is root-anchored. The build runs `drizzle-kit generate` (`Dockerfile:35`).
- **Spec drift.** `container-deployment` and `ci-image-publishing` still describe Deno images and the removed Coolify webhook job.

**Decisions**

1. **Blank env values mean "unset", at the schema boundary.**
   - The object schema is wrapped in `z.preprocess`, which drops keys whose string value trims to `''`. `envSchema` stays exported (now a `ZodPipe`), and `Env` becomes `z.output<typeof envSchema>`.
   - Ports become `z.coerce.number().int().min(1).max(65535)`. `UPLOAD_MAX_SIZE_BYTES` becomes `.int().positive()`. `UPLOAD_DIR` is resolved with `path.resolve`.
   - `loadEnv` prints messages only, never values, and a test locks that down.
   - Alternatives: a per-field `z.union([z.literal(''), …])` (misses ports and enums, and is easy to forget), or removing `:-` defaults from compose only (Coolify and `.env` users still hit the crash).
2. **Absolute upload directory, verified at startup.**
   - The image sets `ENV UPLOAD_DIR=/app/uploads` (owned by `node`), and compose mounts the volume there.
   - `utils/storage/startup.ts` exports `verifyStorage(config, { mkdir, writeFile, unlink, stat, access }, log)`. It creates the directory and proves writability by writing and deleting `.brewform-write-test-<pid>`. It warns when a production directory is not a mount point (comparing `stat().dev` with the parent) and records that for `/ready` (`storage: "ephemeral"`), and logs `{ storageDriver, uploadDir }` or `{ storageDriver: 's3', bucket }`. On failure it throws an error naming the directory, the UID/GID, the errno code and the `chown -R 1000:1000` / `make prod-fix-uploads-owner` fix. `main.ts` turns the throw into `process.exit(1)` before `serve()`. `checkStorageHealth()` serves `/ready`.
   - Alternatives: mount the volume at the cwd-relative path, or `chown` in a root entrypoint.
3. **The web Caddy is the edge, opt-in through `API_UPSTREAM`.**
   - `apps/web/Caddyfile` gets a global block (`admin off`, `import /etc/caddy/global.d/*.caddy`), `:80` with `encode`, `handle /healthz`, `import /etc/caddy/conf.d/*.caddy`, and a fallback static `handle`.
   - When `API_UPSTREAM` matches `^[A-Za-z0-9._-]+(:[0-9]{1,5})?$`, the entrypoint writes a proxy for `/api/* /uploads/* /share/*` with `request_body max_size {$EDGE_MAX_BODY_SIZE:16MB}` and `header_up X-Forwarded-For {client_ip}` / `X-Real-IP {client_ip}`.
   - When `TRUSTED_PROXIES` matches `^[A-Za-z0-9_.:/ ]+$`, it writes `servers { trusted_proxies static … ; trusted_proxies_strict }`.
   - Compose sets `API_UPSTREAM=api:8000`, `VITE_API_URL=/api/v1` and `TRUSTED_PROXIES=private_ranges`.
   - Alternatives: a separate edge service, Coolify path routing, publishing the API port (all compared in the audit §4.1), or always-on proxying (which would 502 `/share` and `/uploads` in Coolify's split setup).
   - **Client-IP contract with t2:** overriding XFF with Caddy's right-to-left `{client_ip}` gives the API exactly one hop, so `TRUST_PROXY=hops`/`TRUST_PROXY_HOPS=1` is correct with or without an outer proxy. The CI smoke test verifies the header shape on Caddy 2.11.9. The fallback is `header_up -X-Forwarded-For` followed by a set.
4. **Runtime `PUBLIC_APP_URL` for the web image.**
   - `Dockerfile.web` keeps the build value in `BREWFORM_BUILD_PUBLIC_APP_URL`.
   - The entrypoint validates `PUBLIC_APP_URL` against an origin allowlist (no `|`, `&` or `\`), then rewrites `index.html` (og/twitter image) and `robots.txt` (`Sitemap:`) from `*.orig` copies, so restarts with a new value stay correct.
   - Rendering meta tags from `/config.js` is not an option, because crawlers do not run JS.
5. **A one-shot migrate service, and entrypoint modes.**
   - `docker-entrypoint.sh serve|migrate`. Both run `node packages/db/src/migrate.ts`, a drizzle-orm `postgres-js/migrator` runner on the default `drizzle.__drizzle_migrations` table, followed by the first-boot check and seed. `serve` skips them when `RUN_MIGRATIONS=false`.
   - Compose adds `migrate` (`restart: "no"`), and `api` depends on it with `service_completed_successfully`.
   - The db `migrate` script switches to the same runner, so dev, CI and production share one path. `generate`/`push` stay on drizzle-kit.
   - Alternatives: an advisory lock (raw SQL), or drizzle-kit at runtime (a devDependency, about 30 MB).
   - The single-replica assumption and expand/contract are documented.
6. **Slim, non-root API runtime that execs node directly.**
   - A `prod-deps` stage runs `pnpm install --prod --frozen-lockfile --offline` and removes `apps/web`, `openspec`, `plans`, `docs` and tests.
   - The runner copies only the workspace packages it needs plus `files/`, installs `tini`, creates `/app/uploads` owned by `node`, sets `USER node`, uses `ENTRYPOINT ["/usr/bin/tini","-g","--","/app/docker-entrypoint.sh"]`, and declares `HEALTHCHECK … CMD ["node","/app/healthcheck.mjs","/ready"]` (interval 15s, timeout 5s, start-period 180s, start-interval 2s, retries 3; see decision 14).
   - The entrypoint ends with `exec node src/main.ts` (Node 26 type stripping). `drizzle-kit generate` is removed from the build.
   - Fallback if the spike fails: `tsx` moves to runtime deps and the entrypoint runs `node --import tsx`, which is still one node process.
   - Alternatives: `pnpm deploy --prod` (copies workspace packages into `node_modules`, so native stripping is impossible), or `init: true` only (Coolify does not set it).
   - The image probes `/ready` (decision 14). Docker's single health status gates traffic and rollouts, never restarts, so it must mean readiness. `/health` serves uptime monitors.
7. **Production compose shape.**
   - `name: brewform-prod`, an `x-logging` anchor (json-file, `DOCKER_LOG_MAX_SIZE`/`FILE`) and an `x-api-env` anchor shared by `migrate` and `api`.
   - Images are `${API_IMAGE:-ghcr.io/ardakilic/brewform-api}:${IMAGE_TAG:-latest}`. `API_DOMAIN` is dropped, and `UPLOAD_DIR` is `/app/uploads`.
   - Memory limits on every service.
   - api: `stop_grace_period: 30s` and the `node /app/healthcheck.mjs /ready` healthcheck (15s/5s/3/60s).
   - web: depends on a healthy api and has an exec-form `wget` `/healthz` healthcheck.
   - Valkey: the password moves from argv into a generated config with `maxmemory ${VALKEY_MAXMEMORY:-192mb}` and policy `noeviction`, and `VALKEYCLI_AUTH` is set in the service environment; the healthcheck runs `valkey-cli ping | grep -q PONG`.
   - Backup: an inline loop on `postgres:18-trixie` (`umask 077`) writes `pg_dump -Fc` to `.partial` and renames it, tars the read-only uploads source, prunes with `find -mtime`, writes to `${BACKUPS_SOURCE:-backups}` (named volume by default), has a freshness healthcheck, and supports `BACKUP_ONESHOT=1` for `make prod-backup`. A profile-gated `restore` service serves `make prod-restore` (decision 12).
   - Data mounts use one variable each: `${UPLOADS_SOURCE:-uploads}`, `${POSTGRES_DATA_SOURCE:-postgres_data}`, `${BACKUPS_SOURCE:-backups}` (decision 10).
   - The compose file must carry t2's and t7's env lines.
   - Alternatives: a third-party backup image, or a runbook only.
8. **One CI workflow, a gated publish, and a PR image smoke test.**
   - `ci.yml` (name `CI`) triggers on `pull_request` (main) and `push` (main, tags `v*`), with top-level `contents: read` and PR-cancelling concurrency.
   - Jobs:
     - `quality`.
     - `test`: needs quality; the only job with `pull-requests: write`.
     - `images`: needs quality, runs in parallel with test (it never pushes). Two `load: true` builds with per-image gha cache scopes and `ignore-error=true`, then `scripts/ci/compose-config-check.sh`, `scripts/ci/smoke-images.sh` (both containers healthy through their own `HEALTHCHECK`, `/health`, the `/ready` keys, the edge `/healthz`, `/`, `/health`, `/api/v1/sitemap.xml`, the client-IP echo check, and the root-owned/1000-owned bind-mount pair) and `scripts/ci/smoke-compose.sh` (the full production stack). On push events it saves both images as a 1-day artifact and outputs their IDs.
     - `publish`: push events only; `needs: [quality, test, images, doc-drift]` (`doc-drift` is appended when that job is added, task 28.6), no `always()`; loads the artifact, verifies the image IDs, and tags and pushes with `docker/metadata-action` tags (`latest` only on the default branch, the full SHA, the tag). It never builds (decision 16). `scripts/ci/check-publish-needs.sh` in the `quality` job fails when any push-running job is missing from `publish.needs`.
   - `pr.yml` and `release.yml` are deleted, and third-party actions are SHA-pinned.
   - Alternatives: a `workflow_run`-triggered release, or building only in `publish`.
9. **Makefile: local images only; `prod-*` wraps the real file.**
   - `images` builds `:local` tags.
   - `PROD_COMPOSE = docker compose --env-file .env.production -f compose.production.yml`, with a `prod-env-check` guard.
   - Targets: `prod-up`, `prod-down`, `prod-logs`, `prod-ps`, `prod-pull`, `prod-backup` and `prod-smoke`.
   - `images-push`, `release`, `prod-up-build` and the `compose.yml` `prod` profile are removed.

10. **One variable per persistent data location (D5).**
    - Decision: how compose persists photos, the database and backups when S3 is not configured.
    - Choice:
      - Short-syntax mounts `${UPLOADS_SOURCE:-uploads}:/app/uploads` (api and restore; read-only
        `/uploads` in backup), `${POSTGRES_DATA_SOURCE:-postgres_data}:/var/lib/postgresql` and
        `${BACKUPS_SOURCE:-backups}:/backups`.
      - Top-level `volumes:` declares `uploads`, `postgres_data`, `backups` and `valkey_data`.
        Compose's own source rule then decides the type: a value starting with `/`, `.` or `~` is a
        host folder, any other value is a declared named volume, and an undeclared name fails
        `docker compose config`.
      - `UPLOAD_DIR` is the literal `/app/uploads`.
      - Valkey keeps a fixed named volume, because its data is disposable.
    - Alternatives:
      - A second override file for bind mounts (`-f compose.bind.yml`): another file, and operators
        forget the flag.
      - Long syntax with `type: ${UPLOADS_TYPE}`: two variables that can disagree.
      - A host folder by default (`./uploads`): Docker creates it root-owned, so every fresh install
        would fail fast until someone runs `chown`.
      - An init container that `chown`s on every start: runs as root on each boot and silently
        changes ownership of a host folder the operator picked.
    - Rationale:
      - One variable cannot be half-configured.
      - The default needs zero steps, because a new named volume inherits the image's `node`
        ownership.
      - The rule is Compose's documented behaviour (compose-go `isFilePath`), not ours.
11. **Bind-mount ownership: fail fast, one-command fix.**
    - Decision: what happens when the uploads host folder is not writable by the non-root API.
    - Choice:
      - `verifyStorage` writes and deletes `.brewform-write-test-<pid>` instead of only calling
        `access(W_OK)`.
      - On failure it logs one error naming the directory, the UID/GID, the errno code,
        `chown -R 1000:1000 <volume or host folder>` and `make prod-fix-uploads-owner`, then exits
        `1` before listening.
      - `make prod-fix-uploads-owner` runs `chown` as root in a one-off api container, so it works
        for both source types.
      - The guide pre-creates folders with `sudo install -d -o 1000 -g 1000 -m 0750 <path>` and
        covers SELinux relabelling and rootless/userns UID mapping.
      - Postgres needs no step (its entrypoint takes ownership). Backups are written by root under
        `umask 077`.
    - Alternatives: running the API as root (reverts t4b hardening); `create_host_path: false` (long
      syntax only, so it breaks the single variable); a warning instead of an exit (photos would be
      lost silently).
    - Rationale: a real write catches every cause (mode bits, `:ro`, SELinux, NFS root squash) the
      same way, and the message carries the exact fix.
12. **Backups target a named volume by default; restore and export go through compose services.**
    - Decision: where dumps land, and how restore works for both source types.
    - Choice:
      - `BACKUPS_SOURCE` (default named volume `backups`; for example `./backups` for a host
        folder) replaces `BACKUP_DIR`.
      - A profile-gated one-shot `restore` service (postgres image, root) mounts the uploads source
        read-write and the backups source read-only. It validates `RESTORE_DB_DUMP` /
        `RESTORE_UPLOADS_ARCHIVE` against the dump/archive name patterns, runs
        `pg_restore --clean --if-exists --no-owner`, extracts the archive and runs
        `chown -R 1000:1000 /app/uploads`.
      - `make prod-restore DUMP=… UPLOADS=…` wraps it (stop api/web, run restore, `up -d`).
        `make prod-backup-export DEST=…` runs `docker compose cp backup:/backups/. <dest>`.
        Imports use `docker compose cp <file> backup:/backups/`.
    - Alternatives: host `./backups` by default (root-owned dumps inside the checkout, and different
      commands per mode); hand-written `docker run` commands (need the project-prefixed volume names
      and differ between volume and folder).
    - Rationale: identical commands for a volume and a folder; name validation blocks path tricks;
      dumps are `0600`.
13. **Liveness and readiness contract (OQ4).**
    - Decision: what `/health` and `/ready` promise, so compose, the image, Coolify and monitors can
      rely on them.
    - Choice:
      - `/health`: no dependency checks, always `200 {"status":"ok"}` while serving.
      - `/ready`: a fixed set of keys `{ status, db, cache, rateLimitStore, storage, shuttingDown }`.
        `200` only when a Drizzle ping (`pingDatabase()`: `select id from user limit 1`, no row data
        read) settles within 2000 ms and the process is not shutting down. Concurrent probes share
        one in-flight ping. Valkey degradation keeps `200` (t2). `storage` (`ok`, `ephemeral`,
        `degraded`, `s3`) is informational only.
      - On SIGTERM/SIGINT a lifecycle flag flips `/ready` to `503` (`db: "skipped"`) before
        `server.close()`, and repeated signals are ignored.
      - Both probes: exempt from rate limiting (t2), `Cache-Control: no-store`, no `CacheProvider`
        access, no `info`+ log per probe (one `warn`/`info` per readiness transition),
        `describeRoute` with shared `HealthOutputSchema`/`ReadinessOutputSchema`, bare JSON (no
        envelope).
      - The code moves to `apps/api/src/modules/health/{model,service,index}.ts`, so no route
        imports `drizzle-orm` and there is no raw SQL.
    - Alternatives: `503` on a Valkey outage (Valkey is optional; contradicts t2); counting storage
      in the status code (an unwritable volume would drop all traffic, not just uploads); new
      `/livez`/`/readyz` paths (docs and Coolify already use the current ones).
    - Rationale: orchestrators need a cheap, stable, bounded signal. Readiness that touches the
      schema also proves migrations ran.
14. **Every HEALTHCHECK probes readiness through one bundled Node script (supersedes the `/health`
    image probe in decision 6).**
    - Decision: what the images, compose and Coolify run as their health check.
    - Choice:
      - `/app/healthcheck.mjs` (from `apps/api/scripts/healthcheck.mjs`): no imports beyond Node
        built-ins, path argument (default `/ready`, validated), 4 s fetch timeout, exit `0` only on
        `200`.
      - API image: `HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --start-interval=2s --retries=3 CMD ["node","/app/healthcheck.mjs","/ready"]`.
      - Web image: exec-form BusyBox `wget` on `/healthz` (`--interval=30s --timeout=3s --start-period=10s --start-interval=1s --retries=3`).
      - Compose declares checks on every long-running service with the timings in the
        production-operations table: postgres `pg_isready -d`, valkey via `VALKEYCLI_AUTH`, api
        `/ready`, web `/healthz`, backup freshness. `migrate` is gated with
        `service_completed_successfully`.
      - `/health` is proxied by the edge (exact path) for uptime monitors; `/ready` is not.
    - Alternatives:
      - Keep the image on `/health` (t4b): `depends_on` and Coolify rolling updates would pass
        before the database is reachable, and the image fallback would disagree with the Coolify
        check the user wants on readiness.
      - Install curl or wget in the API image: extra packages and CVE surface, against t4b
        hardening.
      - Inline `node -e "…"`: Coolify's CMD field forbids `;`/`|`, and the code would be copied
        into three places.
    - Rationale:
      - Docker has a single health status and never restarts a container because of it. Every
        consumer (Compose ordering, Coolify rollouts, Traefik routing) is a traffic gate, which is
        readiness.
      - Three retries 15 s apart absorb DB blips shorter than about 45 s.
      - Accepted trade-off: during a longer DB outage Traefik answers `404`/"No available server"
        instead of the API's `503`. The API could not serve those requests anyway.
15. **Exact Coolify settings, and local storage on Coolify.**
    - Decision: what operators type into Coolify.
    - Choice:
      - API Healthcheck: enabled, Type `CMD`, Command `node /app/healthcheck.mjs /ready`, Interval
        15, Timeout 5, Retries 3, Start period 180.
      - Web Healthcheck: enabled, Type `HTTP`, `GET` `http` `localhost`, Port 80, Path `/healthz`,
        expected 200, Interval 30, Timeout 3, Retries 3, Start period 10.
      - Uptime monitors: `https://<api domain>/health` and `https://<web domain>/healthz`, never
        `/ready`.
      - Local storage: a Persistent Storage **Volume Mount** (`brewform-uploads` → `/app/uploads`),
        or a **Directory Mount** plus `sudo chown -R 1000:1000 <source>`.
      - Because local photo URLs are root-relative, local storage also needs an API network alias
        (`brewform-api`) and `API_UPSTREAM=brewform-api:8000` on the web resource.
    - Alternatives: an HTTP-type API check (fails without curl/wget); a disabled dashboard check
      (works through the identical image check, but the user wants to set it in Coolify; kept as the
      documented fallback); container-name upstreams (names change per rolling deploy).
    - Rationale: copyable values, the same probe everywhere, and photos that survive redeploys and
      actually load.
16. **CI publishes the images it smoke-tested (strengthens decision 8, U4).**
    - Decision: how to guarantee that publishing happens strictly after every check, with the
      tested bits.
    - Choice:
      - `publish.needs: [quality, test, images, doc-drift]`, with every need running on push
        events. `if: github.event_name == 'push'` without `always()`.
      - On push events `images` `docker save`s both tested images into a 1-day artifact and outputs
        their image IDs. `publish` loads them, compares the IDs, tags them with metadata-action tags
        and `docker push`es. No build happens in `publish`.
      - `images` also runs `scripts/ci/compose-config-check.sh` (jq over
        `docker compose config --format json`: health checks, conditions, `UPLOAD_DIR`, volume vs
        bind rendering, no passwords).
      - `scripts/ci/smoke-images.sh` is extended with `/health`, the `/ready` keys, both containers
        healthy through their own `HEALTHCHECK`, `/health` through the edge, and the
        root-owned/1000-owned bind-mount pair.
      - `scripts/ci/smoke-compose.sh` runs the whole production stack with the built images: all
        services healthy, `migrate` exited 0, PNG survives `--force-recreate api`, backup dump and
        archive valid, graceful stop exits 0.
    - Alternatives: rebuild in `publish` from the gha cache (t4b; a cache eviction silently ships an
      untested image); push a candidate tag from `images` and retag later (pushes before tests pass,
      which the user ruled out with "sequential").
    - Rationale: the user's rule ("publish only after all CI jobs pass, never in parallel") becomes
      checkable: the job timeline and the image IDs prove it.

### Web providers, shareable URL state and data-loading standard (t5)

**Context** (confirmed; the inventory is in `audit/t5-web-state.md` §4–5)
- **Admin crash.**
  - `router.tsx:69-73` mounts `Layout` for `/`, while `/admin` (`:351-363`) is a separate top-level route with `AdminLayout`. `ToastProvider`/`ConfirmProvider` exist only in `Layout.tsx:23-24`, and `App.tsx:17-27` stacks only Theme/I18n/Auth.
  - `useToast()` throws outside a provider (`Toast.tsx:99-102`), so `AdminRecipesPage.tsx:26`, `AdminVendorsPage.tsx:18`, `AdminUserDetailPage.tsx:25`, `AdminCompatibilityPage.tsx:21` and `AdminCoffeeVarietiesPage.tsx:124` crash to `RootErrorBoundary`.
  - `useConfirm()` silently falls back to `window.confirm(opts.bodyKey)` (`Modal.tsx:161-167`), which shows raw i18n keys on `/admin/equipment` and `/admin/taste-notes`.
  - Page tests wrap themselves in providers, and `router.test.tsx` never renders `/admin`.
  - *Plain explanation (the user's top-10 item 6, "what does it mean?").* A "provider" is a wrapper component that makes a shared helper available to every page inside it. The toast helper (the small "Saved" / "Delete failed" pop-ups) and the confirm-dialog helper are only set up inside the main site layout. The admin area is a separate branch of the route tree with its own layout, so those helpers do not exist there. Five admin pages ask for the toast helper as they open, get an error, and the whole admin screen is replaced by "Oops! Something went wrong". Two more admin pages fall back to the browser's native confirm box and show a raw translation key. The fix mounts both helpers once at the very top of the app, so every route, including `/admin`, has them. A smoke test that renders every route with the real app wrappers would have caught it, and is added. (Full write-up: `audit/t5-web-state.md` §2.)
- **Pagination.**
  - `useRecipeFilters.ts:91` deletes `page` for every key, including `page` itself (`RecipeListView.tsx:431`), and `useRecipeFilters.test.tsx:148-157` asserts that behaviour.
  - Search inputs push history per keystroke (`RecipeListView.tsx:275,362`, `EquipmentCatalogPage.tsx:125`, `CoffeeVarietiesPage.tsx:116`).
  - `/taste-notes`, `/admin/users`, `/admin/audit-log` and `/admin/coffee-varieties` keep their selections in `useState`, and `/collections` and `/collections/browse` cannot page at all.
- **Split data layer.**
  - 13 page loaders, 1 resource loader and 5 resource actions coexist with **42 `useEffect` fetch blocks in 39 files**. Only 4 of those have a stale guard, and none aborts. About 35 files mutate by calling the client directly. Re-verified 2026-11-19: 41 effect blocks in 38 files outside the allowlisted `AuthContext`, plus 25 files calling the client outside effects and 2 raw `fetch(` QR downloads (`audit/_refine/coverage.md` §1.6), 65 modules in total.
  - The client takes no signal, refreshes per 401 (`client.ts:47-62`) and parses bodies unguarded (`:64`).
  - Guarded loaders rethrow 401 into "Oops!". `RequireAuth.tsx:21` navigates without `replace` or a return path.
  - Comment actions rethrow (`routes/comments.ts:69-72,92-95`), which replaces the page and leaves the rollback branch dead.
  - With no `shouldRevalidate` anywhere, every like re-runs the 3-request detail loader and collapses loaded comment pages.
  - The static cache memoises results rather than promises (`static-cache.ts:18-31`), and re-broadcasts the cross-tab bust on receipt (`useStaticCacheSync.ts:20-27`), which causes ping-pong.

**Decisions**

1. **Providers live once at the root.**
   - `apps/web/src/AppProviders.tsx` nests `ThemeProvider` → `I18nProvider` → `ToastProvider` → `ConfirmProvider` → `AuthProvider`. It is rendered in `App.tsx` around `RouterProvider`, and the providers are removed from `Layout.tsx`.
   - Alternatives: wrap `AdminLayout` as well (two toast queues, and the next top-level route repeats the bug), or a pathless root route element (couples providers to the route tree, with the error boundary above them).
   - `ToastProvider` needs only i18n, and `Modal` has no router dependency. Tests import the same `AppProviders`.
2. **`useConfirm()` throws outside a provider**, mirroring `useToast()`. Fail-fast is what the smoke test relies on.
3. **`router.tsx` exports `routes` and `createAppRouter()`.** `createBrowserRouter` at module scope starts loaders on import, which makes the tree untestable. The smoke test derives its path list from `routes`.
4. **Standardise on React Router data APIs; no TanStack Query.**
   - Loaders handle route reads, actions (via `<Form>`/`fetcher.submit`) handle writes, and `useFetcher().load()` against `resources/*` loaders handles component-level reads. `useEffect` stays only for non-fetch effects and for triggering `fetcher.load()`/`revalidate()` on external events. The sole exception is `contexts/AuthContext.tsx`.
   - Alternatives:
     - TanStack Query: a new dependency, a second cache to invalidate next to router revalidation, and D10 already rejected it.
     - A homemade `useApiQuery`: still two paradigms, and it loses router pending, error and revalidation integration.
   - Rationale: `react-router@8.5.1` already provides `request.signal` cancellation, stale-response discarding, pending state, error boundaries and revalidation. This is the answer to the user's "pros and cons of loaders vs useEffect" question (`audit/t5-web-state.md` §3 has the full table). It is recorded as ADR-018.
   - Pros and cons, in short:

     | | Router loaders / actions / fetchers | `useEffect` + `useState` fetching |
     |---|---|---|
     | **Pros** | Data starts loading before render, in parallel with the lazy page code (no waterfalls). Cancellation through `request.signal` and stale-response discarding are built in. Pending and error states come from the router (`errorElement`). Data revalidates after a mutation. The URL is the natural input, which the shareable-list work needs. Auth redirects happen before anything renders. Loaders and actions are plain async functions, easy to unit-test. No new dependency. | Familiar and fully co-located with the component. No route wiring. |
     | **Cons** | Route-config wiring and a `*.data.ts` module per page. Revalidation needs thought (`shouldRevalidate`). No cache across navigations (acceptable here; static lookups get a small single-flight cache). | Fetching starts only after render, and nested components fetch one after another. Every effect needs its own abort and stale guard: 0 of the 42 current sites abort and only 4 guard. Loading, error and refetch-after-mutation are hand-rolled per page, and many pages show failures as "No results". URL state has to be mirrored into component state and back. Auth redirects flash. |

     Mixing both, as the app does today, carries the costs of both. Because `apps/web` is one app inside the monorepo, it can adopt one paradigm everywhere, which is the choice made here.
5. **Co-located `<Page>.data.ts` modules; lazy routes use `lazy: { loader, action, Component }`.** This enables the import-boundary lint rule and loads data and code in parallel.
6. **Component-level reads use `routes/resources/*.ts` resource routes**: unread count, notification page, my collections, coffee-variety search, taste notes, brew history and stats. A fetcher's new `load()` cancels its previous one, which gives the typeahead the race behaviour it needs.
7. **Actions return result objects.** `{ ok: true, … } | { ok: false, error }` for expected failures, generalising `routes/like.ts`. Pages with several mutations use one action keyed by `intent`, and the UI toasts on `ok:false`.
8. **Auth guarding via loader wrappers.**
   - `requireAuth(fn)`/`requireAdmin(fn)` (`routes/auth-guards.ts`) turn a final 401 into `redirect('/login?next=…')` and an admin 403 into `/`.
   - Rejected: v8 route middleware, because the session store lives above the router and loaders start before it resolves.
   - `RequireAuth` stays as the render guard, now with `replace` and `next`.
9. **The return path is `next`, validated by `isSafeNextPath`**: a single leading `/`, no `//`, no `/\` and no scheme. Otherwise `/`. This prevents open redirects.
10. **One URL-state hook.** `hooks/useListUrlState.ts` takes a per-page parser that is shared with the loader. It provides:
    - `setFilter` (deletes `page`);
    - `setPage` (keeps the rest, and omits page 1);
    - `clearAll`;
    - `useDebouncedUrlText(key)`: a 300 ms debounce that commits with `{ replace: true, preventScrollReset: true }` and re-syncs on external URL change.

    Discrete controls push history, and defaults are omitted from URLs. `/recipes` keeps `search`/`author`, new pages use `q`, and the catalogs accept legacy `search` on read. Alternative: `nuqs` (a new dependency).
11. **Revalidation policy.**
    - Social toggles submit with `defaultShouldRevalidate: false`.
    - `recipes/:slug` skips revalidation for successful like/favourite/follow/comment actions. Rate still revalidates.
    - `CommentSection` merges page-1 data instead of resetting.
    - The root loader never revalidates.
12. **API client.**
    - Every helper and domain method takes an optional `{ signal }`.
    - A module-level `refreshPromise` is shared by concurrent 401s and is not tied to any caller's signal.
    - Bodies are parsed with `text()` plus a guarded `JSON.parse`; a bad body becomes `ApiError('INVALID_RESPONSE', …, status)`.
    - `AbortError` is rethrown untouched and logged at debug.
    - `ApiError` moves to `api/errors.ts`.
13. **Regression guards.**
    - A Biome `style/noRestrictedImports` override bans the API client outside `api/**`, `routes/**`, `*.data.ts`, `AuthContext` and tests.
    - `apps/web/src/architecture.test.ts` scans `useEffect` bodies for API calls.
    - The rule starts at warn and becomes error once the migration ends.
    - Both guards land before the first migration group with a pending list of unmigrated files (tasks 14.1-14.3); each migration task removes its files, and the flip to error happens after the last migrated module, the private-notes editor (task 17.18).
13a. **A lint-independent enforcement test.**
   - Choice: `apps/web/src/data-loading.enforcement.test.ts` scans every non-test `.ts/.tsx` under `apps/web/src` and fails on: (1) value imports (incl. multi-line, `export … from`, dynamic `import()`) of `api/client.ts`, `api/index.ts`, `api/static-cache.ts` outside `api/**`, `*.data.ts`, `routes/**`, `contexts/AuthContext.tsx` and `hooks/useStaticCacheSync.ts` (only `CACHE_BUST_KEY`, `clearStaticCache`); `import type` is allowed everywhere; (2) `fetch(`, `XMLHttpRequest`, `new EventSource(`, `navigator.sendBeacon(` outside `api/**`; (3) `export … loader|action` in a `.tsx` outside `routes/`; (4) value imports from `*.data.ts` outside `router.tsx`, `routes/**` and other data modules. It carries self-check fixtures and a shrink-only `PENDING` list that must be empty before archive.
   - Alternatives: rely on the Biome `noRestrictedImports` override alone (suppressible with a `biome-ignore` line, and blind to raw `fetch` and loader placement), or only the `useEffect` architecture test (misses event-handler calls and direct mutations).
   - Rationale: the user made loaders, actions and fetchers the only mechanism; this test makes that a CI fact. The 2026-11-19 inventory is 65 modules: 41 effect blocks in 38 files, 13 inline loaders, 12 mutation-only modules and 2 raw-fetch QR downloads the audit missed.

13b. **The QR download goes through a resource route.** `useRecipeQrDownload(slug)` calls `fetcher.load('/resources/qrcode/recipe/<slug>')`, whose loader returns `{ ok: true, svg }` from `qrcodeApi.recipeSvg(slug, { signal })` (on a new `api.getText`, so `VITE_API_URL` applies). The hook builds the Blob download and toasts `qrcode.downloadFailed` on failure. This replaces the raw `fetch` in `RecipeQRCode.tsx:34` and `ShareSection.tsx:48`.

13c. **`useBanUser` is rewritten in place, not overridden by precedence.** The web-shared-components requirement is renamed and modified: the hook submits `intent=ban|unban` to the `/admin/users/:id` action with `defaultShouldRevalidate: false`, which keeps the "patch local state, no re-fetch" contract of both admin pages.
14. **Static cache.**
    - Lookups are single-flight: the in-flight promise is memoised and dropped on rejection. A `{ signal }` affects only the caller's wait.
    - All taste-note and equipment lookups go through the cache.
    - Cross-tab sync calls a local `clearStaticCache()`, so a received bust is never re-broadcast. This is the integration-added `static-cache` delta.

### Chart and visualization bounds (t6)

**Context** (every claim validated. Measured with the real fallback font, SF Pro, because Inter is not loaded per `index.html:57`. Numbers are in `audit/t6-charts.md`.)
- **Radar** (`ScaaRadarChart.tsx`).
  - The viewBox equals the plot (`:101-107`), with a fixed `width={size}`, `overflow: 'visible'`, labels at 1.15·R, a fixed 10px font and raw English categories (`:150-159`, `radar-chart-data.ts:6-16`).
  - Labels overflow by −52.8/+26.2px at size 200 and −57.7/+32.9px at size 160, which is 8.7px off-screen on a 375px phone. The audit's −55/−63 is slightly overstated, but the overflow is real.
  - The chart is rendered twice and toggled by CSS (`TastingNotesSection.tsx:114-120`).
  - A `NaN` value blanks the polygon, and a `maxValue` below the data throws vertices outside the plot.
- **Timeline** (`BrewTimeline.tsx`).
  - `<text>` sits inside a `preserveAspectRatio="none"` 1000×120 SVG (`:142-147,199-244`), so glyphs render at 33% / 41.5% / 76% of their natural width at 222 / 277 / 507px.
  - The axis loop has no count cap (`:9-25`): the seeded 43,200s cold brew gets 1,441 labels, and 3,568 totals between 1 and 3,600 have overlapping labels at 222px.
  - `extraction_time_seconds` is an unbounded integer, so an int32-max value makes viewers' tabs try to render about 71.6M divs.
  - `pre ≥ total` gives negative widths. The flow rate is unrounded. Tick text is 2.31:1 in light.
- **StarRating.**
  - A keyboard click has `clientX = 0`, so it always submits a half star (`:61-65`).
  - Read-only mode is 5 disabled buttons.
  - The hardcoded `#f5a623` is 1.86:1 in light.
  - The fill rounds down while the label rounds to nearest.
  - `NaN★` and `5.5★` are reachable.
  - The busy state sets `disabled`, which drops focus (`RecipeDetailPage.tsx:385`).
- **Other displays.**
  - The unrounded ratio `1:2.2222223` overflows its stat card by about 43px (`stat-cards.ts:69`).
  - Raw seconds appear in cards, diff and versions.
  - `RecipeCard.tsx:89` puts the 1–10 value next to a star.
  - `IntensityDots` does not clamp.
  - `formatNumber` has zero call sites, so the archived i18n "Decimals localize" requirement is unimplemented.

**Decisions**

1. **Keep hand-rolled SVG and add one small helper module, `apps/web/src/utils/chart/`.**
   - Files: `scale.ts` (sanitize, clamp, clampPct, safeRatio), `ticks.ts` (`niceTicks`, `durationTicks`), `text.ts` (`estimateTextWidth`, `wrapLabel`), `layout.ts` (box geometry, `fitViewBox`), a barrel, and a measured-width fixture.
   - The algorithms follow d3 conventions.
   - Alternatives: Recharts (about 100KB+ gzipped, and its radar labels still need a custom renderer), visx (several packages for two charts), d3-scale.
   - The module totals about 200 lines of pure, testable code, and adds no dependency.
2. **Radar: fitted viewBox with uniform scaling.**
   - Plot radius R = 100 units with labels at R + 10, wrapped after `/` into `<tspan>`s. The viewBox is `fitViewBox(union(plot, labels), 4)`, rendered at `width="100%"` and `max-width: 280px`.
   - A font of 18 units renders at 10.2px at 222px and 12.9px at 280px.
   - A single instance is rendered, and `TastingNotesSection` becomes a `@container` that stacks below 520px.
   - Labels come from `t('taste.category.<slug>')`.
   - Values are clamped to `[0, effectiveMax]`. All-zero profiles draw no polygon, and 1–2 non-zero categories get vertex markers.
   - Alternatives: HTML labels, font scaling (the status quo), abbreviations, or two instances.
3. **Timeline: shapes in a stretched SVG, text in HTML.**
   - Paths stay in the `preserveAspectRatio="none"` SVG with `vector-effect="non-scaling-stroke"`.
   - Labels are HTML boxes positioned by a pure `layoutPhaseLabels(model, widthPx, locale)`. Hidden durations move to a caption row.
   - Width comes from a `useElementWidth` ResizeObserver hook, with a 200px fallback.
   - Alternatives: uniform `meet` scaling (letterboxing), ellipsis (misleading numbers), or `getBBox` (jsdom lacks it).
4. **Axis: `durationTicks` computed once at the 200px minimum.**
   - The ladder is 1,2,5,10,15,30 s / 1,2,5,10,15,30 min / 1,2,3,6,12 h / 1 d, then closed-form `86400×{2,5,10}·10^k`.
   - At most 8 ticks with a 6px gap. Labels use the step's unit (en s/m/h, tr sn/dk/sa).
   - Ticks that fit at 200px fit at every wider width, so rendering is pure and stable on resize.
   - Simulated over 1–86,400s plus the extremes, en/tr, at five widths: 0 failures.
   - The old step-formula property tests are replaced.
5. **`pre ≥ total` means no split.** The chart renders a single extraction phase with the true total and logs one warn per mount. It renders nothing for an invalid total. Validation belongs to t1's merged cross-field rule, and the chart stays defensive anyway.
6. **StarRating is one `role="slider"` control with whole-star arrows.**
   - Arrows move ±1 star, and Shift+arrows ±½ star. Digits 1–5 select a star, and Home/End select ½ and 5.
   - Enter/Space commit, Escape reverts, and blur commits once. Pointer half-clicks are kept.
   - The busy state uses `aria-disabled`, so focus survives. Read-only mode is one `role="img"`.
   - Alternatives: the minimal `e.detail === 0` fix (fails WCAG 2.1.1), a radio group (submits on every arrow), or APG half-step arrows (contradicts the user's whole-star decision).
7. **Colour tokens.**
   - `--rating-star` is added: `#b45309`/`#f59e0b`/`#fbbf24`, giving 4.60/7.06/7.11:1 against `--bg-secondary`.
   - Ticks use `--text-secondary` (≥ 6.0:1).
   - A contrast unit test parses `globals.css`.
8. **Formatting through `utils/format.ts` with i18n unit keys**: `formatDecimal`, `formatDuration` and `formatDurationTick`. `Intl.DurationFormat` was rejected: Turkish narrow output for 12h30m is `12s 30d` on Node 26.13 ICU. A new `useSafeLocale()` serves components rendered without a provider.
9. **Width estimate.** Per character: 0.34em narrow, 0.80em uppercase/wide, 0.62em digits, 0.60em otherwise. Letter-spacing is added, then ×1.1 for safety and ×1.06 for bold. A fixture test asserts the estimate is at least the measured SF Pro width for every en/tr string.
10. **Testing.**
    - Pure geometry tests (jsdom has no layout), component tests for DOM and ARIA, and fast-check properties.
    - A guard test bans `overflow: visible`, `<text>` in stretched SVGs and hex colours in chart files, including `components/charts/**`.
    - No Playwright: visual verification is a manual checklist, and Playwright goes to the deferred ledger.
11. **Reuse.** The F17 admin analytics and F03 profile stats charts must import `utils/chart`. No `<ChartFrame>` is built until a third chart exists.

### Search ranking and database-side pagination (t7)

**Context**
- `GET /api/v1/recipes?search=…` calls `model.findAllForRanking` (`recipe/model.ts:410-432`), which has **no `LIMIT`**. It loads every matching recipe plus every version's `productName` and `personalNotes` (up to 10,000 chars each, `recipe.ts:45`).
- `rankRecipes` (`service.ts:444-465`) then sorts the whole set, and `service.ts:595-596` slices out one page. List items still carry the undocumented `versions[]` (`index.ts:236-245`).
- The non-search `findMany` (`model.ts:369-396`) is limited, but it also attaches every version's notes.
- Predicates are leading-wildcard `ILIKE` (`model.ts:128-150`) with only B-tree indexes, so every search seq-scans both tables.
- The pool is `max: 10` with no timeouts (`packages/db/src/index.ts:7`), and `search` is unbounded (`recipe.ts:163`).
- Validation:
  - Server memory, unbounded load and seq scans: confirmed.
  - The "browser paginates 1000 matches" reading: refuted. The over-fetch is server-side. This answers the user's design question 4.
  - *Plain explanation of design question 4.* Today, when a search has 1,000 matches and the page shows 10, the **API server** (not the browser) loads all 1,000 recipes from Postgres, together with every version's coffee name and notes (up to 10,000 characters each), into its own memory. It ranks them in JavaScript and sends only the requested 10 to the browser, plus the total. The browser receives one page, so it is not paginating on the client. The cost lands on the server: memory and CPU grow with the number of matches on every request, and the database has no index for `%term%` searches, so it reads both tables in full. After this change Postgres scores, sorts and pages the results itself and returns only the 10 rows of the requested page plus one count. Trigram indexes serve the `%term%` matches, and a statement timeout caps any query that still runs too long.
  - Also found:
    1. `sortBy=rating` silently orders by `createdAt` (`model.ts:376,415,1212`).
    2. There is no unique tie-break, so OFFSET pages can repeat or skip rows.
    3. JS `toLowerCase()` disagrees with `ILIKE` on `İ`.
    4. `\` is not neutralized.
    5. Failed searches log the raw term through `DrizzleQueryError.message`.
- F11's D1 chose in-app ranking "for hundreds of recipes" and rejected SQL `CASE` ranking because of a 3-field keyset cursor. Keeping F11's offset fallback for search removes that objection.

**Decisions**

1. **Score, order and paginate in SQL.**
   - `buildListPageQuery`/`findListPage` in `recipe/model.ts` use the **core** select (`getTableColumns(recipes)` plus an author mini-projection via `innerJoin(users)`, `$dynamic()`).
   - When searching, they left-join a grouped version-score subquery: `max(CASE productName → 2 + CASE notes → 1)`.
   - Score = `CASE title → 3 + coalesce(best, 0)`, ordered by score desc, then the sort key, then `recipes.id`, with `.limit(perPage).offset(...)`. A parallel `COUNT(*)` runs over the same `finalWhere`.
   - `findMany`/`findStarred` delegate, and `findAllForRanking`/`rankRecipes` are deleted.
   - Alternatives: FTS `ts_rank` (changes semantics), a capped top-K plus JS ranking (still heavy, and drops old matches), or relational `extras` (hits the D03 alias bug).
   - Rationale: parity with the F11 weights, O(perPage) memory, and score and filter sharing one `ilike` predicate, which fixes the `İ` mismatch.
2. **`pg_trgm` GIN indexes and a union-structured predicate.**
   - A `drizzle-kit generate --custom --name=enable_pg_trgm` migration contains only `CREATE EXTENSION IF NOT EXISTS pg_trgm;`.
   - Three `index(...).using('gin', col.op('gin_trgm_ops'))` declarations in `schema.ts` (`recipe.title`, `recipe_version.product_name`, `recipe_version.personal_notes`) are generated by `make db-generate`.
   - The search branch becomes `inArray(recipes.id, union(titleIds, versionRecipeIds))`, so each branch can bitmap-scan its own index. If Drizzle 0.45 rejects it, a `sql` fragment with a D03 comment is used instead.
   - `pg_trgm` is a trusted extension (no superuser needed). The index is lossy and rechecked, so results are unchanged.
2a. **Migration pre-flight for `pg_trgm`.**
   - Choice: `packages/db/src/preflight.ts` exports `assertMigrationPreflight(client)`, called by `packages/db/src/migrate.ts` before `migrate()`. It reads `pg_extension`, `pg_available_extensions` and `has_database_privilege(current_user, current_database(), 'CREATE')`, and exits 1 with a fixed message (not available → use the official image or install contrib; no CREATE → run `CREATE EXTENSION pg_trgm;` as the owner). Task 10.1 verifies both official images once and records versions.
   - Alternatives: a manual check only (the previous plan, which also kept a "ship without indexes" fallback branch), or letting the migration fail mid-run.
   - Rationale: both official images ship contrib, so the check protects managed or custom servers, where a mid-migration failure is hardest to diagnose. It runs in the compose `migrate` one-shot service, so the API never starts against a half-migrated schema.

2b. **Search never widens visibility.** The search union and score are ANDed onto the listing's existing visibility condition (owned by the recipe-visibility capability), and the count uses the same `finalWhere`. A DB test asserts that private, draft, unlisted and soft-deleted recipes never match, including through older versions.
3. **Full-text search is rejected for now.**
   - It is lexeme-based (`yirga` ≠ `Yirgacheffe`).
   - `ts_rank` is frequency-based, and generated columns cannot span two tables.
   - The `turkish` stemmer mangles English, and it would need `@@` operators.
4. **Deterministic ordering and a real rating sort.**
   - Every offset ordering ends with `recipes.id`.
   - `rating` orders by an `avg(userRecipeRatings.rating)` aggregate with `NULLS LAST` in both directions (a D03 comment, because Drizzle 0.45 has no helper).
   - The score's version scope follows the filter's (any version today).
5. **Search bounds and literal matching.**
   - Choice: `search: z.string().trim().max(200)`. `normalizeSearchTerm(raw)` trims (empty means no search). `toContainsPattern(term)` escapes `\` → `\\`, `%` → `\%`, `_` → `\_` (in that order) and wraps in `%…%`. The pattern is a bound parameter of Drizzle `ilike()`; PostgreSQL's default LIKE escape is `\`, so no `ESCAPE` clause or `sql` fragment is needed, and pg_trgm honours escaped characters. The same helper serves `search`, `mainBrewer` and `author`. No minimum length: memory is bounded and the statement timeout caps cost.
   - Alternatives: strip the metacharacters (the previous choice: `a_c` matched `ac`, `100%` matched `100`, `\` silently became no search), or an explicit `ESCAPE` clause (needs raw SQL).
   - Rationale: users can search for literal `%`, `_` and `\`, the predicate stays index-assisted, and the filter, score and count share one pattern.
6. **Global statement timeout and 503 `QUERY_TIMEOUT`.**
   - `postgres(url, { max: 10, connect_timeout: 10, idle_timeout: 20, connection: { statement_timeout } })` from `DB_STATEMENT_TIMEOUT_MS` (default 10000, 0 disables).
   - `57014`, direct or on `err.cause`, maps to 503 through t3's SQLSTATE table.
   - `listRecipes`/`listStarredRecipes` log `{ requestId, searchLength, pgCode }` and rethrow a sanitized error.
   - Alternatives: `SET LOCAL` per search (raw SQL plus a round trip), or client-side `query_timeout` (unverified in postgres 4.1).
7. **List payloads drop `versions[]`**, so responses match `RecipeListItemOutputSchema`. `RecipeCard` renders only an explicitly passed `version`.
8. **Record the decision and amend the rules.**
   - ADR-017 "Database-side search ranking with pg_trgm" (pre-allocated by t8; t7's notes say ADR-015).
   - AGENTS.md DB rules (folded into t8's AGENTS.md pass, exact wording in `audit/t7-search.md` §4): `ilike` accepted, `sql` fragments only where Drizzle lacks a builder and with a D03 comment, ADR-approved extensions and GIN opclass indexes allowed, and a new "Bounded reads" rule.
   - `docs/architecture.md` mirrors the rules.

### Documentation and OpenSpec truth (t8)

**Context**

Agents treat `AGENTS.md`, `docs/` and `openspec/specs` as the source of truth, and all three drifted after the Deno → Node 26/pnpm migration (#135), `compose.production.yml` plus the redis driver (#166) and Valkey (#168). The full table is in `audit/t8-docs-specs.md`.

*AGENTS.md.*
- `AGENTS.md:85` and `docs/architecture.md:149` prescribe `eq(t.deletedAt, null)`, which binds `= $1` and never matches. The code uses `isNull(...)` 160 times.
- `:110` lists Deno lint rule names.
- `:111` describes a preceding-comment rule nobody follows; Biome's `: reason` suffix is used instead.
- `:37-38` claims proxy auto-detection.
- `:84` says "no Postgres-specific operators" while `ilike` is used in 4 modules.
- `:162` points at the dead `TODO_logs.md`.
- There is no i18n rule.

*OpenSpec.*
- 24 main specs mention Deno, and `text-sanitization` uses `jsr:`.
- `remote-cache` mandates `Deno.openKv`, and `deno-runtime`/`deno-workspace-management` are still live.
- `openspec/changes/remove-deno-node24-pnpm` is complete but unarchived, and its deltas are wrong (Node 24, memory-only cache, no REMOVED).
- Five archived capabilities never reached the main specs (recipe-comparison, recipe-drink-type-sync, recipe-fork-page, type-consolidation, unit-system-display). The shipped merge code ignores `recipe.deletedAt` (`service.ts:855-857`).

*Lint and docblocks.* Biome `recommended` leaves `noExplicitAny` at warning and omits `useAwait` and `noEmptyBlockStatements`, so all three wave-5 guarantees lapsed. The docblock scanner exists only in the wave-5 archive and uses `Deno.*`. ADR-013 contradicts the code-documentation spec.

*Docs.*
- `docs/api.md` misses brew logs, collections, notifications, merge, diff, the sitemap and the cursor/F11 params, and still documents the removed `grinder` filter.
- `docs/notifications.md`, ADR-006, the README docs table and `docs/architecture.md` are stale.
- `docs/seo.md` hard-codes a domain.
- `robots.txt` `Disallow: /equipment` hides the public `/equipments` catalog.

*Backlog.*
- ROADMAP says "all debt resolved".
- The FEATURE_SUGGESTIONS matrix contradicts it and has 34 broken links.
- F23/F29/F30/F16/F07/F17/F27 rest on Deno premises, and F24 duplicates F09.
- F03/F20/F25/F26/F28 still say F02 is missing, and D28 phase 2 is orphaned.

*Refuted:* `pr_description.md` is git-ignored and was never tracked, so no change is needed.

**Decisions**

1. **Retire `remove-deno-node24-pnpm` without applying its deltas.**
   - The very first task runs `openspec archive remove-deno-node24-pnpm --skip-specs -y` (flag verified). Wave 6 carries the correct deltas instead.
   - Alternatives: rewrite and archive it (two changes editing the same capabilities), archive as-is (writes Node 24 requirements), or delete it (loses history).
2. **Retire `deno-runtime`, `deno-workspace-management` and `remote-cache` by deleting their folders.**
   - Sandbox-verified with openspec 1.4.1: a delta that removes every requirement validates, but makes `openspec archive` abort the whole change ("Spec must have at least one requirement"), even if the folder is deleted first.
   - So `git rm -r` runs just before the wave-6 archive. The REMOVED rationale and migrations (→ `node-runtime`, `pnpm-workspace`, `cache-driver`) are recorded in `proposal.md` and here, and the three names go into the doc-drift allowlist's `retiredCapabilities`.
   - **No track ships an all-REMOVED delta.**
3. **Deno-titled requirements use RENAMED + MODIFIED, keyed by the new name.**
   - Counts: 2 in lint-style, 1 in local-dev-environment, 3 in deployment-guide, 1 in dependency-management and 3 in logging-test-coverage. This archives cleanly (sandbox-verified).
   - Finished one-off requirements (the wave-5 dependency batch and the TS7 gate) are REMOVED, with a migration note.
4. **Orphaned archived capabilities are re-added as curated ADDED specs, corrected to the shipped code.**
   - Implementation code blocks and "commands pass" requirements are dropped.
   - The merge access rule follows `canViewRecipe` plus a soft-delete check, with failing tests first.
   - Alternative: `/opsx:sync` of the archived text, which would re-introduce Deno patterns.
5. **The doc-drift guard is a dependency-free Node script with fixture tests.**
   - `scripts/doc-drift-check.ts` runs with plain `node`, so the `doc-drift` CI job needs no install. It lives in `ci.yml`, because t4b deletes `pr.yml`.
   - Rules: the token pattern `(?<![A-Za-z])deno(?:kv|land)?(?![A-Za-z])|jsr:` (case-insensitive, does not match "denote"), archived capabilities present unless retired, no "Purpose: TBD", relative links resolve, and a code-remnant scan.
   - The allowlist is one JSON file with mandatory reasons and stale-entry detection.
   - Alternatives: a YAML grep step (no fixtures), or markdownlint/lychee (dependencies, network).
6. **The API reference is generated.** `apps/api/scripts/generate-api-reference.ts` builds the real route tree in-process (like `openapi.coverage.test.ts`) and renders `docs/api-reference.md`, and CI fails on diff. `docs/api.md` keeps conventions only. Completeness depends on OpenAPI coverage, and the admin/auth gaps have no wave-6 owner.
7. **The lapsed lint rules come back as errors.** `suspicious.noExplicitAny`, `useAwait` and `noEmptyBlockStatements` are set to `"error"`: fix first, flip last. `packages/shared/src/lint-policy.test.ts` bans file-level and range suppressions and unjustified ignores. Alternative: `--error-on-warnings`, which would also block on 764 `noNonNullAssertion` warnings.
8. **Docblock enforcement is automated.** The wave-5 scanner is ported to `scripts/docblock-scan.ts` (`node:fs`, `--check`), exports added since July are backfilled, and the scan runs in the `doc-drift` job. ADR-020 supersedes ADR-013.
9. **Single editor for shared docs, with pre-allocated ADR numbers.**
   - t8 owns `AGENTS.md`, `README.md`, `docs/` (except `deployment_coolify.md`, `deployment_compose.md`, `docker.md` and `deployment.md`, which belong to t4b) and `plans/`.
   - Other tracks' doc inputs are folded in by the consolidation pass. ADR-015..021 are allocated as listed under Cross-track integration, and later ADRs take 022+.
10. **Historical docs move to `docs/history/` with a banner** (`requirements-audit-report.md` now). They are allowlisted, not edited.
11. **ROADMAP is the only status table.**
    - The FEATURE_SUGGESTIONS matrix becomes a link.
    - ROADMAP gains a "Wave 6 — 2026-11-18 audit remediation" entry, a "Platform changes" history line, D44 (tasteNoteId removal, D28 phase 2) and D99.20+ for deferred items.

## Risks / Trade-offs

**Cross-track**
- [Many tracks edit the same files: `recipe/service.ts` (t1, t3, t7, t8), `errorHandler.ts` (t3, t7), `config/env.ts` (t2, t4a, t4b), the compose files (t2, t4b, t7), `PhotoUpload.tsx` (t4a, t5), `RecipeListView.tsx` (t5, t7), `AddToCollectionModal.tsx` (t3, t5), `RecipeDetailPage.tsx` (t1, t3, t5, t6), `en.json`/`tr.json` (all web tracks), `AGENTS.md` and `docs/`] → Mitigation:
  - Implement in `tasks.md` order on one branch.
  - Each later task names the earlier change it must preserve (for example t4a's error-code mapping inside t5's upload action, and t7's `maxLength` on t5's debounced inputs).
  - All `AGENTS.md` edits go through t8's single pass.
- [Migration numbering across tracks (t1 notes table, t3 identifier indexes, t7 extension and indexes)] → Mitigation: generate one migration at a time in task order. On a collision, delete the local SQL, snapshot and journal entry and re-run `make db-generate`. Never hand-edit the generated SQL. `make db-generate` must end with "No schema changes, nothing to migrate".
- [The doc-drift root test and CI job fail until wave 6 is archived] → Mitigation: build and fixture-test the script early. Wire the CI job and require the root run to pass only after the archive and Purpose backfill at the end of the docs group.

**t1 — notes and recipe write**
- [An amend changes what other users' brew logs point at (`brew_log.recipe_version_id`)] → Mitigation: earlier versions stay immutable, the edit page says plainly that the current version is updated in place and offers "Save as a new version", and an `amendedAt` column is a ledger follow-up.
- [Earlier "private" notes typed on other users' recipes are public and cannot be identified] → Mitigation: the announcement explains what the old box did and asks authors to review their brewer notes. There is no automated wipe, because it would destroy legitimate author text.
- [Authors' private editor now starts empty] → Mitigation: brewer notes stay editable in the edit form, and both labels say which is which.
- [Concurrent edits block on the recipe row lock] → Mitigation: one row, one short transaction, and edits of the same recipe are rare.
- [Unverified authors can no longer edit their recipes] → Mitigation: this is the same rule as create, and `EmailVerificationBanner` already prompts verification.
- [A browser tab opened before the deploy still posts to the removed `POST /notes`] → Mitigation: it gets a 404, the rewritten editor shows the error and keeps the typed text, and a reload loads the new client.

**t2 — rate limiting and cache**
- [A `TRUST_PROXY` setting that is wrong for the topology gives shared buckets (`none` behind a proxy) or a spoofable key (`hops` with direct exposure)] → Mitigation: a secure default, a warn-once when XFF arrives under `none`, the effective mode in the startup log, explicit template values, and a topology table in `docs/deployment_coolify.md`.
- [The bundled Cloudflare ranges go stale] → Mitigation: this fails safe (the edge-IP bucket). `TRUST_PROXY_CIDRS` adds ranges without a release, and the source URL and date sit in the file header.
- [ioredis 6 RESP3 reply shapes break the library's Lua parsing] → Mitigation: the opt-in Valkey integration test catches it, and `protocol: 2` on the limiter client is the fallback.
- [A managed Valkey forbids `EVAL`] → Mitigation: the degraded warn makes it visible, and the Lua-free MULTI backend fits the `RateLimitBackend` seam.
- [Insurance limiting is per process during an outage, so the effective limit is N × replicas] → Accepted and documented.
- [`auth-login-fail-account` lets an attacker lock a known email out for up to an hour] → Mitigation: it needs at least 4 IPs given the per-IP caps, a password reset clears it, and the lock is never permanent.
- [NAT/CGNAT users share IP buckets] → Mitigation: moderate defaults, centralised constants, and `RATE_LIMIT_GLOBAL_MAX` is tunable.
- [Failure-only counting is check-then-act, so parallel wrong passwords can exceed 5] → Accepted: it is bounded by `auth-login-ip` (20/15 min).
- [Valkey `allkeys-*` eviction would drop limiter keys] → Mitigation: compose keeps `noeviction`, and the docs warn against changing it.
- [The reconciliation flush cold-starts the cache] → Mitigation: it runs only when invalidations were dropped, and the pool is capped at 10.
- [LRU pressure evicts hot entries] → Mitigation: `CACHE_MEMORY_MAX_ENTRIES` is tunable, and the sweep's debug log shows the size.
- [A new dependency adds supply-chain surface] → Mitigation: an exact pin, zero transitive deps, and Renovate tracking.

**t3 — slugs, collections and errors**
- [Colliding titles get non-semantic suffixes (`espresso-k3x9q2`)] → Accepted: unique titles stay clean, and numeric suffixes leak counts and race.
- [A slug claim waits on a concurrent uncommitted insert of the same slug] → Mitigation: the claim is the first write of the transaction, so the waiter holds no other locks, and the wait ends when the holder commits (skip to the next candidate) or rolls back (insert).
- [The identifier indexes fail to build on existing case-duplicate data, or on users with two
  default setups] → Mitigation: the migration batch is atomic, so the database is left unchanged.
  The upgrade notes say to run `check-identifiers.ts` first, and its opt-in fixes cover
  soft-deleted duplicates and setup defaults.
- [A lookup written as `eq(users.email, …)` would bypass the expression index and miss legacy
  mixed-case rows] → Mitigation: every lookup in decision I3 is converted in one task (7.19). The AGENTS.md
  database rules gain a bullet (task 25.5).
- [The legacy convention fallback could turn a genuine internal `*_NOT_FOUND` bug into a 404] → Mitigation: every fallback logs `Unmapped domain error reached global handler` at warn, and arbitrary messages still return 500.
- [An extra PK query runs on every cached collection hit] → Mitigation: it is bounded, indexed and selects 4 columns, far cheaper than the join the cache avoids.
- [Titles and like counts in cached details can be ≤ 10 min stale] → Unchanged: only the privacy-relevant visibility and deletion state is refreshed per hit.
- [Hidden items are invisible to the collection owner] → Mitigation: they are inert, excluded from counts and reappear when visible, and remove-by-`recipeId` still works.

**Unlisted visibility**
- [Authors cannot find their own unlisted, draft or private recipes in any listing] → Accepted: it is the literal reading of OQ1 and matches today's behaviour. They open them by link; an author-only "My recipes" listing is a ledger follow-up.
- [Public forks of now-hidden sources lose their "forked from" link] → Intended: an unlisted recipe's id works as its link. The source's author still sees the attribution on the detail.
- [A new listing query forgets the shared condition] → Mitigation: `visibility.enforcement.test.ts` fails at the exact `file:line`, with a stale-checked exemption map.
- [Unlisted slugs are title-derived and can be guessed] → Accepted: unlisted means "not listed", not "secret"; `docs/recipes.md` says to use `private` for secrecy.
- [The 23503 split relies on the wrapper's `query` text] → Mitigation: it falls back to 400 when absent, and both statement kinds are unit-tested.

**t4a — uploads**
- [The built-in JPEG parser rejects an unusual but valid JPEG] → Mitigation: a length-based segment walk, all SOF markers except C4/C8/CC, progressive and EXIF-heavy fixtures, warn logs of the rejection reason, and `image-size` as the fallback.
- [Memory per request stays bounded only by the cap (about 11 MiB) × concurrency] → Mitigation: the cap is bounded, and a per-user upload limit is a follow-up.
- [The `UPLOAD_ERROR` → specific codes and 400 → 415 changes break external clients] → Mitigation: the only client is the in-repo web app, whose mapping ships in the same PR, and `docs/api.md` documents the codes.
- [Stricter `UPLOAD_ALLOWED_TYPES` validation stops boot for custom values] → Mitigation: a clear error message, a release note, and the default is unaffected.
- [An S3-compatible backend rejects `content-type` in `SignedHeaders`] → Mitigation: SigV4 allows it (R2, Garage and MinIO accept it), and a manual check against dev Garage runs before merge.
- [A bucket was already abused through the old bug] → Mitigation: operator guidance to audit unexpected keys and the CORS/policy/ACL/tagging settings, rotate the token if anything is found, and scope the R2 token to the bucket.
- [The 1,200 px thumbnail limit rejects third-party clients] → Accepted: the contract is a 600 px client thumbnail (ADR-009).

**t4b — deploy and CI**
- [Native type stripping fails on some module] → Mitigation: a spike first, the `node --import tsx` fallback, and the PR smoke test.
- [Existing compose installs lose photos that live in the container layer] → Mitigation: upgrade notes with `docker compose cp` rescue commands, repeated in the release notes. brewform.cc uses S3.
- [A root-owned uploads volume or host folder blocks the non-root API] → Mitigation: the fail-fast error names the directory, the UID and the fix, `make prod-fix-uploads-owner` applies it, and new named volumes inherit `node` ownership.
- [The project name change hides existing volumes] → Mitigation: set `COMPOSE_PROJECT_NAME` to the old name. The file is one week old.
- [`TRUSTED_PROXIES=private_ranges` allows spoofing when port 80 is exposed via rootless Docker or userland NAT] → Mitigation: the docs say to set it empty when nothing sits in front.
- [Coolify's HTTP health-check type needs curl/wget, which the API image lacks] → Mitigation: the guide configures the `CMD` type with `node /app/healthcheck.mjs /ready`. A disabled dashboard check falls back to the identical image `HEALTHCHECK`.
- [Backups land on the same disk] → Mitigation: the docs require off-host copies and recommend S3, and the backup healthcheck surfaces staleness.
- [Uploads tarballs grow large] → Mitigation: retention, `BACKUP_UPLOADS=false` with S3, and restic as a documented option.
- [PR wall time grows with the image build] → Mitigation: it runs in parallel with tests, the gha cache helps, and superseded runs are cancelled.
- [GHCR cache writes from fork PRs fail] → Mitigation: `ignore-error=true`.
- [`maxmemory` with `noeviction` makes writes fail when full] → Mitigation: the cache degrades to misses (t2).
- [Readiness-based health means Traefik drops the API during a DB outage longer than about 45 s] → Accepted; the API could not serve those requests, and the container returns to routing at the first successful probe.
- [`/ready` is publicly reachable on the Coolify API domain and reveals component states] → Accepted; it carries no secrets or versions. Operators can block it at Traefik if they want.
- [Coolify's `CMD` health-check type or the network-alias field is missing on an older Coolify] → Fallbacks: disable the dashboard check (the image `HEALTHCHECK` is identical); use S3 instead of local storage on Coolify.
- [The image artifact adds about 1–2 minutes to `main` runs] → Only on push events; PR runs skip the upload.
- [The compose smoke test adds about 3 minutes to every PR] → Runs in parallel with `test`; superseded PR runs are cancelled.
- [A host folder on SELinux or rootless Docker is not writable even after `chown 1000:1000`] → The fail-fast message names the UID; the guide covers `chcon` and UID mapping; the named-volume default avoids it.

**t5 — web**
- [Migrating about 40 files risks regressions] → Mitigation: phase it (providers and pagination hotfix first, then client and guards, then area by area), keep each area in its own commit with tests, and keep the Biome rule at warn until the last area lands.
- [Loaders run before `AuthProvider` resolves] → Mitigation: `requireAuth` turns the 401 into a redirect.
- [A throwing `useConfirm()` breaks tests that relied on the native fallback] → Mitigation: `test-utils/render.tsx` ships first, and the affected tests migrate in the same task.
- [Replace-while-typing means Back skips search refinements] → Accepted: the user decided this, and discrete selections still push.
- [Revalidation opt-outs can leave stale counts] → Mitigation: opt out only for optimistic actions whose result carries the new state, rate still revalidates, and tests assert request counts.
- [Smoke-test brittleness] → Mitigation: one `fetch` envelope stub, paths derived from `routes`, and assertions limited to "no error boundary".
- [Biome `patterns` matching on relative specifiers] → Mitigation: verify with a fixture, and the Vitest architecture test is the hard gate.

**t6 — charts**
- [Fallback fonts differ by platform] → Mitigation: the 1.1 safety factor, a 4-unit margin, a 6px tick gap, and the estimate pinned at or above SF Pro.
- [The larger radar leaves chips less room] → Mitigation: the container query stacks them below 520px.
- [The pre-infusion title is hidden more often on phones] → Mitigation: the duration is always visible inside the phase or in the caption, and the accessible name carries both phases.
- [Existing tests encode the old behaviour] → Mitigation: they are rewritten in the same tasks, and the changed property invariants are called out in the PR.
- [StarRating blur-commit surprises users] → Mitigation: Escape reverts, the hint documents it, and one commit happens per interaction.
- [`ResizeObserver` is missing in jsdom and old browsers] → Mitigation: feature detection with the 200px fallback layout, which is in bounds.
- [The Turkish category names are proposals] → Mitigation: native-speaker review before merge.

**t7 — search**
- [`pg_trgm` is unavailable, or the role cannot create it, on a managed DB] → Mitigation: the migration pre-flight fails before any migration with a message naming the remedy; both official images pass it.
- [`make db-reset` uses `push`, which skips custom migrations] → Mitigation: `db-reset` creates the extension before `db-push`.
- [Non-concurrent GIN builds briefly block writes on deploy] → Mitigation: the tables are small today, the docs note it, and a low-traffic window is suggested.
- [The `personal_notes` trigram index is large] → Mitigation: measure `pg_relation_size` on seed data, and drop that index later if needed.
- [A 10s global `statement_timeout` cancels long statements] → Mitigation: drizzle-kit and the migrator use their own connections, the seed is short, and `DB_STATEMENT_TIMEOUT_MS=0` disables it.
- [The planner prefers a seq scan on small tables] → Mitigation: the EXPLAIN test sets `enable_seqscan = off` and asserts identical results with it on and off.
- [Deep OFFSET pages still score every match] → Mitigation: the cost is DB-side and bounded by the timeout, and keyset-on-score is a follow-up.
- [Case folding depends on the DB ctype] → Unchanged, and score and filter now agree. A Turkish collation is a follow-up.
- [Two `sql` fragments (`CASE`, `NULLS LAST`) become D03 exceptions] → Mitigation: they take Drizzle columns and bound params only, carry comments, and are sanctioned by ADR-017.

**t8 — docs and specs**
- [Every future archive creates a "Purpose: TBD" that the guard rejects] → Intended: AGENTS.md documents the backfill step, and the guard names the file.
- [Allowlisting `docs/decisions.md` could hide drift] → Mitigation: the reason states "ADR history", and superseded ADRs carry "Superseded by" lines.
- [The three lint flips surface an unknown number of violations] → Mitigation: measure in Docker first, fix in batches, flip last, one rule at a time if the count is large.
- [The generated reference is incomplete while admin/auth lack `describeRoute`] → Mitigation: the generator warns about undocumented mounted routes, and the docs state the scope.

## Migration Plan

**1. OpenSpec housekeeping (first commit on the feature branch)**
- Create the branch.
- Commit the change folder and `plans/AUDIT-2026-11-18.md`.
- Run `openspec archive remove-deno-node24-pnpm --skip-specs -y` and confirm `openspec/specs` is unchanged.

**2. Database migrations** (generated in this order, never hand-edited; `make db-generate` must end with "No schema changes, nothing to migrate")
1. `user_recipe_note` (t1, group 4). A new table, so there is no rename prompt.
2. `user_email_lower_unique`, `user_username_lower_unique` and `setup_user_default_unique` (t3 refinement, group 7), generated from `schema.ts`. They fail on existing case-duplicate emails or usernames, or on users with two active default setups; `check-identifiers.ts` finds and fixes those first.
3. `enable_pg_trgm` (t7, group 10). A `drizzle-kit generate --custom` shell containing `CREATE EXTENSION IF NOT EXISTS pg_trgm;`. No snapshot change is needed, because extensions are not tracked.
4. Three GIN `gin_trgm_ops` indexes (t7), generated from `schema.ts` with a sequence number after step 3.

After each step: `make db-migrate`, then `make test-db-provision`. `make db-reset` creates `pg_trgm` before `db-push`.

Other notes:
- No data backfill. `recipe_version.personal_notes` stays exactly as it is, and lost `tds`/variety history cannot be recovered.
- The DB role needs `CREATE` on the database (the owner role in compose and Coolify).
- GIN builds briefly lock writes on `recipe`/`recipe_version`.
- The production entrypoint and the new `migrate` service apply all four migrations through `packages/db/src/migrate.ts`, which first runs the `pg_trgm` pre-flight and reuses the existing `drizzle.__drizzle_migrations` rows. drizzle-orm applies pending migrations in one transaction, so a failing index build leaves the database unchanged.

**3. Environment variables** (all optional; defaults keep current behaviour unless noted)

| Variable | Default | Owner | Note |
|---|---|---|---|
| `TRUST_PROXY` | `none` | t2 | Templates set `hops`; Cloudflare orange-cloud needs `cloudflare` |
| `TRUST_PROXY_HOPS` | `1` | t2 | 1–5 |
| `TRUST_PROXY_CIDRS` | unset | t2 | Extra trusted edge CIDRs |
| `RATE_LIMIT_ENABLED` | `true` | t2 | The only off switch (emergency use) |
| `RATE_LIMIT_STORE` | `memory` | t2 | `redis` requires `REDIS_URL`; production compose sets `redis` |
| `RATE_LIMIT_GLOBAL_MAX` | `100` | t2 | Per IP per minute |
| `CACHE_MEMORY_MAX_ENTRIES` | `10000` | t2 | LRU cap |
| `DB_STATEMENT_TIMEOUT_MS` | `10000` | t7 | `0` disables |
| `RUN_MIGRATIONS` | `true` | t4b | Compose api sets `false` (the `migrate` service runs them) |
| `API_UPSTREAM`, `TRUSTED_PROXIES`, `PUBLIC_APP_URL`, `EDGE_MAX_BODY_SIZE` (`16MB`) | unset | t4b | Web image; unset keeps today's static-only behaviour |
| `IMAGE_TAG`, `API_IMAGE`, `WEB_IMAGE`, `DOCKER_LOG_*`, `*_MEMORY_LIMIT`, `VALKEY_MAXMEMORY`, `BACKUP_INTERVAL_SECONDS`, `BACKUP_RETENTION_DAYS`, `BACKUP_UPLOADS`, `COMPOSE_PROJECT_NAME` | see `.env.production.example` | t4b | Compose only; `BACKUP_DIR` is removed |
| `UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE`, `BACKUPS_SOURCE` | `uploads`, `postgres_data`, `backups` (named volumes) | t4b | Compose only; a value starting with `/`, `.` or `~` selects a host folder |

Behaviour changes to note:
- Blank values now mean unset.
- Bad ports, sizes or `UPLOAD_ALLOWED_TYPES` entries fail at boot.
- An unwritable local upload dir fails at boot, with the exact `chown` fix in the log.
- An `S3_ENDPOINT` with a path, query or fragment fails at boot.
- `API_DOMAIN` is no longer required.
- `/ready` returns fixed keys and `503` while shutting down.
- Emails are stored trimmed and lower-cased; email and username uniqueness ignores letter case; identifiers of deleted accounts stay taken.

**4. Deploy order**
1. Merge the single PR. The API and SPA ship together. An SPA tab opened before the deploy gets a 404 when it saves a note (the legacy `POST` is removed); the editor shows the error and a reload loads the new client.
2. CI `publish` pushes `:latest` and `:<sha>` only after `quality`, `test`, `images` and `doc-drift` pass.
3. **Coolify (brewform.cc):**
   - Set `TRUST_PROXY=hops` (or `cloudflare` behind orange-cloud) on the API resource.
   - Before redeploying, run the identifier check from the new image as a one-off container (`docs/deployment_coolify.md` → "Before upgrading to wave 6") and fix what it reports.
   - Set the API dashboard Healthcheck to Type `CMD`, Command `node /app/healthcheck.mjs /ready`, Interval 15, Timeout 5, Retries 3, Start period 180. Set the web Healthcheck to `HTTP` `GET` `/healthz` on port 80, expected 200, Interval 30, Timeout 3, Retries 3, Start period 10. Point uptime monitors at `https://api.brewform.cc/health` and `https://brewform.cc/healthz`. Redeploy both so the checks apply.
   - Set `PUBLIC_APP_URL=https://brewform.cc` on the web resource, so the `og:image` and robots `Sitemap:` lines follow the runtime origin instead of the build value.
   - Redeploy. Migrations run on boot (`serve` mode).
   - S3 deployments that ran older code then follow the bucket-audit note.
4. **Compose self-hosters:**
   - Before pulling, rescue `/app/apps/api/uploads` with `docker compose cp`.
   - Set `COMPOSE_PROJECT_NAME` to keep the old volumes.
   - Run `make prod-pull`, then `make prod-check-identifiers` and fix what it reports.
   - Run `make prod-fix-uploads-owner` (or choose a host folder with `UPLOADS_SOURCE` and own it by `1000:1000`).
   - Then run `make prod-up`.
   - Full steps: `docs/deployment_compose.md` → "Upgrading from the pre-wave-6 compose file".
5. **After merge:** enable branch protection on `main` requiring `quality`, `test`, `images` and `doc-drift`, and remove the stale `COOLIFY_*` secrets.

**5. Rollback per risky item**
- **Any API/web regression:** set `IMAGE_TAG=<previous sha>` (compose) or switch the tag in Coolify. No data needs undoing.
- **`user_recipe_note`:** revert the code and leave the table in place, unused (Drizzle has no down migrations). Notes written meanwhile survive a re-deploy.
- **Identifier indexes:** revert the code; the indexes stay and keep enforcing case-insensitive uniqueness. Pre-wave-6 code then answers a case-variant duplicate registration with a 500 instead of a 409, with no data harm. Full removal: delete the declarations and run `make db-generate` (drop migration).
- **Health checks:** a Coolify check can be disabled in the dashboard (the image `HEALTHCHECK` remains); compose checks are part of the file and revert with it.
- **`pg_trgm` indexes:** revert the code; the indexes and extension are harmless. Full removal: delete the index declarations, run `make db-generate` (drop migration), then add a custom `DROP EXTENSION IF EXISTS pg_trgm;`. Set `DB_STATEMENT_TIMEOUT_MS=0` to disable the timeout without a deploy.
- **Rate limiting:** set `RATE_LIMIT_ENABLED=false` and restart (logs a warn). A `TRUST_PROXY` change needs only an env edit and a restart. Old `brewform:ratelimit:*` keys expire within 15 minutes, and new keys under `brewform-rl:` have TTLs of at most 24 h.
- **Uploads:** revert. Objects under UUID keys stay valid because rows store URLs.
- **CI:** restore `release.yml`/`pr.yml` from git.
- **Cache:** the collection detail shape is compatible, so no cache action is needed; old entries expire within their 10-minute TTL.
- **Docs, specs and lint:** revert the commits. Reverting the remove-deno archive is a `git mv` back out of `openspec/changes/archive/`.

**6. Closing steps (in the same PR)**
1. `git rm -r` the three retired spec folders.
2. `openspec validate wave-6-audit-remediation --strict`, then `openspec archive wave-6-audit-remediation -y`.
3. Backfill every "Purpose: TBD".
4. Wire the `doc-drift` job.
5. `openspec validate --all --strict`.
6. Final verification, then open the PR.

## Open Questions

No question is open. Every item below is either answered by the user, settled at integration, or settled with an explicit default that implementers follow as written. Items that stay out of scope are follow-ups recorded in the debt ledger (`proposal.md` → Non-Goals; task 27.1 writes them to `plans/ROADMAP.md` as D99.20+, task 17.16 to `plans/TECHNICAL_DEBT.md`).

### Resolved by the user (2026-11-19)

| Id | Question | Answer | Where it is specified |
|---|---|---|---|
| U1 | Fix the admin Toast/Confirm provider crash (top-10 item 6)? | Yes, it must be in the spec and fixed. | `web-shared-components` (app-wide providers, `useConfirm` throws, route smoke test over all 14 `/admin` routes); t5 decisions 1-3; tasks 12.1-12.7. |
| U2 | Adopt the search fix (design item 4)? | Yes: DB-side ranking and pagination with `LIMIT`/`OFFSET` + `COUNT`, `pg_trgm` indexes, statement timeout, bounded input. | `advanced-search`, `recipe-filter`, `cursor-pagination`, `error-handling` (`57014`); t7 decisions 1-6, 2a, 2b; group 10. |
| U3 | How should the web load data (design item 5)? | React Router loaders, actions and fetchers only. | `web-data-loading` (including the static enforcement test), `web-page-logging`, `web-shared-components` (`useBanUser`), `recipe-list`, `recipe-collections`, `static-cache`; t5 decisions 4-13c; groups 14-17 (guards 14.1-14.3, flip 17.18). |
| U4 | How should images be built and published (design item 6)? | PRs build and boot-test both images; publishing runs only after all CI jobs pass, sequentially. | `ci-image-publishing`, `container-deployment`; t4b decisions 8 and 16; tasks 22.3-22.6, 28.6, 29.8. |
| D1 | Notes: fix the IDOR or add private notes? | Both. | `recipe-personal-notes`, `recipe-write`, `web-api-boundary`; t1 decisions 1-7; groups 4 and 17. |
| D2 | Address the two findings the audit missed? | Both. (a) A PATCH without `visibility` unpublishes and a bump resets `isFavourite`. (b) A crafted filename signs bucket-configuration or overwrite requests. | (a) `recipe-write` "An update never resets omitted visibility or favourite state"; t1 decisions 11, 11a; tasks 8.1, 8.4, 8.12. (b) `photo-upload-security` "No client-supplied filename can alter a signed S3 request", "Uploads never overwrite an existing object", "Operators are guided to audit buckets exposed to pre-change versions"; t4a decisions 1, 8, 8a, 8b; group 5. |
| D3 | Slugs and uniqueness: what can we do? | Investigate; random suffixes approved. Outcome: clean slug first, random no-vowel suffix on collision, claimed in-transaction with `ON CONFLICT DO NOTHING`; case-insensitive email/username uniqueness and related rules. | `recipe-slug`, `unique-identifiers`, `error-handling`, `recipe-write` (duplicate ids); t3 decisions 1-5 and I1-I9; group 7. |
| D4 | Collections and hidden recipes? | Collections hide deleted, private and draft recipes from everyone except the recipe's author (and, per OQ1, unlisted too). | `recipe-collections`, `recipe-visibility`; t3 decisions 6-10; "Unlisted visibility everywhere" decision 4; group 9. |
| D5 | Local uploads without S3? | Production compose persists them on a named volume by default, with a documented host-folder (bind mount) option. | `production-operations`, `container-deployment`, `api-env-config`, `deployment-guide`; t4b decisions 2, 10-12, 15; tasks 3.5-3.7, 21.8-21.19, 22.2, 22.9, 22.11. |
| OQ1 | Should unlisted recipes appear in collections, search or category pages? | No. Unlisted means unlisted from everywhere; only the absolute link finds it. Applies to collections too. Admin is exempt. | `recipe-visibility` (surface classes, shared conditions, fork masking, noindex, enforcement test), `recipe-collections`, `advanced-search`, `recipe-filter`, `equipment-recipe-query`, `brew-journal`; "Unlisted visibility everywhere"; groups 9, 11 and tasks 15.6, 15.11, 15.12, 15.15. |
| OQ2 | Random slug suffixes acceptable? | Yes. | `recipe-slug`; t3 decision 2; tasks 7.1-7.10. |
| OQ3 | Keep the deprecated `POST /recipes/:id/notes`? | No, remove it entirely; no alias. | `recipe-personal-notes` "The legacy notes POST endpoint is removed"; t1 decision 5; tasks 4.1-4.3, 4.14-4.19, 17.2. |
| OQ4 | Health checks? | Add them in compose and the images regardless of Coolify; provide both a liveness and a readiness API; document the exact Coolify settings. | `production-operations` (probe contract, compose health checks), `container-deployment` (image `HEALTHCHECK`s, edge `/health`), `deployment-guide` (Coolify settings), `node-runtime` (shutdown flips readiness); t4b decisions 13-15; tasks 20.6-20.10, 20.12, 21.1, 21.3, 21.10-21.12, 22.3, 22.4, 22.11, 29.8. |

**Interpretation calls applied while folding in the answers** (binding defaults for implementation; the user can reverse any of them later):
- *Viewer-only records may show unlisted recipes.* The caller's own Starred list uses `viewableRecipeCondition(userId)`, so a favourited unlisted recipe appears there, and the brew journal keeps every non-deleted recipe the user logged. Nobody else can see either list. Reversal: switch `findStarred` to `listableRecipeCondition(null)` and flip two scenarios.
- *The Coolify API health check is the `CMD` type* (`node /app/healthcheck.mjs /ready`), because Coolify's HTTP type needs curl or wget inside the container and the hardened API image has neither. It probes the same `/ready` endpoint on port 8000 and expects 200. The web check is HTTP `/healthz`.
- *Every image and compose health check probes readiness (`/ready`)*, because Docker health only gates traffic and rollouts and never restarts a container. `/health` (liveness) serves uptime monitors and is proxied through the web edge; `/ready` is not proxied.
- *Authors do not see their own unlisted, draft or private recipes in any discovery listing, their own profile included.* "Only with the absolute link can find it" is applied literally to every shared listing, so discovery queries are viewer-independent (`listableRecipeCondition(null)`). The author still sees their own hidden recipes inside collection items and, when favourited, in their own Starred list; no author-only "My recipes" listing is added (ledger follow-up). Reversal: pass the viewer id to `getUserPublicRecipes`/`getUserStats` when the viewer owns the profile and flip the "Profile shows public recipes to everyone, including the owner" scenario.

### Resolved at integration (recorded so they are not reopened)
- **ADR numbering.** ADR-015..021 are pre-allocated (see Cross-track integration). t7's "ADR-015" becomes ADR-017.
- **Ownership of the `57014` mapping.** It lives in t3's SQLSTATE table, and the `error-handling` delta carries the row.
- **The `request-body-limit` photo-cap delta (t4a §4).** It is folded into `specs/request-body-limit/spec.md`.
- **The `static-cache` ping-pong delta (t5 §7).** Added as `specs/static-cache/spec.md`, with tasks.
- **The `text-sanitization` Deno remnants (t8 §6).** Added as `specs/text-sanitization/spec.md`, owned by t8.
- **The `api-middleware-logging` exact log context (t2).** Added as a MODIFIED delta.
- **Workflow references between t4b and t8.** `doc-drift-check` names `ci.yml`, `pnpm-workspace` names the `quality` job, and `node-runtime` defers the container invocation to `container-deployment`.
- **The proxy hop count (t2/t4b).** The web Caddy edge overrides XFF with `{client_ip}`, so `TRUST_PROXY_HOPS=1` holds with or without an outer proxy.
- **The auth-session dependency (t2).** t2 makes `confirmPasswordReset` return the normalised email itself. Reset-token hashing and invalidating old verification tokens stay out of scope.
- **Unlisted semantics (OQ1).** Unlisted is direct-link-only everywhere, including inside collections (this reverses t3's earlier "unlisted stays visible in collections" choice). See "Unlisted visibility everywhere".
- **LIKE metacharacters.** Escaped with `toContainsPattern`, not stripped, so `%`, `_` and `\` match literally (reverses t7's stripping choice).
- **`pg_trgm` availability.** Enforced by the migration pre-flight (task 10.22, wired in task 20.2); both official images ship the extension. There is no "ship without indexes" fallback.
- **`publish.needs` and `doc-drift`.** `doc-drift` joins `publish.needs` in the same task that adds the job (28.6); `scripts/ci/check-publish-needs.sh` keeps the list complete.
- **Identifier decision labels.** The slug refinement's identifier decisions are numbered I1-I9 so they do not collide with the user-decision ids U1-U4.

### Defaults applied to the remaining track questions

**t1 — notes and recipe write**
- `amendedAt`/`updatedAt` on `recipe_version` to show in-place amends: not in wave 6; the edit page states that the current version is updated in place. Follow-up.
- Merge field parity (intensities, `tds`, variety) and whether merge should stop copying another user's public brewer notes: merge keeps today's behaviour (brewer notes are public, so this is no privacy leak). Follow-up (task 17.16).
- The `SetupUpdateSchema = SetupCreateSchema.partial()` default trap (`setup.ts:17,24`): not fixed in wave 6. Follow-up (task 17.16).
- A "My notes" listing (`GET /api/v1/users/me/notes`): not in wave 6. Follow-up.
- Status code of the removed notes `POST`: 404 (Hono's default without the `methodNotAllowed` middleware, which the app does not use).

**t2 — rate limiting and cache**
- Env-tunable policies: only `RATE_LIMIT_GLOBAL_MAX`; the policy table stays code constants. Follow-up.
- Admin login-lockout reset: not in wave 6 (a password reset clears the account counters). Follow-up.
- A Valkey service in CI for the RESP3/Lua integration test: not in wave 6; the suite runs once against the compose Valkey (task 6.45) and the result goes into the PR. Follow-up.

**t3 — slugs, identifiers, collections and errors**
- `QrCodeFilenameSchema` accepts `_` for legacy slugs: yes (task 7.5). New slugs never contain `_`.
- Tombstones for hidden collection items: no; hidden items are inert and reappear when visible (decision 9).
- Re-registration with a deleted account's email: refused with `409 Email already registered`; deleted usernames are never released. Tombstoning the email on self-deletion is a follow-up with account-deletion anonymisation.
- Reserved usernames: the 17 names in the `unique-identifiers` spec plus the `deleted-` prefix, applied at self-registration only (admins and the seed are exempt).
- The setup default-uniqueness index ships in this change, in the same migration as the identifier indexes; `--fix-setup-defaults` remediates conflicts.
- An empty legacy slug is rewritten only with the opt-in `--fix-empty-slugs`; no other existing slug changes.
- Redundant plain indexes (`recipe_slug_idx`, `user_email_idx`, `user_username_idx`, `password_reset_token_idx`, `badge_rule_idx`) and the exact email/username constraints stay (the seed's conflict target needs the exact constraints). Dropping the plain duplicates is a follow-up.
- Catalog-name uniqueness (equipment, vendors, coffee varieties, taste notes): no constraint; it needs a de-duplication UI first. Follow-up.
- Duplicate relation ids in recipe payloads: rejected with 400 (`recipe-write`).
- `generateUniqueUsername` (unused): untouched; a future OAuth flow must use the `lower()`-aware `isUsernameTaken`.

**Unlisted visibility**
- An author-only "My recipes" listing: not in wave 6; authors open their unlisted, draft and private recipes by link. Follow-up.
- Guessable unlisted URLs: no change; slugs stay title-derived and immutable, and `docs/recipes.md` says to use `private` for secrecy. Follow-up (unguessable URLs).
- `@mentions` in comments on an unlisted recipe: still delivered (the commenter holds the link and shares it deliberately).
- Version, diff and compare pages: always `noindex`, including for public recipes (derived views, not in the sitemap).
- Recorded with no change: merge accepts another user's unlisted version (the caller holds both slugs); the default fork title can repeat an unlisted source's title but never its link; collection list counts can lag a visibility change by the 5-minute list TTL; like, favourite, rate and the photo list skip visibility checks for draft/private recipes (follow-up).

**t4a — uploads**
- EXIF/GPS stripping: follow-up with F23 (sharp).
- Per-user upload rate limit: not in wave 6. Follow-up.
- Env-configurable dimension limits (panoramas wider than 16,384 px): no; code constants. Follow-up.
- S3 conditional writes: no `If-None-Match` (Garage support is unconfirmed); UUIDv4 keys plus the local driver's exclusive create prevent overwrites.

**t4b — deploy, health and CI**
- brewform.cc Coolify version: the guide uses the `CMD` health-check type and an application network alias. If either is missing, the fallbacks are a disabled dashboard check (the identical image `HEALTHCHECK` applies) and S3 storage, which brewform.cc already uses. This does not block implementation.
- Branch protection on `main`: enable it after merge, requiring `quality`, `test`, `images` and `doc-drift` (Migration Plan step 5).
- Multi-arch images, an opt-in TLS compose overlay, and a non-root web (Caddy) image: not in wave 6. Follow-ups.
- Valkey password variable: `VALKEYCLI_AUTH` (documented by Valkey; valkey-cli falls back to `REDISCLI_AUTH`).
- Backup target: the named volume `backups`; `BACKUPS_SOURCE=./backups` selects a host folder.
- `/ready` stays publicly reachable on the Coolify API domain (component states only, no secrets or versions).
- No Valkey data-location variable (its data is disposable); the readiness DB timeout is a fixed 2000 ms; shutdown relies on `server.close()` with the 30 s compose grace period, with no forced connection close.

**t5 — web**
- Replace-while-typing (Back skips search refinements): kept, as the user decided earlier; discrete selections still push history.
- The `q` parameter: used by newly migrated pages; `/recipes` keeps `search`/`author`, and the catalogs accept legacy `search` on read.
- QR downloads go through a resource-route fetcher (`resources/qrcode/recipe/:slug`); the `<img>` preview keeps its relative `src`.
- `useBanUser` submits with `defaultShouldRevalidate: false`.
- A top-level error boundary above the providers and safe `localStorage` access: follow-ups.

**t6 — charts**
- The Turkish SCAA category names ship as proposed in task 18.14; a Turkish speaker confirms them in PR review, and corrections are i18n-only.
- Pre-infusion and flow-rate form inputs, and an `extractionTimeSeconds` upper bound: follow-ups; the chart stays defensive (decision 5).
- Playwright screenshot tests: follow-up (D99); visual verification is the manual checklist (task 19.27).

**t7 — search**
- Minimum search length: none (memory is bounded and the statement timeout caps cost). Follow-up.
- Search scope: any version, as today (decision 4). Current-version-only scope is a follow-up.
- Keyset (cursor) paging on the relevance score: follow-up; search keeps the offset fallback.
- The migration pre-flight's catalog query is a documented `// D03 raw-SQL exception:` in the migration runner (not application query code).

**t8 — docs and specs**
- OpenAPI coverage gaps (37 admin routes; the coverage test excludes auth, recipes and admin): recorded as a D99.20+ entry by task 27.1. The notes routes get their own OpenAPI test (task 4.18).
- `coolify_deployment_plan.md` stays in place and is updated (task 22.15); it does not move to `docs/history/` in wave 6.
- README admin claims and seed docs describe what ships today (tasks 26.1, 26.3); the seed is unchanged.
- The counts for the three re-enabled lint rules are measured in task 23.14; no decision depends on them.

### Follow-ups recorded in the debt ledger
Everything listed under `proposal.md` → Non-Goals → Deferred and "Audit findings with no wave-6 owner". Task 27.1 writes each as a D99.20+ entry in `plans/ROADMAP.md`; task 17.16 adds merge field parity and the `SetupUpdateSchema` trap to `plans/TECHNICAL_DEBT.md`.
