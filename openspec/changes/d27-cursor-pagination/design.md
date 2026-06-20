## Context

The BrewForm API currently paginates all list endpoints using offset-based pagination (`page` / `perPage`). The recipe `findMany()` function in `apps/api/src/modules/recipe/model.ts:270` executes `db.query.recipes.findMany({ where, orderBy, limit, offset })` alongside a separate `SELECT count(*)`. This works for small datasets but degrades as `OFFSET` grows: Postgres must scan and discard all rows before the offset before returning the requested rows.

Cursor-based pagination uses a stable sort column (or composite) as a "bookmark" — the client passes the last-seen value and the database seeks directly to that position via an index scan, avoiding offset entirely.

Existing infrastructure:
- `PaginationMetaSchema` / `PaginatedEnvelope` in shared schemas — offset-only
- `paginated()` helper in API response utils — offset-only
- `PaginationSchema` (`{ page, perPage }`) used by routes for query validation
- `RecipeFilterSchema` has `page`, `perPage`, `sortBy`, `sortOrder` — no cursor param
- Badge service uses ad-hoc `gt(id, lastId)` keyset pagination (not reusable)

This design is scoped to **recipe list endpoints only** (`GET /recipes`, `GET /recipes/starred`, `GET /feed/following`). Comments already use client-side pagination via `CommentSection.tsx` and are out of scope.

## Goals / Non-Goals

**Goals:**
- Add cursor-based pagination to recipe list endpoints as an opt-in alternative to offset
- Maintain full backward compatibility — existing `page`/`perPage` callers unaffected
- Add `(createdAt DESC, id)` composite index for efficient cursor scans
- Provide clean separation between cursor and offset response meta shapes
- Support `sortBy=createdAt` with both `asc`/`desc` directions
- Gracefully fall back to offset pagination when `sortBy` is `likeCount` or `rating` (mutable columns with unstable sort order)

**Non-Goals:**
- Bidirectional pagination (`before` cursors in addition to `after`)
- Cursor pagination for comments, users, vendors, equipment, or other list endpoints (those can adopt the pattern later)
- Frontend "Load More" / infinite scroll implementation (API ships first, frontend follows)
- Cursor pagination with mutable sort columns (`likeCount`, `rating`, `commentCount`)
- Removing offset pagination entirely (admin pages, small datasets still use it)
- Generic/reusable cursor SDK — the cursor utility is recipe-scoped for now

## Decisions

### 1. Cursor format: base64-encoded JSON `{ createdAt, id }`

**Choice:** Encode `{ createdAt: string (ISO 8601), id: string (UUID) }` via `JSON.stringify` → `btoa`.

**Rationale:**
- `id` is a UUIDv4 (random), not time-ordered — it acts as a deterministic tiebreaker for records with identical `createdAt` timestamps.
- Base64 keeps the cursor opaque, preventing clients from depending on internal structure.
- ISO 8601 strings serialize cleanly and survive round-trip through JSON/btoa.
- `btoa`/`atob` are globally available in Deno (no dependencies).

**Alternative considered:** HMAC-signed cursor to prevent tampering. Rejected — cursors are opaque bookmarks, not authorization tokens. Tampering with a cursor cannot escalate permissions; at worst it returns unexpected results or an invalid-cursor error.

### 2. Dual-mode pagination (cursor OR offset, not both)

**Choice:** Accept either `?cursor=` OR `?page=&perPage=` — not both simultaneously.
When both are present, cursor takes precedence and `page` is silently ignored with a debug log.

**Routing logic in `listRecipes()`:**
```
if cursor is present:
  → validate cursor format
  → if sortBy !== 'createdAt' → fall back to offset (cursor incompatible with mutable sorts)
  → execute cursor-based query
  → return { data, meta: { cursor: { nextCursor, hasMore } } }
else:
  → execute existing offset-based findMany()
  → return { data, meta: { pagination: { page, perPage, total, totalPages } } }
```

**Rationale:** This keeps both code paths clean without cross-contamination. The route handler chooses the response envelope (`cursorPaginated()` vs `paginated()`) based on which mode was used. Cursor takes precedence when both params are present because it's the more specific/more efficient option.

### 3. Cursor WHERE clause: composite row-value comparison via Drizzle

**Choice:** Use Drizzle's `or()` + `and()` + `lt()` (or `gt()` for ASC) to implement `(createdAt, id) < (cursorCreatedAt, cursorId)`. The composite WHERE condition is passed directly as the `where` parameter to `db.query.recipes.findMany()`, matching the existing codebase pattern where imported SQL operators are already used in the relational API.

