## Why

All paginated recipe list endpoints (`GET /recipes`, `GET /feed/following`) use offset-based pagination (`page`/`perPage`). This causes two problems: (1) **performance degradation** as `OFFSET` grows — scanning 10,000 rows to return 20 — and (2) **inconsistent results** when data is inserted or deleted between page requests (items get skipped or duplicated). As the recipe count grows past ~10K, homepage feeds and explore pages will slow noticeably. Cursor-based pagination eliminates both issues by using a stable sort key instead of counting offsets. (`GET /recipes/starred` remains offset-only in this change due to its separate favourites subquery JOIN — deferred to follow-up.)

## What Changes

- **New shared cursor utility** — `packages/shared/src/utils/cursor.ts` with `encodeCursor()`/`decodeCursor()` for base64-encoded `{ createdAt, id }` cursors.
- **New composite index** — `recipe_created_at_id_idx` on `(createdAt DESC, id)` for efficient cursor-based queries.
- **Cursor-based query path** in `apps/api/src/modules/recipe/model.ts` — new `findCursor()` function using Drizzle composite WHERE conditions.
- **Dual-mode pagination** in `apps/api/src/modules/recipe/service.ts` — `listRecipes()` detects `cursor` param and dispatches to cursor or offset path. Cursor pagination only supports `sortBy=createdAt`; other sort orders fall back to offset.
- **New `CursorPaginationMetaSchema`** in shared response schemas — `{ nextCursor, hasMore }` for cursor responses, alongside the existing offset `PaginationMetaSchema`.
- **Route handler update** — `GET /recipes` returns `nextCursor`/`hasMore` meta when cursor mode is active.
- **OpenAPI documentation** — add `resolver()`-typed response schemas for recipe list routes (currently missing).
- **No breaking changes** — existing `page`/`perPage` params continue to work; cursor is opt-in via new `?cursor=` query param.

## Capabilities

### New Capabilities

- `cursor-pagination`: Encode/decode opaque cursors, execute cursor-based recipe queries with `(createdAt, id) < (cursorCreatedAt, cursorId)`, return `nextCursor`/`hasMore` metadata, and fall back to offset pagination when cursor is not provided or sort order is incompatible.

### Modified Capabilities

- `db-indexes`: Add `recipe_created_at_id_idx` composite index on `(createdAt DESC, id)` to the recipes table.
- `recipe-list`: Response shape for cursor-based pages includes `nextCursor`/`hasMore` instead of `page`/`totalPages`; frontend `RecipeListView` must support cursor-based "Load More" alongside existing offset pagination.

## Impact

- **Database**: New composite index migration (`make db-generate && make db-migrate`); index verification test updated.
- **API**: `RecipeFilterSchema` gains optional `cursor` field; `listRecipes()` gains cursor query path; `GET /recipes` response meta changes shape (cursor mode vs offset mode).
- **Shared schemas**: New `CursorPaginationMetaSchema` + `cursorEnvelope()` in `packages/shared/src/schemas/response.ts`; new `CursorPaginationMeta` type in `packages/shared/src/types/api.ts`.
- **Frontend**: `RecipeListView` and page wrappers adopt cursor-based loading (can ship separately — API supports both modes).
- **OpenAPI**: Recipe list routes receive proper typed response schemas; coverage test updated.
- **No third-party dependencies** — uses `btoa`/`atob` (globally available in Deno).
