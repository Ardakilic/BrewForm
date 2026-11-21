# F24 — Recipe Version Immutability Guards

> **Refresh (2026-11-21): scope cut to the immutability guards.**
>
> - The diff half of this plan (`version-diff.ts`, `computeVersionDiff`, `generateDiffSummary`,
>   `getVersionsWithDiff`, `VersionDiffSchema`, `VersionDiffBadge`, `VersionDetail` and the
>   diff-enriched `GET /recipes/:slug/versions`) shipped as **F09** (recipe version diff,
>   2026-07-28) and is removed from this plan. F09 provides `diffVersions(recipeId, v1Id, v2Id)`
>   (`apps/api/src/modules/recipe/service.ts`, over `DIFF_SCALAR_FIELDS` plus taste-note and
>   equipment set diffs), the route `GET /api/v1/recipes/:slug/versions/diff?v1=&v2=`
>   (`recipe/index.ts`), `VersionDiffOutputSchema` (`packages/shared/src/schemas/responses/recipe.ts`)
>   and the web `VersionDiffPage` with `DiffHighlighter`.
> - Wave 6 (group 8) defines the write model the guards must respect: `PATCH /api/v1/recipes/:id`
>   either **amends the current version in place** (`bumpVersion: false`) or **bumps** to a new
>   version (`bumpVersion: true`), both inside one transaction under a recipe row lock
>   (`model.updateRecipeWithVersion`, `.for('update')`). Amending the current version is allowed
>   by design. Only versions *other than* `recipes.currentVersionId` are immutable.
> - Today no code path writes an earlier version: `updateRecipeWithVersion` updates only the row
>   it read as current, `replaceVersionRelations` only runs on that row, and no route accepts a
>   write under `/recipes/:slug/versions/:versionId` (Hono answers 404). This plan turns that
>   property into explicit guards and regression tests so a future write path cannot break it.
> - An `amendedAt` column (showing that the current version was amended in place) is a separate
>   debt-ledger follow-up, not part of F24.
>
> **Validation status (2026-07-13): ✅ Valid** (superseded by the refresh above for the diff scope)

## Overview

Guarantee that recipe version history is append-only apart from the current version: an earlier
version, its taste notes, equipment, additional preparations and photo links can never be
changed or deleted through the API, by the author or anyone else. The current version stays
amendable through `PATCH /recipes/:id` with `bumpVersion: false`.

## Goals

1. Earlier versions (any `recipe_version` row whose id is not `recipes.currentVersionId`) are
   never updated or deleted by application code.
2. Version relation rows (`recipe_taste_note`, `recipe_equipment`,
   `recipe_additional_preparation`, `recipe_version_photo`) of an earlier version are never
   replaced.
3. Explicit `PATCH`/`PUT`/`DELETE` attempts on a single version are rejected with a documented
   error instead of an accidental 404 or a future accidental write.
