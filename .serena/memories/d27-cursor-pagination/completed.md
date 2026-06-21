Cursor pagination implementation (change `d27-cursor-pagination`) is complete and verified.

Completed work:
- Added `recipe_created_at_id_idx` composite index on `recipes(createdAt DESC, id)` in `packages/db/src/schema.ts`, generated/verified migration `0007_moaning_hellfire_club.sql`, and ran `make db-migrate`.
- Added `packages/shared/src/utils/cursor.ts` with `encodeCursor`/`decodeCursor` and unit tests.
- Added `CursorPaginationMeta` type, `CursorPaginationMetaSchema`, and `cursorEnvelope` helper; extended `RecipeFilterSchema` with `cursor` and `includeTotal`.
- Added `cursorPaginated()` and `invalidCursor()` response helpers in the API.
- Implemented `findCursor()` in `apps/api/src/modules/recipe/model.ts` with DESC/ASC keyset logic, `limit + 1` hasMore detection, optional `includeTotal`, and soft-delete filtering.
- Updated `getFeed()` in recipe model to dispatch to cursor mode.
- Updated `listRecipes()` in recipe service for cursor/offset routing, invalid cursor handling, sort fallback, and mutual exclusion logging.
- Updated `GET /api/v1/recipes` and `GET /api/v1/follows/feed/following` routes with cursor support and OpenAPI documentation; `GET /api/v1/recipes/starred` remains offset-only with a debug log when a cursor is passed.
- Added integration tests: `model.cursor.test.ts` and `service.cursor.test.ts`.
- Updated `tasks.md` to mark completed tasks and created `pr_description.md` (root file, gitignored by project convention).

Verification results:
- `make fmt` ✅
- `make lint` ✅
- `make check` ✅
- API tests: 78 passed (766 steps) ✅
- DB tests: 14 passed (100 steps) ✅
- Web tests: 814 passed ✅
- Shared tests: 103 passed (512 steps) ✅
- OpenAPI coverage test: 19 steps passed ✅
- New cursor tests (model + service + shared utilities/schemas): 62 steps passed ✅

Note: `make test` directly still fails because `make up` cannot start the `brewform-garage-1` dependency in this environment. All test suites pass when run inside the already-up app container with `--no-deps`, which is what `make test` does internally.