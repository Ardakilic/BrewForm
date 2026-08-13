## Context

F02 is the next roadmap feature (`plans/ROADMAP.md:34`) and a named prerequisite for F03
(profile stats), F20, F25's offline brew-log sync, and F28's guided-brew completion hook. The PRD
(`plans/F02-brew-journal.md`) was re-validated against the codebase on 2026-08-13; its corrections
are authoritative and are folded into this design. The codebase state it verified:

- No `brew_log` table, no `apps/api/src/modules/brew-log/`, no brew-log schemas — fully net-new.
- Reference patterns: `collections` table (`packages/db/src/schema.ts:897-915`) for the
  soft-delete trio; `collection` API module (`apps/api/src/modules/collection/`) for the 3-layer
  pattern, OpenAPI metadata, and test structure; `collectionApi` (`apps/web/src/api/index.ts:269`)
  for the typed web boundary (D42).
- Constraints: Drizzle-only (no raw SQL), no JSONB/UUID columns, soft delete on main entities,
  mandatory OpenAPI documentation per route, i18n en/tr parity, composite-index convention (D23).

## Goals / Non-Goals

**Goals:**

- Owner-private brew event logging: date, actual yield/dose, notes, 1–10 personal rating.
- Full CRUD with soft delete; paginated history per user and per recipe.
- Aggregate stats: user-level (own, auth) and recipe-level (public, optional auth).
- "Brew Again" flow from `RecipeDetailPage` pre-filling the form from the recipe's current version.
- Complete OpenAPI documentation, i18n parity, and test coverage matching the collection module.

**Non-Goals:**

- Public/shared brew logs or any visibility model (F26 may add a flag later).
- Time-series charts or a chart dependency (stats are plain numbers).
- F28 guided-brew completion hook (F28 is unimplemented; it will POST to this change's create
  endpoint when it lands).
- Extending `RecipeDetailOutputSchema` with brew metrics (see Decision 3).
- Notifications for brew events (`notificationTypeEnum` has no brew type; F05 fan-out excludes
  brews by design).

## Decisions

### Decision 1: One `brew_log` table, owner-private rows

A single table holds every brew event: owner FK, recipe FK, nullable `recipeVersionId` FK
(which version was brewed), `brewedAt`, `real()` actuals, `text` notes, integer `personalRating`,
soft-delete trio. No separate notes/ratings tables — a brew event is one row by nature.

**Privacy**: individual logs are strictly owner-private. All log read/write routes require auth and
filter by the caller's `userId`. Only aggregate recipe stats are public. Alternative considered: a
`visibility` column like collections — rejected as YAGNI; if F26 wants shareable brew entries it
can add the column then. Consequence: the brew-history tab on `UserProfilePage` renders only on
the viewer's own profile, and `GET /brew-logs/recipe/:recipeId` is auth-required (a deliberate
deviation from the PRD's "optional auth", which contradicts the privacy model — optional auth
would either expose private notes or return nothing useful to visitors; the public need is served
by the stats route).

### Decision 2: Stats via dedicated endpoints, not embedded in recipe responses

`GET /brew-logs/stats/recipe/:recipeId` (optional auth) returns `brewCount` + `avgBrewRating`;
`GET /brew-logs/stats/user` (auth) returns `totalBrews`, `last30Days`, `distinctRecipeCount`,
`firstBrewedAt`, `lastBrewedAt`. Alternative: extend `RecipeDetailOutputSchema`. Rejected:
(1) it mixes two different rating metrics — `avgRating` is the community rating from
`user_recipe_rating` (D21); the brew-log average is a personal-rating aggregate, so field names
must stay distinct (`brewCount`/`avgBrewRating`); (2) it would modify the recipe capability and
the heavily-used detail response for a concern that belongs to the journal; (3) the endpoint keeps
the change additive and the web page composes it independently. User stats are plain numbers — no
time-series buckets, no chart library; a chart is a follow-up if users ask.

### Decision 3: Composite indexes per D23, not the PRD's single-column indexes

`brew_log_user_brewed_idx` on `(userId, brewedAt)` and `brew_log_recipe_brewed_idx` on
`(recipeId, brewedAt)` serve the two list queries (`WHERE userId = ? ORDER BY brewedAt DESC`,
`WHERE recipeId = ? AND userId = ? ORDER BY brewedAt DESC`) with seek + presorted scan. Plus
`brew_log_deleted_at_idx` (soft-delete convention). No index on `recipeVersionId` — no query
filters by it. This replaces the PRD's four separate single-column indexes.

### Decision 4: `updatedAt` included; CHECKs mirror the D21 scale

The PRD draft omitted `updatedAt`; every soft-deletable mutable entity carries it
(`collections` at schema.ts:905-907), so `brewLogs` does too. CHECKs:
`personal_rating BETWEEN 1 AND 10` (matches `user_recipe_rating_rating_check`, schema.ts:719),
`yield_actual > 0`, `dose_actual > 0`. All three columns are nullable, and Postgres CHECKs pass
NULL, so "no rating yet" stays representable.

### Decision 5: Module shape copies the collection module exactly