4. Regression tests pin the amend and bump paths so a refactor cannot widen what they write.

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | Know that earlier recipe versions cannot be changed | I can trust the version history (and F09's diffs of it) |
| US-2 | Recipe author | Keep fixing typos in my current version without creating a new version | Small corrections do not clutter the history |
| US-3 | Developer | Get a clear, documented error when I try to write a single version | I do not build clients against a write path that must not exist |

## Technical Design

### No New Tables

No schema change. The guards live in the recipe model (single writer of versions) and the route
layer.

### Model guard: only the current version is writable

`apps/api/src/modules/recipe/model.ts` is the only module that writes `recipe_version` rows and
their relations. Add one internal helper and call it before every in-place version write:

```ts
/**
 * Throws `VERSION_IS_IMMUTABLE` unless `versionId` is the recipe's current version.
 * Call inside the transaction, after the recipe row is locked, before any UPDATE of a
 * `recipe_version` row or any replacement of its relation rows.
 */
async function assertCurrentVersion(
  tx: Transaction,
  recipeId: string,
  versionId: string,
): Promise<void> {
  const [row] = await tx
    .select({ currentVersionId: recipes.currentVersionId })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)));
  if (!row) throw new Error('RECIPE_NOT_FOUND');
  const current = row.currentVersionId ?? (await highestVersionId(tx, recipeId)); // legacy rows
  if (current !== versionId) throw new Error('VERSION_IS_IMMUTABLE');
}
```

- `updateRecipeWithVersion` (`mode: 'amend'`) calls it with `current.id` before
  `tx.update(recipeVersions)` and `replaceVersionRelations`. (`findCurrentVersionRow` falls back
  to the highest version number when `currentVersionId` is null; for such legacy rows the guard
  accepts the highest version only. Keep that fallback and test it.)
- `replaceVersionRelations` stays non-exported and is only reachable through the guarded amend
  path.
- `mode: 'bump'` and fork/merge only `INSERT` new versions and relation rows; they must never
  call `tx.update(recipeVersions)` or delete relation rows of an existing version. A test asserts
  the previous version's row and relations are byte-for-byte unchanged after a bump.
- `VERSION_IS_IMMUTABLE` maps to `409 VERSION_IS_IMMUTABLE` through the typed errors in
  `apps/api/src/utils/errors.ts` (`ConflictError`), not a new string-matched error.

### Route guard: no single-version write endpoints

In `apps/api/src/modules/recipe/index.ts`, register explicit rejections for
`PATCH`, `PUT` and `DELETE` on `/:slug/versions/:versionId`, before the `/:slugOrId` catch-all,
each with `describeRoute()` metadata (tag `Recipes`, `security: [{ bearerAuth: [] }]`) and a
`resolver(ErrorEnvelopeSchema)` response:

```ts
recipe.on(
  ['PATCH', 'PUT', 'DELETE'],
  '/:slug/versions/:versionId',
  describeRoute({ /* tags, summary, description, security, 405/401 responses */ }),
  authMiddleware,
  (c) =>
    error(
      c,
      'VERSION_IS_IMMUTABLE',
      'Recipe versions are immutable; amend the current version with PATCH /recipes/:id',
      405,
    ),
);
```

405 (with an `Allow: GET` header) states that the resource exists but the method never will;
the body points at the supported amend path. The OpenAPI coverage test must list the new route.

### Logging

The guard logs `log.warn({ recipeId, versionId }, 'VERSION_IS_IMMUTABLE rejected')` (ids only),
and the route rejection logs at `debug` with the request id.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PATCH` | `/api/v1/recipes/:id` | Required | Unchanged: amends the current version (`bumpVersion: false`) or bumps (`bumpVersion: true`) |
| `PATCH`/`PUT`/`DELETE` | `/api/v1/recipes/:slug/versions/:versionId` | Required | **Rejected** with `405 VERSION_IS_IMMUTABLE` |
| `GET` | `/api/v1/recipes/:slug/versions/diff` | Optional | Unchanged (F09) |

## Acceptance Criteria

- [ ] `PATCH`, `PUT` and `DELETE` on `/recipes/:slug/versions/:versionId` return 405 with
      `VERSION_IS_IMMUTABLE`, for the author and for admins, and carry OpenAPI metadata
- [ ] An amend (`bumpVersion: false`) still updates the current version in place
- [ ] A bump leaves the previous version's row and all its relation rows unchanged (DB-backed test)
- [ ] An amend never touches any version other than the current one (DB-backed test with a
      three-version recipe)
- [ ] `assertCurrentVersion` rejects a non-current version id with `VERSION_IS_IMMUTABLE` (409)
- [ ] F09's diff endpoint and `VersionDiffPage` are unchanged
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test-api`)

## Implementation Steps

1. Failing tests first: a DB-backed model test (bump keeps the previous version and its relations
   unchanged; amend writes only the current version) using `RecipeWriteFixtures` from
   `apps/api/src/modules/recipe/test-helpers.ts`, and a route test for the three rejected methods.
2. Add `assertCurrentVersion` to `recipe/model.ts` and call it in the amend branch of
   `updateRecipeWithVersion`.
3. Map `VERSION_IS_IMMUTABLE` through the typed errors in `apps/api/src/utils/errors.ts`.
4. Add the rejecting route with `describeRoute()` before `/:slugOrId`.
5. Run `make check && make lint && make test-api`.

## Dependencies

- `recipes.currentVersionId` and the `recipe_version` relation tables (`packages/db/src/schema.ts`)
- `model.updateRecipeWithVersion` (wave 6 group 8 amend/bump transaction)
- F09 (shipped) for every diff concern
- Typed errors (`apps/api/src/utils/errors.ts`) and response helpers
