# Cursor Pagination

Cursor-based pagination for recipe list endpoints, using base64-encoded composite cursors
with `(createdAt, id)` as the stable sort key. Supports both ASC and DESC directions with
`sortBy=createdAt`, and falls back to offset pagination for mutable sort columns.

## ADDED Requirements

### Requirement: Cursor encode and decode

The system SHALL provide `encodeCursor(cursor: PaginationCursor): string` and
`decodeCursor(cursor: string): PaginationCursor` utilities in `packages/shared/src/utils/cursor.ts`.

The `PaginationCursor` type SHALL have fields:
- `createdAt: string` (ISO 8601 date-time string)
- `id: string` (UUID)

Encoding SHALL use `JSON.stringify` then `btoa`. Decoding SHALL use `atob` then `JSON.parse`.

#### Scenario: Encode a valid cursor

- **WHEN** `encodeCursor({ createdAt: '2026-05-29T10:30:00.000Z', id: '550e8400-e29b-41d4-a716-446655440000' })` is called
- **THEN** the result is a base64 string that decodes back to the same object

#### Scenario: Decode an empty string

- **WHEN** `decodeCursor('')` is called
- **THEN** the function throws an error (invalid cursor format)

#### Scenario: Decode a tampered cursor string

- **WHEN** `decodeCursor('not-valid-base64!')` is called
- **THEN** the function throws an error (invalid cursor format)

---

### Requirement: Cursor-based query with DESC order

When `sortBy=createdAt` and `sortOrder=desc` (the default "newest first" feed), the system SHALL
execute a query via `db.query.recipes.findMany()` with:

```typescript
db.query.recipes.findMany({
  where: and(
    existingWhere,
    or(
      lt(recipes.createdAt, cursor.createdAt),
      and(eq(recipes.createdAt, cursor.createdAt), lt(recipes.id, cursor.id)),
    ),
  ),
  orderBy: [desc(recipes.createdAt), desc(recipes.id)],
  limit: perPage + 1,
  with: { author: { columns: { id: true, username: true, displayName: true } } },
});
```

Existing WHERE conditions (`deletedAt IS NULL`, visibility, authorId, etc.) SHALL be combined
with the cursor condition via `and()`. The `with` relation SHALL match the existing `findMany()`
behavior.

#### Scenario: First page with no cursor

- **WHEN** `GET /api/v1/recipes?perPage=5` is called (no cursor, default `sortBy=createdAt`, `sortOrder=desc`)
- **THEN** the response returns the first 5 public recipes (newest first) using offset pagination with `meta.pagination`
- **AND** `meta.cursor` is absent (offset mode is used when no cursor is provided)

#### Scenario: Second page using cursor from first page

- **WHEN** `GET /api/v1/recipes?cursor=<nextCursor from first page>&perPage=5` is called
- **THEN** the response returns the next 5 recipes (older than the cursor)
- **AND** no recipe from the first page appears in the result

#### Scenario: Last page (no more results)

- **WHEN** a cursor query returns fewer than `perPage + 1` results
- **THEN** `meta.cursor.hasMore` is `false` and `meta.cursor.nextCursor` is `null`

#### Scenario: Empty result set

- **WHEN** a cursor query returns zero recipes (cursor points past the end of available data)
- **THEN** `data` is an empty array
- **AND** `meta.cursor.hasMore` is `false`
- **AND** `meta.cursor.nextCursor` is `null`

#### Scenario: First page is also the last page (total ≤ perPage)

- **WHEN** the total number of matching recipes is less than or equal to `perPage`
- **THEN** the first page response has `meta.cursor.hasMore: false` and `meta.cursor.nextCursor: null`

#### Scenario: Concurrent insert does not cause skipped or duplicated items

- **WHEN** a new public recipe is inserted while user is on page 1
- **AND** user navigates to page 2 using the cursor from page 1
- **THEN** the new recipe is either on page 1 (already seen) or page 2 (not skipped)
- **AND** no recipe is duplicated across pages

