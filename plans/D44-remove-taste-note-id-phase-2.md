# D44 — Remove the Deprecated `tasteNoteId` Query Parameter (D28 Phase 2)

> **Status (2026-11-21): Open, waiting on its sunset criterion.** Phase 1
> ([D28](D28-remove-deprecated-taste-note-id.md), resolved 2026-06-22) added the RFC 8594
> `Deprecation: true` header and a `warn` log. This plan removes the parameter. Ledgered in
> [`ROADMAP.md`](ROADMAP.md) → Remaining Debt and in [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md)
> (Infrastructure changes, D28 line).

## Severity

**Low.** It is a breaking change for callers that still send `tasteNoteId`, and it removes no
user-visible behaviour, because the web app sends only `tasteNoteIds`
(`apps/web/src/utils/recipe-filters.ts`).

## Problem

`GET /api/v1/recipes` and `GET /api/v1/recipes/starred` still accept the singular `tasteNoteId`
filter next to the canonical comma-separated `tasteNoteIds` (AND logic, up to 10 ids). D28 was
phase 1 of 2: it only announced the deprecation. The phase-2 removal had no ledger entry until
the 2026-11-18 audit ([`AUDIT-2026-11-18.md`](AUDIT-2026-11-18.md)) found it orphaned. D28's
"follow-up plan (D29 or later)" wording pointed at a number D29 already used. So the
parameter, its model branch, the deprecation branch and the docs row all still ship:

| Piece | Location (2026-11-21) |
|---|---|
| Schema field | `packages/shared/src/schemas/recipe.ts` `RecipeFilterSchema.tasteNoteId` (`z.uuid().optional().meta({ deprecated: true })`, with a JSDoc that already points here) |
| Model filter type and branch | `apps/api/src/modules/recipe/model.ts` filter type `tasteNoteId?: string` and the `else if (filters.tasteNoteId)` branch of the shared filter builder |
| Deprecation branch | `apps/api/src/modules/recipe/service.ts`: the two `deprecations` objects (list and starred) with their `Deprecated query parameter used` warn logs and `withDeprecations`; `apps/api/src/modules/recipe/index.ts`: the `tasteNoteId` OpenAPI parameter, the `Deprecation` response-header docs and the `{ headers: { Deprecation: 'true' } }` options on both list routes |
| Tests | `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`, the `Deprecation` cases in `apps/api/src/modules/recipe/index.test.ts` |
| Docs row | `docs/api.md` → Deprecations table (`tasteNoteId` on `GET /recipes`); the generated `docs/api-reference.md` rows for both list routes |

## Telemetry and sunset criterion

- **Signal:** every request that uses the parameter logs
  `warn` `Deprecated query parameter used` with `filter: 'tasteNoteId'` (plus `requestId`, and
  `userId` when authenticated). No other telemetry exists, so the API logs are the source.
- **Criterion:** no such log line in production for **30 consecutive days**, counted over every
  API replica's logs. Write the query you used and the date range in the removal PR.
- **If callers remain:** add a `Sunset: <HTTP-date>` header (RFC 8594) at least 30 days ahead
  next to `Deprecation`, tell the known callers, and remove on that date whatever the count.

## Removal steps

1. **Schema field.** Delete `tasteNoteId` and its JSDoc from `RecipeFilterSchema`. The object
   schema strips unknown keys, so a stale caller then gets unfiltered results silently. Say so in
   the release notes, or reject the key with a `400` for one release, and decide which in the PR.
   Run `make test-shared`.
2. **Model.** Remove `tasteNoteId?: string` from the recipe filter type and the
   `else if (filters.tasteNoteId)` branch in `recipe/model.ts`. `tasteNoteIds` keeps its
   `inArray`/AND logic unchanged.
3. **Deprecation branch.** In `recipe/service.ts`, delete both `deprecations` objects, their warn
   logs and the `withDeprecations` wrapper, and return the list results directly. In
   `recipe/index.ts`, drop the `tasteNoteId` parameter and the `Deprecation` response header
   from both `describeRoute()` blocks and the header options from both handlers. Keep the
   `options` (headers) argument of `paginated`/`cursorPaginated` in `utils/response` only if
   another caller uses it.
4. **Tests.** Delete `recipe-filter-deprecation.test.ts` and the `Deprecation` cases in
   `recipe/index.test.ts`. Add one case asserting that `tasteNoteIds` still filters and that no
   response carries a `Deprecation` header. Run `make test-api`; `openapi.coverage.test.ts` must
   stay green.
5. **Docs row.** Remove the `tasteNoteId` row from the `docs/api.md` Deprecations table (keep the
   section with a "no deprecated parameters" line if the table empties). Regenerate the reference
   with `pnpm --filter @brewform/api run docs:api` so `docs/api-reference.md` drops the
   parameter. Update the `advanced-search` spec's documented-parameter list through an OpenSpec
   change delta.
6. **Ledger.** Mark D44 resolved in [`ROADMAP.md`](ROADMAP.md) and add the resolution line next
   to the D28 line in [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md).

## Acceptance criteria

- [ ] The sunset criterion is met and its evidence is in the PR description.
- [ ] `tasteNoteId` appears in no shared schema, recipe model/service/index, OpenAPI document or
      `docs/` file, apart from the resolved history in `plans/`.
- [ ] `make check`, `make test-api`, `make test-shared` and `make docs-check` pass.

## Effort estimate

**Low**: about two hours once the criterion is met.