Per Drizzle's cursor-pagination guide:
```typescript
// For DESC order (newest first, getting older pages):
db.query.recipes.findMany({
  where: and(
    existingWhere,                                        // deletedAt IS NULL, visibility, etc.
    or(
      lt(recipes.createdAt, cursor.createdAt),
      and(eq(recipes.createdAt, cursor.createdAt), lt(recipes.id, cursor.id)),
    ),
  ),
  orderBy: [desc(recipes.createdAt), desc(recipes.id)],   // composite ordering
  limit: perPage + 1,
  with: { author: { columns: { id: true, username: true, displayName: true } } },
});

// For ASC order (oldest first, getting newer pages):
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

This is equivalent to `(created_at, id) < ($1, $2)` in raw SQL — Postgres can use a composite index on `(createdAt DESC, id DESC)` for both directions.

**Alternative considered:** Using `db.select()` (SQL-like API) instead of `db.query.recipes.findMany()` (relational API). Rejected because `findMany` supports `with` for eager-loading relations (e.g., `author`), which all recipe list endpoints require. Switching to `db.select()` would lose relation loading or require manual joins.

### 4. Index: `recipe_created_at_id_idx` on `(createdAt DESC, id)`

**Choice:** A single composite index with both columns in DESC order.

**Rationale:**
- Matches the `ORDER BY createdAt DESC, id DESC` (most common: newest-first feed).
- Postgres can scan this index backward for ASC queries, so a single index covers both directions.
- The existing `recipe_visibility_created_idx` on `(visibility, createdAt)` is already used for filtered queries; the new index is additive, not a replacement.
- The `visibility` column is not included because it's a high-cardinality filter applied via `eq(visibility, 'public')` — Postgres applies it as a filter on the index scan result, not as a leading index column.

**Naming convention:** Follows existing pattern `table_column1_column2_idx` (see `db-indexes` spec).

### 5. Response envelope: separate cursor meta shape

**Choice:** Add `CursorPaginationMeta` alongside existing `PaginationMeta`, with distinct envelope helpers.

```typescript
// New shared type (cursor mode):
interface CursorPaginationMeta {
  nextCursor: string | null; // null when no more pages
  hasMore: boolean;
  total?: number; // optional — computed only when explicitly requested
}

// New shared schema (for OpenAPI):
const CursorPaginationMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  total: z.number().int().min(0).optional(),
});

// New envelope schema:
function cursorEnvelope<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    meta: z.object({
      requestId: z.string(),
      cursor: CursorPaginationMetaSchema,
    }),
  });
}
```

**Response shape:**
```json
// Cursor mode:
{ "success": true, "data": [...], "meta": { "requestId": "...", "cursor": { "nextCursor": "eyJ...", "hasMore": true } } }

