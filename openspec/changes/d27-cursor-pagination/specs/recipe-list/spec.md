# Recipe List (Delta)

The recipe list API response shape is extended to support both cursor-based and offset-based
pagination metadata, discriminated by the presence of `meta.cursor` vs `meta.pagination`.

## ADDED Requirements

### Requirement: Feed route accepts cursor without polluting PaginationSchema

The `GET /api/v1/follow/feed` route SHALL switch from `PaginationSchema` (only `page`/`perPage`) to a
local inline schema that includes `cursor`, so that the shared `PaginationSchema` in
`packages/shared/src/schemas/common.ts` remains unchanged and the 10 other endpoints that use it
are unaffected:

```typescript
zValidator('query', z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
})),
```

The `PaginationSchema` in `packages/shared/src/schemas/common.ts` SHALL remain unchanged
(no cursor field added).

#### Scenario: Feed route accepts cursor parameter

- **WHEN** `GET /api/v1/follow/feed?cursor=eyJ...&perPage=10` is called
- **THEN** the query passes Zod validation and reaches the route handler
- **AND** cursor-based pagination is used

#### Scenario: Feed route still works with page/perPage only (backward compatible)

- **WHEN** `GET /api/v1/follow/feed?page=1&perPage=10` is called
- **THEN** offset-based pagination is used (unchanged behavior)

---

### Requirement: Recipe model `getFeed()` supports cursor parameter

The `getFeed(authorIds, page, perPage)` function in `apps/api/src/modules/recipe/model.ts` SHALL
be extended to accept an optional `cursor` parameter and dispatch to `findCursor()` when present.

The follow service `getFeed(userId, page, perPage)` in `apps/api/src/modules/follow/service.ts`
SHALL pass the cursor through to the recipe model layer.

#### Scenario: Feed with cursor uses cursor-based query

- **WHEN** `follow/service.getFeed(userId, page, perPage, cursor)` is called with a valid cursor
- **THEN** the query uses `recipeModel.findCursor()` instead of `recipeModel.findMany()`
- **AND** the result includes `nextCursor` and `hasMore`

---

### Requirement: Starred recipes route uses offset pagination only (deferred)

The `GET /recipes/starred` route SHALL continue to use offset pagination exclusively.
The `findStarred()` function in `apps/api/src/modules/recipe/model.ts` SHALL NOT be
modified in this change.

If a `cursor` parameter is sent to the starred route, it SHALL be silently ignored and
offset pagination SHALL be used. A debug log SHALL be emitted: `log.debug('Cursor provided but starred recipes use offset pagination, using offset')`.

Cursor pagination for starred recipes is deferred to a follow-up change because:
- `findStarred()` has a separate inline offset implementation with a favourites subquery
- The starred query involves a JOIN with the `favourites` table, which adds complexity to cursor ordering
- No user-facing demand for cursor pagination on starred lists yet

#### Scenario: Cursor param on starred route falls back to offset

- **WHEN** `GET /api/v1/recipes/starred?cursor=eyJ...` is called
- **THEN** offset pagination is used with `page=1, perPage=20` defaults
- **AND** the response contains `meta.pagination` (not `meta.cursor`)
- **AND** a debug log is emitted

## MODIFIED Requirements

### Requirement: API returns discriminated pagination meta

The recipe list endpoint `GET /api/v1/recipes` SHALL return one of two mutually exclusive meta
shapes:

1. **Cursor mode** (when `cursor` query param is present and `sortBy=createdAt`):
   ```json
   { "meta": { "requestId": "...", "cursor": { "nextCursor": "string|null", "hasMore": true } } }
   ```

2. **Offset mode** (when `cursor` is absent or `sortBy` is incompatible):
   ```json
   { "meta": { "requestId": "...", "pagination": { "page": 1, "perPage": 20, "total": 1234, "totalPages": 62 } } }
   ```

The `data` array shape (array of recipe list items) SHALL be identical in both modes.

#### Scenario: First page with no cursor returns offset meta

- **WHEN** `GET /api/v1/recipes?page=1&perPage=10` is called
- **THEN** `meta.pagination` is present with `page=1, perPage=10, total, totalPages`
- **AND** `meta.cursor` is absent

#### Scenario: Cursor page returns cursor meta

- **WHEN** `GET /api/v1/recipes?cursor=eyJ...&perPage=10` is called with a valid cursor
- **THEN** `meta.cursor` is present with `nextCursor, hasMore`
- **AND** `meta.pagination` is absent

#### Scenario: Feed endpoint returns cursor meta when cursor is provided

- **WHEN** `GET /api/v1/follow/feed?cursor=eyJ...&perPage=10` is called
- **THEN** `meta.cursor` is present with `nextCursor, hasMore`

---

### Requirement: RecipeFilterSchema includes cursor parameter

The `RecipeFilterSchema` in `packages/shared/src/schemas/recipe.ts` SHALL include optional
`cursor` and `includeTotal` fields:

```typescript
cursor: z.string().optional(),
includeTotal: z.coerce.boolean().optional().default(false),
```

The schema SHALL continue to accept `page`, `perPage`, `sortBy`, and `sortOrder` without changes.

#### Scenario: Cursor param is accepted and validated

- **WHEN** `GET /api/v1/recipes?cursor=eyJjcmVhdGVkQXQ...` is called
- **THEN** the query passes Zod validation and reaches the route handler

#### Scenario: Cursor param is optional (not required)

- **WHEN** `GET /api/v1/recipes?page=1&perPage=10` is called without `cursor`
- **THEN** the query passes Zod validation (backward compatible)

#### Scenario: includeTotal is accepted and defaults to false

- **WHEN** `GET /api/v1/recipes?cursor=eyJ...` is called without `includeTotal`
- **THEN** `includeTotal` defaults to `false` (no count query is executed)
