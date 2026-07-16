## Context

Wave 4 of the debt roadmap closes out the four remaining open debt items (D42, D43, D35, D39
Tier 2/3). Unlike Waves 1–3, these items have no sequencing dependency on each other — they touch
disjoint areas (web type boundary, DB schema, lint hygiene, test backfill). The research surfaced
significant drift from the original plans for D35 and D42; this design resolves each drift with an
explicit decision.

### Architecture — the four sub-changes and their independence

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  WAVE 4 — four independent sub-changes, one PR                              │
│  (no sequencing constraint — any can land first; all must land for the      │
│   ROADMAP to mark Wave 4 done)                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  D42 — Typed Web API Boundary (P2, ~1-1.5 days) ── THE BIG ONE              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  PREREQUISITE: web type-check in CI (does not exist today!)            │  │
│  │    make check-web = deno lint src/  → add tsc --noEmit                 │  │
│  │                                                                        │  │
│  │  Step 1: Shared schema type exports (barrel gap)                       │  │
│  │    responses/* already export *Output types (Wave 2/D25)               │  │
│  │    BUT schemas/index.ts barrel re-exports only schema OBJECTS          │  │
│  │    → add `export type { ... } from './responses/...'` re-exports       │  │
│  │    → add missing request types (RecipeCreate/Update/Fork/Rate/Notes,   │  │
│  │      UserProfileUpdate, UserPreferences, TasteNoteCreate/Update,       │  │
│  │      Follow, CommentCreate)                                            │  │
│  │                                                                        │  │
│  │  Step 2: New/extended shared schemas (recipe shape gaps)               │  │
│  │    RecipeListItemOutputSchema — NEW (slim list projection)             │  │
│  │    RecipeDetailOutputSchema — EXTEND with per-request overlay          │  │
│  │      (userLiked, userFavourited, avgRating, userRating, favouriteCount)│  │
│  │    PaginatedResponse<T> — NEW shared type matching paginatedEnvelope() │  │
│  │                                                                        │  │
│  │  Step 3: Replace 23 Record<string,unknown> in api/index.ts             │  │
│  │    order: recipes → users/profile → follow → setups/beans/equipment    │  │
│  │    → taste hierarchy (highest-traffic first)                           │  │
│  │                                                                        │  │
│  │  Step 4: Delete api/types.ts (185 lines, 14+ shadow interfaces)        │  │
│  │    replace 25+ import sites with shared types                          │  │
│  │                                                                        │  │
│  │  Step 5: Delete per-page shadow types (20+ local interfaces)           │  │
│  │    Fix fallout: BeanListPage uses productName, BeanOutput uses name    │  │
│  │    → latent bug; fix the page (or schema if API genuinely differs)     │  │
│  │                                                                        │  │
│  │  Step 6: Remove 5 real `as` casts                                      │  │
│  │    SetupListPage:38, EquipmentListPage:40, TasteNotesPage:234,         │  │
│  │    OnboardingWizard:26,36, SettingsPage:75                             │  │
│  │                                                                        │  │
│  │  Step 7: Type-level regression test (@ts-expect-error on derived type) │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D43 — Join Table Timestamps (P3, ~2 hours) ── CLEANEST                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  NO DRIFT from plan. Exact line numbers verified (241/263/330).        │  │
│  │                                                                        │  │
│  │  schema.ts: add createdAt to 3 tables (mirror userRecipeLikes pattern) │  │
│  │    createdAt: timestamp('created_at', { withTimezone: true })          │  │
│  │      .notNull().defaultNow()                                           │  │
│  │                                                                        │  │
│  │  make db-generate → migration 0008 (next after 0007, confirmed)        │  │
│  │    3x ALTER TABLE ... ADD COLUMN ... DEFAULT now() NOT NULL            │  │
│  │    NEVER manually edit generated SQL (drizzle hash tracking)           │  │
│  │                                                                        │  │
│  │  No API exposure change (Zod schemas strip unknowns)                  │  │
│  │  No seed change (defaultNow() handles it)                             │  │
│  │  No indexes (add with first consuming query, per db-indexes spec)     │  │
│  │  forkRecipe gets fresh timestamps (correct, no special handling)      │  │
│  │                                                                        │  │
│  │  New test: column-existence assertion via getTableConfig pattern      │  │
│  │  Extend model.create.test.ts: assert createdAt populated              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D35 — Lint Suppressions (P3, ~2-4 hours) ── BIGGEST DRIFT                  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  PLAN SAYS 7 FILES, ACTUALLY 9:                                        │  │
│  │    + coffee-variety/model.ts:1 (vestigial require-await) [MISSED]      │  │
│  │    + coffee-variety/service.ts:1 (vestigial require-await) [MISSED]    │  │
│  │                                                                        │  │
│  │  6 of 9 directives are VESTIGIAL (mask nothing):                       │  │
│  │    no-explicit-any & require-await are in deno.json rules.exclude      │  │
│  │    → deleting those directives = zero lint impact today                 │  │
│  │                                                                        │  │
│  │  Only 3 directives suppress REAL violations:                           │  │
│  │    openapi/index.ts: as any cast (justification already added by D34)  │  │
│  │      → narrow file-level → line-level                                  │  │
│  │    cors.ts + requestId.ts: unused `const log` (delete dead code)       │  │
│  │                                                                        │  │
│  │  Logger types ALREADY use Record<string,unknown> — no any to replace   │  │
│  │  Plan's premise was wrong for 4 shared files (vestigial, just delete)  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D39 — Test Coverage Tier 2/3 (P2, incremental) ── WAVE 3 PRE-EMPTED       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  WAVE 3 (D40) already added tr-locale spot-check tests for 22 pages    │  │
│  │  D38 added AuthContext test; D36 added BanDialog; D37 added            │  │
│  │    ErrorBoundary + ErrorPage consolidation                             │  │
│  │                                                                        │  │
│  │  GENUINE GAPS remaining (43 new test files):                           │  │
│  │  Tier 2 API (22 files):                                                │  │
│  │    9 model tests (badge/bean/comment/follow/photo/preference/qrcode/   │  │
│  │      report/setup)                                                     │  │
│  │    9 route tests (preference/bean/setup/photo/taste/user/badge/qrcode/ │  │
│  │      vendor) [report done; follow done via index_test.ts]              │  │
│  │    4 util tests (utils/jobs/cron.ts [PATH FIX], openapi, upload,       │  │
│  │      middleware/requestId.ts)                                           │  │
│  │  Tier 3 web (15 files):                                                │  │
│  │    4 pages (ForgotPassword/ResetPassword/BeanList/SetupList)           │  │
│  │    6 components (OnboardingWizard/PhotoUpload/RecipeQRCode/            │  │
│  │      ScaaRadarChart/StarRating/StatCards component)                    │  │
│  │    5 hooks/utils/contexts (useDebounce/recipe-filters.ts/sessionId.ts/ │  │
│  │      I18nContext/ThemeContext)                                          │  │
│  │  Tier 3 shared (6 files):                                              │  │
│  │    bean/comment/follow/photo/setup/vendor input schema tests           │  │
│  │                                                                        │  │
│  │  DO NOT RE-CREATE: NotFoundPage (D37), ErrorBoundary (D37),            │  │
│  │    BanDialog (D36), AuthContext (D38), 22 Wave 3 spot-check pages      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Why bundle vs split

The four items share no code paths and no string-touching contract (unlike Wave 3's D36→D37→D40
sequencing). They are bundled purely for ROADMAP hygiene — landing all four ledger items in one PR
keeps the `ROADMAP.md` and `TECHNICAL_DEBT.md` accurate. Each sub-change is independently
shippable within the PR: D43's migration can be generated and applied before D42's type work
starts; D35's directive deletion can land before D39's tests are written. The `tasks.md` enforces
no ordering constraint between the four items, only within D42's steps (type-check prerequisite →
schema exports → api/index.ts replacement → shadow type deletion).

---

## Decision 1 — Web type-check: `tsc --noEmit` via existing `tsconfig.json`

**Finding:** The web app is **not type-checked in CI** today. The chain:
- `apps/web/deno.json:8` — `"check": "deno lint src/"` (lint only, no `deno check`).
- `deno.json:19` (root) — `"check:web": "deno task --cwd apps/web check"` → resolves to lint.
- `Makefile:75-76` — `check-web` → `docker compose run --rm app deno task check:web` → lint.
- `.github/workflows/pr.yml:32-36` — the `check` job runs `deno task check` + `deno task build:web`.
- `apps/web/deno.json:7` — `"build": "deno run -A npm:vite build"`. Vite does NOT type-check by
  default; no `vite-plugin-checker` is installed.
- `apps/web/tsconfig.json` (26 lines, strict mode, `@brewform/shared/*` path aliases) exists but is
  only consumed by IDE language servers, not CI.
- `typescript` 5.x is already a dev-dep in `apps/web/package.json:17`.

**Decision:** Add `tsc --noEmit -p tsconfig.json` to the web check task. Change `apps/web/deno.json`
`"check"` to `"deno lint src/ && deno run -A npm:tsc --noEmit -p tsconfig.json"` (or a separate
`"typecheck"` task composed into `check`). This uses the existing `tsconfig.json` with its path
aliases and strict mode. `make check-web` (via `deno task check:web`) will then type-check. **This
is a prerequisite for D42** — without it, replacing `Record<string, unknown>` with real types is
unverifiable.

**Rejected alternative:** `deno check apps/web/src/`. Rejected because path aliases (`@/`,
`@brewform/shared/*`) are configured in `apps/web/tsconfig.json`, not in the root Deno config.
`deno check` would need `--config` pointing at the web tsconfig AND may not resolve Vite-specific
aliases. `tsc --noEmit` is the lowest-risk path that uses the already-configured aliases.

**Rejected alternative:** Add `vite-plugin-checker` with TypeScript check. Rejected because it adds
a new dependency and changes the build pipeline; `tsc --noEmit` is simpler and uses the existing
`typescript` dev-dep.

**Risk:** Adding `tsc --noEmit` to CI will surface **all pre-existing type errors** in
`apps/web/src/`, not just the ones D42 introduces. This is a one-time painful migration. Mitigation:
run `tsc --noEmit` locally first, fix all pre-existing errors as part of D42's "fix fallout
honestly" step, then wire it into CI. If the pre-existing error count is large, consider a
two-phase approach: (1) add `tsc --noEmit` as a non-blocking `make check-web-types` target in this
change; (2) make it blocking in a follow-up once pre-existing errors are cleared. **Prefer the
single-phase approach** — D42 is the natural moment to fix the web type boundary, and half-measures
leave the gate unverifiable.

**Verified error breakdown (2026-07-06):** Running `tsc --noEmit -p tsconfig.json
--ignoreDeprecations 6.0` produces 887 errors, but they break down as:
- **686 errors** are `TS5097` (import path `.ts`/`.tsx` extensions) — fixed by adding
  `"allowImportingTsExtensions": true` to `tsconfig.json` (one config line, zero code change).
- **145 errors** are in **test files** — mostly `TS2352`/`TS2345` from mock `AuthContextType`
  objects missing `sessionError`/`clearSessionError` (added by D38 to the real type but not to test
  mocks). ~67 are in `CommentSection.test.tsx` alone. These are a D38 follow-up, not D42 fallout.
- **56 errors** are in **non-test files** — mostly `TS2339`/`TS2322` in `RecipeDetailPage.tsx`
  (43 errors, the shadow-type `RecipeDetailResponse` mismatch that D42 fixes by replacing it with
  the shared `RecipeDetailOutput`) and `RecipeCreatePage.tsx` (4 errors). These are exactly the
  mismatches D42 exists to surface.

**Revised mitigation:** The "fix all pre-existing errors" step is tractable: (1) add
`allowImportingTsExtensions: true` to tsconfig (kills 686); (2) fix the 56 non-test errors as part
of D42's shadow-type deletion (they're in files D42 touches); (3) fix the 145 test-file mock errors
by adding `sessionError: null` and `clearSessionError: vi.fn()` to the mock `AuthContextType`
objects (mechanical, one-line-per-mock). The single-phase approach is confirmed viable.

---

## Decision 2 — Response types: export `*Output` (data payload), NOT envelope types

**Finding:** `apps/web/src/api/client.ts` unwraps the response envelope:
- `request<T>(endpoint, options)` → `return (data as Record<string, unknown>).data as T` — returns
  the **unwrapped `.data` payload** as `T`.
- `requestWithMeta<T>(endpoint, options)` → `return requestInternal(endpoint, options) as Promise<T>`
  — returns the **full envelope** (for `api.getWithMeta` only).
- `api.get<T>` / `api.post<T>` / `api.patch<T>` / `api.delete<T>` all use `request<T>` → `T` =
  data payload.
- `api.getWithMeta<T>` uses `requestWithMeta<T>` → `T` = full envelope.

The shared `*Output` types (e.g. `RecipeDetailOutput`, `BeanOutput`) are already **data payload
types** — they match what `api.get<T>` should receive after envelope unwrapping.

**Decision:** Export the existing `*Output` types (data payload) through the `schemas/index.ts`
barrel. Use them directly as the `T` in `api.get<T>` / `api.post<T>` / etc. Do NOT export envelope
types (`XResponse`) — the client peels `.data` before returning, so the envelope type is only
useful for `getWithMeta` and bespoke-envelope routes.

For `api.getWithMeta<T>`, export a shared `PaginatedResponse<T>` helper type matching
`paginatedEnvelope()`'s shape:
```typescript
export type PaginatedResponse<T> = {
  success: true;
  data: T[];
  meta: { requestId: string; pagination: PaginationMeta };
};
```
The web's current hand-written `PaginatedResponse<T>` in `api/types.ts:175-185` is **missing
`success` and `meta.requestId`** — drift to fix when replacing `api/types.ts`.

For bespoke envelopes (`EquipmentRecipesResponse`, `EquipmentDeleteRequestResponse`), the shared
types already exist and include `success` — use them directly as the `T` in `api.get<T>` (these
routes return the full bespoke envelope as the payload, not the standard envelope).

**Rejected alternative:** Export both `XOutput` (payload) and `XResponse` (envelope) types.
Rejected because the envelope is a generic function (`successEnvelope<T>(schema)`), not a
pre-instantiated schema — there is no `RecipeDetailResponseSchema` to infer from. The web client
peels `.data` anyway, so the envelope type is only needed for the 2 `getWithMeta` call sites, which
the `PaginatedResponse<T>` helper covers.

---

## Decision 3 — Recipe list-item schema: ADD `RecipeListItemOutputSchema`, do NOT use `FeedRecipeOutput`

**Finding:** The web's `RecipeListItem` (in `api/types.ts:99`) has a slim projection shape:
`id`, `slug`, `title`, `author` (mini), `visibility`, `currentVersion` (badge row data),
`likeCount`, `commentCount`, `forkCount`, `favouriteCount`, `avgRating`, `userLiked`,
`userFavourited`, `featured`, `createdAt`. The closest shared type, `FeedRecipeOutput`
(`responses/recipe.ts:116`), has the **full recipe row** (`currentVersionId`, `deletedAt`, etc.)
plus a 3-field author — it's the feed endpoint's shape, not the list endpoint's slim projection.
Crucially, `FeedRecipeOutput` lacks `userLiked`/`userFavourited`/`avgRating` (per-request overlay
fields that depend on the authenticated user).

**Decision:** Add `RecipeListItemOutputSchema` to `packages/shared/src/schemas/responses/recipe.ts`
matching the API's actual list-endpoint return shape. Derive it from the real
`recipe/model.ts findMany` / `findCursor` return shape (per AGENTS.md OpenAPI rule: "derive output
schemas from the ACTUAL `service.ts` return shape"). Include the per-request overlay fields
(`userLiked`, `userFavourited`, `avgRating`, `userRating`, `favouriteCount`) because the list
endpoint genuinely returns them (they're computed from `ctx.user` joins). Export the inferred type
`RecipeListItemOutput`.

**Rejected alternative:** Use `FeedRecipeOutput` as the list type and fix the web's list rendering
to match. Rejected because `FeedRecipeOutput` has the wrong shape (full row, no user-state overlay)
and the list endpoint genuinely returns a different projection. Using the wrong type would force
the web to access fields that don't exist on the type or ignore fields the type says are present.

---

## Decision 4 — Recipe detail: EXTEND `RecipeDetailOutputSchema` with per-request overlay

**Finding:** The web's `RecipeDetailResponse` (`api/types.ts:5-31`) includes per-request fields the
shared `RecipeDetailOutput` (`responses/recipe.ts:207`) lacks: `currentVersion` (a nested version
object), `tasteNotes[]`, `equipment[]`, `bean`, `avgRating`, `userLiked`, `userFavourited`,
`favouriteCount`, `userRating`. The shared `RecipeDetailOutput` has `versions[]` (all versions),
`forkedFrom`, and the static recipe row — but not the per-request overlay.

The API's `recipe/model.ts findById` returns a shape that includes both the static recipe data AND
the per-request overlay (computed from `ctx.user` joins for the authenticated user). The shared
schema should model what the API actually returns.

**Decision:** Extend `RecipeDetailOutputSchema` to include the per-request overlay fields
(`userLiked`, `userFavourited`, `avgRating`, `userRating`, `favouriteCount`) and the
`currentVersion` convenience field (the latest version's nested data — `tasteNotes[]`, `equipment[]`,
`bean`). This matches the actual `findById` return shape. The web's `RecipeDetailResponse` becomes
unnecessary and is deleted; `RecipeDetailPage` imports `RecipeDetailOutput` from shared.

**Implementation note:** The `currentVersion` field is a convenience projection (the API computes
it from `versions[0]` or `versions.find(v => v.id === currentVersionId)`). The schema should
model it as an optional nested object (`currentVersion?: RecipeDetailVersionOutput`) since not all
recipes have versions. The `versions[]` array stays as the full list.

**Rejected alternative:** Split into `RecipeDetailOutput` (static) + `RecipeDetailResponse`
(per-request overlay). Rejected because the API returns a single combined object — splitting
forces the web to intersect two types, adding complexity for no benefit. The per-request fields are
optional (depend on authentication), so they fit naturally as optional fields on the single schema.

---

## Decision 5 — D43: `createdAt` only, no `updatedAt`, no indexes

**Finding:** The three target tables are insert/delete-only (relations are replaced, not mutated).
`updatedAt` would always equal `createdAt` and adds no audit value. No current query sorts these
tables by insertion time.

**Decision:** Add `createdAt` only (matching the `userRecipeLikes` pattern). Do NOT add `updatedAt`.
Do NOT add `created_at` indexes preemptively — per the `db-indexes` spec, add indexes with the
first consuming query (D23 precedent). Note this in the schema docblock.

**Rejected alternative:** Add `createdAt` + `updatedAt` + a `created_at` index. Rejected because
`updatedAt` is meaningless for insert/delete-only tables, and the index has no consumer (wasted
write overhead on every insert).

---

## Decision 6 — D35: delete dead `const log`, do NOT rename to `_log`

**Finding:** `cors.ts:6` and `requestId.ts:13` declare `const log = createLogger(...)` that is
never called. The `createLogger` call has a runtime side effect (allocates a pino child logger)
that is immediately garbage-collected. These are not Hono middleware signature params (like
`(c, next) => ...`) — they are module-level const declarations.

**Decision:** Delete the `import { createLogger }` line, the `const log = ...` line, and the
`// deno-lint-ignore no-unused-vars` directive. The loggers are genuinely unused; keeping `_log`
would preserve a side-effect-free no-op with a wasteful child-logger allocation.

**Rejected alternative:** Rename `log` → `_log` and delete the directive. Rejected because it
preserves dead code with a runtime cost. The `lint-style` spec does not mandate loggers in every
middleware; AGENTS.md's "create a module-scoped logger" convention is for modules that *log*, not a
mandate to add loggers to modules that don't. If future logging is needed, re-add the logger then.

---

## Decision 7 — D39: Wave 3 tr-locale spot-checks satisfy the "has a test file" gate

**Finding:** Wave 3 (D40) added thin tr-locale spot-check tests for 22 converted pages. These
tests mock `useTranslation` with a hardcoded Turkish string map and assert one string renders
(e.g. `AdminBadgesPage.test.tsx` is 53 lines, asserts only `'Rozetler'` appears). They are
i18n-regression tests, NOT behavioural coverage. The D39 plan's intent ("no untested exported
function remains") suggests deeper behavioural tests.

**Decision:** Wave 3's tr-locale spot-checks **satisfy the D39 "has a test file" gate** for the 22
pages they cover. D39 Tier 3 web work is scoped to the **4 genuinely-untested pages**
(`ForgotPasswordPage`, `ResetPasswordPage`, `BeanListPage`, `SetupListPage`) + the 6 untested
components + 5 untested hooks/utils/contexts. Deepening the Wave 3 spot-checks into full
behavioural coverage is **out of scope** for Wave 4 — it's a separate coverage-quality effort that
can be absorbed into feature work touching those files.

**Rejected alternative:** Deepen all 22 Wave 3 spot-checks to full behavioural coverage. Rejected
because it expands D39 Tier 3 scope from 15 new test files to 37+ (15 + 22 deepened), mixing
coverage-quality work with coverage-backfill work. The 4 genuinely-untested pages are the
unambiguous gap; the 22 spot-checked pages have *some* test, which is better than none.

---

## Decision 8 — Spec structure: 2 NEW + 2 MODIFIED capabilities

**Finding:** 
- **D42** has no existing spec covering the web↔API type boundary. The closest is `api-type-safety`
  (Wave 2), which covers the API service layer, not the web client layer. D42 is a new concern.
- **D43** has no existing spec covering join-table audit columns. `db-indexes` covers indexes, not
  timestamps. D43 is a new concern.
- **D35** modifies `lint-style` — the existing spec is silent on production `deno-lint-ignore-file`
  directives (it only addresses test-file directives and production `as any` casts). D35 tightens
  it.
- **D39 Tier 2/3** modifies `model-test-coverage` — the existing spec only contracts Tier 1
  (recipe-list components, RequireAuth). Tier 2/3 extend the same conventions to API models/routes/
  utils and web/shared tests.

**Decision:** 
- ADD `web-api-boundary` (D42) — references `api-type-safety` (Wave 2 foundation) and
  `model-test-coverage` (test conventions for the type-level regression test).
- ADD `join-table-audit` (D43) — references `db-indexes` (precedent for "no preemptive indexes").
- MODIFY `lint-style` (D35) — add production-source `deno-lint-ignore-file` prohibition + the 2
  missed `coffee-variety` files.
- MODIFY `model-test-coverage` (D39 Tier 2/3) — add Tier 2 API model/route/util conventions + Tier
  3 web/shared conventions.

**Rejected alternative:** ADD 4 new capabilities. Rejected for D35/D39 because the existing specs
are the right homes — modifying them keeps the convention in one place rather than splitting it
across two specs. This matches the repo's pattern: `db-indexes` was extended by D23, not replaced.

---

## Drift from the original plans (2026-07-04 → 2026-07-06)

| Plan claim | Actual state (2026-07-06) | Resolution |
|---|---|---|
| D42: "25+ occurrences" | 23 occurrences of `Record<string, unknown>` | Acceptance criterion "zero hits" unaffected |
| D42: "export `RecipeDetailResponse`" | No `RecipeDetailResponseSchema` exists; the convention is `XOutputSchema`/`XOutput` | Use existing `*Output` naming; delete the web's `RecipeDetailResponse` |
| D42: "request types already exported" | Wave 2 exported only 4 domains (bean/setup/vendor/equipment); recipe/user-profile/preferences/taste/follow/comment missing | Add the 10+ missing request type exports as a prerequisite step |
| D42: "Primary gate is `make ci`" | `make ci` does NOT type-check the web app | Add `tsc --noEmit` to `make check-web` (Decision 1) |
| D42: `RecipeListItem` "originally defined in a page" | Centralized in `api/types.ts:99` (still hand-written, not derived) | Delete `api/types.ts`; add `RecipeListItemOutputSchema` to shared (Decision 3) |
| D43: all claims | Verified accurate — no drift | None needed |
| D35: 7 files | Actually 9 files — missed `coffee-variety/model.ts` + `service.ts` | Include both in scope; delete vestigial directives |
| D35: "replace `any` with `unknown` in logger" | Logger already uses `Record<string, unknown>` — no `any` to replace | Delete the 4 vestigial shared-file directives (no code change) |
| D35: `as any` at `:28` | Actually at `:29` (line 28 is the justification comment added by D34) | Narrow file-level → line-level directive above line 29 |
| D39: `cron.ts` at `apps/api/src/jobs/cron.ts` | Actually at `apps/api/src/utils/jobs/cron.ts` | Use correct path |
| D39: Tier 3 web pages list | Wave 3 pre-empted 22 of 26 pages with tr-locale spot-checks | Scope Tier 3 web to 4 genuinely-untested pages (Decision 7) |
| D39: `NotFoundPage` target | D37 consolidated it into `ErrorPage.tsx`; `ErrorPage.test.tsx` covers it | Do NOT re-create `NotFoundPage.test.tsx` |

---

## Risks and unknowns

1. **D42's web type-check prerequisite (Decision 1) will surface pre-existing type errors.** The
   web app has never been `tsc`-checked in CI. Adding `tsc --noEmit` will find errors in files D42
   doesn't touch. Mitigation: run `tsc --noEmit` locally first, triage errors, fix pre-existing
   ones as part of D42's "fix fallout honestly" step. If the count is large (>50), consider a
   two-phase approach (non-blocking target first, blocking in follow-up). **Prefer single-phase.**

2. **D42's recipe-detail shape divergence (Decision 4) is a schema design decision.** Extending
   `RecipeDetailOutputSchema` to include per-request overlay fields changes the OpenAPI spec. The
   OpenAPI coverage test must stay green. The extension must match the actual `findById` return —
   if the model returns fields the schema doesn't model, the coverage test may flag it. Verify by
   reading `recipe/model.ts findById` return shape carefully before extending the schema.

3. **D42's `BeanListPage` `productName` vs `BeanOutput` `name` is a latent bug.** Either the page
   reads the wrong field (silently rendering `undefined`) or the bean list endpoint returns a
   different shape than `BeanOutputSchema` documents. D42's "fix fallout honestly" step must
   determine which is correct and fix the page or the schema. This is exactly the kind of latent
   bug the typing work exists to surface.

4. **D43's migration `0008` must not be manually edited.** Drizzle's hash-based migration tracking
   depends on unmodified generated SQL. The implementer should run `make db-generate`, review the
   output, and commit it as-is. If the output is wrong, fix the schema and re-generate.

5. **D35's `coffee-variety` directive deletion is not in the plan.** The implementer must remember
   to delete both `coffee-variety/model.ts:1` and `coffee-variety/service.ts:1` — without them, the
   acceptance criterion "zero `deno-lint-ignore-file` in production source" fails.

6. **D39 Tier 2 API model tests need DB fixtures.** Each of the 9 new model tests follows the
   `equipment/model.test.ts` pattern: inline `crypto.randomUUID()` fixtures, `afterEach`
   hard-delete, `{ sanitizeOps: false, sanitizeResources: false }`. The test DB has seed data —
   tests must filter to their own rows. This is a well-established pattern but verbose.

7. **D39 Tier 3 web component tests may need DOM/SVG mocking.** `ScaaRadarChart` renders SVG;
   `RecipeQRCode` renders a QR code canvas. These may need `vi.mock` for canvas/SVG rendering or
   jsdom limitations. The implementer should check the existing `RecipeCard.test.tsx` pattern and
   the `@testing-library/react` SVG support.

---

## Testing strategy

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  WAVE 4 TEST STRATEGY                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  D42 tests                                                                   │
│  ├── tsc --noEmit on apps/web/src      NEW gate: web type-check in CI        │
│  ├── type-level regression test        @ts-expect-error on derived type      │
│  └── existing web tests pass           loaders, recipe-list, pages           │
│                                                                              │
│  D43 tests                                                                   │
│  ├── schema column-existence test      getTableConfig(table).columns assert  │
│  ├── model.create.test.ts (extend)     assert createdAt populated on joins   │
│  └── migration applies clean           make db-migrate on fresh + seeded DB  │
│                                                                              │
│  D35 tests                                                                   │
│  ├── deno lint passes                   no new violations                     │
│  ├── deno check passes                  type-check after directive removal    │
│  └── grep gate                          zero deno-lint-ignore-file in prod    │
│                                                                              │
│  D39 tests (all new — this IS the change)                                   │
│  ├── Tier 2 API: 22 new test files     model + route + util                  │
│  ├── Tier 3 web: 15 new test files     pages + components + hooks/contexts   │
│  └── Tier 3 shared: 6 new test files   input schema tests                    │
│                                                                              │
│  Verification gates                                                          │
│  ├── make check              type-check all workspaces (NOW includes web)    │
│  ├── make lint               lint all apps and packages                      │
│  ├── make fmt                deno fmt                                        │
│  └── make test               all tests via Docker with --allow-all           │
└──────────────────────────────────────────────────────────────────────────────┘
```