// Offset mode (unchanged):
{ "success": true, "data": [...], "meta": { "requestId": "...", "pagination": { "page": 1, "perPage": 20, "total": 1234, "totalPages": 62 } } }
```

**Key design:** `meta.pagination` vs `meta.cursor` — these are sibling keys under `meta`, never both present. Consumers check `meta.cursor` to determine mode.

**Rationale:** Using different keys (`pagination` vs `cursor`) avoids union type complexity and makes the mode explicit in the response shape. The frontend type system can discriminate on the presence of each key.

### 6. `total` count: optional in cursor mode

**Choice:** Do NOT compute `SELECT count(*)` by default in cursor-based queries. Allow opt-in via `?includeTotal=true`.

**Rationale:** `SELECT count(*)` on large tables is expensive and defeats a key benefit of cursor pagination (avoiding full scans). For feed/explore UIs, `hasMore` is sufficient — the user doesn't need to know total count. Admin pages that need totals use offset pagination.

### 7. `limit + 1` detection pattern

**Choice:** Always fetch `perPage + 1` rows in cursor mode. If result length > `perPage`, set `hasMore = true` and slice to `perPage`. Encode the cursor from the last item in the sliced result.

```typescript
const rows = await cursorQuery(limit + 1);
const hasMore = rows.length > limit;
const data = rows.slice(0, limit);
const nextCursor = hasMore ? encodeCursor({ createdAt: data[data.length - 1].createdAt, id: data[data.length - 1].id }) : null;
```

This is standard practice and avoids a second query.

### 8. Cursor validation

**Choice:** The cursor string is validated at decode time. If `JSON.parse(atob(cursor))` throws or the resulting object doesn't have valid `createdAt` and `id` fields, return a 400 error: `INVALID_CURSOR`.

The `cursor` param in `RecipeFilterSchema` is `z.string().optional()` — raw validation only checks for string type. Full structural validation happens in the service layer (decode → try/catch → throw ValidationError).

### 9. Feed route validation: local schema instead of PaginationSchema

**Choice:** The `GET /feed/following` route switches from `zValidator('query', PaginationSchema)` to a local inline schema that includes `cursor`:

```typescript
zValidator('query', z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  perPage: z.coerce.number().int().positive().max(100).default(20).optional(),
  cursor: z.string().optional(),
})),
```

**Rationale:** `PaginationSchema` is shared across 10 endpoints (setups, vendors, beans, comments, equipment, etc.). Adding `cursor` to `PaginationSchema` would expose it to all those endpoints, which is out of scope and could confuse consumers. A local inline schema keeps cursor scoped to the feed endpoint.

### 10. Starred recipes: offset-only for this change

**Choice:** The `GET /recipes/starred` route remains offset-only. If a `cursor` param is sent, it is silently ignored and offset pagination is used with a debug log.

**Rationale:** `findStarred()` has a separate inline offset implementation with a favourites subquery JOIN. Adding cursor pagination requires refactoring the subquery into cursor-compatible form. This is deferred to a follow-up change. The `RecipeFilterSchema` already includes `cursor` (added by this change), so the starred route simply ignores it in the service layer.

### 11. OpenAPI dual-mode response documentation

**Choice:** Document the cursor envelope as the primary 200 response schema and describe the offset variant in the endpoint description text. If `hono-openapi` v1.3.0+ supports `oneOf` response discriminators, use a discriminated union on `meta.cursor` vs `meta.pagination`.

**Rationale:** A single OpenAPI status code (200) cannot have two different response bodies without using `oneOf`. Since `oneOf` support varies by tooling, the prose-based approach is the safest default. The coverage test only requires that the route is documented — it does not require exhaustive response shape enumeration.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **Cursor-based pagination only works with `sortBy=createdAt`** — `likeCount` and `rating` are mutable and produce unstable cursors. | Document this limitation. Fall back to offset pagination when `sortBy !== 'createdAt'` and cursor is present. Log a warning so we can monitor usage patterns. |
| **Composite index migration on a live table** — `CREATE INDEX` on large tables can lock writes. | Use `CONCURRENTLY` if Drizzle supports it, or schedule migration during low-traffic window. `make db-generate` produces the SQL; review before applying. |
| **UUIDv4 tiebreaker may not be perfectly ordered** — two records with same `createdAt` could be ordered by UUID (random). This gives deterministic but not chronologically meaningful order for same-timestamp items. | This is inherent to UUIDv4. It's acceptable because same-`createdAt` items are rare and the tiebreaker only ensures no items are skipped/duplicated across pages — not that they appear in a specific sub-order. |
| **Backward compatibility: existing clients use `page`/`perPage`** — response shape changes if they accidentally send a `cursor` param. | `cursor` is opt-in — it's a new query parameter. Existing callers don't send it, so they get the unchanged offset response. |
| **`btoa`/`atob` not available in some Deno runtimes** | Both are globally available in Deno ≥1.30 (API runs on Deno 2.x). Verified in Deno's Web API compatibility. |

## Migration Plan

1. **Create composite index** via `make db-generate && make db-migrate` (Phase 0 — prerequisite).
2. **Deploy API** — both offset and cursor modes active. Existing clients unaffected.
3. **Update frontend** in a follow-up PR/change — `RecipeListView` adopts cursor-based "Load More" for `source='all'` and `source='starred'` pages.
4. **Monitor** — watch for cursor usage, `sortBy` fallback frequency, and performance metrics.
5. **No rollback needed** — cursor is a new, additive parameter. Removing it reverts to offset-only without breaking anything.

## Open Questions

- Should we add cursor pagination to the feed endpoint (`GET /feed/following`) in this change, or defer to follow-up? The feed currently delegates to `recipeModel.findMany()` — same query path. **Decision: Include feed in this change** since it uses the same `findMany()` path and benefits equally.
- Should `total` count be opt-out or opt-in? **Decision: Opt-in via `?includeTotal=true`** — keeps the default path fast for feed/explore UIs.