#### Scenario: Soft-deleted recipe does not cause skipped items

- **WHEN** a recipe at the cursor position is soft-deleted between page loads
- **THEN** the next page still returns correct results (the deleted recipe is simply excluded)
- **AND** no items are skipped (the cursor bookmark remains valid)

---

### Requirement: Cursor-based query with ASC order

When `sortBy=createdAt` and `sortOrder=asc` (oldest first), the system SHALL
execute the cursor query using `gt()` instead of `lt()`, with `orderBy: [asc(recipes.createdAt), asc(recipes.id)]`:

```typescript
db.query.recipes.findMany({
  where: and(
    existingWhere,
    or(
      gt(recipes.createdAt, cursor.createdAt),
      and(eq(recipes.createdAt, cursor.createdAt), gt(recipes.id, cursor.id)),
    ),
  ),
  orderBy: [asc(recipes.createdAt), asc(recipes.id)],
  limit: perPage + 1,
  with: { author: { columns: { id: true, username: true, displayName: true } } },
});
```

#### Scenario: First page ASC

- **WHEN** `GET /api/v1/recipes?sortOrder=asc&perPage=5` is called
- **THEN** the response returns the 5 oldest public recipes with `meta.cursor.nextCursor` set

#### Scenario: Second page ASC using cursor

- **WHEN** `GET /api/v1/recipes?cursor=<nextCursor>&sortOrder=asc&perPage=5` is called
- **THEN** the response returns the next 5 recipes (newer than the cursor)
- **AND** no overlap with page 1 results

---

### Requirement: Fallback to offset pagination

When `cursor` is provided but `sortBy` is `likeCount` or `rating`, the system SHALL
fall back to offset-based pagination using `page` and `perPage` (defaults: `page=1`, `perPage=20`).

The system SHALL log a warning when this fallback occurs: `log.warn({ sortBy }, 'Cursor pagination incompatible with sortBy, falling back to offset')`.

When `cursor` is provided but `sortBy` is `createdAt`, cursor-based query SHALL be used.

When no `cursor` is provided, offset-based pagination SHALL be used regardless of `sortBy`.

#### Scenario: Cursor with sortBy=likeCount falls back to offset

- **WHEN** `GET /api/v1/recipes?cursor=eyJ...&sortBy=likeCount` is called
- **THEN** the response uses offset pagination with `page=1`, `perPage=20`
- **AND** the response meta contains `pagination` (not `cursor`)
- **AND** a warning is logged

#### Scenario: No cursor, any sortBy uses offset

- **WHEN** `GET /api/v1/recipes?page=2&perPage=10&sortBy=likeCount` is called
- **THEN** the response uses offset pagination with `page=2`, `perPage=10`

---

### Requirement: Mutually exclusive cursor and page parameters

When both `cursor` and `page` query parameters are present in the same request, the system SHALL
use cursor-based pagination and silently ignore the `page` parameter.

The system SHALL emit a debug-level log: `log.debug('Both cursor and page provided, using cursor pagination')`.

#### Scenario: Both cursor and page provided, cursor takes precedence

- **WHEN** `GET /api/v1/recipes?cursor=eyJ...&page=3&perPage=10` is called
- **THEN** cursor-based pagination is used (page=3 is ignored)
- **AND** the response contains `meta.cursor` (not `meta.pagination`)
- **AND** a debug log is emitted

---

### Requirement: Cursor payload is direction-agnostic

The cursor payload `{ createdAt, id }` SHALL NOT encode the sort direction. The `sortOrder`
query parameter determines which side of the cursor to fetch (older vs newer), not the cursor
itself. A cursor obtained from a `sortOrder=desc` response MAY be used with `sortOrder=asc`,
and vice versa.

#### Scenario: Cursor from DESC query reused with ASC order