`model.ts` (pure Drizzle; services never import `drizzle-orm`) with `findById`, `findByUserId`,
`findByRecipeIdAndUser`, `create`, `update` (sets `updatedAt`), `softDelete`,
`getRecipeBrewStats`, `getUserBrewStats`. `service.ts` with
`createLogger('brew-log-service')`, entry/exit debug logs, string-error throws
(`'BREW_LOG_NOT_FOUND'`, `'FORBIDDEN'`, `'RECIPE_NOT_FOUND'`, `'RECIPE_VERSION_MISMATCH'`) mapped
to 404/403/400 in `index.ts` catch blocks. `index.ts` uses the swappable `deps` middleware proxy
for tests, `describeRoute()` + `zValidator(..., zodValidationHook)` on every route,
`jsonRequestBody()` for POST/PATCH bodies, `resolver(successEnvelope(...))` /
`resolver(paginatedEnvelope(...))` / `resolver(ErrorEnvelopeSchema)` responses. No caching layer —
the queries are index-covered aggregates and lists; add cache only if measured.

Route table (registered in this order):

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/brew-logs` | required | own logs, offset pagination, newest first |
| GET | `/brew-logs/stats/user` | required | own aggregate stats |
| GET | `/brew-logs/stats/recipe/:recipeId` | optional | public aggregate stats |
| GET | `/brew-logs/recipe/:recipeId` | required | own logs for one recipe |
| POST | `/brew-logs` | required | create |
| GET | `/brew-logs/:id` | required | owner-scoped single get (edit-form loader; added during implementation — the edit loader spec requires fetching the log) |
| PATCH | `/brew-logs/:id` | required | owner-only update |
| DELETE | `/brew-logs/:id` | required | owner-only soft delete |

(`GET /stats/*` and `GET /recipe/:recipeId` have disjoint literal first segments, so registration
order is not load-bearing; the order above groups reads before writes for legibility.)

### Decision 6: Validation rules in the service layer

`createBrewLog`: recipe must exist and not be soft-deleted, and must be public OR owned by the
caller (you can journal your own private recipes); if `recipeVersionId` is given it must belong to
that recipe. `brewedAt` accepts any ISO datetime, defaulting to now — no future-date guard
(trivial abuse, not worth a dynamic refine). Update/delete: ownership check before anything else.
Lists join `recipes` and filter `isNull(recipes.deletedAt)` so logs of deleted recipes disappear
from history and stats without cascading deletes.

### Decision 7: Web — two pages, four components, loader pattern

`BrewLogListPage` (`/brew-logs`, RequireAuth + loader) and `BrewLogFormPage` serving both
`/brew-logs/new?recipeId=...&recipeVersionId=...` and `/brew-logs/:id/edit` (loader fetches the
existing log for edit, or the recipe for prefill on create — dose/yield actuals pre-filled from
the version's parameters as starting points). Components: `BrewLogForm`, `BrewLogCard`,
`BrewHistorySection` (recipe page, auth users only; its header button IS the "Brew Again"
affordance — a separate `BrewAgainButton` component would be one button, so it folds in),
`RecipeBrewStats` (recipe page, public). `UserProfilePage` gains a `brews` tab rendered only when
the profile belongs to the authenticated viewer. `brewLogApi` in `apps/web/src/api/index.ts` uses
`z.infer` types from `@brewform/shared/schemas` and `api.getWithMeta<PaginatedResponse<T>>` for
the paginated lists (D42).

### Decision 8: i18n and OpenAPI registration

All UI strings under a flat `brewLog.*` namespace in both `en.json` and `tr.json` (parity test
fails otherwise). New `Brew Logs` tag in `apps/api/src/routes/openapi.ts`; `/api/v1/brew-logs`
added to `IN_SCOPE_BASE_PATHS` in `openapi.coverage.test.ts`.

## Risks / Trade-offs

- [Metric confusion: brew rating vs community rating] → Distinct field names
  (`avgBrewRating` vs `avgRating`), separate endpoints, and the distinction documented in the
  output-schema file and OpenAPI descriptions.
- [PRD deviation on recipe-log-list auth] → Documented in Decision 1; the public stats route
  covers the visitor use case (US-6).
- [Soft-deleted recipes leave orphan brew logs] → Acceptable: rows stay for data preservation,
  all read paths filter them out; stats exclude them. No cascade.
- [Future F26/F28 integration] → The create endpoint is the stable contract; F28's
  `onSessionComplete` will POST to it. No hook scaffolding added now.
- [Migration sequencing] → Additive-only migration `0014_*`; rollback is dropping the table.
  Run `make db-generate && make db-migrate`; never hand-edit generated SQL.

## Migration Plan

1. Schema change in `packages/db/src/schema.ts` → `make db-generate` (expect `0014_<codename>.sql`)
   → `make db-migrate`.
2. Deploy API (new module is additive; no existing route changes).
3. Deploy web (additive pages/components).
4. Rollback: revert web, revert API, `DROP TABLE brew_log` (no other object depends on it).

## Open Questions

None blocking. (If F26 later wants shareable brew entries, add a `visibility` column then —
the table design does not preclude it.)
