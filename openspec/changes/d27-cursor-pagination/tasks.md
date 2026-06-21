## 1. Database: Composite Index

- [x] 1.1 Add `recipe_created_at_id_idx` composite index on `recipes(createdAt DESC, id)` in `packages/db/src/schema.ts` with JSDoc docblock
- [x] 1.2 Run `make db-generate` to auto-generate migration SQL from the Drizzle schema (do NOT manually edit SQL files — per AGENTS.md, manual SQL edits break Drizzle's hash-based migration tracking)
- [x] 1.3 Run `make db-migrate` to apply the index migration
- [x] 1.4 Add test assertion for `recipe_created_at_id_idx` in `packages/db/src/schema-indexes.test.ts` (17 existing index assertions + 1 new = 18)
- [ ] 1.5 Verify with `EXPLAIN ANALYZE` that cursor query uses the new index (not a sequential scan)

## 2. Shared: Cursor Utility

- [x] 2.1 Create `packages/shared/src/utils/cursor.ts` with `PaginationCursor` interface, `encodeCursor()`, and `decodeCursor()` with JSDoc docblocks
- [x] 2.2 Create `packages/shared/src/utils/cursor_test.ts` with unit tests covering encode, decode, empty string, tampered base64, invalid JSON, missing fields
- [x] 2.3 Export cursor utility from `packages/shared/src/utils/index.ts` barrel file

## 3. Shared: Types and Schemas

- [x] 3.1 Add `CursorPaginationMeta` interface to `packages/shared/src/types/api.ts` with JSDoc docblock
- [x] 3.2 Add `CursorPaginationMetaSchema` Zod schema to `packages/shared/src/schemas/response.ts` with JSDoc docblock
- [x] 3.3 Add `cursorEnvelope(itemSchema)` OpenAPI envelope function to `packages/shared/src/schemas/response.ts` with JSDoc docblock
- [x] 3.4 Add test for `CursorPaginationMetaSchema` in `packages/shared/src/schemas/response_test.ts` (create if not exists)
- [x] 3.5 Add optional `cursor` and `includeTotal` fields to `RecipeFilterSchema` in `packages/shared/src/schemas/recipe.ts`

## 4. API: Response Helpers

- [x] 4.1 Add `cursorPaginated(c, data, meta)` runtime helper to `apps/api/src/utils/response/index.ts` with JSDoc docblock
- [x] 4.2 Add `invalidCursor(c)` error helper returning `{ code: 'INVALID_CURSOR', status: 400 }`

## 5. API: Recipe Model — Cursor Query

- [x] 5.1 Add `findCursor(where, cursor, perPage, sortOrder)` function to `apps/api/src/modules/recipe/model.ts` with JSDoc docblock
- [x] 5.2 Implement cursor WHERE clauses using `db.query.recipes.findMany()` with imported SQL operators (`or`, `and`, `lt`, `gt`, `eq`) and `orderBy` array syntax
- [x] 5.3 Implement DESC cursor WHERE clause using `or(lt, and(eq, lt))` per design.md
- [x] 5.4 Implement ASC cursor WHERE clause using `or(gt, and(eq, gt))` per design.md
- [x] 5.5 Implement `limit + 1` pattern with `hasMore` detection: `rows.length > perPage` indicates more pages
- [x] 5.6 Add optional `includeTotal` parameter that conditionally runs `SELECT count(*)`
- [x] 5.7 Include author relation in cursor query (same `with: { author: ... }` as `findMany`)
- [x] 5.8 Update `getFeed(authorIds, page, perPage)` to accept optional `cursor` param and dispatch to `findCursor()` when cursor is present
- [x] 5.9 Add unit tests for `findCursor` in `apps/api/src/modules/recipe/model_test.ts` covering DESC, ASC, empty result, hasMore detection, includeTotal, includeTotal with empty result
- [x] 5.10 Add unit tests for `getFeed` with cursor in `apps/api/src/modules/recipe/model_test.ts`

## 6. API: Recipe Service — Routing Logic

- [x] 6.1 Update `listRecipes()` in `apps/api/src/modules/recipe/service.ts` to accept cursor param and route to cursor or offset query
- [x] 6.2 Implement cursor validation: try/catch `decodeCursor`, throw `ValidationError('INVALID_CURSOR')` on failure
- [x] 6.3 Implement sort fallback: if `cursor` present but `sortBy !== 'createdAt'`, log warning and fall back to offset
- [x] 6.4 Implement cursor+page mutual exclusion: if both present, cursor takes precedence, log debug message
- [x] 6.5 Return discriminated result `{ data, meta: { cursor: ... } | { pagination: ... } }`
- [x] 6.6 Update `follow/service.getFeed()` to accept cursor param and pass through to `recipeModel.getFeed()`
- [x] 6.7 Handle starred route cursor: silently log debug and fall back to offset when cursor provided to `/starred`
- [x] 6.8 Add service-level tests in `apps/api/src/modules/recipe/service_test.ts` covering: cursor/offset routing, invalid cursor, sort fallback, cursor+page both provided (cursor wins), ASC cursor from DESC response, DESC cursor from ASC response

## 7. API: Recipe Routes

- [x] 7.1 Update `GET /` route in `apps/api/src/modules/recipe/index.ts` to pass cursor to service and use `cursorPaginated()` when cursor mode is active
- [x] 7.2 Update `GET /starred` route: keep offset-only, silently ignore cursor param with debug log (defer cursor support for starred to follow-up change)
- [x] 7.3 Replace `zValidator('query', PaginationSchema)` on `GET /feed/following` in `apps/api/src/modules/follow/index.ts` with a local inline schema that includes `cursor: z.string().optional()`
- [x] 7.4 Update `GET /feed/following` route handler to pass cursor to service and use `cursorPaginated()` when cursor mode is active
- [x] 7.5 Add route-level tests in `apps/api/src/modules/recipe/index_test.ts` for cursor mode responses (valid cursor, invalid cursor, cursor+page both, empty cursor result)
- [x] 7.6 Add route-level tests in `apps/api/src/modules/follow/index_test.ts` for feed cursor mode

## 8. OpenAPI Documentation

- [x] 8.1 Add `resolver(cursorEnvelope(FeedRecipeOutputSchema))` to `GET /` route's `describeRoute()` for the 200 response
- [x] 8.2 Add note in endpoint description that `meta.pagination` replaces `meta.cursor` when offset pagination is active
- [x] 8.3 Document `cursor` query parameter in `describeRoute()` parameters
- [x] 8.4 Run OpenAPI coverage test: `make test-specific filter=routes/openapi.coverage.test.ts` and fix any failures

## 9. Format, Lint, Type-Check, Tests

- [x] 9.1 Run `make fmt` — auto-format all changed files
- [x] 9.2 Run `make lint` — fix any lint errors
- [x] 9.3 Run `make check` — fix any TypeScript errors
- [x] 9.4 Run `make test` — ensure all tests pass (new + existing) — equivalent per-suite runs pass; `make test` itself is blocked by an unhealthy `garage` dependency in `make up`
- [x] 9.5 Verify test coverage ≥80% for all new code paths

## 10. Logging

- [x] 10.1 Add `log.warn({ sortBy }, 'Cursor pagination incompatible with sortBy, falling back to offset')` on sort fallback
- [x] 10.2 Add `log.debug('Both cursor and page provided, using cursor pagination')` on mutual exclusion
- [x] 10.3 Add `log.debug('Cursor provided but starred recipes use offset pagination, using offset')` on starred cursor fallback
- [x] 10.4 Add `log.debug({ recipeId: cursor.id }, 'findCursor started')` entry log in `findCursor()`
- [x] 10.5 Add `log.debug({}, 'findCursor completed')` exit log in `findCursor()`