- **WHEN** a cursor obtained from a `sortOrder=desc` response is used with `sortOrder=asc`
- **THEN** the query returns recipes newer than the cursor position (direction determined by `sortOrder`)
- **AND** the response is valid (no error)

#### Scenario: Cursor from ASC query reused with DESC order

- **WHEN** a cursor obtained from a `sortOrder=asc` response is used with `sortOrder=desc`
- **THEN** the query returns recipes older than the cursor position
- **AND** the response is valid (no error)

---

### Requirement: Authorization and visibility rules apply identically in cursor mode

The system SHALL apply the same `buildListRecipesWhere(filters, isAdmin)` WHERE conditions to
both cursor-based and offset-based queries. Visibility filtering (`eq(visibility, 'public')` for
non-admin users), soft-delete exclusion (`isNull(deletedAt)`), and author scoping SHALL be
combined with the cursor condition via `and()`.

#### Scenario: Cursor mode respects same visibility rules as offset mode

- **WHEN** a cursor-based query runs with the same `filters`, `isAdmin`, and `_requestingUserId`
- **THEN** the WHERE conditions (visibility, deletedAt, authorId, etc.) are identical to offset mode
  for the same parameters

#### Scenario: Non-admin user cannot see draft recipes via cursor

- **WHEN** a non-admin user sends a cursor-based query
- **THEN** only public recipes are returned (drafts excluded, same as offset mode)

---

### Requirement: Optional total count in cursor mode

The system SHALL support an optional `includeTotal` query parameter. When `includeTotal=true`
and in cursor mode, the system SHALL compute `SELECT count(*)` and include `total` in
`meta.cursor`. When `includeTotal` is absent or `false`, `total` SHALL be absent from the response.

#### Scenario: Cursor query without includeTotal

- **WHEN** `GET /api/v1/recipes?cursor=eyJ...` is called without `includeTotal`
- **THEN** `meta.cursor` contains `nextCursor` and `hasMore` but NOT `total`

#### Scenario: Cursor query with includeTotal=true

- **WHEN** `GET /api/v1/recipes?cursor=eyJ...&includeTotal=true` is called
- **THEN** `meta.cursor` contains `nextCursor`, `hasMore`, and `total`

#### Scenario: Cursor query with includeTotal=true and zero results

- **WHEN** `GET /api/v1/recipes?cursor=<validCursor>&includeTotal=true` returns zero recipes
- **THEN** `meta.cursor.total` is `0`
- **AND** `meta.cursor.hasMore` is `false`
- **AND** `meta.cursor.nextCursor` is `null`

---

### Requirement: Invalid cursor returns 400 error

When a `cursor` query parameter is present but cannot be decoded (malformed base64, invalid JSON,
missing required fields), the system SHALL return a standard error envelope with
`code: 'INVALID_CURSOR'` and status `400`.

#### Scenario: Malformed cursor base64

- **WHEN** `GET /api/v1/recipes?cursor=!!!invalid!!!` is called
- **THEN** the response is `{ success: false, error: { code: 'INVALID_CURSOR', message: '...' } }`
- **AND** status is `400`

#### Scenario: Cursor decodes to invalid shape

- **WHEN** cursor decodes to `{ foo: 'bar' }` (no `createdAt` or `id` fields)
- **THEN** the response is a `400` `INVALID_CURSOR` error

---

### Requirement: Response envelope distinction

The system SHALL use distinct meta keys for cursor vs offset pagination:
- Cursor mode: `meta.cursor` with `{ nextCursor, hasMore, total? }`
- Offset mode: `meta.pagination` with `{ page, perPage, total, totalPages }` (unchanged)

These keys SHALL be mutually exclusive — a response never contains both.

