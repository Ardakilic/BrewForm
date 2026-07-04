# D27 — Migrate to Cursor-Based Pagination

> **Status (2026-07-04): ✅ Done** — `utils/cursor.ts`; `RecipeFilterSchema.cursor` (:154); service cursor path + `model.findCursor`. Openspec change `d27-cursor-pagination` is complete — recommend archiving it.

**Severity:** Low  
**Status:** Implemented  
**Files:** `packages/shared/src/schemas/recipe.ts`, `apps/api/src/modules/recipe/service.ts`, all paginated API endpoints

---

## Issue Description

All paginated API endpoints currently use offset-based pagination (`page` + `perPage`). This approach has two well-known problems:

1. **Performance degradation at offset:** `OFFSET 10000 LIMIT 20` requires the DB to scan and discard 10,000 rows before returning results.
2. **Inconsistent results:** If data is inserted or deleted between page requests, items can be skipped or duplicated.

The `RecipeFilterSchema` currently defines:
```typescript
page: z.coerce.number().int().positive().default(1),
perPage: z.coerce.number().int().positive().max(100).default(20),
```

---

## Impact

- **Performance:** Homepage feed, explore page, and search results slow down as recipe count grows.
- **User experience:** Pagination "jumps" when new recipes are added between page loads.
- **Scalability:** Current approach works for <10K records but degrades beyond that.

---

## Root Cause

Offset pagination was the initial implementation — simpler to build and sufficient for early-stage data volumes. Cursor-based pagination requires more infrastructure (cursor encoding, stable sort key).

---

## Affected Files

| File | Description |
|------|-------------|
| `packages/shared/src/schemas/recipe.ts` | `RecipeFilterSchema` — add `cursor` param |
| `packages/shared/src/utils/cursor.ts` | New utility for cursor encoding/decoding |
| `apps/api/src/modules/recipe/service.ts` | `listRecipes()` — add cursor-based query path |
| `apps/api/src/modules/recipe/index.ts` | Route handler — pass cursor to service |
| `apps/web/src/...` | Frontend consumers — adopt cursor-based loading |

---

## Fix Approach

### Technical Design

**Cursor format:** Base64-encoded JSON `{ createdAt: string, id: string }` — opaque to clients.

**API contract:**
- Add optional `cursor` query parameter alongside existing `page` param (backward compatible).
- Response meta adds `nextCursor: string | null` and `hasMore: boolean`.
- If `cursor` is provided, use cursor-based query. If not, fall back to offset.

**Database query:**
```sql
-- Cursor-based (DESC order: < because we want rows older than the cursor):
WHERE (created_at, id) < ($cursorCreatedAt, $cursorId)
  AND visibility = 'public'
ORDER BY created_at DESC, id DESC
LIMIT 21  -- fetch one extra to determine hasMore
```

**Frontend:** Infinite scroll or "Load More" button using `nextCursor`.

### Drizzle ORM Reference

From Context7 (`/drizzle-team/drizzle-orm-docs`):

```typescript
import { and, lt, or, eq, desc } from 'drizzle-orm';

// Cursor-based query (DESC order: lt because we want rows older than the cursor)
const results = await db.select()
  .from(recipes)
  .where(
    and(
      eq(recipes.visibility, 'public'),
      or(
        lt(recipes.createdAt, cursorCreatedAt),
        and(eq(recipes.createdAt, cursorCreatedAt), lt(recipes.id, cursorId)),
      ),
    ),
  )
  .orderBy(desc(recipes.createdAt), desc(recipes.id))
  .limit(limit + 1); // +1 to detect hasMore
```

---

## Implementation Steps

### Phase 1: Shared Utility

1. **Create** `packages/shared/src/utils/cursor.ts`:
   ```typescript
   export interface PaginationCursor {
     createdAt: string; // ISO date
     id: string;
   }

   export function encodeCursor(data: PaginationCursor): string {
     return btoa(JSON.stringify(data));
   }

   export function decodeCursor(cursor: string): PaginationCursor {
     return JSON.parse(atob(cursor));
   }
   ```

### Phase 2: Schema Update

2. **Read** `packages/shared/src/schemas/recipe.ts` — `RecipeFilterSchema`.
3. **Add** `cursor` parameter:
   ```typescript
   cursor: z.string().optional(),
   ```
4. **Keep** `page` and `perPage` for backward compatibility (admin pages, small datasets).

### Phase 3: Service Layer

5. **Read** `apps/api/src/modules/recipe/service.ts` — `listRecipes()`.
6. **Add** cursor-based query path:
   - If `cursor` is provided, decode it and use `(createdAt, id) < (cursorCreatedAt, cursorId)` (DESC order: < to get older rows).
   - If not provided, use existing offset logic.
7. **Fetch** `limit + 1` rows to determine `hasMore`.
8. **Return** `{ data, meta: { nextCursor, hasMore, total? } }`.

### Phase 4: Route Handler

9. **Read** `apps/api/src/modules/recipe/index.ts` — `GET /` route.
10. **Pass** `cursor` to service.
11. **Return** `nextCursor` in response meta.

### Phase 5: Frontend (Optional — Can Be Separate PR)

12. **Update** recipe list components to use cursor-based loading.
13. **Implement** "Load More" button or infinite scroll.
14. **Keep** offset pagination for admin pages (small datasets).

### Phase 6: Verification

15. **Run** `make check` — type-check all workspaces.
16. **Run** `make test` — all tests pass.
17. **Test** with `EXPLAIN ANALYZE` to verify index usage.

---

## API Response Format

```json
{
  "data": [...],
  "meta": {
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA1LTI5...",
    "hasMore": true,
    "total": 1234
  }
}
```

---

## Testing Strategy

| Test | Expected |
|------|----------|
| `GET /api/v1/recipes?page=1&perPage=20` | Works (backward compatible) |
| `GET /api/v1/recipes?cursor=...` | Returns next page via cursor |
| `GET /api/v1/recipes` (no params) | Returns first page with `nextCursor` |
| Empty cursor result | `hasMore: false`, `nextCursor: null` |
| Concurrent inserts between pages | No skipped or duplicated items |
| Performance at offset 10000 | Cursor query is significantly faster |

---

## Risk Assessment

**Risk: Low-Medium**

- Backward compatible — existing `page` param still works.
- Cursor-based query requires composite index on `(createdAt, id)` — verify index exists or add it.
- Frontend changes can be deferred (API supports both modes).
- Slightly more complex service logic.

---

## Dependencies

- Depends on D23 (composite indexes) for optimal performance — the `(createdAt, id)` composite index is needed.
- Frontend changes are optional for this PR — API layer can ship first.