The system SHALL provide:
- `CursorPaginationMeta` type in `packages/shared/src/types/api.ts`
- `CursorPaginationMetaSchema` Zod schema in `packages/shared/src/schemas/response.ts`
- `cursorEnvelope(itemSchema)` OpenAPI envelope helper in `packages/shared/src/schemas/response.ts`
- `cursorPaginated(c, data, meta)` runtime helper in `apps/api/src/utils/response/index.ts`

#### Scenario: Cursor response shape

- **WHEN** a cursor-based query completes successfully
- **THEN** the response body is:
  ```json
  { "success": true, "data": [...], "meta": { "requestId": "...", "cursor": { "nextCursor": "eyJ...", "hasMore": true } } }
  ```

#### Scenario: Offset response shape (unchanged)

- **WHEN** an offset-based query completes successfully
- **THEN** the response body is:
  ```json
  { "success": true, "data": [...], "meta": { "requestId": "...", "pagination": { "page": 1, "perPage": 20, "total": 1234, "totalPages": 62 } } }
  ```

---

### Requirement: OpenAPI documentation for recipe list routes

The `GET /recipes` route handler SHALL include typed OpenAPI response schemas via `describeRoute()`.
Because a single status code (200) can return two different meta shapes (cursor vs offset), the
system SHALL document the cursor envelope as the primary response schema and describe the offset
variant in the endpoint description text.

The implementation SHALL:
- Use `resolver(cursorEnvelope(FeedRecipeOutputSchema))` for the 200 response
- Document `cursor` as an optional query parameter in `describeRoute({ parameters: [...] })`
- Note in the endpoint description that `meta.pagination` replaces `meta.cursor` when offset
  pagination is active (i.e., when `cursor` param is absent or `sortBy` is incompatible)
- If `hono-openapi` v1.3.0+ supports `oneOf` response discriminators, use a discriminated union
  on `meta.cursor` vs `meta.pagination` instead of the prose-based approach

#### Scenario: OpenAPI spec includes cursor response schema

- **WHEN** `GET /api/v1/openapi.json` is fetched after the change
- **THEN** the `GET /recipes` endpoint has a documented 200 response with the cursor envelope schema
- **AND** the `cursor` query parameter is documented
- **AND** the endpoint description mentions offset pagination as an alternative

#### Scenario: OpenAPI coverage test passes

- **WHEN** `make test-api` runs
- **THEN** the OpenAPI introspection coverage test passes (all routes documented, no orphan tags)

---

### Requirement: All new code covered by tests

Every new function and code path SHALL be covered by tests with at least 80% line coverage.
New test files SHALL be created for:
- `packages/shared/src/utils/cursor_test.ts` — cursor encode/decode unit tests
- `packages/shared/src/schemas/response_test.ts` — cursor envelope schema tests (if not already covered)
- `apps/api/src/modules/recipe/model_test.ts` — cursor query tests (if not already covered, or update existing)
- `apps/api/src/modules/recipe/service_test.ts` — cursor/offset routing tests
- `apps/api/src/modules/recipe/index_test.ts` — route handler cursor mode tests

Existing tests SHALL continue to pass — offset pagination behavior is unchanged.

#### Scenario: All tests pass

- **WHEN** `make test` runs
- **THEN** all tests pass, including new cursor pagination tests

#### Scenario: TypeScript compiles

- **WHEN** `make check` runs
- **THEN** no type errors exist

#### Scenario: Linting passes

- **WHEN** `make lint` runs
- **THEN** no lint errors exist

---

### Requirement: Docblocks on all new public functions

Every new exported function, type, and schema SHALL have a JSDoc docblock describing its purpose,
parameters, and return value. Existing undocumented functions touched by this change SHALL
receive docblocks where missing.

#### Scenario: All new exported functions have docblocks

- **WHEN** code is reviewed
- **THEN** `encodeCursor`, `decodeCursor`, `CursorPaginationMeta`, `CursorPaginationMetaSchema`,
  `cursorEnvelope`, `cursorPaginated`, `findCursor` all have docblocks
