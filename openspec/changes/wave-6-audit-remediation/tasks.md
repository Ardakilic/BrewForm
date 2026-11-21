<!--
How to use this task list
- Work strictly top to bottom. Each group depends only on the groups above it (design.md → Decisions → Cross-track integration explains the order). Commit at least once per group.
- Every task is a direct instruction: it names the files, tests and commands. Do exactly what it says. No task is optional, and no task waits for work outside this list; anything out of scope is listed under proposal.md → Non-Goals.
- Where a task says "failing test first", write the test, run it, see it fail for the stated reason, then implement until it passes.
- Group titles carry provenance only: (tN) is the research track that drafted the work (evidence in audit/<track>.md), and "refine" marks work added from the user's 2026-11-19 decisions (evidence in audit/_refine/<topic>.md, decisions in design.md → "Resolved by the user (2026-11-19)"). A task that mentions a track ("t2's policy table", "t7's maxLength") points at work already done in an earlier group of this list.
- AGENTS.md applies to every task: model → service → index modules and no `drizzle-orm` import in services; `describeRoute()` plus `zValidator` on every route; entry/exit debug logs with ids only (no PII, tokens or note text); every user-visible string in both `en.json` and `tr.json`; `isNull(deletedAt)` for soft deletes; schema changes only in `packages/db/src/schema.ts` followed by `make db-generate` (never hand-edit generated SQL; the only hand-written migration SQL is the `--custom` `enable_pg_trgm` shell in group 10); run `make fmt` after each batch of edits.
- Run every make target from the repository root. Check each test suite's exit code separately (never `make test | tail`). DB-backed tests need `make test-db-provision` once after `make up`.
- All work lands on the branch created in task 1.1 and ships as ONE pull request (group 29).
-->

## 1. OpenSpec housekeeping and branch setup

- [x] 1.1 Create the feature branch `wave-6-audit-remediation` from an up-to-date `main` (`git switch -c wave-6-audit-remediation`). Every later commit lands on this branch, and the change ends with ONE pull request (group 29).
- [x] 1.2 Make the first commit: add `openspec/changes/wave-6-audit-remediation/` (proposal, design, specs, tasks, audit notes) and `plans/AUDIT-2026-11-18.md` (currently untracked; ROADMAP, the docs and this change link to it).
- [x] 1.3 Archive the stale Deno-removal change without applying its deltas: run `openspec archive remove-deno-node24-pnpm --skip-specs -y`, confirm the folder moved to `openspec/changes/archive/<today>-remove-deno-node24-pnpm/`, and confirm `git status openspec/specs` shows no change (its Node 24 / memory-only deltas must never reach the main specs). This is the first change to `openspec/` in wave 6 and must run before any other track's tasks.
- [x] 1.4 Add a `context:` block to `openspec/config.yaml` (stack: Node 26, pnpm 12 workspaces, Hono, Drizzle/postgres-js, React 19 + react-router data router, Vite, Tailwind 4, base-ui, Vitest, Biome; key AGENTS.md rules; the first-line SHALL/MUST quirk; the no all-REMOVED-delta rule)
- [x] 1.5 Confirm that `openspec/changes/wave-6-audit-remediation/specs/text-sanitization/spec.md` (added at integration from the MODIFIED deltas drafted in `audit/t8-docs-specs.md` §6; owner t8) matches `apps/api/src/utils/sanitize.test.ts`: test API imported from `vitest`, no test-options object passed to `describe`. Change the test file only if it has drifted.
- [x] 1.6 Confirm the integrated spec deltas already reflect t4b's workflow changes (fixed at integration): `specs/doc-drift-check` runs the `doc-drift` job in `.github/workflows/ci.yml` (`pr.yml` is deleted), the `pnpm-workspace` scenario names the `quality` job of `ci.yml`, and `node-runtime` defers the container invocation (`exec node src/main.ts`, `node --import tsx` fallback) to `container-deployment` without referencing `release.yml`. The `doc-drift` job itself is added in task 28.6, and it is listed in `publish.needs`.
- [x] 1.7 Group check: from the repository root run `openspec validate wave-6-audit-remediation --strict` (expect "Change 'wave-6-audit-remediation' is valid"), `openspec list` (the change is listed with 0 completed tasks and `remove-deno-node24-pnpm` is gone) and `git status openspec/specs` (no change). Commit the group.

## 2. Foundations: API error mapping and shared Postgres helpers (t3)

- [x] 2.1 Rewrite `apps/api/src/middleware/errorHandler.test.ts` with failing-first unit tests that call `errorHandler` directly: a real `DrizzleQueryError` (import from `drizzle-orm` in the test only) wrapping a `PostgresError`-shaped cause for `23505`, `23503` with an `insert …` and a `delete …` query, `23514`, `22P02` and an unknown code; a bare `PostgresError`; `new HTTPException(400, { message: 'Malformed JSON in request body' })`, an `HTTPException(429)` and one with a custom `res`; one instance of each `AppError` subclass; each legacy string convention (`FORBIDDEN`, `RECIPE_NOT_FOUND`, `COFFEE_VARIETY_NOT_FOUND`, `ALREADY_FOLLOWING`, `EMAIL_ALREADY_EXISTS`, `VALIDATION_ERROR: Title cannot be empty`) and a plain `new Error('boom')`; assert status, `error.code`, `error.message`, `requestId`, and that neither body nor captured logger calls contain the parameter values (delete the tautological tests at `:17-72`)
- [x] 2.2 Create `apps/api/src/utils/errors.ts` with `AppError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError` (each sets `name`, JSDoc on every export), plus `getPostgresError(err)` (walks `cause` up to 5 levels, structural `name === 'PostgresError'` + 5-char `code`), `isUniqueViolation(err, constraint?)`, `postgresStatementKind(err)` (leading keyword of the wrapper's `query`) and `toLoggableError(err)` (drops `params`/`parameters`/`detail`, strips the `params:` tail from the message); add `apps/api/src/utils/errors.test.ts` covering wrapped, bare, nested-cause and non-Postgres inputs
- [x] 2.3 Update `apps/api/src/middleware/errorHandler.ts`: branch order `HTTPException` → `AppError` → `EQUIPMENT_INCOMPATIBLE` (unchanged) → Postgres via `getPostgresError` (SQLSTATE table from the error-handling spec) → `ZodError` → auth/JWT → legacy string conventions (subsuming the `COFFEE_VARIETY_NOT_FOUND` branch with an identical response, humanizing `X_Y_NOT_FOUND` → `X y not found`) → 500; build every envelope with `c.json`; update the module docblock. Implement the full SQLSTATE table from the modified `error-handling` spec, including the `57014` → 503 `QUERY_TIMEOUT` row that the `advanced-search` capability relies on (t7 adds its service-side catch in task 10.17 and the `QUERY_TIMEOUT` domain-code mapping with its tests in task 10.27).
- [x] 2.4 Logging in `errorHandler.ts`: HTTPException 4xx → `log.warn({ requestId, status, method, path }, 'HTTP exception')`; mapped DB errors → `log.warn({ requestId, pgCode, constraint, table, method, path }, 'Database constraint violation')`; legacy fallbacks → `log.warn({ requestId, domainCode, method, path }, 'Unmapped domain error reached global handler')`; AppError 4xx → `log.debug`; 500s → `log.error({ err: toLoggableError(err), requestId }, 'Unhandled error')`; in non-production return `Database error` instead of a `DrizzleQueryError` message
- [x] 2.5 Add a route-level test `apps/api/src/middleware/errorHandler.route.test.ts` that mounts the real app via `app.request` and posts `{"name":` with `Content-Type: application/json` to `/api/v1/collections` as an authenticated user, asserting `400` / `BAD_REQUEST` / `Malformed JSON in request body`
- [x] 2.6 Add a DB-backed test (`brewform_test`) that inserts the same `user_follow` pair twice through `follow/model.ts#createFollow` behind a minimal Hono route and asserts the HTTP response is `409 CONFLICT` and the log contains no parameter values
- [x] 2.7 Write failing DB-backed tests first: concurrent first rating (`Promise.all` of two `recipeService` rate calls, expect both resolve and one row) in `apps/api/src/modules/recipe/model.test.ts`; re-registration with a soft-deleted user's stored email returns `409` `Email already registered` (through the `23505` mapping of task 2.11 here; task 7.19 moves it to the availability pre-check and the assertion stays the same), and the error-handling "Re-registration conflict does not log the password hash" case reaches the insert through two concurrent registrations with the same new email and a concurrent same-username registration returns one `201` + one `409` in `apps/api/src/modules/auth/index.test.ts`; duplicate collection add via a `DrizzleQueryError`-wrapped `23505` on `collection_item_collection_id_recipe_id_unique` maps to `ALREADY_IN_COLLECTION`, and a unique violation on another constraint does not, in `apps/api/src/modules/collection/service.test.ts`
- [x] 2.8 Change `upsertUserRating` in `apps/api/src/modules/recipe/model.ts` to a single `db.insert(userRecipeRatings).values(...).onConflictDoUpdate({ target: [userRecipeRatings.userId, userRecipeRatings.recipeId], set: { rating, updatedAt: new Date() } })`; update its docblock (remove the select-then-insert rationale)
- [x] 2.9 Replace the manual `err.cause` unwrapping in `apps/api/src/modules/admin/model.ts#throwIfUniqueViolation` with `isUniqueViolation`: map any of `USER_EMAIL_CONSTRAINTS` (`user_email_unique`, `user_email_lower_unique`) to `EMAIL_ALREADY_EXISTS` and any of `USER_USERNAME_CONSTRAINTS` (`user_username_unique`, `user_username_lower_unique`) to `USERNAME_ALREADY_EXISTS`. Define both constants in `apps/api/src/modules/auth/model.ts` here; the `_lower_unique` indexes are created in task 7.15.
- [x] 2.10 Replace the substring sniffing in `apps/api/src/modules/collection/service.ts#addRecipeToCollection` with `isUniqueViolation(err, 'collection_item_collection_id_recipe_id_unique')`
- [x] 2.11 In `apps/api/src/modules/auth` registration (`model.createUser` call path), translate `23505` on any of `USER_EMAIL_CONSTRAINTS` / `USER_USERNAME_CONSTRAINTS` into `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS` using the shared helper. This is the race fallback: task 7.19 makes the `isEmailTaken`/`isUsernameTaken` pre-checks cover soft-deleted rows and compare case-insensitively. Add entry/exit debug logs if missing.
- [x] 2.12 Confirm `grep -rn "includes('unique')\|includes('duplicate')\|\.cause" apps/api/src/modules` returns no unique-violation detection code
- [x] 2.13 Group check: run `make test-db-provision` (once), then `make test-api` and `make check-api`; both pass before moving on.

## 3. Foundations: API env parsing and storage startup (t4b api-env-config)

- [x] 3.1 Add failing cases to `apps/api/src/config/env.test.ts`: (a) `STORAGE_DRIVER=local` with `S3_ENDPOINT=''`, `S3_PUBLIC_URL=''`, `PUBLIC_APP_URL=''` parses and leaves them `undefined`; (b) `APP_PORT=''`, `SMTP_PORT=''`, `UPLOAD_MAX_SIZE_BYTES=''` fall back to `8000`/`1025`/`10485760`; (c) `CACHE_ENABLED=''`, `CACHE_DRIVER=''`, `LOG_FORMAT=''`, `STORAGE_DRIVER=''` fall back to defaults; (d) `JWT_SECRET=''` and `DATABASE_URL='   '` fail naming the key; (e) `STORAGE_DRIVER=s3` with `S3_ENDPOINT=''` fails with `S3_ENDPOINT is required when STORAGE_DRIVER is s3`; (f) `APP_PORT=abc|0|70000`, `SMTP_PORT=70000`, `UPLOAD_MAX_SIZE_BYTES=-1|0` fail; (g) `UPLOAD_DIR='./uploads'` resolves to `path.resolve('./uploads')` and `/app/uploads` stays as is. Run `make test-specific filter=src/config/env.test.ts` and confirm they fail.
- [x] 3.2 In `apps/api/src/config/env.ts`, wrap the object schema in `z.preprocess` that copies the input and drops keys whose value is a string that trims to `''`; keep `envSchema` exported and change `Env` to `z.output<typeof envSchema>`; make `APP_PORT`/`SMTP_PORT` `z.coerce.number().int().min(1).max(65535)`, `UPLOAD_MAX_SIZE_BYTES` `z.coerce.number().int().positive()`, and `UPLOAD_DIR` `z.string().default('./uploads').transform((p) => path.resolve(p))` (import `node:path`). Re-run the env tests until green; run `make check-api`. This lands before t2's and t4a's env changes (tasks 6.3 and 5.29), which build on the same schema.
- [x] 3.3 Add a test that `loadEnv` failure output names the variable but not the value (spy on `console.error`, set `process.env.JWT_SECRET='tooshort'` and `S3_ENDPOINT='not a url'` with `STORAGE_DRIVER=s3`, call `reloadConfig()` in a `try`, restore env in `finally`); adjust `loadEnv` only if the assertion fails.
- [x] 3.4 Update the env comment block in `env.ts` (`UPLOAD_DIR`: "resolved to an absolute path at load; the production image sets /app/uploads") and add a short note that blank values are treated as unset.
- [x] 3.5 Write failing unit tests in `apps/api/src/utils/storage/startup.test.ts` for `verifyStorage(config, fsDeps, log)`, with injected `mkdir`, `writeFile`, `unlink`, `stat` and `access`. The tests cover:
  - It creates a missing directory (`mkdir` with `recursive: true`).
  - It writes and then unlinks `<dir>/.brewform-write-test-<pid>`.
  - It logs info `{ storageDriver: 'local', uploadDir }` and returns `{ storageDriver: 'local', uploadDir, mounted: true }`.
  - When `writeFile` rejects with `EACCES`, and separately with `EROFS`, it throws `StorageStartupError`. The message contains the directory, `uid <n> gid <n>`, the error code, `chown -R 1000:1000` and `make prod-fix-uploads-owner`.
  - When `APP_ENV=production` and `stat(dir).dev === stat(parent).dev`, it warns once and returns `mounted: false`. It never warns outside production.
  - For `s3` it logs `{ storageDriver: 's3', bucket }`, never calls the fs deps and never logs keys.
  - `checkStorageHealth(config, { access })` returns `ok` when `access(W_OK)` resolves after a mounted result, `ephemeral` after a `mounted: false` result, `degraded` when `access` rejects, and `s3` without calling `access`.
- [x] 3.6 Implement `apps/api/src/utils/storage/startup.ts`: `verifyStorage`, `checkStorageHealth`, `StorageStartupError`, a module-level record of the last `mounted` result, and `resetStorageStartupStateForTests()`.
  - Logging: module logger `createLogger('storage-startup')`, entry/exit debug logs, `err` on error logs, no secrets or file contents.
  - Export all of them from `apps/api/src/utils/storage/index.ts`.
  - Run `make test-specific filter=src/utils/storage/startup.test.ts` until green.
- [x] 3.7 Call `verifyStorage` in `startup()` in `apps/api/src/main.ts` before `serve()`.
  - On `StorageStartupError`, run `log.error({ err, uploadDir: config.UPLOAD_DIR, uid: process.getuid?.(), gid: process.getgid?.() }, err.message)` and `process.exit(1)`.
  - Update the startup-sequence JSDoc at the top of `main.ts`.
- [x] 3.8 Simplify `apps/api/src/utils/storage/local.ts` (`save`/`_resolvePath`) and the `/uploads/*` handler in `main.ts` to use `config.UPLOAD_DIR` directly (already absolute) while keeping the traversal guards; extend `apps/api/src/utils/storage/storage.test.ts` with a case that a file saved by the driver is served by `GET /uploads/<file>` from the same directory (use `app.request`).
- [x] 3.9 Group check: run `make test-specific filter=src/config/env.test.ts`, `make test-specific filter=src/utils/storage` and `make check-api`.

## 4. Security: private recipe notes — database, shared schema and API; legacy POST removed (t1, refine D1, OQ3)

- [x] 4.1 Add a failing test file `apps/api/src/routes/recipe-notes-post-removed.test.ts` that mounts the composed `routes` app from `apps/api/src/routes/index.ts` with `app.onError(errorHandler)`, seeds users A and B and A's public recipe R through `@brewform/db`, authenticates with `signAccessToken` Bearer tokens, and cleans up in `afterEach`. Assert that B's `POST /api/v1/recipes/R/notes` with `{ "notes": "x" }` returns 404, that every `recipe_version.personal_notes` of R is byte-identical afterwards, and that no `user_recipe_note` row exists for (B, R). It fails today (200 and an overwrite).
- [x] 4.2 In the same file, assert that B's `POST /:id/notes` on A's `private` recipe returns 404 and writes nothing, and that an anonymous `POST /:id/notes` returns 404 (not 401). After task 4.16 mounts the `recipe-note` router with only GET, PUT and DELETE, the file must still pass (Hono returns 404 for an unmatched method; the app does not use `methodNotAllowed`).
- [x] 4.3 Delete the obsolete `describe('saveNotes')` block in `apps/api/src/modules/recipe/service.test.ts:848-864` and the `POST /:id/notes` block in `apps/api/src/modules/recipe/index.test.ts:906-927`; they are replaced by the removal test (tasks 4.1-4.2) and the `recipe-note` module tests below.
- [x] 4.4 Update `RecipeNotesSchema`'s docblock in `packages/shared/src/schemas/recipe.ts` (now for `PUT /api/v1/recipes/:id/notes`, caller-scoped private notes). Keep `{ notes: string().trim().min(1).max(10000) }`.
- [x] 4.5 Add `RecipeUserNoteOutputSchema` (`{ recipeId: string, notes: string | null, updatedAt: string | null }`) and its inferred type in `packages/shared/src/schemas/responses/recipe-note.ts`. Export it from `packages/shared/src/schemas/responses/index.ts`, add a round-trip test in `responses/recipe-note.test.ts`, and register it in the `cases` array of `responses/output-schema-acceptance.pbt.test.ts`.
- [x] 4.6 Add `userRecipeNotes` (`user_recipe_note`) to `packages/db/src/schema.ts` with columns `id`, `userId`, `recipeId`, `notes` (text not null), `createdAt`, `updatedAt` and `deletedAt`; unique `user_recipe_note_user_id_recipe_id_unique`; index `user_recipe_note_recipe_id_idx`; check `user_recipe_note_notes_length_check` (`char_length(notes) <= 10000`); and a docblock. Add `userRecipeNotesRelations`, and add `many(userRecipeNotes)` to `usersRelations` and `recipesRelations`.
- [x] 4.7 Run `make db-generate`, then `make db-migrate`. Rerun `make db-generate` and assert "No schema changes, nothing to migrate". Commit the generated SQL, snapshot and journal unedited. On a numbering collision with another track, delete the local files and regenerate.
- [x] 4.8 Run `make test-db-provision` to apply the migration to `brewform_test`.
- [x] 4.9 Extend `packages/db/src/schema-columns.test.ts`, `schema-constraints.test.ts` and `schema-indexes.test.ts` to assert the new table's columns, its unique and check constraints, and the `recipe_id` index. Add an assertion that the generated migration SQL contains no statement on `recipe_version.personal_notes`.
- [x] 4.10 Create `apps/api/src/modules/recipe-note/model.ts`:
  - `findRecipeForNotes(recipeId)`: `id`, `authorId`, `visibility`, `isNull(deletedAt)`.
  - `findNote(userId, recipeId)`: `isNull(userRecipeNotes.deletedAt)`.
  - `upsertNote(userId, recipeId, notes)`: `onConflictDoUpdate` on `[userId, recipeId]` setting `notes`, `updatedAt` and `deletedAt: null`.
  - `softDeleteNote(userId, recipeId)`: sets `deletedAt` and `notes: ''`.
  - `softDeleteAllNotesForUser(userId)`.
  - Add JSDoc throughout.
- [x] 4.11 Add `apps/api/src/modules/recipe-note/model.test.ts`: upsert creates, then replaces the same row; soft delete scrubs; revive reuses the row id; `findNote` ignores deleted rows; per-user isolation.
- [x] 4.12 Create `apps/api/src/modules/recipe-note/service.ts`:
  - `getMyNote`, `saveMyNote` and `deleteMyNote(userId, recipeId, isAdmin)`. Each throws `RECIPE_NOT_FOUND` unless the recipe exists, is not deleted and passes `canViewRecipe` imported from `../recipe/service.ts`.
  - `saveMyNote` applies `sanitizeText` and throws `VALIDATION_ERROR: notes` when the result is empty.
  - `deleteAllNotesForUser(userId)`.
  - Entry/exit `log.debug({ userId, recipeId })` and `log.error({ err, userId, recipeId })` with no note text.
  - No `drizzle-orm` imports.

  Throw t3's typed `NotFoundError`/`ValidationError` from `apps/api/src/utils/errors.ts` (task 2.2) rather than new string codes.
- [x] 4.13 Add `apps/api/src/modules/recipe-note/service.test.ts`: cross-user isolation; 404 rules for private, draft, deleted and unknown recipes; sanitization; empty-after-sanitize rejection; admin cannot read another user's note; a log spy proves no note text is logged.
- [x] 4.14 Create `apps/api/src/modules/recipe-note/index.ts` (Hono `<AppEnv>` router) with `GET`, `PUT` and `DELETE /:id/notes` only (no `POST` handler):
  - `authGuard` via a `deps` proxy, as in `recipe/index.ts`.
  - `zValidator('param', z.object({ id: z.uuid() }))`, and `zValidator('json', RecipeNotesSchema, zodValidationHook)` on PUT.
  - `Cache-Control: private, no-store` on every response.
  - Map `RECIPE_NOT_FOUND`→404 and `VALIDATION_ERROR`→400.
- [x] 4.15 Add full `describeRoute()` metadata to the GET, PUT and DELETE notes routes: tag `Recipes`, summary, description, `security`, the `id` parameter, `jsonRequestBody(RecipeNotesSchema)` on PUT, 200 as `resolver(successEnvelope(RecipeUserNoteOutputSchema))`, and 400/401/404 as `resolver(ErrorEnvelopeSchema)`.
- [x] 4.16 Mount the router in `apps/api/src/routes/index.ts` with `routes.route('/api/v1/recipes', recipeNote)`. Delete the old `POST /:id/notes` route and its `describeRoute()` entry (`apps/api/src/modules/recipe/index.ts:846-873`) and the `RecipeNotesSchema` import there. Delete `saveNotes` from `recipe/service.ts` and `updateVersionNotes` from `recipe/model.ts`. No module registers a `POST` on `/:id/notes`. Run `make test-specific filter=src/routes/recipe-notes-post-removed.test.ts` and confirm it now passes.
- [x] 4.17 Add `apps/api/src/modules/recipe-note/index.test.ts`:
  - The IDOR regression: B cannot change A's brewer note or A's private note via `PUT`, and `PUT`/`DELETE` by A or B never change any `recipe_version.personal_notes`.
  - Status codes: 401 anonymous, 404 on non-viewable recipes, 400 on a malformed id, empty or over-long text.
  - Idempotent DELETE and the `Cache-Control` header.
  - An unverified email can still save.
  - Search with `?search=<token from B's private note>` returns nothing, and `GET /api/v1/recipes/:slug` does not contain the note text.
- [x] 4.18 Add `apps/api/src/routes/openapi.notes.test.ts`, built like `openapi.coverage.test.ts` (set `OPENAPI_ENABLED=true`, `APP_ENV=test`, `CACHE_DRIVER=memory` before the dynamic import of `routes/index.ts`, then request `/api/v1/openapi.json`). Assert `paths['/api/v1/recipes/{id}/notes']` has `get`, `put` and `delete`, each with `tags: ['Recipes']`, a `summary`, `security` containing `bearerAuth`, the `id` path parameter and `401`/`404` responses; `put` has a `requestBody` and a `400` response; and the path has no `post` key. This is needed because `IN_SCOPE_BASE_PATHS` in `openapi.coverage.test.ts:58-79` excludes `/api/v1/recipes`.
- [x] 4.19 Run `grep -rnwE "saveNotes|updateVersionNotes" apps/api/src` and confirm no matches (the web side is checked again in task 17.21).
- [x] 4.20 Call `recipeNoteService.deleteAllNotesForUser(userId)` from `deleteAccount` in `apps/api/src/modules/user/service.ts` (account-deletion anonymisation stays out of scope for wave 6). Add a test in `user/service.test.ts` that the notes end up soft-deleted and scrubbed.
- [x] 4.21 Run `make test-api`, including `openapi.coverage.test.ts`, and confirm the notes routes are documented and tagged.
- [x] 4.22 Group check: run `make check`, `make lint`, `make test-shared` (the `RecipeUserNoteOutputSchema` round-trip and acceptance cases), `make test-specific filter=src/schema-` (the db schema tests of task 4.9) and `make db-generate` (expect "No schema changes, nothing to migrate"), then `make fmt` and `make fmt-check`. All must be green before group 5 starts.

## 5. Security: upload storage keys, file validation and S3 request integrity (t4a, refine D2b)

- [x] 5.1 Add `apps/api/src/test-fixtures/images.ts` exporting minimal valid byte arrays: `JPEG_1x1` (SOI + APP0 + SOF0 + SOS + EOI), `PNG_1x1` (signature + IHDR + IDAT + IEND), `WEBP_LOSSY_1x1`, `WEBP_LOSSLESS_1x1`, `WEBP_VP8X_1x1`. Also add `makeJpeg(width, height)` / `makePng(width, height)` header builders, plus hostile samples: `HTML_BYTES`, `SVG_BYTES`, `GIF89A_1x1`, `PNG_BOMB_HEADER` (IHDR 65535×65535) and `JPEG_NO_SOF` (SOI + APP0 + SOS). Use explicit `.ts` imports and add a one-line JSDoc per export
- [x] 5.2 Add a failing route test to `apps/api/src/modules/photo/index.test.ts` (build here the route harness that task 5.25 extends): as the recipe author, upload `JPEG_1x1` as multipart with filename `a.x/%2e%2e/%2e%2e/other-bucket/payload` and assert 201, `url` matches `/uploads/<uuidv4>.jpg`, contains none of `other-bucket`, `%2e`, `..`, and `thumbnailUrl === url`. Add a second case for filename `a.x/%2e%2e?policy=`. Confirm both fail on the current `generateFilename`. (Route level, because task 5.22 removes the `name` field from `uploadPhoto`.)
- [x] 5.3 Add failing tests to `apps/api/src/modules/photo/service.test.ts`:
  - `HTML_BYTES` declared `image/jpeg` is rejected with `UploadValidationError` `code: 'UNSUPPORTED_MEDIA_TYPE'`, `field: 'file'`, and no photo row exists afterwards
  - an HTML thumbnail with a valid original is rejected with `field: 'thumbnail'`, and no row and no file exist in the test `UPLOAD_DIR`
  - `PNG_BOMB_HEADER` gives `INVALID_IMAGE`
  - PNG bytes declared `image/jpeg` are stored under a `.png` key
- [x] 5.4 Replace the `[1, 2, 3]` placeholder bytes in the `makeFile()` helper of `apps/api/src/modules/photo/service.test.ts` with fixture bytes matching the declared type. Update the "unsupported file types" expectation from the old `Unsupported file type: ${type}` string to the typed error code
- [x] 5.5 Create `apps/api/src/utils/upload/mime.ts` with no imports. It exports `SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const`, the `SupportedImageMime` type, and the frozen `MIME_TO_EXT` table (`jpg`, `png`, `webp`)
- [x] 5.6 Write `apps/api/src/utils/upload/sniff.test.ts` first. Assert `detectImage()` returns the correct `{ mime, ext, width, height }` for every fixture in `test-fixtures/images.ts`, and for `makeJpeg(6016, 6016)` and a JPEG with a 60 KB APP1 segment before SOF0, plus a progressive SOF2 case. Assert it returns `null` for HTML, SVG, GIF, `JPEG_NO_SOF`, truncated PNG/WebP headers, an empty array and a 3-byte array
- [x] 5.7 Implement `apps/api/src/utils/upload/sniff.ts`: a pure `detectImage(bytes: Uint8Array): DetectedImage | null` covering:
  - JPEG `FF D8 FF`: a marker walk using segment lengths, skipping `FF` fill bytes and standalone markers (`D0`–`D7`, `01`), and accepting SOF0–SOF15 except `C4`/`C8`/`CC`. Return null on SOS/EOI before SOF or on an out-of-bounds read
  - PNG: signature plus `IHDR` at offset 12, with big-endian u32 width/height at 16/20
  - WebP: `RIFF`/`WEBP` with `VP8 ` (start code `9D 01 2A`, 14-bit little-endian dims), `VP8L` (`0x2F` signature, 14+14 bits plus 1) or `VP8X` (24-bit little-endian plus 1)

  It has no dependencies and every read is bounds-checked
- [x] 5.8 Add `apps/api/src/utils/upload/errors.ts` with `class UploadValidationError extends Error { code; status; field }` and fixed safe messages per code (`FILE_TOO_LARGE` → 400, `INVALID_IMAGE` → 400, `UNSUPPORTED_MEDIA_TYPE` → 415). Add a co-located `errors.test.ts`
- [x] 5.9 Update `apps/api/src/utils/upload/index.test.ts`:
  - delete the tests that assert the client extension is preserved (`should preserve the original extension`, `noextension`, and the `generateThumbnailFilename` cases)
  - add tests that `generateStorageKey('image/jpeg')` returns `{ id, key }` with `key === \`${id}.jpg\`` matching the UUIDv4 pattern, that 1,000 calls give unique keys, and that `thumbnailKey(id, 'image/png') === \`${id}_medium.png\``
  - add tests that `validateImagePart()` throws the right `UploadValidationError` for: size over the cap, size over the thumbnail cap, disallowed declared type, unknown bytes, zero or oversized dimensions, and a thumbnail wider than 1,200 px
  - keep (or add) coverage for `getPublicUrl`, `saveUploadedFile`, `saveThumbnail`, `deleteStoredFile` and `getThumbnailSizes`, per the modified `model-test-coverage` row for `utils/upload/index.ts`
- [x] 5.10 In `apps/api/src/utils/upload/index.ts`, remove `generateFilename` and `generateThumbnailFilename`. Add `generateStorageKey(mime)` (uses `crypto.randomUUID()` and `MIME_TO_EXT`, no client input) and `thumbnailKey(id, mime)`. Put the limits in a new `apps/api/src/utils/upload/limits.ts`, which imports only `config` so that `bodyLimit.ts` can use it without constructing the storage driver. It exports `MAX_IMAGE_SIDE_PX = 16_384`, `MAX_IMAGE_PIXELS = 50_000_000`, `THUMBNAIL_MAX_SIDE_PX = 1_200`, `THUMBNAIL_MAX_SIZE_BYTES = Math.min(1024 * 1024, config.UPLOAD_MAX_SIZE_BYTES)` and `PHOTO_BODY_MAX_BYTES = config.UPLOAD_MAX_SIZE_BYTES + THUMBNAIL_MAX_SIZE_BYTES + 64 * 1024`
- [x] 5.11 Replace `validateImageUpload` with `validateImagePart(part: { declaredType: string; size: number; data: Uint8Array }, kind: 'file' | 'thumbnail'): DetectedImage`. It applies, in order:
  1. the size cap for the part
  2. the declared-type advisory check (non-empty, not `application/octet-stream`, not in the allowlist → 415)
  3. `detectImage()`
  4. the allowlist check (detected type ∩ `config.UPLOAD_ALLOWED_TYPES`)
  5. the dimension limits

  It throws `UploadValidationError` and never echoes client strings. Update the `bodyLimit.test.ts` case that imports `validateImageUpload`
- [x] 5.12 Change `saveUploadedFile(data, key, contentType)` / `saveThumbnail(...)` in `apps/api/src/utils/upload/index.ts` to pass `{ contentType }` to the driver. Add `deleteStoredFile(key)` for cleanup. Expose a mutable `storageDeps = { driver }`, following the module `deps` pattern, so tests can inject a failing driver, and give it a one-line JSDoc
- [x] 5.13 Write `apps/api/src/utils/storage/key.test.ts` first. `assertSafeStorageKey` must accept `<uuid>.jpg`, `<uuid>_medium.webp` and the legacy `1731000000000-abcd1234.jpeg`. It must throw for `''`, `.hidden`, `a/b.jpg`, `a\\b.jpg`, `..`, `a..b`, `x.x/%2e%2e/%2e%2e/other-bucket/payload`, `abc.png?policy=`, `a#b`, `a b.jpg` and a 200-character key
- [x] 5.14 Implement `apps/api/src/utils/storage/key.ts` exporting `SAFE_STORAGE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}(\.[A-Za-z0-9]{1,8})?$/` and `assertSafeStorageKey(key)`, which throws `Error('Invalid storage key')` without echoing the key
- [x] 5.15 Change `apps/api/src/utils/storage/types.ts` to `save(data: Uint8Array, key: string, options: { contentType: string }): Promise<string>`. Update the JSDoc so the caller supplies the content type and drivers never infer it
- [x] 5.16 In `apps/api/src/utils/storage/local.ts`, call `assertSafeStorageKey` at the top of `save` and `delete`, before `mkdir` or any other fs call, and keep the existing `_resolvePath` guards. In `apps/api/src/utils/storage/storage.test.ts`:
  - switch the existing fixture names (`test-file.txt` and others) to safe keys and pass `{ contentType }`
  - assert that `save(bytes, 'abc.x/sub/evil', …)` throws and that no subdirectory is created
  - change `save` to `writeFile(path, data, { flag: 'wx' })` so an existing file is never replaced, and add a `storage.test.ts` case: saving twice to the same safe key throws on the second call and the file keeps the first bytes
- [x] 5.17 Write `apps/api/src/utils/storage/s3.test.ts` with `vi.spyOn(globalThis, 'fetch')` and mutated S3 config, following the `storage.test.ts` pattern with a preceded `// biome-ignore` rationale:
  - `save` with a generated key sends one PUT whose URL pathname is `/test-bucket/<key>` with an empty search
  - the request has header `content-type: image/png`
  - the `authorization` `SignedHeaders` contains `content-type`
  - unsafe keys (`1-a.x/%2e%2e/%2e%2e/other-bucket/payload`, `abc.png?policy=`) throw, and `fetch` is never called, for both `save` and `delete`
  - when fetch returns 403 with an XML body, `save` throws, and only the server log receives the body text
- [x] 5.18 Add to `apps/api/src/utils/storage/s3.test.ts`: constructing `S3StorageDriver` with `S3_ENDPOINT` set to `https://s3.example.com/brewform-uploads`, `https://s3.example.com/?x=1` or `https://s3.example.com/#f` throws an error naming `S3_ENDPOINT`; `https://s3.example.com` and `https://s3.example.com/` are accepted.
- [x] 5.19 Refactor `apps/api/src/utils/storage/s3.ts`:
  - add a private `uriEncode(segment)` implementing the SigV4 unreserved set (`A-Z a-z 0-9 - . _ ~`, encoded once)
  - build `path = '/' + uriEncode(bucket) + '/' + key.split('/').map(uriEncode).join('/')` after `assertSafeStorageKey`
  - pass `path` explicitly to `signRequest` as the canonical URI with an empty canonical query
  - after `new URL(endpoint + path)`, throw if `pathname !== path || search !== ''`
  - add `content-type` to the headers and to `SignedHeaders`/`canonicalHeaders` for PUT, keeping header names sorted
  - add module logger `createLogger('s3-storage')` with `debug` entry/exit on `save`/`delete` (key only), `warn` on each retry, and `error` with `err` on final failure
  - in the constructor, parse `S3_ENDPOINT` with `new URL()` and throw `Error('S3_ENDPOINT must be the account endpoint with no path, query or fragment')` when `pathname` is not `''`/`'/'` or `search`/`hash` is non-empty; strip a trailing `/` as today
- [x] 5.20 Update `apps/api/src/middleware/bodyLimit.test.ts` first:
  - replace the "does not apply bodyLimit to POST /api/v1/photos" expectations: `content-length` of `PHOTO_BODY_MAX_BYTES + 1` gives 413 `PAYLOAD_TOO_LARGE` with `requestId`, and the handler is not invoked (use a spy flag)
  - a chunked `ReadableStream` body above the cap gives 413
  - a 2 MB `content-length` on `/api/v1/photos` still reaches the handler
  - the same rules hold for `/api/v1/photos/sub`; `/api/v1/photoshop` keeps the 1 MB limit
  - update the real-app integration case
- [x] 5.21 In `apps/api/src/middleware/bodyLimit.ts`, add `photoBodyLimit = bodyLimit({ maxSize: PHOTO_BODY_MAX_BYTES, onError })`. The `onError` logs `warn` with `{ event: 'payload_too_large', status: 413, limit: PHOTO_BODY_MAX_BYTES, requestId, path, method, contentLength }` and returns `error(c, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413)`. Route `PHOTOS_ROUTE_RE` matches to `photoBodyLimit` instead of `next()`, and update the file and function JSDoc. Import `PHOTO_BODY_MAX_BYTES` from `utils/upload/limits.ts`, not from `utils/upload/index.ts`, which constructs the storage driver at load
- [x] 5.22 Refactor `uploadPhoto` in `apps/api/src/modules/photo/service.ts` to:
  1. add `log.debug({ userId, recipeId }, 'uploadPhoto started')`
  2. keep the ownership checks
  3. run `validateImagePart` on the file and, if non-empty, the thumbnail before any write; log `warn` on rejection with `{ userId, recipeId, reason: err.code, field, declaredType, detectedType, size }` and never the filename, then rethrow
  4. call `generateStorageKey(detected.mime)`
  5. save the original, then the thumbnail (`thumbnailKey(id, thumb.mime)`), then `model.create`
  6. on any failure after the first write, best-effort `deleteStoredFile` for the written keys, `warn` on cleanup failure (`{ err, key }`), and rethrow
  7. log `info({ photoId, key, mime, size, hasThumbnail }, 'Photo saved')` and `debug` 'uploadPhoto completed'

  Change the signature so `file` is `{ declaredType, size, data }` with no `name` field
- [x] 5.23 Add a test to `apps/api/src/modules/photo/service.test.ts` that injects a fake driver through `storageDeps`. It throws on the second `save`; assert that `delete` was called with the first key and that no photo row exists. A second test makes `delete` throw as well and asserts that the original error still propagates
- [x] 5.24 Update the `POST /` handler in `apps/api/src/modules/photo/index.ts`:
  - stop passing `fileField.name`; pass `declaredType: fileField.type`, `size` and `data` for the file, and the same shape for a non-empty thumbnail
  - map `UploadValidationError` to `error(c, err.code, err.message, err.status, [{ field: err.field, message: err.message }])`
  - keep the `RECIPE_NOT_FOUND` → 404 and `FORBIDDEN` → 403 mappings
  - `throw err` for everything else, which removes the `UPLOAD_ERROR` catch-all
- [x] 5.25 Extend `apps/api/src/modules/photo/index.test.ts`. Mount the router with `app.onError(errorHandler)`, authenticate with a real Bearer token from `signAccessToken` (`apps/api/src/modules/auth/jwt.ts`, as used in `auth/index.test.ts`) for a user and recipe seeded through `@brewform/db`, and clean them up in `afterEach`. Assert:
  - a crafted-filename upload gives 201 with a UUID URL
  - HTML bytes give 415 `UNSUPPORTED_MEDIA_TYPE`
  - an oversized thumbnail gives 400 `FILE_TOO_LARGE` with `details[0].field === 'thumbnail'`
  - with `config.APP_ENV` mutated to `production` and `storageDeps.driver` replaced by one that throws `HTTP 403: <Error><Code>AccessDenied</Code>…`, the response is 500 `INTERNAL_ERROR` with message `Something went wrong` and a body containing neither `AccessDenied` nor the bucket name
- [x] 5.26 Add `apps/api/src/modules/photo/index.s3.test.ts` (same harness as task 5.25: router with `app.onError(errorHandler)`, seeded user and recipe, `signAccessToken` Bearer token, `afterEach` cleanup). Mutate S3 config (`S3_ENDPOINT=https://s3.test`, `S3_BUCKET=test-bucket`), set `storageDeps.driver = new S3StorageDriver()`, and `vi.spyOn(globalThis, 'fetch')` resolving `new Response(null, { status: 200 })` (preceded `// biome-ignore` rationale comment as in `storage.test.ts`). For each multipart filename `a.x/%2e%2e?policy=`, `a.x/%2e%2e?cors=`, `a.x?acl=`, `a.x?tagging=`, `a.x?uploads=`, `a.x?partNumber=1&uploadId=1`, `a.x/%2e%2e/%2e%2e/other-bucket/payload` and `../1731000000000-abcd1234.jpeg`, upload `JPEG_1x1` and assert: 201; every `fetch` call is a `PUT`; `new URL(call.url).pathname` matches `^/test-bucket/<uuidv4>(_medium)?\.(jpg|png|webp)$`; `search === ''`; the `authorization` header's canonical request (recomputed in the test from the sent headers) has an empty query line; and no call targets `/test-bucket/` or `/other-bucket/`.
- [x] 5.27 Add to `apps/api/src/modules/photo/index.test.ts`: (a) a multipart upload whose `file` part is `class EvilFile extends File { get name(): string { throw new Error('name read'); } }` built from `JPEG_1x1` succeeds with 201; (b) with `STORAGE_DRIVER=local` and a temp `UPLOAD_DIR` pre-populated with `1731000000000-abcd1234.jpeg` and `<uuid-A>.jpg` (random bytes), uploads named after both files return new `<uuid>.jpg` URLs and both pre-existing files are byte-identical afterwards (compare with `readFile`).
- [x] 5.28 Add tests to `apps/api/src/config/env.test.ts`:
  - `UPLOAD_ALLOWED_TYPES='image/jpeg,image/gif'` fails with an issue on path `UPLOAD_ALLOWED_TYPES` whose message names `image/gif`
  - `'image/jpeg, image/png'` parses to `['image/jpeg', 'image/png']`
  - `UPLOAD_MAX_SIZE_BYTES` of `'0'`, `'-5'` or `'1.5'` fails
  - the default still parses to 10485760 and three types
- [x] 5.29 In `apps/api/src/config/env.ts`, change `UPLOAD_MAX_SIZE_BYTES` to `z.coerce.number().int().positive().default(10 * 1024 * 1024)`. Change `UPLOAD_ALLOWED_TYPES` to a string that is split, trimmed, lower-cased and filtered for empty entries, then refined against `SUPPORTED_IMAGE_MIME_TYPES` from `utils/upload/mime.ts` with an error naming the variable and the bad entries. Update `apps/api/src/utils/upload/index.ts` to read the parsed array instead of `split(',')`. The blank-as-unset preprocessing and the `int().positive()` bound on `UPLOAD_MAX_SIZE_BYTES` already landed in task 3.2. Keep them, and add only what is missing here.
- [x] 5.30 Update `describeRoute()` for `POST /` in `apps/api/src/modules/photo/index.ts`:
  - add `413` (body over the photo cap) and `415` (unsupported image type) responses with `resolver(ErrorEnvelopeSchema)`
  - reword `400` to "Validation error, file too large, or invalid image"
  - extend `description` with the size, type and dimension constraints, and add part descriptions for `file` and `thumbnail` (max 1,200 px, max 1 MiB)
  - keep runtime behaviour unchanged
  - run `make test-specific filter=src/routes/openapi.coverage.test.ts`
- [x] 5.31 In `apps/web/src/components/photos/PhotoUpload.tsx`, inside the `catch`, map `ApiError` `code` `FILE_TOO_LARGE`/`PAYLOAD_TOO_LARGE` → `photo.error.tooLarge` and `UNSUPPORTED_MEDIA_TYPE`/`INVALID_IMAGE` → `photo.error.unsupportedType`, otherwise keep `photo.error.uploadFailed`. Reuse the existing keys, so no new i18n is needed. Send fixed multipart filenames (`photo.<ext>` from the selected file's MIME type, and `thumbnail.jpg`) so local filenames are never transmitted; assert the sent filenames in `PhotoUpload.test.tsx`. Add a case to `PhotoUpload.test.tsx`. t5 later moves this upload into a resource action (task 15.20), and that action must carry this mapping over.
- [x] 5.32 `docs/api.md` Photos section:
  - document the server-generated key format (`<uuid>.<ext>`, `<uuid>_medium.<ext>`), content-based type detection, the dimension limits (16,384 px per side and 50 MP for originals; 1,200 px and 1 MiB for thumbnails) and the photo body cap
  - document the error codes `VALIDATION_ERROR`, `FILE_TOO_LARGE`, `INVALID_IMAGE` (400), `UNSUPPORTED_MEDIA_TYPE` (415), `PAYLOAD_TOO_LARGE` (413) and `INTERNAL_ERROR` (500), and note that `UPLOAD_ERROR` was removed
- [x] 5.33 `docs/decisions.md`: add ADR-019 (number pre-allocated by t8), "Server-generated upload keys and built-in magic-byte sniffing". Record the rejected `file-type`/`image-size`/`sharp`/`busboy` alternatives, and cross-reference ADR-009
- [x] 5.34 `docs/deployment_coolify.md` §10: step 3 scopes the R2 token to the `brewform-uploads` bucket only ("Object Read & Write", specific bucket, never "Admin Read & Write"); the full "Photo storage security check" section is written by task 5.35.
- [x] 5.35 Write the "Photo storage security check (installs that ran before wave 6)" section in `docs/deployment_coolify.md` §10, exactly as listed in the `photo-upload-security` requirement "Operators are guided to audit buckets exposed to pre-change versions": the seven `aws s3api get-bucket-*` commands with `--bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"` and how to read `NoSuch…` errors; `aws s3api list-objects-v2` plus a `jq` filter flagging keys matching neither `^[0-9]{13}-[0-9a-f]{8}(_medium)?\.[A-Za-z0-9]+$` nor `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(_medium)?\.(jpg|png|webp)$`; `get-object-tagging` on a sample; a `psql` query listing `photo.url`/`thumbnail_url` with `created_at` to compare against `LastModified`; the delete-configuration, restore-from-backup and rotate-on-finding steps; and the per-provider credential scoping (R2, Garage without `--owner`, AWS/MinIO object-only IAM policy JSON).
- [x] 5.36 Add commented `UPLOAD_MAX_SIZE_BYTES` / `UPLOAD_ALLOWED_TYPES` defaults, with their constraints, to the root `.env.example`. The `AGENTS.md` "Middleware stack order" edit (`bodyLimit` is 1 MB, with the photo upload cap on `/api/v1/photos`) is folded into task 25.3.
- [x] 5.37 Confirm that `apps/api/src/middleware/bodyLimit.test.ts` covers every item of the modified `request-body-limit` "Test coverage" list: a photo body within the cap passes, a body above the cap gives 413, and an oversized file part gives 400 `FILE_TOO_LARGE`. The MODIFIED blocks drafted in `audit/t4a-upload-security.md` §4 were folded into `specs/request-body-limit/spec.md` at integration.
- [x] 5.38 Manual check against the dev Garage service (`make up`, `STORAGE_DRIVER=s3` pointed at Garage):
  - upload a JPEG through the API
  - confirm the object key is `<uuid>.jpg`, and the stored `Content-Type` (via `HEAD`) is `image/jpeg`
  - confirm a crafted-filename upload creates no object outside the bucket and no bucket-subresource change
- [x] 5.39 Group check: run `make check`, `make lint`, `make test-api`, `make test-specific filter=src/middleware/bodyLimit.test.ts` and `make test-web` (for the `PhotoUpload` change), then `make fmt` and confirm `pnpm run fmt-check` is clean

## 6. Security: rate limiting and cache driver (t2)

- [x] 6.1 Add `rate-limiter-flexible` pinned to exactly `11.5.0` in `apps/api/package.json` `dependencies`. Run `make install`, commit the updated `pnpm-lock.yaml`, and confirm `make check-api` still passes
- [x] 6.2 Add failing cases to `apps/api/src/config/env.test.ts`:
  - defaults: `TRUST_PROXY='none'`, `TRUST_PROXY_HOPS=1`, `RATE_LIMIT_ENABLED=true`, `RATE_LIMIT_STORE='memory'`, `RATE_LIMIT_GLOBAL_MAX=100`, `CACHE_MEMORY_MAX_ENTRIES=10000`
  - rejects `TRUST_PROXY=xff`, `TRUST_PROXY_HOPS=0` and `=6`, `TRUST_PROXY_CIDRS=10.0.0.0/33` and `=not-a-cidr`, `CACHE_MEMORY_MAX_ENTRIES=10`
  - accepts `TRUST_PROXY_CIDRS=10.0.0.0/8, 2001:db8::/32`
  - `RATE_LIMIT_STORE=redis` with `CACHE_ENABLED=false` and no `REDIS_URL` fails on `REDIS_URL`
- [x] 6.3 Extend `envSchema` in `apps/api/src/config/env.ts` with the seven variables:
  - Validate CIDRs with `node:net` `isIP` plus a prefix-length check (≤32 for v4, ≤128 for v6), and expose `TRUST_PROXY_CIDRS` as a parsed `string[]`
  - Add the `RATE_LIMIT_STORE=redis` → `REDIS_URL` rule to the existing `superRefine`, independent of `CACHE_ENABLED`
  - Make the env tests pass, and keep the `api-env-config` empty-string-as-unset rule working for the new optional vars
- [x] 6.4 Write `apps/api/src/utils/client-ip/index.test.ts` first, covering every `api-rate-limiting` "Client IP is resolved…" scenario:
  - `none` ignores XFF and CF headers
  - `hops=1` and `hops=2` chain selection, including invalid XFF entries being dropped and a short chain clamping to the socket
  - `cloudflare` accepted only when the hop is in the Cloudflare ranges or `TRUST_PROXY_CIDRS`
  - IPv4-mapped normalisation, IPv6 zone stripping, and `rateLimitIpKey` /64 bucketing
  - no socket → `null`
  - a `fast-check` property: in `hops` mode, prepending arbitrary strings to XFF never changes the result
- [x] 6.5 Add `apps/api/src/utils/client-ip/cloudflare-ranges.ts` exporting `CLOUDFLARE_IPV4` and `CLOUDFLARE_IPV6` arrays copied from `https://www.cloudflare.com/ips-v4` and `/ips-v6`, with the source URL and fetch date in a header comment, plus a unit assertion that both lists are non-empty valid CIDRs
- [x] 6.6 Implement `apps/api/src/utils/client-ip/index.ts`, with a module logger `createLogger('client-ip')`, until the tests pass. It exports:
  - `getClientIp(c, trust = trustConfigFromEnv())`, reading the peer via `getConnInfo` from `@hono/node-server/conninfo` inside try/catch and returning `null` when absent
  - `normalizeIp(raw)`
  - `rateLimitIpKey(ip | null)`, which returns `'unknown'` for `null` and the `<prefix>::/64` form for IPv6
  - a lazily built `net.BlockList` for the Cloudflare ranges plus `TRUST_PROXY_CIDRS`
  - a process-level warn-once when XFF is present under `none`, with context `{}` and no header value
- [x] 6.7 Add `apps/api/src/utils/client-ip/test-helpers.ts` exporting `peerEnv(ip)`, which returns the `app.request()` env shape that `getConnInfo` reads (verify against the installed `@hono/node-server` 2.1.6 `conninfo` source). Add one test proving `getClientIp` returns that IP
- [x] 6.8 Write `apps/api/src/utils/redis/client.test.ts` asserting that `createRedisClient(url, { lazyConnect: true })` produces an ioredis instance whose `options` include `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `commandTimeout: 500` and `connectTimeout: 2000`
- [x] 6.9 Implement `apps/api/src/utils/redis/client.ts` `createRedisClient(url, overrides?)` with those options and the default `retryStrategy`. Never log the URL. Log `error` events at most once per disconnect cycle with `{ err }`. Switch `createRedisProvider` in `apps/api/src/utils/cache/redis.ts` to use it, and update its docblock
- [x] 6.10 Create `apps/api/src/utils/rate-limit/policies.ts` with the `RateLimitPolicy` type (`id`, `dimension: 'ip' | 'email' | 'email-ip' | 'user'`, `points`, `durationSec`, `mode: 'count' | 'failures'`, `message`) and the frozen `POLICIES` map holding exactly the table from the `api-rate-limiting` spec (`global` reads `config.RATE_LIMIT_GLOBAL_MAX`). Add `policies.test.ts` asserting unique ids, positive integers, every value in the spec table, and that no login message is used by a non-login policy
- [x] 6.11 Write `apps/api/src/utils/rate-limit/backend.test.ts` first:
  - the memory backend admits exactly `points` per key per window, and keys are isolated per policy
  - bounded memory (api-rate-limiting "Memory counters expire with their window"): with Vitest fake timers, 1,000 distinct keys under a 60 s policy have no record after the clock advances past 60 s, and the next request starts a fresh window. If `RateLimiterMemory`'s expiry timers do not follow Vitest fake timers, advance real time with a 1 s test policy instead
  - `createRedisBackend` with a fake client whose commands reject and whose `status` is `'end'` still enforces limits through the insurance limiter, emits exactly one degraded warn `{ store: 'redis', err }` across 50 checks, and one recovery info after a simulated `ready` event
  - `status()` reports `memory` / `ok` / `degraded`
- [x] 6.12 Implement `apps/api/src/utils/rate-limit/backend.ts`:
  - the `RateLimitBackend` interface: `limiter(policy)` (memoised per policy id), `status()`, `close()`
  - `createMemoryBackend()` (`RateLimiterMemory`, `keyPrefix: policy.id`)
  - `createRedisBackend(client)` (`RateLimiterRedis` with `storeClient`, `keyPrefix: 'brewform-rl:' + policy.id`, `rejectIfRedisNotReady: true`, `insuranceLimiter: new RateLimiterMemory(same points/duration)`)
  - degraded and recovery transitions driven by the client's `error` / `ready` events, with a `fallbackDecisions` counter and a module logger `createLogger('rate-limit-backend')`
- [x] 6.13 Implement `apps/api/src/utils/rate-limit/registry.ts`: `getRateLimitBackend()`, `setRateLimitBackend(b)`, `resetRateLimitBackend()` (fresh memory backend) and `getRateLimitStoreStatus()` (`disabled` when `RATE_LIMIT_ENABLED=false`). Add `registry.test.ts`
- [x] 6.14 Write `apps/api/src/utils/rate-limit/headers.test.ts`, then implement `headers.ts`:
  - `appendRateLimitHeaders(c, policy, { remaining, msBeforeNext })` appends Structured-Field list items to `RateLimit-Policy` (`"<id>";q=<points>;w=<durationSec>`) and `RateLimit` (`"<id>";r=<remaining>;t=<ceil seconds>`), and overwrites `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (epoch seconds)
  - `setRetryAfter(c, msBeforeNext)` (minimum 1)
- [x] 6.15 Add `apps/api/src/utils/rate-limit/redis.integration.test.ts`, guarded by `describe.skipIf(!process.env.REDIS_TEST_URL)`:
  - 50 concurrent consumes against a limit of 10 admit exactly 10
  - two backends on separate clients share one budget
  - a backend pointed at a closed port answers every check within 1 s via insurance
  - after one consume on a 15-minute policy, `PTTL brewform-rl:<policy-id>:<key>` is positive and at most 900,000 ms (shared-store keys always carry a TTL)

  Document `REDIS_TEST_URL=redis://:dev-valkey-password@valkey:6379` in the test docblock. If the RESP3 reply parsing fails, set `protocol: 2` on the limiter client and record why in a comment
- [x] 6.16 Rewrite `apps/api/src/middleware/rateLimit.test.ts` first, using `peerEnv()` and `resetRateLimitBackend()`:
  - the 429 envelope (`RATE_LIMITED`, `requestId`, the policy message) and `Retry-After`
  - `RateLimit` / `RateLimit-Policy` items for two stacked policies, with `X-RateLimit-Limit` from the last one
  - `RATE_LIMIT_ENABLED=false` is a pass-through with no headers
  - limiting still works with `setCacheProvider(new NullCacheProvider())`
  - the spoofed-XFF regression: one peer with random XFF values hits 429
  - `rateLimitFailures`: 429 before the handler once the counter reaches the limit, `penalty` only on 401, `delete` on 2xx when `resetOnSuccess`, and no headers unless 429
  - fail-open: a backend whose limiter throws `Error` lets the request through and logs `error` with `{ err, policy }`
  - the exceeded log is `log.warn({ policy, limit, userId? }, 'rateLimitMiddleware rate limit exceeded')`, and no log call ever contains an IP, email or key

  This is the exact log context required by the modified `api-middleware-logging` requirement, which was added at integration in response to t2's flag to that spec's owner. Include one IP-keyed case (`POLICIES.global`, `{ policy: 'global', limit: 100 }`), one user-keyed case (`POLICIES.commentUser`, `{ policy: 'comment-user', limit: 5, userId }`) and one under-the-limit case with no warn log, as the modified `logging-test-coverage` requirement "Rate limit test verifies both IP-based and user-ID-based rate limit logging" requires.
- [x] 6.17 Re-implement `apps/api/src/middleware/rateLimit.ts`, keeping `export const log = createLogger('rate-limit-middleware')`:
  - `rateLimit(policy, opts?: { key?: (c) => string | null; skip?: (c) => boolean })` (default key: `rateLimitIpKey(getClientIp(c))`, user policies key on `c.get('userId')`)
  - `rateLimitFailures(policy, { key, isFailure = (s) => s === 401, resetOnSuccess })`
  - an `emailKey(email)` helper (trim, lower-case, SHA-256 hex first 32 chars, via `node:crypto`)
  - the backend resolved lazily from the registry on every request
  - delete `rateLimitMiddleware` and `authRateLimitMiddleware`, and the `RateLimitEntry` / cache imports
- [x] 6.18 Wire startup in `apps/api/src/main.ts`:
  - install `createRedisBackend(createRedisClient(config.REDIS_URL))` when `RATE_LIMIT_STORE=redis`, otherwise keep the memory backend, before `serve()`
  - log info `{ enabled, store, trustProxy, hops }` (no URL), and warn when `RATE_LIMIT_ENABLED=false`
  - replace `app.use('*', rateLimitMiddleware(...))` with `rateLimit(POLICIES.global, { skip })`, skipping `/health`, `/ready` and `GET /uploads/*`, and add `rateLimit(POLICIES.uploads)` to the `/uploads/*` handler
  - close the limiter backend in `shutdown()` and update the header comment's middleware line
- [x] 6.19 Add `exposeHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']` to `apps/api/src/middleware/cors.ts`, with a case in `cors.test.ts` asserting `Access-Control-Expose-Headers`
- [x] 6.20 Add the `main` wiring test as a new file `apps/api/src/main.rateLimit.test.ts` that imports `app` from `./main.ts` (keep `rateLimit.test.ts` for the middleware unit cases):
  - 150 `GET /health` requests are never 429
  - 101 requests to an API route from one `peerEnv` give a 429 on the 101st
  - `CACHE_ENABLED=false` does not change this
- [x] 6.21 Add failing tests to `apps/api/src/modules/auth/index.test.ts` (DB-backed, `peerEnv()` per simulated client, `resetRateLimitBackend()` in `beforeEach`):
  - register, two logins and forgot-password from one IP are all non-429
  - 5 wrong passwords then the correct one gives 429 with `Retry-After` and no cookies
  - a different IP with the correct password succeeds
  - 4 failures, a success, then 4 more failures stay non-429
  - 20 failures from 20 IPs make the 21st attempt 429
  - an unknown email gives an identical 429 body and headers
  - send-verification twice in 60 s gives 200 then 429, with exactly one email sent (spy on the notify module)
  - forgot-password for one email from 4 IPs gives a 429 on the 4th
  - the registration-disabled warn log has no `ip` key
- [x] 6.22 Migrate the existing `postJson` helper and the other requests in `apps/api/src/modules/auth/index.test.ts` from `x-forwarded-for: test-<uuid>` to `peerEnv(<unique test IP>)`. Confirm `grep -n "x-forwarded-for" apps/api/src/modules/auth/index.test.ts` is empty
- [x] 6.23 Update `apps/api/src/modules/auth/index.ts`:
  - remove `authRateLimit`
  - `/register`: `rateLimit(POLICIES.authRegisterIp)`
  - `/login`: `rateLimit(POLICIES.authLoginIp)` and `rateLimitFailures(POLICIES.authLoginFailIp)` before `zValidator`, then `rateLimitFailures(POLICIES.authLoginFailAccountIp, { resetOnSuccess: true })` and `rateLimitFailures(POLICIES.authLoginFailAccount)` after it, keyed from `c.req.valid('json').email`
  - `/forgot-password`: `authForgotIp` before and `authForgotAccount` after `zValidator`
  - `/reset-password` and `/verify-email`: `authTokenIp`
  - `/send-verification`: `authVerifySendIp` before `authMiddleware`, `authVerifySendUserBurst` and `authVerifySendUserDaily` after it
  - drop `ip` from the `Registration attempt while disabled` warn
- [x] 6.24 Make `authService.confirmPasswordReset` (`apps/api/src/modules/auth/service.ts`) return the account's normalised email. In the `/reset-password` handler, delete the `auth-login-fail-account` and `auth-login-fail-account-ip` (requesting IP) counters through the registry on success. Add a test: lock an account, reset the password, then log in successfully
- [x] 6.25 Add OpenAPI metadata to every rate-limited auth route in `apps/api/src/modules/auth/index.ts`: a `429` response with `content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } }` and a description naming the limit, plus the limits in the operation `description`. Keep `zValidator`. Add an assertion to `apps/api/src/routes/openapi.test.ts` that `/api/v1/auth/send-verification` POST documents `429`
- [x] 6.26 Update `apps/api/src/modules/contact/index.ts` to use `rateLimit(POLICIES.contactIp)`, keeping the existing 429 OpenAPI entry. Update `apps/api/src/modules/contact/contact.test.ts` to use `peerEnv()` and `resetRateLimitBackend()`, and add the spoofed-XFF regression case (4 POSTs from one peer with random XFF; the 4th is 429)
- [x] 6.27 Update `apps/api/src/modules/comment/index.ts`: `rateLimit(POLICIES.commentIp)` first, plus `rateLimit(POLICIES.commentUser)` right after `authMiddleware`. Update the 429 description, and replace `setCacheProvider` resets in `apps/api/src/modules/comment/index.test.ts` with `resetRateLimitBackend()` and `peerEnv()`
- [x] 6.28 Update `apps/api/src/modules/report/index.ts` and `apps/api/src/modules/report/index.test.ts` exactly as the modified `report-rate-limit` spec describes: `reportIp` first, `reportUser` after `authMiddleware`, `peerEnv()`, `resetRateLimitBackend()`, the spoofed-XFF, second-IP, per-user (DB-backed) and admin-not-throttled cases, and the `Retry-After` assertion
- [x] 6.29 Run `rg -n "x-forwarded-for|x-real-ip|cf-connecting-ip" apps/api/src --glob '!**/client-ip/**' --glob '!**/*.test.ts'` and confirm it prints nothing. Run `rg -n "rateLimitMiddleware|authRateLimitMiddleware" apps/api/src` and confirm only the log message string remains
- [x] 6.30 Add failing cases to `apps/api/src/utils/cache/cache.test.ts`, using `new InMemoryCacheProvider({ maxEntries: 3 })` and Vitest fake timers:
  - LRU eviction order with recency refreshed on `get`
  - overwriting a key does not evict
  - 1 000 one-second-TTL entries are gone after advancing 61 s without reads
  - 50 000 writes with the default cap leave ≤ 10 000 entries
  - `close()` clears the interval (`vi.getTimerCount()` returns to its baseline) and empties the store
- [x] 6.31 Implement the bounded `InMemoryCacheProvider` in `apps/api/src/utils/cache/index.ts`: constructor options `{ maxEntries, sweepIntervalMs }`, Map re-insertion for recency, oldest-key eviction, a `setInterval(...).unref()` sweep with a debug log `{ swept, size }` only when entries were removed, a `close()`, and a `size` getter used by tests. Pass `config.CACHE_MEMORY_MAX_ENTRIES` from `createCacheProvider('memory')`, and update the file docblock (remove the stale "Hono context injection" claim only if the cache-wiring owner has not already done so)
- [x] 6.32 Make sure the default singleton in `apps/api/src/utils/cache/singleton.ts` and every test-constructed provider do not leak sweep timers: `.unref()` plus `close()` in the test `afterEach` where providers are created
- [x] 6.33 Write `apps/api/src/utils/cache/failSoft.test.ts` first, with a client double whose methods can be toggled to reject:
  - a rejected `get` → `null`; a rejected `set` / `delete` / `deleteByPrefix` resolves
  - exactly one warn `{ driver: 'redis', err }` across 200 failures, and one info `{ driver: 'redis', droppedOps }` on the next success
  - after a dropped `delete`, the first success triggers exactly one asynchronous `inner.deleteByPrefix([])`, logged with `reason: 'dropped-invalidations'`
  - read-only outages trigger no flush
- [x] 6.34 Implement `apps/api/src/utils/cache/failSoft.ts` (`FailSoftCacheProvider implements CacheProvider`, module logger `createLogger('cache')`) and wrap the provider in `createCacheProvider('redis')`. Expose `getCacheStatus()` (`ok` / `degraded` / `memory` / `disabled`) for `/ready`
- [x] 6.35 Add a case to `apps/api/src/utils/cache/cache.test.ts` proving that `deleteByPrefix([])` builds the SCAN pattern `brewform:*`, and that the fake keyspace entry `brewform-rl:global:1.2.3.4` survives it
- [x] 6.36 Extend `apps/api/src/routes/health.ts` `/ready` with `cache: getCacheStatus()` and `rateLimitStore: getRateLimitStoreStatus()`. Keep the status code DB-only, update its `describeRoute` description and response docs, and add cases to `apps/api/src/routes/health.test.ts` for `memory` / `degraded` values and for a 200 while the cache is degraded Task 20.9 later moves this route into `apps/api/src/modules/health/`; keep the getters importable from `utils/cache` and `utils/rate-limit` so the move does not change them.
- [x] 6.37 Review `apps/api/scripts/flush-cache.ts`: it must keep using `deleteByPrefix([])` on the cache provider only and must never construct a limiter backend. Update its docblock to state that rate-limit keys (`brewform-rl:*`) are intentionally untouched
- [x] 6.38 Add failing cases to `apps/web/src/api/client.test.ts`: a 429 with `Retry-After: 120` produces `ApiError` with `code === 'RATE_LIMITED'`, `status === 429` and `retryAfterSeconds === 120`. A missing or invalid header leaves `retryAfterSeconds` undefined
- [x] 6.39 Implement `retryAfterSeconds` on `ApiError` and parse `Retry-After` (delta-seconds) in `apps/web/src/api/client.ts`
- [x] 6.40 Add `error.rateLimited` ("Too many attempts. Please try again in {seconds} seconds." / "Çok fazla deneme yapıldı. Lütfen {seconds} saniye sonra tekrar deneyin.") to `packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/tr.json`. Run the en/tr parity test
- [x] 6.41 Add `apps/web/src/utils/apiErrorMessage.ts` `getApiErrorMessage(err, t, fallbackKey)`, which returns `t('error.rateLimited', { seconds })` for `RATE_LIMITED` (default 60 when unknown), otherwise `err.message`, otherwise `t(fallbackKey)`. Add a co-located test, and use it in `pages/auth/LoginPage.tsx`, `RegisterPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `VerifyEmailPage.tsx`, `pages/ContactPage.tsx` and `components/EmailVerificationBanner.tsx`. Add one 429 case each to `LoginPage.test.tsx` and `ContactPage.test.tsx`
- [x] 6.42 Add the new variables, with comments, to `apps/api/.env.example`:
  - `TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1`, a commented `TRUST_PROXY=cloudflare` line explaining origin lockdown, and a commented `# TRUST_PROXY_CIDRS=` line (extra trusted edge CIDRs, comma-separated, IPv4 or IPv6)
  - `RATE_LIMIT_ENABLED=true`, `RATE_LIMIT_STORE=memory`, `RATE_LIMIT_GLOBAL_MAX=100`, `CACHE_MEMORY_MAX_ENTRIES=10000`
  - replace "CACHE_ENABLED=false disables all caching (incl. rate-limit state)" with "does not affect rate limiting"

  Mirror the dev-relevant lines in the root `.env.example` (`TRUST_PROXY=none`, the rate-limit and cache-cap lines), and replace the same stale `CACHE_ENABLED` comment there (`.env.example:12`)
- [x] 6.43 Add `RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-redis}`, `TRUST_PROXY: ${TRUST_PROXY:-hops}` and `TRUST_PROXY_HOPS: ${TRUST_PROXY_HOPS:-1}` to the `api` service in `compose.production.yml`, with a header note about counting proxy hops (the web Caddy edge replaces `X-Forwarded-For` with its `{client_ip}`, so the API sees exactly one hop and `TRUST_PROXY_HOPS=1` stays correct with or without an outer proxy; design t4b decision 3). Add `TRUST_PROXY=none` and `RATE_LIMIT_STORE=memory` to the dev `app` service in `compose.yml`
- [x] 6.44 Group check: run `make check`, `make lint`, `make test-api` (the Valkey integration suite skipped) and `make test-web`, then `make fmt`. Confirm `make db-generate` reports "No schema changes, nothing to migrate"
- [x] 6.45 Run the Valkey integration suite once against the compose Valkey: `make up`, then `make test-specific filter=src/utils/rate-limit/redis.integration.test.ts` with `REDIS_TEST_URL` exported into the container. Record the result in the PR description
- [x] 6.46 Do a manual smoke test with `RATE_LIMIT_STORE=redis` and `CACHE_DRIVER=redis` under `make dev`:
  - `docker compose stop valkey`, then check that `GET /health` and `GET /ready` (with `cache: 'degraded'`, `rateLimitStore: 'degraded'`) and a cached GET still answer 2xx within about 1 s
  - check that one degraded warn per component appears in the logs
  - `docker compose start valkey` and check for one recovery info each

## 7. Recipe slugs and identifier uniqueness (t3)

- [x] 7.1 Write failing tests first in `packages/shared/src/utils/slug.test.ts` (delete the `ensureUniqueSlug` block):
  - `generateSlug`: `Türk Kahvesi` → `turk-kahvesi`, `İSTANBUL Şehir Rehberi` → `istanbul-sehir-rehberi`, `Iğdır Usulü` → `igdir-usulu`, `ŞEKERSİZ ÇAY` → `sekersiz-cay`, `Bob's V60_Pour Over` → `bobs-v60-pour-over`, `Crème brûlée ﬁlter ①` → `creme-brulee-filter-1`, `Straße Æble` → `strasse-aeble`; `東京コーヒー`, `Кофе` and `!!!` → `''`; a 200-character word title → at most 93 characters, no trailing `-`, ends on a word boundary; every non-empty output matches `SlugSchema`.
  - `randomSlugSuffix`: 1,000 calls all match `^<sfx>$` and at least 995 are distinct. With `vi.spyOn(globalThis.crypto, 'getRandomValues')` filling byte `250` on the first call and `5` afterwards, the result is `777777` (restore the spy in `afterEach`).
  - `slugCandidates`: `('Morning V60', ['bbbbbb','cccccc'])` → `['morning-v60','morning-v60-bbbbbb','morning-v60-cccccc']`; `('New', ['bbbbbb'])` → `['new-bbbbbb']`; a UUID title → `['<uuid>-bbbbbb']`; `('東京コーヒー', ['bbbbbb'])` → `['recipe-bbbbbb']`; `('Espresso', ['bbbbbb','bbbbbb'])` → `['espresso','espresso-bbbbbb']`.
  - `isReservedRecipeSlug`: `true` for every `RESERVED_RECIPE_SLUGS` entry and for `123e4567-e89b-12d3-a456-426614174000`; `false` for `morning-v60`.
  - Run `make test-shared` and confirm the new cases fail.
- [x] 7.2 Rewrite `packages/shared/src/utils/slug.ts`:
  - `generateSlug`: apostrophe strip → `toLowerCase()` → the 9-entry map (`ı ß æ œ ø đ ð ł þ`) → `normalize('NFKD')` + `/\p{M}+/gu` strip → `[^a-z0-9]+` → `-` → trim → 93-character cap at a hyphen boundary.
  - `SLUG_SUFFIX_ALPHABET = '23456789bcdfghjkmnpqrstvwxz'`, `SLUG_SUFFIX_LENGTH = 6` and `SLUG_SUFFIX_ATTEMPTS = 5`.
  - `randomSlugSuffix(length = SLUG_SUFFIX_LENGTH)`: `globalThis.crypto.getRandomValues` on a `Uint8Array`; discard bytes `>= 243`; map `SLUG_SUFFIX_ALPHABET[b % 27]`; refill until `length` characters.
  - `RESERVED_RECIPE_SLUGS` (the 16 words in the recipe-slug spec, `as const`), `isReservedRecipeSlug(base)` (list or UUID regex) and `slugCandidates(title, suffixes)`.
  - No `node:` import. JSDoc on every export: state the 27^6 space and the no-vowel, no-look-alike rationale.
  - Re-run `make test-shared` until green.
- [x] 7.3 Remove `ensureUniqueSlug`:
  - Delete it from `slug.ts`. Set the export line in `packages/shared/src/utils/index.ts` to `export { generateSlug, isReservedRecipeSlug, RESERVED_RECIPE_SLUGS, randomSlugSuffix, SLUG_SUFFIX_ALPHABET, SLUG_SUFFIX_ATTEMPTS, SLUG_SUFFIX_LENGTH, slugCandidates } from './slug.ts';`.
  - Delete its cases and imports in `apps/api/src/utils/qrcode/qrcode.test.ts` (`:1`, `:15`) and `apps/api/src/modules/recipe/service.test.ts` (`:22`, `:49-54`).
  - Confirm `grep -rn ensureUniqueSlug apps packages` prints nothing.
- [x] 7.4 Verify that no slug or transliteration package was added: `grep -n "slugify\|transliterat\|limax" package.json apps/*/package.json packages/*/package.json` prints nothing.
- [x] 7.5 Legacy slugs and QR codes:
  - Add failing cases to `packages/shared/src/schemas/common.test.ts`: `QrCodeFilenameSchema` accepts `cold_brew.png` and `cold-brew.svg`, and rejects `../x.png`, `a--b.png`, `-a.png` and `a.gif`.
  - Export `QR_CODE_FILENAME_PATTERN = /^([a-z0-9_]+(?:-[a-z0-9_]+)*)\.(png|svg)$/i` from `common.ts` and build `QrCodeFilenameSchema` from it. Its docblock says legacy slugs may contain `_` and new slugs never do. Keep `SlugSchema` unchanged.
  - Replace the inline regex at `apps/api/src/modules/qrcode/index.ts:56` with `QR_CODE_FILENAME_PATTERN`.
  - Add a DB-backed case to `apps/api/src/modules/qrcode/index.test.ts`: a public recipe inserted with slug `cold_brew_<m>` returns `200 image/png` from `GET /api/v1/qrcode/recipe/cold_brew_<m>.png`.
- [x] 7.6 Write failing DB-backed model tests in `apps/api/src/modules/recipe/model.create.test.ts`:
  - (a) `createRecipeWithRelations({ …, slugCandidates: [taken, free] })`, where `taken` belongs to a soft-deleted recipe, returns slug `free` with exactly one `recipe_version` row.
  - (b) With every candidate taken, it returns `null`. The `recipe` and `recipe_version` row counts for that author are unchanged.
  - (c) `forkRecipe(sourceId, authorId, 'Fork of X', [taken, free])` returns slug `free` and the source `forkCount` goes up by 1. With every candidate taken, it returns `null` and `forkCount` is unchanged.
- [x] 7.7 In `apps/api/src/modules/recipe/model.ts`:
  - Add a private `claimRecipeSlug(tx, row, slugCandidates)`. For each candidate, it runs `tx.insert(recipes).values({ ...row, slug }).onConflictDoNothing({ target: recipes.slug }).returning()`. It returns the first inserted row, or `null`, and logs `modelLog.debug({ authorId, attempt }, 'recipe slug candidate taken')` for each taken candidate.
  - Replace `CreateRecipeWithRelationsInput.slug` with `slugCandidates: readonly string[]`. Run the claim as the first write in `createRecipeWithRelations`. When it returns `null`, return `null` from the transaction callback and the function, and skip the `findById` reload.
  - Change `forkRecipe(sourceId, authorId, title, slugCandidates)` the same way. The claim replaces the bare insert at `:479-488` and runs before the version insert and the `forkCount` update.
  - Update both docblocks: the `ON CONFLICT` semantics, and why there is no savepoint and no `23505` catch.
  - Run the 7.6 tests until green.
- [x] 7.8 Write failing DB-backed tests in a new `apps/api/src/modules/recipe/service.slug.test.ts`. Every title carries `<m>`.
  - The same title twice: the second slug is `^<base>-<sfx>$`.
  - The title of a soft-deleted recipe (deleted via `deleteRecipe`): the new slug is suffixed and the deleted row keeps its slug.
  - `New`, `Starred` and a UUID title: suffixed.
  - `東京コーヒー`, `Кофе` and `!!!`: `^recipe-<sfx>$`.
  - Two forks without a title: `fork-of-<base>`, then suffixed.
  - A fork titled `<b>My</b> Fork` stores `My Fork`. A fork titled `<b></b>` stores `Fork of <source title>`.
  - Two merges with the same title: distinct slugs.
  - `Promise.all` of two `createRecipe` calls with the same new title: both resolve, distinct slugs, one version row each.
  - `updateRecipe` with a new title (amend and bump) keeps the slug.
- [x] 7.9 Write failing exhaustion tests in a new `apps/api/src/modules/recipe/service.slug-exhaustion.test.ts`, using `vi.mock('@brewform/shared/utils', async (importOriginal) => ({ ...(await importOriginal()), randomSlugSuffix: () => 'bbbbbb' }))`:
  - Create title `Exhaust <m>` twice (taking `<base>` and `<base>-bbbbbb`). A third `createRecipe` rejects with `ConflictError` whose code is `SLUG_CONFLICT`.
  - Through `app.request`, the third `POST /api/v1/recipes` returns `409` with `error.code === 'SLUG_CONFLICT'` and `error.message === 'Could not allocate a unique recipe slug'`.
  - A third untitled fork of the same recipe returns `409 SLUG_CONFLICT`.
  - No `Unhandled error` log line (spy on the error-handler logger).
- [x] 7.10 In `apps/api/src/modules/recipe/service.ts`:
  - Replace `generateUniqueSlug` with `buildRecipeSlugCandidates(title)`, which returns `slugCandidates(title, Array.from({ length: SLUG_SUFFIX_ATTEMPTS }, () => randomSlugSuffix()))`. Import both from `@brewform/shared/utils`, which keeps the 7.9 mock effective.
  - `createRecipe` passes `slugCandidates`.
  - `forkRecipe` sanitizes the supplied title with `sanitizeText`, falls back to `Fork of ${source.title}` when the result is empty, and passes `buildRecipeSlugCandidates(forkTitle)`.
  - On a `null` model result, both log `logger.warn({ authorId, attempts, constraint: 'recipe_slug_unique' }, 'recipe slug candidates exhausted')` and `throw new ConflictError('SLUG_CONFLICT', 'Could not allocate a unique recipe slug')`.
  - `mergeRecipes` keeps delegating to `createRecipe`.
  - Remove the `ensureUniqueSlug` import. Update the docblocks of `createRecipe`, `forkRecipe` and `mergeRecipes`, and keep the entry/exit debug logs.
  - Run 7.6–7.9 until green.
- [x] 7.11 Replace the three `throw new Error('VALIDATION_ERROR: Title cannot be empty')` sites in `recipe/service.ts` with `throw new ValidationError('Title cannot be empty', [{ field: 'title', message: 'Title cannot be empty' }])`. Add a route test that `POST /api/v1/recipes` with `title: '<b></b>'` returns `400 VALIDATION_ERROR`.
- [x] 7.12 Add a route test to `apps/api/src/modules/recipe/index.test.ts` that posts the same create payload twice and asserts `201` both times with different slugs.
- [x] 7.13 Add drift guards:
  - `apps/api/src/modules/recipe/reserved-slugs.test.ts` iterates `recipe.routes` (the default export of `apps/api/src/modules/recipe/index.ts`). It asserts that every first path segment that is not a `:param` is in `RESERVED_RECIPE_SLUGS`.
  - `apps/web/src/router.reserved-slugs.test.ts` reads `apps/web/src/router.tsx` with `node:fs`. It asserts that every `path: 'recipes/<segment>…'` whose `<segment>` is not a `:param` is in `RESERVED_RECIPE_SLUGS`.
  - Both name the missing word on failure.
- [x] 7.14 Write failing schema tests:
  - `packages/db/src/schema-indexes.test.ts`, via `getTableConfig`: `users` has indexes `user_email_lower_unique` and `user_username_lower_unique` with `config.unique === true`, and `setups` has `setup_user_default_unique` with `config.unique === true` and a defined `config.where`.
  - `packages/db/src/schema-constraints.test.ts` (DB-backed): inserting emails `Case<m>@example.com` and `case<m>@example.com` fails on the second with `cause.code === '23505'` and `cause.constraint_name === 'user_email_lower_unique'`. Usernames `Arda<m>`/`arda<m>` fail the same way on `user_username_lower_unique`. Two active default setups for one user fail on `setup_user_default_unique`. A soft-deleted default plus an active default succeed.
- [x] 7.15 Edit `packages/db/src/schema.ts`:
  - Export `lower(column: AnyPgColumn): SQL`, returning `` sql`lower(${column})` ``, with the comment `// D03 raw-SQL exception: Drizzle has no lower() builder; used by the case-insensitive unique indexes and the matching lookups.` Import `SQL` from `drizzle-orm` and `uniqueIndex` from `drizzle-orm/pg-core`.
  - Add `uniqueIndex('user_email_lower_unique').on(lower(table.email))` and `uniqueIndex('user_username_lower_unique').on(lower(table.username))` to `users`. Keep `.unique()` on both columns and the existing plain indexes.
  - Add ``uniqueIndex('setup_user_default_unique').on(table.userId).where(sql`${table.isDefault} = true and ${table.deletedAt} is null`)`` to `setups`.
  - Update the `users` and `setups` docblocks.
  - Run `make db-generate`. Inspect, without editing, the new SQL: two `CREATE UNIQUE INDEX … USING btree (lower(…))` statements and `CREATE UNIQUE INDEX "setup_user_default_unique" ON "setup" USING btree ("user_id") WHERE …`.
  - Run `make db-migrate` and `make test-db-provision`. Run `make db-generate` again and confirm `No schema changes, nothing to migrate`.
  - Run `make test-specific filter=src/schema-indexes.test.ts` and `make test-specific filter=src/schema-constraints.test.ts`.
- [x] 7.16 Write failing shared tests:
  - `packages/shared/src/schemas/common.test.ts`: `EmailSchema.parse('  Mixed.Case@Example.COM ') === 'mixed.case@example.com'`, and `'not-an-email'` fails.
  - `auth.test.ts`: `AuthRegisterSchema`, `AuthLoginSchema` and `PasswordResetSchema` lower-case and trim the email. A register username `' Arda '` parses to `'Arda'`.
  - `admin.test.ts`: the same for admin create/update email.
  - `packages/shared/src/utils/username.test.ts`: `isReservedUsername('Support')`, `('ADMIN')` and `('deleted-abc123')` are `true`; `('arda')` is `false`.
  - `mention.test.ts`: `parseMentions('@Arda @arda @bob')` → `['Arda', 'bob']`.
- [x] 7.17 Implement the shared changes:
  - `EmailSchema = z.string().trim().toLowerCase().max(255).pipe(z.email())` in `packages/shared/src/schemas/common.ts`. Its JSDoc explains why the email check comes after the pipe (Zod 4 runs format checks before chained transforms). Export it from `schemas/index.ts`.
  - Use it in place of `z.email()` at `auth.ts:25,40,59` and `admin.ts:11,30` (`.optional()` on update). Leave the contact schema untouched.
  - Put `.trim()` first on the register and admin username schemas.
  - Add `RESERVED_USERNAMES` (the 17 names in the unique-identifiers spec) and `isReservedUsername` to `packages/shared/src/utils/username.ts`, and export them from `utils/index.ts`.
  - Make `parseMentions` de-duplicate by `toLowerCase()` key, keeping the first spelling.
  - JSDoc on every new export. Run `make test-shared` until green.
- [x] 7.18 Write failing API tests in `apps/api/src/modules/auth/index.test.ts`:
  - Register `Mixed<m>@Example.com`: the stored email is `mixed<m>@example.com`. Registering `MIXED<m>@example.com` again gives `409 Email already registered`.
  - Login with `MIXED<m>@EXAMPLE.COM` gives `200`.
  - A legacy row inserted directly with `Legacy<m>@Example.com` logs in with `legacy<m>@example.com`, and forgot-password with `LEGACY<m>@example.com` creates a `password_reset` row.
  - `Arda<m>` and then `arda<m>` gives `409 Username already taken`.
  - After soft-deleting `Del<m>` / `del<m>@example.com`: registering `DEL<m>@Example.com` gives `409 Email already registered`, registering username `del<m>` gives `409 Username already taken`, and neither logs `Database constraint violation`.
  - `Support` and `deleted-abc<m>` give `409 Username already taken`.
  - Concurrent `Race<m>`/`race<m>` registrations give one `201` and one `409`.
  - In `apps/api/src/modules/admin/index.test.ts`: renaming user B to `ARDA<m>` while A holds `Arda<m>` gives `409 Username is already taken by another user.` Creating a user with the reserved username `brewform` through `POST /api/v1/admin/users` returns `201`. Before the request, the test hard-deletes any leftover `brewform` row through `db`, and it hard-deletes the created row in `finally` (`user_preferences` cascades).
- [x] 7.19 Change the models:
  - `apps/api/src/modules/auth/model.ts`:
    - `findUserByEmail`, `findUserByUsername`, `isEmailTaken` and `isUsernameTaken` compare with `eq(lower(users.<col>), value.toLowerCase())`.
    - The two `is…Taken` functions drop `isNull(users.deletedAt)`. Their docblocks and the module docblock state the exception (the unique indexes cover soft-deleted rows, and deleted usernames stay reserved).
    - Export `USER_EMAIL_CONSTRAINTS = ['user_email_unique', 'user_email_lower_unique'] as const` and `USER_USERNAME_CONSTRAINTS = ['user_username_unique', 'user_username_lower_unique'] as const`.
  - `apps/api/src/modules/admin/model.ts`: `isEmailTaken`/`isUsernameTaken` change the same way, keeping `excludeId`. `throwIfUniqueViolation` maps through `USER_EMAIL_CONSTRAINTS.some((c) => isUniqueViolation(err, c))` and the username equivalent.
  - `apps/api/src/modules/user/model.ts`: `findByUsername` uses `eq(lower(users.username), username.toLowerCase())`.
  - `apps/api/src/modules/notification/model.ts`: `findMentionTargets` uses `inArray(lower(users.username), usernames.map((u) => u.toLowerCase()))`.
  - Import `lower` from `@brewform/db/schema`. Services never import it.
- [x] 7.20 In `apps/api/src/modules/auth/service.ts`, `register` throws `USERNAME_ALREADY_EXISTS` when `isReservedUsername(data.username)` (before `isUsernameTaken`). The `23505` race mapping from task 2.11 uses `USER_EMAIL_CONSTRAINTS`/`USER_USERNAME_CONSTRAINTS`. Keep the existing `register started/completed` debug logs (no identifiers in logs). Run `make test-specific filter=src/modules/auth` and `make test-specific filter=src/modules/admin`.
- [x] 7.21 Write case-insensitive lookup tests:
  - `apps/api/src/modules/user/index.test.ts`: `GET /api/v1/users/ARDA<m>` for user `Arda<m>` returns `200` with `username === 'Arda<m>'`.
  - `apps/api/src/modules/comment/service.test.ts`: a comment containing `@arda<m>` creates exactly one `mention` notification for `Arda<m>`.
- [x] 7.22 Fix the own-profile check:
  - In `apps/web/src/pages/users/UserProfilePage.tsx`, compare ids instead of usernames: the loader's brews-tab check (`:74`) becomes `viewer?.id === profile.id`, and `isSelf` (`:123`) becomes `user?.id === profile.id`.
  - Add a case to `UserProfilePage.test.tsx`: viewer `{ id: 'u1', username: 'Arda' }` at `/u/arda` with profile `{ id: 'u1', username: 'Arda' }` renders the own-profile UI (no follow button) and requests the brew journal for `?tab=brews`.
  - Run `make test-web`.
- [x] 7.23 In `packages/db/src/seed.ts`, add an exported pure `normalizeAdminEmail(raw: string | undefined): string` (`(raw || 'admin@brewform.local').trim().toLowerCase()`) and use it for the admin insert and the fallback select. Unit-test it in `packages/db/src/seed.test.ts` (`' Admin@BrewForm.Local '` → `'admin@brewform.local'`; `undefined` → the default). Confirm `packages/db/src/seed.idempotent.test.ts` still passes.
- [x] 7.24 Make the default-setup switch transactional:
  - Write failing tests first. In `apps/api/src/modules/setup/service.test.ts`: `Promise.all` of `setDefault` on two setups of one user leaves exactly one active default, and each call resolves or rejects with an error that the route maps to `409`. `createSetup({ isDefault: true })` clears the previous default.
  - In `apps/api/src/modules/setup/index.test.ts`: the concurrent route calls return `200`/`409`, never `500`.
  - Then in `apps/api/src/modules/setup/model.ts`, `create(data)` and `update(id, data, ownerId)` run "clear the owner's other active default + write" in one `db.transaction` when `data.isDefault === true`. Remove `clearDefaultForUser`.
  - In `service.ts`, `createSetup`, `updateSetup` and `setDefault` stop calling it, and `setDefault` calls `model.update(id, { isDefault: true }, userId)`.
  - Update the docblocks and keep the entry/exit logs.
- [x] 7.25 Add join-row re-add regression tests:
  - `apps/api/src/modules/recipe/index.test.ts`: `POST /:id/like` three times (like, unlike, like) leaves one `user_recipe_like` row. The same for `POST /:id/favourite`.
  - `apps/api/src/modules/follow/index.test.ts`: follow, unfollow, follow leaves one `user_follow` row.
  - `apps/api/src/modules/collection/service.test.ts`: add, remove, add leaves one `collection_item` row.
- [x] 7.26 Write failing tests in a new `packages/db/src/check-identifiers.test.ts`:
  - Pure cases: `groupCaseInsensitiveDuplicates` over `A@x.io` (active), `a@x.io` (soft-deleted) and `b@x.io` returns one group with both ids, the deleted member marked fixable. `findMultipleDefaults` lists the older default for clearing. `formatReport` output contains no email address. `hasBlockingIssues` is `true` for any email, username or default group and `false` for empty slugs only.
  - DB-backed cases against `brewform_test`: `runCheck(db, {})` reports zero blocking issues. A recipe inserted with `slug = ''` is reported by id (skip when one already exists; delete it in `finally`), and `runCheck(db, { fixEmptySlugs: true })` gives it a slug matching `^recipe-<sfx>$`.
- [x] 7.27 Implement `packages/db/src/check-identifiers.ts`:
  - Module docblock modelled on `check-users-empty.ts`: purpose, invocation, output contract and the "never prints emails" rule.
  - Exported pure functions plus `runCheck(database, { fixDeletedDuplicates?, fixSetupDefaults?, fixEmptySlugs? })`.
  - It loads only the columns listed in the unique-identifiers spec.
  - Fixes, each in its own transaction:
    - deleted duplicates → `email = deleted+<id>@deleted.invalid`, `username = deleted-<first 12 hex of id without dashes>`;
    - setup defaults → keep the newest `updatedAt`;
    - empty slugs → `slugCandidates('', suffixes)` from `@brewform/shared/utils`, trying the next candidate on a unique violation.
  - CLI via `node:util` `parseArgs` (`--fix-deleted-duplicates`, `--fix-setup-defaults`, `--fix-empty-slugs`), guarded by `if (import.meta.main)`. Exit code `1` on blocking issues left after fixes. `client.end()` in `finally`.
  - For active-account groups, print the manual admin-rename instructions.
  - Add `"check-identifiers": "tsx src/check-identifiers.ts"` to `packages/db/package.json`.
  - Run `make test-specific filter=src/check-identifiers.test.ts`.
- [x] 7.28 Add a `db-check-identifiers` target to the `Makefile`: `docker compose run --rm app pnpm --filter @brewform/db run check-identifiers -- $(args)`, with a `##` help line and a `.PHONY` entry. Verify `make db-check-identifiers` exits `0` on the dev DB and `make db-check-identifiers args=--fix-setup-defaults` runs.
- [x] 7.29 Docs:
  - `docs/api.md` gets an "Account identifiers" note: emails are trimmed and lower-cased; emails and usernames are unique case-insensitively, and usernames keep their display case; identifiers of deleted accounts stay reserved (`409`); reserved usernames are refused as taken.
  - `docs/deployment_coolify.md` upgrade notes add a "Before upgrading to wave 6" step: on the server, run the check from the new image as a one-off container on the API's network, `docker run --rm --network <API network> -e DATABASE_URL=<API value> --entrypoint node ghcr.io/ardakilic/brewform-api:<new tag> /app/packages/db/src/check-identifiers.ts`, fix what it reports (the opt-in flags, or the admin rename path), and then redeploy. If the step is skipped and data conflicts, the migration rolls back, the new container never becomes healthy and the old one keeps serving. `docs/deployment_compose.md` gets the compose equivalent (`make prod-check-identifiers`) in task 22.9.
- [x] 7.30 Group check: run `make check`, `make lint`, `make test-shared`, `make test-api` (after `make test-db-provision`), `make test-web`, `make test-specific filter=src/check-identifiers.test.ts`, `make db-check-identifiers` (exit `0`) and `make db-generate` (`No schema changes, nothing to migrate`), then `make fmt` and `make fmt-check`. All must be green.

## 8. Recipe write integrity — shared schemas, model, service and route (t1, refine D2a)

- [x] 8.1 Add failing tests to `packages/shared/src/schemas/recipe.test.ts`:
  - `RecipeUpdateSchema.parse({ title: 'x' })` deep-equals `{ title: 'x', bumpVersion: false }` (no `visibility` or `isFavourite` key).
  - `Object.keys(RecipeUpdateSchema.parse({}))` equals `['bumpVersion']` (drift guard against any future `.default()` on an update field).
  - `null` is accepted for the clearable fields and rejected for `title`, `brewMethod`, `drinkType`, `preparationNotes`, `visibility`, `isFavourite` and `brewDate`.
  - `tasteNoteIntensities` without `tasteNoteIds` is rejected.
  - The cross-field refinements apply to updates.
- [x] 8.2 Add failing cases to `packages/shared/src/schemas/recipe.test.ts`: duplicate ids in `tasteNoteIds` and `equipmentIds` are rejected on create and update with the message `Duplicate ids are not allowed`. Then add `.refine((ids) => new Set(ids).size === ids.length, { message: 'Duplicate ids are not allowed' })` to the shared id-array schema both fields use (`recipe-write` requirement "Recipe payloads reject duplicate relation ids"). Add a route test to `apps/api/src/modules/recipe/index.test.ts`: `POST /api/v1/recipes` with `tasteNoteIds: [a, a]` returns `400 VALIDATION_ERROR` and writes no recipe row.
- [x] 8.3 Extract the five cross-field rules into an exported pure `recipeCrossFieldIssues(data)` in `packages/shared/src/schemas/recipe.ts`. Use it from `RecipeCreateSchema` via `.superRefine`, keeping the same messages and paths, and unit-test it directly.
- [x] 8.4 Build `RecipeUpdateObjectSchema` field by field: `.nullish()` for clearable fields, `.optional()` for required fields, no `.default()`. Then set `RecipeUpdateSchema = RecipeUpdateObjectSchema.extend({ bumpVersion: z.boolean().default(false) }).superRefine(recipeCrossFieldIssues + intensities-require-ids)`. Update the docblocks to describe absent/null/[] semantics.
- [x] 8.5 Add `coffeeVarietyId: z.uuid().optional()` to `RecipeCreateObjectSchema` (nullish on update). Remove `brewRatio` and `flowRate` from the input schemas. Update the affected shared tests and `RecipeUpdate`/`RecipeCreate` consumers.
- [x] 8.6 Add a version-column mapping helper to `apps/api/src/modules/recipe/model.ts` (`versionColumnsFrom(resolved)` and `copyVersionColumns(source)`) covering every `recipeVersions` column except `id`, `recipeId`, `versionNumber` and `createdAt`. Add the drift-guard test to `model.test.ts` using `getTableColumns(recipeVersions)`.
- [x] 8.7 Extend `CreateRecipeWithRelationsInput` with `tds: string | null`, `coffeeVarietyId: string | null` and `coffeeVarietyName: string | null`. Insert them through the mapping in `createRecipeWithRelations`, and update its docblock.
- [x] 8.8 Extend `forkRecipe` to copy `tds`, `coffeeVarietyId` and `coffeeVarietyName` through the copy mapping, while keeping the reset of `rating` and `isFavourite`.
- [x] 8.9 Add the reference lookups to `model.ts`: `findExistingTasteNoteIds`, `findExistingEquipmentIds` (non-deleted), `findVendor`, `findOwnedBean(beanId, userId)` and `findCoffeeVariety(id)` (non-deleted, returns `{ id, name }`).
- [x] 8.10 Add `updateRecipeWithVersion(input: UpdateRecipeWithVersionInput)` to `model.ts`, with `mode: 'amend' | 'bump'`, resolved version columns, optional relation arrays and recipe-level fields. It runs one `db.transaction`:
  1. Lock the recipe row with `.for('update')`.
  2. Read the current version and its relations.
  3. **amend**: update the current version and replace each provided relation.
  4. **bump**: compute `max(versionNumber) + 1`, insert the version, and copy or replace taste notes (with intensities), equipment, preparations (`sortOrder`) and photos.
  5. Update `recipes` (title, visibility, `currentVersionId` on bump, `updatedAt`).
  6. Return `findById` after commit.
  Include entry/exit/error logs with `{ recipeId, mode, versionNumber }` and a JSDoc. Remove `createVersion`, `insertVersionPhotos` and `getVersionPhotos` if they become unused.
- [x] 8.11 Extend `model.create.test.ts` (tds and variety round-trip) and add `model.update.test.ts`:
  - Amend replaces provided relations and keeps the rest.
  - Bump copies every relation with intensities and sortOrder.
  - Bump replaces relations when provided.
  - The earlier version is untouched.
  - A thrown error mid-transaction leaves no rows.
  - Two concurrent bumps get consecutive numbers.
  - Add fork copies `tds`/variety to `model.test.ts`.
- [x] 8.12 Add failing service regression tests in `apps/api/src/modules/recipe/service.update.test.ts`:
  - A non-bump `grindSize` edit persists.
  - A bump keeps taste notes with intensities, equipment, preparations, photos, `tds` and variety.
  - A title-only update keeps a public recipe public.
  - A bump keeps `isFavourite`.
  - An amend (`bumpVersion: false`) that omits `isFavourite` and `visibility` keeps both (current version `isFavourite: true` stays true; a `public` recipe stays `public`).
  - `null` and `[]` clear.
  - An empty sanitized title on a bump leaves no orphan version.
  - A merged cross-field violation is rejected.
  - An unknown `coffeeVarietyId`, `tasteNoteId` or a foreign `beanId` is rejected before any write.
  - `setupId` on update fills grinder and brewerDetails only when they are absent.
- [x] 8.13 Refactor `updateRecipe` in `apps/api/src/modules/recipe/service.ts`:
  1. Load the recipe and check the author.
  2. Build merged values (absent keeps, null clears) and recompute `brewRatio`/`flowRate`.
  3. Run `recipeCrossFieldIssues` on the merged values, check references, check equipment compatibility on the merged brew method and equipment set, sanitize the title and brewer notes (empty becomes `NULL`), normalize `tds` with `String(n)`, and resolve `coffeeVarietyName`.
  4. Only then call `model.updateRecipeWithVersion({ mode: bumpVersion ? 'bump' : 'amend', ... })`.
  Throw t3's typed `ValidationError` (with `details`) from `apps/api/src/utils/errors.ts` (task 2.2). Bump `brewDate` is the payload value or now. Update the docblock and keep the entry/exit logs.
- [x] 8.14 Update `createRecipe`: run reference validation and variety-name resolution before the helper, pass `tds` (as a string), `coffeeVarietyId` and `coffeeVarietyName`, store empty brewer notes as `NULL`, and update the docblock.
- [x] 8.15 Extend `service.create.test.ts` (tds and variety persisted; an invalid reference writes nothing) and update the old `describe('updateRecipe')` expectations in `service.test.ts:938-975` to the amend semantics.
- [x] 8.16 Update `PATCH /:id` in `apps/api/src/modules/recipe/index.ts`:
  - Add the `isEmailVerified` gate, returning 403 `EMAIL_NOT_VERIFIED`.
  - Map `VALIDATION_ERROR*` to 400 with details (via `validationError`/`error`), `FORBIDDEN` to 403 and `RECIPE_NOT_FOUND` to 404. Leave 422 and 409 to `errorHandler`.
  - Add full `describeRoute` metadata: description of amend versus bump and absent/null/[], `jsonRequestBody(RecipeUpdateSchema)`, 200 as `resolver(successEnvelope(RecipeDetailOutputSchema))`, and 400/401/403/404/409/422 as `resolver(ErrorEnvelopeSchema)`.
- [x] 8.17 Map the `VALIDATION_ERROR*` service errors to 400 in the `POST /` handler, which covers the empty title and invalid references.
- [x] 8.18 Extend `apps/api/src/modules/recipe/index.test.ts`:
  - A PATCH from an unverified author returns 403.
  - An empty title returns 400 (not 500).
  - A title-only PATCH keeps visibility.
  - A bump round-trip through `GET /:slug` keeps taste notes, equipment, `tds` and variety.
  - `POST /` with an unknown `tasteNoteId` returns 400.
  - `POST /` with `tds` and `coffeeVarietyId` returns them in the response.
  - The recipe is listed under `?coffeeVarietyId=` and `/coffee-varieties/:id/recipes` after a bump.
- [x] 8.19 Update the `recipeVersions` docblock in `packages/db/src/schema.ts:208` ("current version may be amended by its author; earlier versions are immutable"). This is comment-only; confirm `make db-generate` still reports no changes.
- [x] 8.20 Group check: run `make test-shared` and `make test-api`. Confirm the data-loss regression tests named in the `recipe-write` spec pass.

## 9. Collection visibility, shared visibility helpers, conflict responses in OpenAPI and error docs (t3, refine D4, OQ1)

- [x] 9.1 Write the failing predicate test `apps/api/src/modules/recipe/service.visibility.test.ts`:
  - `canListRecipe` is evaluated over visibility {`public`, `unlisted`, `private`, `draft`} × `deletedAt` {`null`, a `Date`, an ISO string} × viewer {`null`, the author, another user};
  - it is `true` only for non-deleted `public` (any viewer) and for any non-deleted visibility when the viewer is the author;
  - add a `canViewRecipe` matrix that locks today's behaviour (`public`/`unlisted` → `true` for everyone; `draft`/`private` → only for the author or `isAdmin: true`).
- [x] 9.2 Write the failing DB-backed parity test `apps/api/src/modules/recipe/model.visibility.test.ts`:
  - fixtures: author A owns one recipe in each of the 4 visibilities, plus a soft-deleted copy of each;
  - for viewer ∈ {`null`, A, B}, `db.select({ id: recipes.id }).from(recipes).where(and(inArray(recipes.id, fixtureIds), listableRecipeCondition(viewer)))` returns exactly the fixtures for which `canListRecipe(row, viewer)` is `true`;
  - `viewableRecipeCondition(viewer)` returns exactly those for which `canViewRecipe(row, viewer) && row.deletedAt === null`;
  - leave a `describe.todo('maskUnlistableForkSources')` placeholder for task 11.4.
- [x] 9.3 Implement the helpers:
  - in `apps/api/src/modules/recipe/model.ts`, the exported `listableRecipeCondition(viewerId: string | null): SQL` and `viewableRecipeCondition(viewerId: string | null): SQL`, built only from Drizzle `and`/`or`/`eq`/`inArray`/`isNull` with no `sql` fragment, both including `isNull(recipes.deletedAt)`, each with a docblock that cites the `recipe-visibility` capability and states "discovery surfaces pass `null`";
  - in `apps/api/src/modules/recipe/service.ts`, the pure `canListRecipe(recipe: { visibility: string; authorId: string; deletedAt?: Date | string | null }, viewerId?: string | null): boolean` beside `canViewRecipe`, with a docblock and no logging (the same deliberate deviation as `canViewRecipe`).
  - Run `make test-specific filter=src/modules/recipe/service.visibility.test.ts` and `make test-specific filter=src/modules/recipe/model.visibility.test.ts`; both pass.
- [x] 9.4 Write failing DB-backed tests first in `apps/api/src/modules/collection/service.test.ts`:
  - a soft-deleted item is hidden from the anonymous viewer, the owner and the recipe author;
  - another author's recipe made private is hidden from anonymous viewers and from the owner, but returned to its author;
  - another author's recipe made unlisted is hidden from anonymous viewers, from the owner and from a third user, but returned to its author;
  - the owner's own draft and own unlisted recipe are hidden from others and returned to the owner;
  - `recipeCount === items.length`;
  - an item that is a public fork of an unlisted recipe has `recipe.forkedFromId === null` for every viewer (collection items mask viewer-independently, because the cached shape is shared);
  - warm cache → recipe made private → the next anonymous hit omits it without calling `model.findById` (spy via the provider test hook);
  - warm cache → recipe made unlisted → the next anonymous hit and the owner's hit omit it;
  - warm cache → recipe soft-deleted → it is omitted;
  - warm cache → fork source made unlisted → the item's `forkedFromId` becomes `null`;
  - reorder with a hidden item succeeds with visible ids and rejects a payload that contains the hidden id.

  In `index.test.ts`, an anonymous `GET /api/v1/collections/:id` body contains neither the private recipe's title and slug nor the unlisted recipe's title and slug.
- [x] 9.5 Add `getRecipeVisibilityStates(recipeIds)` to `apps/api/src/modules/collection/model.ts` (select `id`, `visibility`, `authorId`, `deletedAt` from `recipes` with `inArray`, early `[]` on empty input, no `deletedAt` filter); model tests for a soft-deleted id and empty input
- [x] 9.6 Change the batched `recipeCount` queries in `findByUserId` and `findAllPublic` (and therefore `findPublicByUserId`) to `innerJoin(recipes, eq(collectionItems.recipeId, recipes.id))`, filtered by the shared condition imported from `../recipe/model.ts`: `listableRecipeCondition(userId)` for the owner's list and `listableRecipeCondition(null)` for public lists. Add an audience parameter so that `findPublicByUserId` counts as anonymous. Do not compare `recipes.visibility` inline. Extend `model.test.ts` with owner-vs-anonymous count cases: public, own draft, own unlisted, another author's unlisted, another author's private, soft-deleted (owner `3`, anonymous `1`).
- [x] 9.7 In `apps/api/src/modules/collection/service.ts`, add one `filterItemsForViewer(detail, viewerId, states)` helper:
  - drop items whose recipe is missing from `states`, is soft-deleted, or fails `canListRecipe(state, viewerId)` (import the canonical predicate from `../recipe/service.ts`; do not re-implement it);
  - set `item.recipe.forkedFromId` to `null` when its source is absent from `states` or fails `canListRecipe(sourceState, null)`;
  - recompute `recipeCount`.

  Make `toDetailOutput` exclude items whose recipe is null or already deleted at fill time.
- [x] 9.8 Apply the filter in `getCollection` on both paths through the same code:
  - after the collection visibility check (cache miss) or re-check (cache hit), call `model.getRecipeVisibilityStates([...itemRecipeIds, ...itemForkSourceIds])` once and pass the states to `filterItemsForViewer`;
  - on a miss, cache the unfiltered, viewer-independent shape and return the filtered one;
  - apply the same filter in the `createCollection`/`updateCollection` outputs, with the owner as viewer;
  - log `hiddenCount` and `maskedForkCount` (counts only) in the `getCollection completed` / `cache hit` debug lines.
- [x] 9.9 Rework `reorderCollection` to validate `itemIds` against the owner-listable set (`canListRecipe(recipe, ownerId)` over fresh `getRecipeVisibilityStates`) (no duplicates, same size, all members) and pass the hidden item ids (in current order) to `model.reorderItems` so they receive the trailing `sortOrder` values in the same transaction; update docblocks of `reorderCollection`, `reorderItems`, `getCollection` and `findById`
- [x] 9.10 Confirm `removeRecipeFromCollection` and `addRecipeToCollection` behavior is unchanged (add rule: own recipes of any visibility, others' public only) and keep their existing entry/exit logs
- [x] 9.11 Add regression locks to `apps/api/src/modules/collection/index.test.ts`. They must pass after tasks 9.7-9.10 and protect the listing rule for collections:
  - an `unlisted` collection K owned by A is absent from `GET /api/v1/collections/public`;
  - K is absent from `GET /api/v1/users/<A>/collections` for an anonymous caller and for B, and present for A;
  - K is absent from `GET /api/v1/recipes/<slug>/collections` for B for a public recipe inside K;
  - anonymous `GET /api/v1/collections/<K>` returns `200` and lists only K's public items;
  - `POST /api/v1/collections/:id/recipes` by B with A's unlisted recipe returns `403`.
- [x] 9.12 Add failing cases to `apps/web/src/components/collections/AddToCollectionModal.test.tsx`: the hidden-recipe note renders for `recipeVisibility` `draft`, `private` and `unlisted`, and not for `public`.
- [x] 9.13 Add an optional `recipeVisibility` prop to `apps/web/src/components/collections/AddToCollectionButton.tsx` and `AddToCollectionModal.tsx`, pass `recipe.visibility` from `apps/web/src/pages/recipes/RecipeDetailPage.tsx`, and render `t('collection.modal.hiddenRecipeNote')` under the collection list when it is `draft`, `private` or `unlisted`; update component docblocks
- [x] 9.14 Add `collection.modal.hiddenRecipeNote` to BOTH `packages/shared/src/i18n/en.json` ("Only you can see this recipe in your collections until you make it public.") and `packages/shared/src/i18n/tr.json` ("Bu tarifi herkese açık yapana kadar koleksiyonlarında yalnızca sen görebilirsin.")
- [x] 9.15 Add `400` and `409` `resolver(ErrorEnvelopeSchema)` responses to the `describeRoute` blocks of `POST /api/v1/recipes`, `PATCH /api/v1/recipes/:id`, `POST /api/v1/recipes/:id/fork` and `POST /api/v1/recipes/merge` in `apps/api/src/modules/recipe/index.ts`, and `409` to `POST /api/v1/auth/register` if missing (keep `zValidator`; no success-shape change); run `make test-specific filter=openapi.coverage.test.ts`
- [x] 9.16 Update the error-code table in `docs/api.md` (add `BAD_REQUEST` 400, `SLUG_CONFLICT` 409, `PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429; widen `CONFLICT` to "unique-constraint conflict"; note that `VALIDATION_ERROR` also covers invalid references)
- [x] 9.17 Rewrite the "Error path" section of `docs/request-lifecycle.md` (it claims every unhandled error is a 500): document `AppError`, the HTTPException, Postgres SQLSTATE and legacy-convention mappings, the `cause`-chain unwrapping, and that DB error logs never include query parameters
- [x] 9.18 Add a "Slugs" section to `docs/recipes.md`: built-in ASCII transliteration (Turkish included); a `recipe-<suffix>` fallback for non-Latin titles; a 6-character suffix from `23456789bcdfghjkmnpqrstvwxz` when the bare slug is taken (soft-deleted recipes included); reserved words and UUID-shaped titles always suffixed; the in-transaction `ON CONFLICT (slug) DO NOTHING` claim with `409 SLUG_CONFLICT` on exhaustion; slug immutability on rename; legacy `_` slugs accepted by the QR route; and that slugs are title-derived, so `unlisted` means "not listed", not "secret" (use `private` for secrecy).
- [x] 9.19 Add a short "Visibility of items" note to the collections section of `docs/api.md`: unlisted, private and draft recipes are shown only to their own author, and deleted recipes to nobody; collection ownership grants nothing; counts follow the audience (the owner's list counts the owner's own non-public recipes, public lists count public recipes only); unlisted collections open by direct link and are never listed to non-owners; link to the "Visibility" section (task 11.11).
- [x] 9.20 Group check: run `make check`, `make lint`, `make test-shared`, `make test-api` (after `make test-db-provision`), `make test-web`, then `make fmt` and `pnpm run fmt-check` (via `make fmt-check`); all green

## 10. Search: database-side ranking, bounds, literal matching, pre-flight and time budget (t7, refine U2)

- [ ] 10.1 Verify `pg_trgm` is available in both official images: `docker compose exec -T postgres psql -U brewform -d brewform -c "SELECT name, default_version FROM pg_available_extensions WHERE name = 'pg_trgm'"` (compose, `postgres:18-trixie`) and the same query in a throwaway `postgres:18-alpine` container (CI image). Both ship the contrib modules; assert one row in each and record `default_version` in the PR description. The permanent guard is the migration pre-flight (tasks 10.22 and 20.2).
- [ ] 10.2 Re-read `apps/api/src/modules/recipe/model.ts:101-150,359-432,1191-1232` and `service.ts:407-611` to confirm the line references in the design before editing. Note any drift in the PR description.
- [ ] 10.3 Create DB-backed `apps/api/src/modules/recipe/model.search.test.ts` (fixture helpers modelled on `model.cursor.test.ts`; clean up inserted rows in `afterEach`). Add failing cases: (a) 25 productName-only matches newer than one title-only match, `perPage=10`: title match is first on page 1. (b) Best single version scored, not summed across versions. (c) Equal scores ordered by `sortBy=likeCount desc`, then `id`. (d) `İstanbul Blend` title ranked ahead of productName-only matches for `istanbul`. (e) 1000 matches (two versions each), `page=3&perPage=10`: 10 rows, `total` 1000. (f) Page 101 is empty with `total` 1000. (g) `sortBy=rating` desc/asc with unrated last. (h) 30 recipes with `likeCount` 0: pages 1–3 are disjoint and complete. (i) No `versions` key on list items.
- [ ] 10.4 Add to `apps/api/src/modules/recipe/model.search.test.ts`: (j) a 1000-recipe fixture (two versions each, bulk-inserted in one `db.insert(...).values([...])` per table, deleted in `afterAll`) where `findListPage({ search: 'espresso', page: 3, perPage: 10, … })` run on a test `drizzle(client, { schema, logger: { logQuery: (q) => queries.push(q) } })` instance issues exactly two statements, returns 10 rows and `total` 1000, and no row has `versions`, `productName` or `personalNotes`; page 101 is empty with `total` 1000. (k) literal matching: `a_c` returns `a_c` not `abc`; `100%` returns `100% Arabica` not `1000 Arabica`; `\` returns only the recipe whose productName is `C:\beans`; `'   '` behaves as no search. (l) visibility: private, draft, unlisted and soft-deleted recipes titled `zq7hidden`, and a private recipe whose older version's productName is `zq7legacy`, never match for an anonymous viewer or a non-author; a search result set is a subset of the same listing without `search`.
- [ ] 10.5 Add a failing unit test in `model.search.test.ts` asserting `buildListPageQuery({ search: 'espresso', page: 3, perPage: 10, … }).toSQL()` contains `limit` and `offset` with params 10 and 20, and that `'findAllForRanking' in model` is `false`.
- [ ] 10.6 Add failing cases to `packages/shared/src/schemas/recipe.test.ts`: `search` of 201 chars is rejected, `'  espresso  '` parses to `'espresso'`, 200 chars accepted.
- [ ] 10.7 Add failing route tests to `apps/api/src/modules/recipe/index.test.ts`: `perPage=101` → 400 envelope. 201-char `search` → 400 with a `search` detail. `search=%20%20%20` → 200 and the same result as no search; `search=%5C` → 200 containing only the fixture recipe whose productName contains a backslash; `search=a_c` returns `a_c` and not `abc`. A model/service stub throwing `Object.assign(new Error('Failed query'), { name: 'DrizzleQueryError', cause: Object.assign(new Error('canceling statement due to statement timeout'), { name: 'PostgresError', code: '57014' }) })` → 503 with `error.code` `QUERY_TIMEOUT`, and the captured logs contain neither the search term nor `params:`.
- [ ] 10.8 Run `make test-specific filter=src/modules/recipe/model.search.test.ts` and `make test-shared` and confirm the new cases fail for the expected reasons (unbounded fetch, rating no-op, missing bound).
- [ ] 10.9 In `packages/shared/src/schemas/recipe.ts`, change `search` to `z.string().trim().max(200).optional()` and update its JSDoc (case-insensitive substring on title, coffee name and personal notes, relevance-ranked, max 200). Run `make test-shared`.
- [ ] 10.10 Add exported pure `normalizeSearchTerm(raw: string | undefined): string` (trim only; `undefined` → `''`) and `toContainsPattern(term: string): string` (escape `\` → `\\`, then `%` → `\%`, then `_` → `\_`, wrap in `%…%`) to `apps/api/src/modules/recipe/model.ts`, with docblocks naming PostgreSQL's default `\` LIKE escape. Unit-test both in `model.test.ts` (including `toContainsPattern('50%_\\')` → `%50\%\_\\%`). Use them in the `search`, `mainBrewer` and `author` branches of `buildRecipeFilters` and in the score.
- [ ] 10.11 Restructure the `search` branch of `buildRecipeFilters` into `inArray(recipes.id, union(titleIdsSelect, versionRecipeIdsSelect))` (`union` from `drizzle-orm/pg-core`), keeping the null guard. If Drizzle 0.45 rejects a set operator inside `inArray`, use the documented `sql` fallback with a `// D03 raw-SQL exception:` comment. Update the inline mirror of `buildRecipeFilters` in `apps/api/src/modules/recipe/model.test.ts` accordingly. This is the shape required by the modified `recipe-filter` requirement "Shared recipe filter-building helper": add its two scenarios to `model.test.ts` (one union condition for `search: 'V60'` that includes the `personalNotes` branch, and `' 50%_\\ '` producing only `%50\%\_\\%` patterns while `'   '` yields no search condition and `'\\'` yields the pattern `%\\%`).
- [ ] 10.12 Add `buildListPageQuery(opts: { where; page; perPage; sortBy; sortOrder; search?: string })` to `model.ts`. Use a core select of `getTableColumns(recipes)` plus the `{ id, username, displayName }` author via `innerJoin(users)` and `$dynamic()`. Left-join the grouped version-score subquery when `search` is non-empty, and the `avg(userRecipeRatings.rating)` aggregate when `sortBy === 'rating'`. ORDER BY `[score desc], <sort key> (rating: nulls last), recipes.id` in the `sortOrder` direction. `.limit(perPage).offset((page - 1) * perPage)`. Add `// D03 raw-SQL exception:` comments on the `CASE` and `NULLS LAST` fragments and a docblock covering weights, best-version semantics, tie-breaks and the LIMIT guarantee.
- [ ] 10.13 Add `findListPage(opts)` to `model.ts`: run `buildListPageQuery` and `db.select({ count: count() }).from(recipes).where(finalWhere)` in parallel, and return `{ recipes, total }` with no `score` key. Add `modelLog.debug` entry and exit logs with `{ page, perPage, sortBy, hasSearch, searchLength, resultCount }` (never the term).
- [ ] 10.14 Make `findMany` delegate to `findListPage` (no `versions` relation; remove the stale "F11: versions loaded for rankRecipes" comment). Make `findStarred` build its `finalWhere` (starred subquery and the existing public-visibility condition, unchanged here; task 11.3 switches it to `viewableRecipeCondition(userId)` after the failing tests of task 11.2) and delegate to `findListPage` with `search`/`sortBy`/`sortOrder`. Delete `findAllForRanking`. Confirm `getFeed`'s offset path still compiles against `findMany`.
- [ ] 10.15 In `apps/api/src/modules/recipe/service.ts`, delete `RankableRecipe`, `rankRecipes` and the `hasSearch` JS-ranking branch (`:586-603`). `listRecipes` calls `model.findMany`/`findListPage` with the normalized `search`. Compute `hasSearch` via `model.normalizeSearchTerm`. Keep the cursor fallback and its debug log unchanged (the modified `cursor-pagination` "Fallback to offset pagination" requirement changes only its rationale: ranking is now SQL-side). Update the `listRecipes` docblock (no "fetch ALL matching recipes") and any code comment that says search results are ranked "in application code".
- [ ] 10.16 Pass the normalized `search` through `listStarredRecipes` so starred search is ranked by the same query.
- [ ] 10.17 In `listRecipes`/`listStarredRecipes`, catch statement-timeout errors (SQLSTATE `57014` on the error or its `cause`). Log `logger.warn({ requestId, searchLength, pgCode: '57014' }, 'Recipe list query timed out')` and rethrow `new Error('QUERY_TIMEOUT')` with no cause, so SQL and params are never logged.
- [ ] 10.18 Remove the `rankRecipes` import and `describe('rankRecipes')` block from `apps/api/src/modules/recipe/model.test.ts` (`:25`, `:504-600`), porting each ordering expectation into `model.search.test.ts` as a DB-backed case.
- [ ] 10.19 Generate the extension migration first: `docker compose run --rm app pnpm --filter @brewform/db exec drizzle-kit generate --custom --name=enable_pg_trgm`. Write `CREATE EXTENSION IF NOT EXISTS pg_trgm;` into the new empty SQL file (this is the custom-migration workflow, not an edit of a generated migration). No snapshot change is needed because extensions are not tracked. Then run `make db-generate` and assert "No schema changes, nothing to migrate".
- [ ] 10.20 In `packages/db/src/schema.ts`, add `index('recipe_title_trgm_idx').using('gin', table.title.op('gin_trgm_ops'))` to `recipes`, and `index('recipe_version_product_name_trgm_idx').using('gin', table.productName.op('gin_trgm_ops'))` and `index('recipe_version_personal_notes_trgm_idx').using('gin', table.personalNotes.op('gin_trgm_ops'))` to `recipeVersions`, each with a docblock naming the search predicate it serves.
- [ ] 10.21 Run `make db-generate` (inspect, do not edit, the generated `CREATE INDEX … USING gin (… gin_trgm_ops)` SQL; confirm its sequence number is after `enable_pg_trgm`). Then run `make db-migrate`, `make test-db-provision`, and `make db-generate` again, which must print "No schema changes, nothing to migrate".
- [ ] 10.22 Write failing `packages/db/src/preflight.test.ts` with a stub client (a function returning canned catalog rows) for the three outcomes in the `advanced-search` requirement "Migrations pre-flight the trigram extension" (not available → exact message; available, not installed, no CREATE → exact message naming role and database; installed with no CREATE → passes). Then implement `packages/db/src/preflight.ts` exporting `assertMigrationPreflight(client)`: one catalog query selecting `exists(select 1 from pg_extension where extname = 'pg_trgm')`, `exists(select 1 from pg_available_extensions where name = 'pg_trgm')`, `has_database_privilege(current_user, current_database(), 'CREATE')`, `current_user` and `current_database()`, with a `// D03 raw-SQL exception:` comment (catalog pre-flight in the migration runner, not application query code), a docblock, and `console` entry/exit lines matching the runner's style (no credentials). Run `make test-specific filter=packages/db/src/preflight.test.ts` (or `pnpm --filter @brewform/db exec vitest run src/preflight.test.ts` inside Docker).
- [ ] 10.23 Update the `db-reset` target in `Makefile` to run `docker compose exec -T postgres psql -U brewform -d brewform -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"` after `CREATE DATABASE` and before `$(MAKE) db-push`. Run `make db-reset` and confirm the three indexes exist (`\di *trgm*`).
- [ ] 10.24 Create DB-backed `apps/api/src/modules/recipe/model.search.explain.test.ts`. Inside `client.begin(...)` run `SET LOCAL enable_seqscan = off`, then `client.unsafe('EXPLAIN (FORMAT JSON) ' + q.sql, q.params)` for the compiled search page query and count query (term `espresso`). Assert Bitmap Index Scan nodes on all three trigram indexes. Also assert the same ids, in the same order, with seqscan on and off for `espresso` and for `istanbul` against `İstanbul Blend`. Add a comment justifying the test-only raw SQL. Also assert seqscan on/off parity for the escaped searches `a_c`, `100%` and `\`.
- [ ] 10.25 Record `pg_relation_size` of the three indexes on seeded data in the PR description (index-size check).
- [ ] 10.26 In `packages/db/src/index.ts`, parse `DB_STATEMENT_TIMEOUT_MS` (default 10000; a non-integer or negative value falls back to the default; `0` disables) and create the pool with `{ max: 10, connect_timeout: 10, idle_timeout: 20, connection: timeoutMs > 0 ? { statement_timeout: timeoutMs } : {} }`. Update the docblock.
- [ ] 10.27 In `apps/api/src/middleware/errorHandler.ts`, map `QUERY_TIMEOUT` and SQLSTATE `57014` (checking `err.code` and `err.cause?.code`) to 503 `{ success: false, error: { code: 'QUERY_TIMEOUT', message: 'The query took too long. Try a more specific search.', requestId } }`. Log without `err.message` (no SQL or params). Add cases to `errorHandler.test.ts`. The `57014` row already exists in the SQLSTATE table from task 2.3. This task adds the `QUERY_TIMEOUT` domain-code mapping, the exact message and the tests.
- [ ] 10.28 Add a DB-backed assertion (in `model.search.test.ts`) that `db.execute(sql\`show statement_timeout\`)` returns `10s` by default. Add a unit test for the env parsing helper covering `0`, unset, and garbage values.
- [ ] 10.29 Add `DB_STATEMENT_TIMEOUT_MS` (commented, default `10000`, `0` disables) to the root `.env.example` and to `apps/api/.env.example` (the Coolify template), and as an optional passthrough to the app service environment in `compose.yml` and `compose.production.yml`. The `.env.production.example` line is added in task 22.12.
- [ ] 10.30 In `apps/api/src/modules/recipe/index.ts` `describeRoute` for `GET /` and `GET /starred`: give `search` `schema: { type: 'string', maxLength: 200 }` and a description ("Case-insensitive substring match on title, coffee name and personal notes; results ordered by relevance (title 3, coffee name 2, notes 1), then sortBy"). Describe `sortBy=rating` as "average rating, unrated last". Add `400` (validation) and `503` (`QUERY_TIMEOUT`) responses with `resolver(ErrorEnvelopeSchema)`. Keep `zValidator`. Run `make test-api` (includes `openapi.coverage.test.ts`).
- [ ] 10.31 In `apps/web/src/components/recipe-list/RecipeListView.tsx`, add `maxLength={200}` to the search input and `maxLength={100}` to the author input. Add assertions to `RecipeListView.test.tsx`. No new i18n keys are needed. Task 13.2 keeps both limits when it moves these inputs to `useDebouncedUrlText`.
- [ ] 10.32 Add an ADR to `docs/decisions.md` as ADR-017 (number pre-allocated by t8): "Database-side search ranking with pg_trgm (instead of in-app ranking or full-text search)". Use the Decision / Why / Trade-off format, list the rejected alternatives (FTS `tsvector` + `ts_rank`, bounded top-K + JS ranking, the previous unbounded JS ranking), and state the approved `sql` fragments (`CASE` score, `NULLS LAST`) and the `pg_trgm` extension.
- [ ] 10.33 Add `DB_STATEMENT_TIMEOUT_MS` to the env table in `docs/deployment_coolify.md`, with a note that the migration needs `CREATE` privilege for `pg_trgm` and briefly locks `recipe`/`recipe_version` writes while the GIN indexes build.
- [ ] 10.34 Update `docs/api.md` (task 24.16 keeps this content when it rewrites the file as conventions only): `search` (max 200, relevance-ranked, trigram-indexed), `sortBy=rating` semantics, the 503 `QUERY_TIMEOUT` error code, and the removal of `versions` from list items.
- [ ] 10.35 Group check: run `make check`, `make lint`, `make test-shared`, `make test-api` (with `brewform_test` provisioned via `make test-db-provision`), and `make test-web` for the RecipeListView change. Then run `make fmt` and confirm `pnpm run fmt-check` passes.
- [ ] 10.36 Manual acceptance: with the dev stack up, run `GET /api/v1/recipes?search=a&perPage=20` and `?search=espresso&page=2`. Confirm 20 items, no `versions` keys, the correct `meta.pagination.total`, and `sortBy=rating` ordering in the UI ("Top rated"). Paste `EXPLAIN (ANALYZE, BUFFERS)` of the search page query (with `enable_seqscan = off`) into the PR description.

## 11. Unlisted visibility on every discovery surface (recipe-visibility; refine OQ1, D4)

- [ ] 11.1 Write regression locks first. They pass before the refactor of task 11.3 and protect it. Fixtures: author A, public recipe P and unlisted recipe U, both using equipment E and coffee variety V in their current version, and user B following A.
  - `apps/api/src/modules/recipe/service.test.ts`: `listRecipes({ search: U.title }, 1, 20, viewer, false)` for viewer `null`, A and B never returns U and `total` excludes it; `listRecipes({ authorId: A })` returns only P for all three; the cursor path (`listRecipes({ cursor })`) excludes U; an admin `listRecipes({ visibility: 'unlisted' }, 1, 20, adminId, true)` returns U.
  - `apps/api/src/modules/follow/service.test.ts`: `getFeed(B)` excludes U in offset and cursor mode.
  - `apps/api/src/modules/equipment/model.test.ts`: `getRecipesUsingEquipment(E, 1, 10)` excludes U from `data` and `total`.
  - `apps/api/src/modules/coffee-variety/model.test.ts`: `getRecipesUsingVariety(V, 1, 10)` excludes U from `data` and `total`.
  - `apps/api/src/modules/user/service.test.ts`: `getPublicProfile(<A's username>, viewer)` for `undefined`, B and A has `recipes` without U and `recipeCount === 1`.
  - `apps/api/src/routes/sitemap.test.ts`: a new DB-backed `describe` calls the real `deps.getPublicRecipes()` and `deps.getActiveUsers()`. U's slug is absent, and user C, whose only recipe is unlisted, is absent.
  - Run `make test-api`; every new case passes.
- [ ] 11.2 Write failing Starred tests in `apps/api/src/modules/recipe/service.test.ts`. B favourites A's unlisted U, A's public P, and A's public X, which A then changes to `private`. Then:
  - `listStarredRecipes({}, 1, 20, B)` returns P and U, but not X;
  - A's own favourited draft is returned to A;
  - `total` matches the rows;
  - with `search` set to U's title, it returns U.
  - Confirm the tests fail today, because the Starred list is public-only.
- [ ] 11.3 Refactor every discovery query to the shared condition. Behaviour is preserved except for Starred:
  - `buildListRecipesWhere` (`recipe/model.ts`): non-admins, and admins without a filter, get `listableRecipeCondition(null)`. The admin filter branch keeps `eq(recipes.visibility, filters.visibility)` with a trailing `// visibility-exempt: admin filter (recipe-visibility)`.
  - `getFeed`: `and(inArray(recipes.authorId, authorIds), listableRecipeCondition(null))`.
  - `findStarred`: base condition `viewableRecipeCondition(userId)` plus the favourites subquery. Its docblock describes the viewer-only rule.
  - `equipment/model.ts`: `const recipeConditions = listableRecipeCondition(null)`.
  - `coffee-variety/model.ts`: both branches of `getRecipesUsingVariety`.
  - `user/model.ts`: `getUserStats` (recipe count) and `getUserPublicRecipes`.
  - `apps/api/src/routes/sitemap.ts`: both `deps` queries.
  - Remove imports that become unused, and update every touched docblock ("public" now names the helper).
  - Run `make test-api`. The tests of task 11.1 still pass and those of task 11.2 now pass.
- [ ] 11.4 Write failing fork-masking tests. Fixture: B forks A's unlisted U into public F, and separately forks public P into public G.
  - `apps/api/src/modules/recipe/index.test.ts`, anonymous and B: `GET /api/v1/recipes/<F slug>` returns `forkedFrom: null`, `forkedFromId: null`, `forkedFromSlug: null`.
  - The same request by A returns U's `{ id, slug, title }` and no `visibility`/`authorId`/`deletedAt` keys inside `forkedFrom`.
  - G keeps P's attribution.
  - After P is soft-deleted, G is masked for B.
  - F's row has `forkedFromId: null` in `GET /api/v1/recipes`, in the follow feed (`follow/index.test.ts`), in `GET /api/v1/equipment/<E>/recipes` and in `GET /api/v1/coffee-varieties/<V>/recipes`.
  - In `recipe/model.visibility.test.ts`, replace the `describe.todo` with `maskUnlistableForkSources` cases: no query when no row has a source (spy on `db.select`); public sources are kept; unlisted, private and deleted sources are masked.
- [ ] 11.5 Implement `maskUnlistableForkSources<T extends { forkedFromId: string | null }>(rows: T[]): Promise<T[]>` in `recipe/model.ts`:
  - collect the distinct non-null `forkedFromId`s and return `rows` unchanged when there are none;
  - otherwise run one query, `db.select({ id: recipes.id }).from(recipes).where(and(inArray(recipes.id, ids), listableRecipeCondition(null)))`;
  - map `forkedFromId` to `null` for every source missing from the result;
  - log `modelLog.debug({ rowCount, maskedCount }, 'maskUnlistableForkSources completed')`;
  - write a docblock.
  Apply it to the returned rows of `findListPage` (t7), `findCursor`, `getRecipesUsingEquipment` and `getRecipesUsingVariety`. Run the list cases of task 11.4.
- [ ] 11.6 Fork attribution on the detail:
  - In `findById`/`findBySlug`, change the relation to `forkedFrom: { columns: { id: true, slug: true, title: true, visibility: true, authorId: true, deletedAt: true } }`.
  - Add `resolveForkAttribution(forkedFrom, viewerId)` to `recipe/service.ts`. It returns `{ forkedFrom: { id, slug, title } | null, forkedFromId: string | null, forkedFromSlug: string | null }` and keeps the source only when `canListRecipe(forkedFrom, viewerId)`. Write a docblock and add entry/exit debug logs with `{ viewerId, masked }`.
  - In the `GET /:slugOrId` handler (`recipe/index.ts` ~:541-585), spread its result after `...r` so the raw `forkedFromId` and `forkedFrom` are overwritten. Delete the `forkedFromSlug: r.forkedFrom?.slug ?? null` line.
  - Run `make test-specific filter=src/modules/recipe/index.test.ts`.
- [ ] 11.7 Brew log on unlisted recipes:
  - Add failing cases to `apps/api/src/modules/brew-log/service.test.ts`: `createBrewLog(B, { recipeId: U })` succeeds; `createBrewLog(B, { recipeId: <A's private> })` and `<A's draft>` throw `RECIPE_NOT_FOUND`. Add a failing case to `brew-log/index.test.ts`: B's `POST /api/v1/brew-logs` for U returns `201`, and A's `GET /api/v1/brew-logs` does not contain B's log.
  - Then replace the check at `brew-log/service.ts:27` with `if (!recipe || !canViewRecipe(recipe, userId)) throw new Error('RECIPE_NOT_FOUND')`, importing `canViewRecipe` from `../recipe/service.ts`. Keep the existing logs, and update the `createBrewLog` docblock ("visible to the user per `canViewRecipe`").
- [ ] 11.8 Write failing `X-Robots-Tag` tests:
  - `apps/api/src/routes/share.test.ts`: `GET /share/<U slug>` and `GET /share/<unknown>` both return the same `404` HTML body with `X-Robots-Tag: noindex, nofollow`; public P returns `200` without the header.
  - `apps/api/src/middleware/crawler.test.ts`, `deps.getRecipeMeta` stubbed: a `Googlebot` user agent on `/recipes/<U slug>`, on `/recipes/<unknown>` (stub throws `RECIPE_NOT_FOUND`) and on a stub that throws a generic error each fall through to the next handler, and the response carries the header; public returns OG HTML without it; a non-recipe path gets no header.
  - `apps/api/src/modules/recipe/index.test.ts`: U's detail, versions and diff responses carry the header for anonymous viewers and for A; P's do not.
  - `apps/api/src/modules/collection/index.test.ts`: K's detail carries the header; a public collection's does not; A's private collection detail requested by A carries it.
- [ ] 11.9 Implement the headers:
  - `routes/share.ts`: set `c.header('X-Robots-Tag', 'noindex, nofollow')` on both 404 returns.
  - `middleware/crawler.ts`: after a recipe-path match, if the meta is missing, not public, or the lookup throws, `await next()` and then `c.res.headers.set('X-Robots-Tag', 'noindex, nofollow')`. Log at debug with `{ slug, reason }`, where `reason` is `missing`/`non-public`/`error`.
  - `recipe/index.ts` `GET /:slugOrId`, `GET /:slug/versions` and `GET /:slug/versions/diff`, and `collection/index.ts` `GET /:id`: set the header when `visibility !== 'public'`.
  - Add `headers: { 'X-Robots-Tag': { schema: { type: 'string' }, description: 'noindex, nofollow for non-public items' } }` to those routes' `describeRoute` 200 responses and to the share 404 response. Keep `zValidator`.
  - Run `make test-specific filter=openapi.coverage.test.ts`.
- [ ] 11.10 Write `apps/api/src/modules/recipe/visibility.enforcement.test.ts`, the static scan from the `recipe-visibility` requirement "An enforcement test keeps every recipe listing on the shared condition":
  - read the files with `node:fs` relative to `import.meta.dirname`;
  - implement Rule A (no inline comparisons outside the two helpers, except lines ending in `// visibility-exempt:`);
  - split each file into top-level units at every `function`, `async function`, `export function`, `export async function` and `export const` declaration that starts at column 0 (non-exported `async function list` in `brew-log/model.ts` is its own unit);
  - implement Rule B (units that touch `recipes` must reference a helper unless they are in `EXEMPT_UNITS`, which starts with the exact list from the spec, each with a reason string);
  - implement Rule C (`buildListRecipesWhere`, `getFeed` and `findStarred` must reference a helper);
  - add the stale-key check and the self-test on an in-memory fixture.
  - Run it. It passes.
  - Add a temporary `eq(recipes.visibility, 'public')` list function to `apps/api/src/modules/user/model.ts`, confirm the test fails and names `user/model.ts#<fn>` with its line, then remove the function.
- [ ] 11.11 Add a "Visibility" section to `docs/api.md`:
  - the four values and the surface-class table from the `recipe-visibility` spec;
  - "unlisted = direct link only; never listed, searched, counted on public lists or indexed";
  - Starred includes unlisted recipes the caller favourited;
  - fork fields are `null` unless the source is public (on the recipe detail, the source's own author also sees the attribution);
  - the `X-Robots-Tag` header;
  - admin exemption.
  Link it from the collections "Visibility of items" note (task 9.19).
- [ ] 11.12 Group check: run `make check`, `make lint`, `make test-api` (after `make test-db-provision`) and `make test-shared`, then `make fmt` and `make fmt-check`. Everything must be green.

## 12. Web foundations: app providers, router smoke test, pagination fix, API client and auth guards (t5)

- [x] 12.1 Write a failing router smoke test `apps/web/src/router.smoke.test.tsx` that renders `/admin/recipes`, `/admin/vendors`, `/admin/users/<uuid>`, `/admin/compatibility`, `/admin/coffee-varieties` through `createMemoryRouter` with the real providers and no per-test wrappers, asserting no `error.boundary.oops` text (fails today with "useToast must be used within ToastProvider")
- [x] 12.2 Refactor `apps/web/src/router.tsx` to export `routes: RouteObject[]` and `createAppRouter()` instead of a module-scope `createBrowserRouter`; update `apps/web/src/App.tsx` to create the router once and `apps/web/src/router.test.tsx` to read `routes`
- [x] 12.3 Create `apps/web/src/AppProviders.tsx` (`ThemeProvider` → `I18nProvider` → `ToastProvider` → `ConfirmProvider` → `AuthProvider`) and render it in `App.tsx` around `RouterProvider`; remove `ToastProvider`/`ConfirmProvider` and the stale JSDoc claim from `apps/web/src/components/layout/Layout.tsx`
- [x] 12.4 Make `useConfirm()` in `apps/web/src/components/ui/Modal.tsx` throw `useConfirm must be used within ConfirmProvider` (delete the `window.confirm(opts.bodyKey)` fallback); update `Modal.test.tsx`
- [x] 12.5 Add `apps/web/src/test-utils/render.tsx` (`renderWithAppProviders(ui | routes, { initialEntries, auth })` using `AppProviders` + `createMemoryRouter`) and migrate the self-wrapping tests: `AdminRecipesPage`, `AdminUserDetailPage`, `AdminCoffeeVarietiesPage`, `AdminVendorsPage`, `AdminCompatibilityPage`, `BeanListPage`, `SetupListPage`, `BrewLogFormPage`, `RecipeQRCode`, and `SettingsPage.test.tsx` (drop its `window.confirm` mock)
- [x] 12.6 Extend `router.smoke.test.tsx` to walk every nested route in `routes`, render every route with an `element`, `Component` or `lazy` component (skip action-only routes and `resources/*`), substitute fixture values for `:slug`, `:id`, `:username`, `:userId`, `:recipeId`, `:slug1/:slug2`, stub `fetch` with an empty-success-envelope factory, render public routes signed-out and guarded/admin routes as an admin, and assert no `error.boundary.oops` (a loader-driven not-found page is allowed). Assert the derived list contains all 14 admin paths (`/admin`, `/admin/users`, `/admin/users/new`, `/admin/users/:id`, `/admin/users/:id/edit`, `/admin/recipes`, `/admin/equipment`, `/admin/vendors`, `/admin/taste-notes`, `/admin/coffee-varieties`, `/admin/compatibility`, `/admin/badges`, `/admin/audit-log`, `/admin/cache`). Confirm it fails when `ToastProvider` is removed from `AppProviders.tsx`, then restore. Add `rg -n "<ToastProvider|<ConfirmProvider" apps/web/src --glob '!*.test.*'` to the group check and expect only `AppProviders.tsx`.
- [x] 12.7 Add a mount/unmount debug log to `AppProviders` per `web-page-logging` conventions
- [x] 12.8 Replace the bug-codifying test at `apps/web/src/components/recipe-list/useRecipeFilters.test.tsx:148-157` with failing tests: filter change clears `page`; `updateFilter('page','3')` and `setPage(3)` keep `page=3` plus filters; `setPage(1)` removes `page`
- [x] 12.9 Add a failing `RecipeListView.test.tsx` case that clicks Next on a 2-page result under `createMemoryRouter` and asserts the URL has `page=2` and the loader receives `page: '2'` with filters intact
- [x] 12.10 Fix `apps/web/src/components/recipe-list/useRecipeFilters.ts`: delete `page` only when `key !== 'page'`, add `setPage(n)`, parse `page` with `extractListParams` rules; wire `RecipeListView.tsx:431` to `setPage`; update the hook JSDoc
- [x] 12.11 Write failing tests in `apps/web/src/api/client.test.ts`: three parallel 401s trigger one `POST /auth/refresh` and each request retries once; an aborted signal rejects with `AbortError` and logs no `error`; a 502 HTML body throws `ApiError` with status 502
- [x] 12.12 Implement in `apps/web/src/api/client.ts`: `RequestOptions { signal? }` on every verb helper, module-level `refreshPromise` (cleared on settle, not bound to a caller's signal), `text()` + guarded `JSON.parse` mapping to `ApiError('INVALID_RESPONSE', …, status)`, `AbortError` rethrown and logged at `debug`
- [x] 12.13 Move `ApiError` (and an `isApiError` helper) to `apps/web/src/api/errors.ts`, re-export from `api/index.ts`; update component imports of `ApiError` to `api/errors.ts`
- [x] 12.14 Thread an optional trailing `opts?: RequestOptions` through every domain client method in `apps/web/src/api/index.ts` (auth, user, recipe, taste, setup, bean, equipment, coffeeVariety, admin, follow, comment, notification, collection, brewLog) and add typed methods for the raw `api.*` reads being migrated (admin stats/recipes/equipment/vendors/compatibility/audit-log/coffee-varieties, preferences, catalog equipment/varieties with pagination, recipe versions); extend `api/index.test.ts`
- [x] 12.15 Make `apps/web/src/api/static-cache.ts` single-flight (memoise the in-flight promise, drop it on rejection, accept `{ signal }` for the caller's wait only) with tests in `static-cache.test.ts` for shared request and retry-after-failure
- [x] 12.16 Write failing tests `apps/web/src/routes/auth-guards.test.ts` and `apps/web/src/utils/safe-next.test.ts`: 401 → `redirect('/login?next=<encoded path+search>')`, admin 403 → `redirect('/')`, other errors rethrown; `isSafeNextPath` accepts `/collections?page=2`, rejects `//evil.example`, `/\evil`, `https://x`
- [x] 12.17 Implement `requireAuth(fn)` / `requireAdmin(fn)` in `apps/web/src/routes/auth-guards.ts` and `isSafeNextPath` in `apps/web/src/utils/safe-next.ts` with debug logging of redirects (ids only)
- [x] 12.18 Update `apps/web/src/components/auth/RequireAuth.tsx` to `<Navigate to={`/login?next=…`} replace />` and `RequireAuth.test.tsx`; update `LoginPage.tsx` and `RegisterPage.tsx` to `navigate(safeNext ?? '/', { replace: true })` with tests
- [x] 12.19 Wrap existing guarded loaders with `requireAuth`: `SettingsPage`, `CollectionListPage`, `CollectionEditPage`, `StarredRecipesPage`, `BrewLogListPage`, `NotificationListPage`, `BrewLogFormPage` (401 now goes to login, 404 stays `/brew-logs`); add a loader test per page for the 401 redirect
- [x] 12.20 Group check: run `make check-web` and `make test-web`. The five admin routes render in `router.smoke.test.tsx`, and the pagination regression tests pass.

## 13. Web: shareable URL state on every list page (t5)

- [x] 13.1 Create `apps/web/src/hooks/useListUrlState.ts` (`setFilter` resets page, `setPage` keeps filters and omits 1, `clearAll`, `useDebouncedUrlText(key, 300)` with `replace: true` + `preventScrollReset` and external re-sync, defaults omitted) plus parser helpers in `apps/web/src/utils/list-params.ts`; Vitest suite `useListUrlState.test.tsx` covering every `web-url-state` scenario
- [x] 13.2 Refactor `useRecipeFilters.ts` to delegate to `useListUrlState`; make the `/recipes` search and author inputs in `RecipeListView.tsx` use `useDebouncedUrlText`; test one loader call per typing pause and input re-sync on Back/Clear Filters/badge removal. Keep t7's `maxLength={200}` / `maxLength={100}` on the search and author inputs (task 10.31).
- [x] 13.3 Migrate `/equipments` (`EquipmentCatalogPage`) and `/coffee-varieties` (`CoffeeVarietiesPage`) search to debounced replace with param `q` (accept legacy `search` on read) and canonical `page`
- [x] 13.4 Canonicalise `/notifications` (omit `page=1`/`unreadOnly=false`) and `/brew-logs` through the shared helpers
- [x] 13.5 Add URL pagination to `/collections` and `/collections/browse` (loaders read `?page`, render `PaginationControls`) and a `collectionsPage` param for the profile collections tab in `UserProfilePage`; tests per page
- [x] 13.6 Move `/taste-notes` search to `?q=` via `useDebouncedUrlText`
- [x] 13.7 Move `/admin/users` (`q`, `page`), `/admin/audit-log` (`entityType`, `page`) and `/admin/coffee-varieties` (`category`, `q`, `page`) selections into the URL (done together with their loader migration below)
- [x] 13.8 Group check: run `make check-web`, `make lint` and `make test-web` (`useListUrlState.test.tsx`, the `useRecipeFilters`/`RecipeListView` cases and the per-page URL tests of tasks 13.1-13.6), then `make fmt` and `make fmt-check`. Task 13.7 is verified in group 14 with its loader migration.

## 14. Web data loading: regression guards first, then admin, settings, account and auth pages (t5)

- [x] 14.1 Add `apps/web/src/architecture.test.ts` scanning non-test `apps/web/src/**/*.{ts,tsx}` for `useEffect` bodies that reference `api.`, `*Api.`, `fetch(` or `get*Cached(` (allowlist: `contexts/AuthContext.tsx`), reporting file:line; start it with the not-yet-migrated files in a temporary pending list that the migration tasks shrink to empty
- [x] 14.2 Add `apps/web/src/data-loading.enforcement.test.ts` implementing the four rules of the `web-data-loading` requirement "A static enforcement test keeps API access inside loaders, actions and resource routes": read files with `node:fs` (`readdirSync` recursive, skip `*.test.ts(x)`, `test-setup.ts`, `test-utils/**`), resolve relative and `@/` specifiers to `apps/web/src` paths, parse multi-line `import`/`export … from`/dynamic `import()` statements and their named bindings, and report every violation as `<relative path>:<line> <rule>`. Include the self-check `describe` block with the inline fixtures listed in the requirement. Seed a `PENDING` set with the 65 modules from `audit/_refine/coverage.md` §1.6 (minus any that groups 12 and 13 already migrated), and fail when a `PENDING` file no longer violates. Each migration task in groups 14, 15 and 17 removes its files from `PENDING`.
- [x] 14.3 Add the Biome override in `biome.json` (`style/noRestrictedImports` `patterns` for `**/api/client.ts`, `**/api/index.ts`, `**/api/static-cache.ts` on `apps/web/src/**`, re-allowed for `apps/web/src/api/**`, `apps/web/src/routes/**`, `apps/web/src/**/*.data.ts`, `apps/web/src/contexts/AuthContext.tsx`, `apps/web/src/hooks/useStaticCacheSync.ts` (it imports only `CACHE_BUST_KEY` and `clearStaticCache`) and tests) at level `warn`; verify it fires on a `../../api/index.ts` import. The Vitest enforcement test (task 14.2) is the authoritative check; the Biome rule is the editor-time hint.
- [x] 14.4 Add `requireAdmin` loaders in co-located `*.data.ts` files and switch routes to `lazy: { loader, action, Component }` with an `errorElement` that renders inside `AdminLayout`: `AdminDashboard`, `AdminBadgesPage`, `AdminAuditLogPage` (URL `entityType`/`page`), and `AdminCompatibilityPage` (plus its patch/flush intent action)
- [x] 14.5 Migrate `AdminUsersPage` (URL `q`/`page`, `toggleAdmin` intent) and `AdminUserCreatePage` (create action) to loaders/actions
- [x] 14.6 Migrate `AdminUserDetailPage` and `AdminUserEditPage` to `/admin/users/:id` and `/admin/users/:id/edit` loaders (404 → not-found) and intent actions in `AdminUserDetailPage.data.ts` (`delete`, `ban`, `unban`) and `AdminUserEditPage.data.ts` (`update`), each returning `{ ok: true } | { ok: false, error }` and passing `request.signal`. Rewrite `hooks/useBanUser.ts` per the renamed `web-shared-components` requirement "useBanUser hook owns the ban/unban state machine and submits through the admin user route action": no API-client import, `useFetcher().submit({ intent, reason }, { method: 'post', action: '/admin/users/<id>', defaultShouldRevalidate: false })`, same returned state and `onSuccess` contract, logs per the modified logging requirement. Rewrite `useBanUser.test.ts` to drive a `createMemoryRouter` route whose `action` is a `vi.fn()` (no `adminApi` mock) and add `AdminUserDetailPage.data.test.ts` for the ban/unban/delete intents (mocking `adminApi`). The `/admin/users/:id` loader keeps `log.error({ err }, 'AdminUserDetailPage loadData failed')` before rethrowing non-404 errors (modified `web-page-logging` requirement).
- [x] 14.7 Migrate `AdminRecipesPage` and `AdminVendorsPage` to loaders + intent actions returning `{ ok, error }` with toasts on failure
- [x] 14.8 Migrate `AdminEquipmentPage` and `AdminTasteNotesPage` to loaders + intent actions that call `invalidateStaticCache()` on success; replace the log-only catches (`AdminEquipmentPage.tsx:77-79,103-105`, `AdminTasteNotesPage.tsx:63-64,89-90`) with toasts
- [x] 14.9 Migrate `AdminCoffeeVarietiesPage` (URL `category`/`q`/`page`, debounced search) and `AdminCachePage` (flush action) to loaders/actions
- [x] 14.10 Update each admin page test to drive loaders/actions through `renderWithAppProviders`, including one failure-path toast assertion per page
- [x] 14.11 Add a root route `id: 'root'` loader returning `{ registrationEnabled }` with `shouldRevalidate: () => false`; read it with `useRouteLoaderData('root')` in `Navbar.tsx` and `RegisterPage.tsx`, removing both effects
- [x] 14.12 Move `VerifyEmailPage` token verification into a `/verify-email` loader (`shouldRevalidate: () => false`); the component only calls `refreshUser()` on success; the loader emits `log.error({ err }, 'VerifyEmailPage verifyEmail failed')` on failure (modified `web-page-logging` requirement "VerifyEmailPage logs token verification failure in its loader"); test that StrictMode no longer verifies twice and that the failure is logged
- [x] 14.13 Convert `SettingsPage` mutations to an intent action (`save-preferences`, `delete-account` via `userApi.deleteAccount`); convert `ContactPage`, `ForgotPasswordPage`, `ResetPasswordPage` submits to actions; move `EmailVerificationBanner` `sendVerification` to a `resources/auth/send-verification` action
- [x] 14.14 Give `/onboarding` a `requireAuth` loader (setups list) and an action for `PATCH /preferences` and the bean step in `OnboardingWizard.tsx`; add an `AbortController` to the allowlisted `AuthContext` bootstrap effect
- [x] 14.15 Group check: run `make check-web`, `make lint` (the `noRestrictedImports` rule from task 14.3 reports warnings only for files still in `PENDING`), `make test-web` (`architecture.test.ts` and `data-loading.enforcement.test.ts` pass with every module migrated in tasks 14.4-14.14 removed from their pending lists, plus `router.smoke.test.tsx` and the admin page tests) and `make test-shared` (en/tr key parity), then `make fmt` and `make fmt-check`.

## 15. Web data loading: catalogs, recipes, collections, notifications and shared components (t5)

- [x] 15.1 Loaders for `/equipments`, `/equipment/:id`, `/coffee-varieties`, `/coffee-varieties/:id` (404 → not-found page; drop the `Array.isArray(r?.data)` envelope guessing) using granular `lazy`; add loader tests including abort-signal forwarding
- [x] 15.2 Loader for `/taste-notes` (`tasteApi.hierarchy`); failures render the route error state instead of `taste.noResults`
- [x] 15.3 `requireAuth` loaders + intent actions for `/beans`, `/setups`, `/equipment` (personal); equipment actions call `invalidateStaticCache()`; replace log-only catches (`EquipmentListPage.tsx:72-74,98-100`) with toasts
- [x] 15.4 `/recipes/new` loader (equipment, setups, optional `?beanId` bean) + create action; `/recipes/:id/edit` and `/recipes/:id/fork` loaders + update/fork actions, all via granular `lazy` with `requireAuth`. The edit loader keeps the `RecipeEditPage loadRecipe/loadBeans/loadEquipment failed` error logs in its catch path before rethrowing (modified `web-page-logging` requirement), with a loader test per log line
- [x] 15.5 Loaders for `/recipes/compare/:slug1/:slug2` (+ merge action), `/recipes/:slug/focus` (via `getTasteNotesCached`), `/recipes/:slug/versions`, `/recipes/:slug/versions/diff` (`?v1&v2`); failures render error states, not `compare.notFound`/`common.noResults`
- [x] 15.6 Write failing assertions in `apps/web/src/pages/recipes/RecipeVersionsPage.test.tsx`, `VersionDiffPage.test.tsx` and `RecipeComparePage.test.tsx`: after render, `document.head.querySelector('meta[name="robots"]')?.getAttribute('content') === 'noindex, nofollow'`. Then pass `noIndex` to the existing `SEOHead` in `RecipeVersionsPage.tsx` (:85), `VersionDiffPage.tsx` (:162) and `RecipeComparePage.tsx` (:151), and update each component docblock ("never indexed: derived view").
- [x] 15.7 Add `resources/coffee-varieties/search` loader and switch `useCoffeeVarietyFilter.tsx` to `useFetcher().load()`; resolve the selected variety name in the `/recipes` loader when `?coffeeVarietyId` is set
- [x] 15.8 Move `BrewLogFormPage` create/update from the submit handler into the `brew-logs/new` and `brew-logs/:id/edit` route action (toast on `{ ok:false }`); move its loader to `BrewLogFormPage.data.ts`
- [x] 15.9 Pass `request.signal` in the existing loaders: `HomePage`, `RecipeListPage`, `StarredRecipesPage`, `RecipeDetailPage`, `UserProfilePage`, `routes/comments.ts`; switch their components to `useLoaderData<typeof loader>()` and move loaders to `*.data.ts` When moving the `UserProfilePage` loader, keep the id-based own-profile checks from task 7.22 (`viewer?.id === profile.id`, `user?.id === profile.id`).
- [x] 15.10 Move the inline loaders of `apps/web/src/pages/brew-logs/BrewLogListPage.tsx`, `apps/web/src/pages/notifications/NotificationListPage.tsx` and `apps/web/src/pages/settings/SettingsPage.tsx` into `BrewLogListPage.data.ts`, `NotificationListPage.data.ts` and `SettingsPage.data.ts` (keeping the `requireAuth` wrapping from task 12.19), pass `request.signal` to every client call (`brewLogApi.list`, `notificationApi.list`, the preferences read via the typed method from task 12.14), switch the components to `import type { loader }` + `useLoaderData<typeof loader>()`, wire the routes in `router.tsx`, and add a loader test per module asserting the signal is forwarded.
- [x] 15.11 Write failing tests in `apps/web/src/pages/recipes/RecipeDetailPage.test.tsx`:
  - (a) the loader with `?from=qr` for an `unlisted` recipe returns data and does not redirect;
  - (b) `?from=qr` where `recipeApi.get` rejects with a 404 `ApiError` throws `redirect('/recipes/unavailable')`;
  - (c) without `from=qr`, a 404 still throws the 404 `Response`;
  - (d) rendering an `unlisted` recipe sets `<meta name="robots" content="noindex, nofollow">`, leaves no `link[rel="canonical"]` and renders no `script[type="application/ld+json"]`;
  - (e) a `draft` recipe viewed by its author behaves like (d);
  - (f) a `public` recipe has no robots meta, a canonical link and the JSON-LD script.
- [x] 15.12 Implement the QR landing and the head rules:
  - In `apps/web/src/pages/recipes/RecipeDetailPage.data.ts`, wrap `recipeApi.get(slug, { signal })`. On a 404 `ApiError`, throw `redirect('/recipes/unavailable')` when `fromQr`, and the 404 `Response` otherwise. Delete the `recipe.visibility !== 'public'` redirect, and log `log.debug({ slug }, 'QR visit to unavailable recipe')` on that redirect.
  - In `RecipeDetailPage.tsx`, compute `const isPublic = recipe.visibility === 'public'`. Pass `noIndex={!isPublic}` and `canonical={isPublic ? <url> : undefined}` to `SEOHead`, and render `<RecipeJsonLd …/>` only when `isPublic`.
  - Update the loader and component docblocks.
  - Run `make test-web`.
- [ ] 15.13 Add `resources/collections/mine` loader + add/remove/create action; rewrite `AddToCollectionModal.tsx` on `useFetcher()` with toasts on failure and keep membership on a 409 during add. Keep t3's `recipeVisibility` prop and the `collection.modal.hiddenRecipeNote` line for `draft`, `private` and `unlisted` (task 9.13). This implements the modified `recipe-collections` requirement "Frontend components — CollectionCard, AddToCollectionModal, CollectionRecipeList", including its failed-add scenario.
- [x] 15.14 Move `CollectionRecipeList.tsx` reorder/remove and `CollectionCreatePage`/`CollectionEditPage` submits to route actions; serialise reorders by disabling while a reorder fetcher is pending; move collection loaders to `*.data.ts` with `request.signal`
- [x] 15.15 Write failing cases in `apps/web/src/pages/collections/CollectionDetailPage.test.tsx`:
  - an `unlisted` collection sets the robots `noindex, nofollow` meta and `document.title === '<name> | BrewForm'`;
  - a `private` collection rendered for its owner sets the robots meta;
  - a `public` collection has no robots meta.
  Then render `<SEOHead title={collection.name} description={collection.description ?? undefined} noIndex={collection.visibility !== 'public'} />` in `apps/web/src/pages/collections/CollectionDetailPage.tsx`, and update its docblock.
- [x] 15.16 Add `resources/notifications/unread-count`, `resources/notifications` (page) loaders and `resources/notifications/:id/read`, `resources/notifications/read-all` actions
- [x] 15.17 Rewrite `NotificationBell.tsx` (effect subscribes to `focus`/`brewform:notifications-changed` and calls `fetcher.load`), `NotificationDropdown.tsx`, `NotificationItem.tsx`, and `NotificationListPage` mark-all-read on fetchers; update their tests
- [x] 15.18 Add `resources/brew-logs/recipe/:recipeId`, `resources/brew-logs/stats/:recipeId` and `resources/taste-notes` loaders; switch `BrewHistorySection.tsx`, `RecipeBrewStats.tsx`, `TasteAutocomplete.tsx` to `useFetcher().load()`
- [x] 15.19 Replace the two raw `fetch(` QR downloads: add `api.getText(endpoint, opts?: RequestOptions): Promise<string>` to `apps/web/src/api/client.ts` (same base URL, auth refresh and error parsing as the JSON helpers, returns `response.text()`), `qrcodeApi.recipeSvg(slug, opts)` to `apps/web/src/api/index.ts` (`GET /qrcode/recipe/<slug>.svg`), and the resource route `apps/web/src/routes/resources/qrcode.ts` (path `resources/qrcode/recipe/:slug`, loader returning `{ ok: true, svg } | { ok: false, error }`, entry/exit/failure logs with `slug` only) registered in `router.tsx`. Add `apps/web/src/components/qrcode/useRecipeQrDownload.ts` (uses `useFetcher()`, exposes `download()` and `downloading`, on `{ ok: true }` creates a `Blob` of type `image/svg+xml` and clicks an anchor named `brewform-<slug>-qr.svg`, on `{ ok: false }` calls `toast.error('qrcode.downloadFailed')`, mount/unmount debug logs). Use it in `components/qrcode/RecipeQRCode.tsx` and `components/recipe/ShareSection.tsx` (deleting the silent `catch`). Tests: `routes/resources/qrcode.test.ts` (ok and error results, signal forwarded), `useRecipeQrDownload.test.tsx` (download on success, toast on failure), and update `RecipeQRCode.test.tsx` / `ShareSection.test.tsx`. No new i18n keys (`qrcode.downloadFailed` exists in both locales).
- [x] 15.20 Move the `PhotoUpload.tsx` upload (`encType: 'multipart/form-data'`) to a resource action returning `{ ok, error }`, and carry t4a's error-code → i18n mapping (task 5.31) into the action result. The `RecipeNotesSection.tsx` move to a resource action is done by the private-notes rewrite in task 17.4, which targets the new caller-scoped notes endpoints.
- [x] 15.21 Group check: run `make check-web` and `make test-web`. The architecture test's pending list and the enforcement test's `PENDING` set shrink with each migrated file.

## 16. Web data loading: comment contract, revalidation, static cache and docs (t5)

- [x] 16.1 Write failing tests in `routes/comments.test.ts` and `CommentSection.test.tsx`: create/delete API failures return `{ ok:false, error }`, the page stays rendered, delete rolls back, typed text is preserved, an error toast shows
- [x] 16.2 Change `createCommentAction`/`deleteCommentAction` in `apps/web/src/routes/comments.ts` to return `{ ok:true, comment } | { ok:true } | { ok:false, error }`; branch on `ok` in `CommentSection.tsx` for submit and delete
- [x] 16.3 Add `shouldRevalidate` to the `recipes/:slug` route (skip on successful like/favourite/follow/comment actions; keep for rate) and `defaultShouldRevalidate: false` on social submits in `LikeButton`, `FavouriteButton`, `FollowButton`; make `CommentSection` merge revalidated data instead of resetting loaded pages; test that a like sends exactly one request and loaded comment pages survive
- [x] 16.4 Write failing tests in `apps/web/src/hooks/useStaticCacheSync.test.ts` and `apps/web/src/api/static-cache.test.ts`, per the modified `static-cache` spec (added at integration from `audit/t5-web-state.md` §7):
  - a `brewform-static-cache-bust` storage event calls `clearStaticCache()` exactly once, never calls `invalidateStaticCache()`, and never writes the bust key
  - other keys trigger neither function
  - `clearStaticCache()` nulls both slots, including in-flight promises, without touching `localStorage`
- [x] 16.5 Add `clearStaticCache()` to `apps/web/src/api/static-cache.ts`. It clears locally only and drops in-flight promises; `invalidateStaticCache()` becomes `clearStaticCache()` plus the marker write. Switch the `apps/web/src/hooks/useStaticCacheSync.ts` listener to `clearStaticCache()`, update both docblocks and keep the debug logs. This fixes the confirmed cross-tab ping-pong (`audit/t5-web-state.md` V18).
- [x] 16.6 Add ADR-018 (number pre-allocated by t8) to `docs/decisions.md`, recording the choice of React Router data APIs over TanStack Query. The `AGENTS.md` "Web data loading" section is written in task 25.10.
- [x] 16.7 Mark `plans/D10-tanstack-query-migration.md` as superseded by this change, and fix the stale JSDoc in `Layout.tsx`, `useRecipeFilters.ts` and `routes/comments.ts`. The `docs/architecture.md` web data-flow section is written in task 26.8.
- [x] 16.8 Group check: run `make check`, `make lint`, `make test-web` (including `router.smoke.test.tsx` and `architecture.test.ts`) and `make fmt`; confirm `make fmt-check` is clean and that no new keys were needed in `packages/shared/src/i18n/{en,tr}.json` (add any new user-visible strings to both files)
- [ ] 16.9 Manually verify in `make dev`: each of the five admin pages opens; `/recipes` Next/Prev keeps filters and Back/Forward works; typing in search produces one history entry; `/settings` while signed out redirects to `/login?next=%2Fsettings` and returns after login

## 17. Private notes and recipe write — web, then the data-loading guard flip (t1, t5)

- [x] 17.1 Add i18n keys to both `packages/shared/src/i18n/en.json` and `tr.json`: `recipe.brewerNotes`, `recipe.brewerNotes.hint`, `recipe.tastingNotes.brewerNote`, `recipe.myNotes`, `recipe.myNotes.hint`, `recipe.notes.delete`, `recipe.notes.deleted`, `recipe.notes.saveError`, `recipe.notes.loadError` and `recipe.myNotes.placeholder`. Remove `recipe.personalNotes`, `recipe.tastingNotes.personalNote` and `recipe.notes.placeholder` once nothing references them. Run `make test-shared` (key-parity test).
- [x] 17.2 Add `recipeApi.getMyNote(id, { signal })`, `saveMyNote(id, notes)` (PUT) and `deleteMyNote(id)` to `apps/web/src/api/index.ts`, typed with `RecipeUserNoteOutput`, with `saveMyNote` taking the shared `RecipeNotes` request type. Remove `saveNotes` and update `apps/web/src/api/index.test.ts`. This matches the two modified `web-api-boundary` requirements ("Missing request schema types are exported and re-exported", "apps/web/src/api/index.ts uses shared types, not Record<string, unknown>"). Assert in `api/index.test.ts` that `'saveNotes' in recipeApi` is `false` and that no client method issues `POST` to `/recipes/:id/notes`.
- [x] 17.3 Add the resource route `resources/recipes/:id/notes` in `apps/web/src/routes/` (registered in `apps/web/src/router.tsx`), following the web-data-loading capability. The loader calls `getMyNote` with `request.signal`. The action handles intents `save` and `delete` and returns `{ ok: true, note }` or `{ ok: false, error }`. It logs entry, exit and failure with no note text.
- [x] 17.4 Rewrite `apps/web/src/components/recipe/RecipeNotesSection.tsx`. Failing test first: write the `RecipeNotesSection.test.tsx` cases of task 17.7 and the single-`PUT` assertion below, run `make test-web` and see them fail against the current editor (pre-filled from `currentVersion.personalNotes`, posting to `POST /notes`), then implement:
  - Takes a single `recipeId` prop.
  - Loads with `useFetcher().load('/resources/recipes/:id/notes')`; saves and deletes with `fetcher.submit`.
  - Shows a Delete button when a note exists, plus the `recipe.myNotes` label and hint.
  - Shows an error toast or inline error on `{ ok: false }` and keeps the typed text.
  - No silent `catch`.
  - Its print-only paragraph prints the viewer's own note.
  - Saving sends exactly one `PUT /api/v1/recipes/:id/notes` (never `POST /notes`, never `PATCH /recipes/:id`); assert this in `RecipeNotesSection.test.tsx`.

  This also completes t5's move of `RecipeNotesSection` onto a resource action.
- [x] 17.5 Update `apps/web/src/pages/recipes/RecipeDetailPage.tsx`: render `<RecipeNotesSection recipeId={recipe.id} />` only when `isAuthenticated`, with no `initialNotes`.
- [x] 17.6 Relabel the author's notes:
  - `TastingNotesSection.tsx` uses `recipe.tastingNotes.brewerNote`.
  - The create and edit pages use `recipe.brewerNotes` plus the hint.
  - `VersionDiffPage.tsx:37` uses `recipe.brewerNotes`.
- [x] 17.7 Rewrite `apps/web/src/components/recipe/RecipeNotesSection.test.tsx` and update `RecipeDetailPage.test.tsx`:
  - The editor is empty for a non-author, never pre-filled from `currentVersion.personalNotes`.
  - It is hidden for anonymous viewers, and no notes request is sent.
  - A save failure shows an error.
  - Delete clears the editor.
  - Labels come from the new keys.
- [ ] 17.8 Add i18n keys to both `en.json` and `tr.json`. Change the value of `recipe.editPage.bumpVersion` to "Save as a new version", and add `recipe.editPage.bumpHint.off` ("Updates the current version (v{current}) in place"), `recipe.editPage.bumpHint.on` ("Creates version v{next}; v{current} stays unchanged"), `recipe.form.coffeeVariety` and `recipe.form.coffeeVariety.placeholder`.
- [ ] 17.9 Extract the equipment picker from `apps/web/src/pages/recipes/RecipeCreatePage.tsx:300-320` into `apps/web/src/components/recipe/EquipmentPicker.tsx`. Add a `CoffeeVarietyPicker.tsx` typeahead over `coffeeVarietyApi.search` (via a fetcher resource route per web-data-loading). Write component tests for both.
- [ ] 17.10 Update `apps/web/src/pages/recipes/RecipeEditPage.tsx` (on top of the web-data-loading loader/action migration):
  - Pre-populate equipment and coffee variety and render both pickers.
  - Show the checkbox with the new label and the state-dependent hint, including version numbers.
  - The payload builder sends `null` for cleared scalar, date, rating and emoji inputs, `[]` for cleared taste notes and equipment, and omits fields the page does not render.
  - Show validation errors inline and navigate only on success.
- [ ] 17.11 Update `apps/web/src/pages/recipes/RecipeCreatePage.tsx`: send `beanId` when opened with `?beanId=`, add the coffee-variety picker, and send `coffeeVarietyId`.
- [ ] 17.12 Show the coffee variety on `apps/web/src/pages/recipes/RecipeDetailPage.tsx`: when `currentVersion.coffeeVarietyName` is set, render it as a link to `/coffee-varieties/:coffeeVarietyId`.
- [ ] 17.13 Extend `RecipeEditPage.test.tsx`:
  - Clearing the grinder sends `grinder: null`.
  - Removing all taste notes sends `tasteNoteIds: []`.
  - The hint text follows the checkbox and the version numbers.
  - A variety change is sent.
  - Pre-populated equipment is sent unchanged.
  Add create-page tests for `?beanId` → `beanId` in the payload and for the variety selection. Add a detail-page test for the variety link.
- [ ] 17.14 Update `docs/api.md`:
  - Document `GET`, `PUT` and `DELETE /recipes/:id/notes` (caller-scoped private notes, `Cache-Control`, statuses).
  - State that `POST /recipes/:id/notes` was removed in wave 6 (it returns 404) and that clients use `PUT /recipes/:id/notes` for the caller's private note.
  - Document the PATCH body semantics (amend versus bump, absent/null/[]), the `tds` and `coffeeVarietyId` fields, and the 403 `EMAIL_NOT_VERIFIED`.
- [ ] 17.15 Update `docs/recipes.md`:
  - Versioning: the current version is amendable and earlier versions are immutable.
  - Bump carry-forward rules.
  - Private notes versus brewer notes.
  - Fork copies `tds` and variety.
- [ ] 17.16 Update `plans/TECHNICAL_DEBT.md` (and `plans/ROADMAP.md` if it lists open items) with two entries: merge field parity (intensities, `tds`, variety); and the `SetupUpdateSchema` `.partial()` default trap (`setup.ts:17,24`). Do not add a notes-POST removal entry (the endpoint is removed in this change).
- [ ] 17.17 Draft the change-announcement and release-note text (in the PR description): the old "Personal Notes" box on others' recipes edited the author's public note; private notes now start empty; authors should review their brewer notes. State that `POST /api/v1/recipes/:id/notes` was removed (404) and link the photo storage security check for S3 deployments.
- [ ] 17.18 After all migration tasks: empty the architecture test's pending list and the enforcement test's `PENDING` set (delete both), and raise the Biome rule to `error`.
- [ ] 17.19 Run `make test-web` with the architecture pending list and `PENDING` set deleted (previous task), and record in the PR description: "Data-loading migration: 41 useEffect fetch blocks in 38 files, 13 inline loaders moved to `*.data.ts`, 12 mutation-only modules moved to actions, 2 raw-fetch QR downloads moved to a resource route (65 modules); AuthContext is the only API-client exception."
- [ ] 17.20 Group check: run `make fmt`, then `make check`, `make check-tests` and `make lint`, all clean.
- [ ] 17.21 Group check: run `make test-db-provision` once, then `make test-api`, `make test-shared` and `make test-web`, all green, including `openapi.coverage.test.ts`, the en/tr key-parity test and every regression test listed in the `recipe-write` and `recipe-personal-notes` specs. Run `grep -rnwE "saveNotes|updateVersionNotes" apps/api/src apps/web/src` and confirm no matches.
- [ ] 17.22 Manual smoke test with `make dev`:
  - As user B on user A's recipe: save, reload and delete a private note, and confirm A's brewer note is unchanged.
  - As A: edit `grindSize` without the checkbox and confirm it persists with no new version.
  - As A: tick the checkbox and confirm a new version keeps taste notes and equipment.
  - Clear the grinder and confirm it is gone.
  - Set a coffee variety and confirm the recipe appears on `/coffee-varieties/:id`.

## 18. Charts: shared helpers, formatters and i18n (t6)

- [x] 18.1 Write failing tests `apps/web/src/utils/chart/scale.test.ts` for `sanitizeNumber`, `clamp`, `clampPct` and `safeRatio`. Cover `NaN`, `±Infinity`, `null`, `undefined`, strings, reversed `min`/`max`, and denominators of 0 or `NaN`. Add a fast-check property asserting that `clamp` output always lies in `[min, max]`.
- [x] 18.2 Implement `apps/web/src/utils/chart/scale.ts` (pure, explicit `.ts` imports, JSDoc on every export) until the tests pass.
- [x] 18.3 Add `apps/web/src/utils/chart/measured-widths.fixture.ts` with the SF Pro measurements from `audit/t6-charts.md` §8 (string, font px, weight, letter-spacing, measured px).
- [x] 18.4 Write failing tests `apps/web/src/utils/chart/text.test.ts`: `estimateTextWidth` ≥ measured for every fixture row; `wrapLabel` splits after `/` (keeping the slash on the first line) and at whitespace; an unbreakable label returns a single line.
- [x] 18.5 Implement `apps/web/src/utils/chart/text.ts` (narrow 0.34em / wide and uppercase 0.80em / digits 0.62em / other 0.60em, plus letter-spacing; ×1.1 safety; ×1.06 bold).
- [x] 18.6 Write failing tests `apps/web/src/utils/chart/layout.test.ts` for `labelBox` (start/middle/end × top/middle/bottom, multi-line), `unionBox`, `isInside`, `overlaps` and `fitViewBox` (margin, symmetric-x option).
- [x] 18.7 Implement `apps/web/src/utils/chart/layout.ts`.
- [x] 18.8 Write failing tests `apps/web/src/utils/chart/ticks.test.ts`:
  - `niceTicks(min, max, maxCount)`: steps of 10^k×{1,2,5}, ≤ maxCount, inside bounds.
  - `durationTicks` examples: 27s, 59s, 290s, 1800s, 43200s → `0 2h 4h 6h 8h 12h` (en) / `… 12 sa` (tr), and 86400s.
  - `durationTicks` property: totals 1–86,400 plus 172,800, 10^6 and 2,147,483,647, for en/tr at 200/222/277/507/670px. Assert 2–8 ascending ticks, 0 and the total included, no box overlap (6px gap), no box outside `[0, width]`, and each call under 5 ms.
- [x] 18.9 Implement `apps/web/src/utils/chart/ticks.ts`: time ladder `1,2,5,10,15,30s / 1,2,5,10,15,30min / 1,2,3,6,12h / 1d`, then closed-form `86400×{2,5,10}·10^k`; unit-consistent labels via an injected formatter; the end label is the compact total; the last nice tick is dropped on collision with the end label.
- [x] 18.10 Add `apps/web/src/utils/chart/index.ts` barrel with a module JSDoc stating the chart rules: in-bounds, no `<text>` in stretched SVGs, sanitize via `clamp`, tokens only, geometry tests required, reuse by F17/F03.
- [x] 18.11 Extend `apps/web/src/utils/format.test.ts` with failing cases:
  - `formatDecimal(2.2222223, 'en', 1)` → `2.2` and `'tr'` → `2,2`.
  - `formatDuration`: 45 → `45s` / `45 sn`; 270 → `4m 30s` / `4 dk 30 sn`; 43200 → `12h` / `12 sa`; 5400 → `1h 30m`; at most two units; rounds to whole seconds.
  - `formatDurationTick(7200, 7200, 'en')` → `2h`.
  - `formatNumber(12345, 'tr')` → `12.345`.
- [x] 18.12 Implement `formatDecimal`, `formatDuration` and `formatDurationTick` in `apps/web/src/utils/format.ts`, taking unit strings from `chart.duration.*` via the shared `t` (append only; do not change `formatDate`/`formatNumber`).
- [x] 18.13 Add `useSafeLocale()` to `apps/web/src/utils/safe-translation.ts` (returns the context locale or `'en'` outside a provider), with a unit test.
- [x] 18.14 Add i18n keys to **both** `packages/shared/src/i18n/en.json` and `tr.json`:
  - `taste.category.{floral,fruity,sweet,nuttyCocoa,spices,roasted,greenVegetative,sourFermented,other}`; tr: Çiçeksi, Meyvemsi, Tatlı, Fındıksı/Kakao, Baharatlı, Kavrulmuş, Yeşil/Bitkisel, Ekşi/Fermente, Diğer; native-speaker review is pending.
  - `chart.duration.{seconds,minutes,hours}` (en `{n}s`/`{n}m`/`{n}h`; tr `{n} sn`/`{n} dk`/`{n} sa`).
  - `a11y.rating.{value,notRated,slider,keyboardHint}`.
  - `a11y.scaaRadarChartValues`, `a11y.scaaRadarChartEmpty`, `recipe.brewTimeline.flowRate`.
  - Change `a11y.brewTimeline` and `a11y.brewTimelineNoPreInfusion` to take formatted durations, with no `s`/`sn` suffix.
- [x] 18.15 Run `packages/shared/src/i18n/i18n.test.ts` (key parity) via `make test-shared`.
- [x] 18.16 Group check: run `make check-web` and `make test-web` (chart helper and formatter suites).

## 19. Charts: radar, brew timeline, ratings, meters and derived displays (t6)

- [x] 19.1 Add `SCAA_CATEGORY_SLUGS` and `scaaCategoryLabelKey(category)` to `apps/web/src/utils/radar-chart-data.ts`, with tests in `radar-chart-data.test.ts` (the 9 slugs map 1:1; unknown names → `null`).
- [x] 19.2 Write failing geometry tests `apps/web/src/utils/radar-layout.test.ts` for `computeRadarLayout({ labels, values, maxValue, fontSize: 18, maxWidthPx: 280 })`:
  - Label sets: en labels, tr labels, and a synthetic set of 24-character single words.
  - Every label line box is inside the viewBox, with no label-label overlap.
  - `fontSize×222/viewBox.width ≥ 10` and `fontSize×280/viewBox.width ≤ 14`.
  - Value clamping: `NaN`, negative, `Infinity`, `maxValue` < data.
  - Empty profile → no polygon; 1 or 2 non-zero → vertex markers; all vertices inside the outer guide.
  - On failure, the assertion message names the label and the overflow in px.
- [x] 19.3 Implement `apps/web/src/utils/radar-layout.ts` (pure; uses `utils/chart`).
- [x] 19.4 Write failing component tests in `apps/web/src/components/recipe/ScaaRadarChart.test.tsx`:
  - The root `<svg>` has `width="100%"` and an inline `max-width`, and no `overflow` style.
  - One `role="img"` whose name lists the non-zero translated categories and values (en/tr); the empty-profile name.
  - Label `<tspan>` splitting.
  - Remove the old `width/height = size` and `viewBox = 0 0 size size` assertions.
- [x] 19.5 Rewrite `apps/web/src/components/recipe/ScaaRadarChart.tsx` on `computeRadarLayout`: translated labels via `useSafeT`, `aria-hidden` internals, tokens only, `size` prop replaced by `maxWidthPx` (default 280).
- [x] 19.6 Update `apps/web/src/components/recipe/TastingNotesSection.tsx`: render a single chart instance; make the card a `@container` with `flex-col @min-[520px]:flex-row`; translate chip-group headings that map to an SCAA category. Update `TastingNotesSection.test.tsx`.
- [x] 19.7 Write failing tests `apps/web/src/utils/brew-timeline.test.ts`:
  - `computeTimelineModel`: normal 5/28 → 17.857/82.143%; `pre ≥ total` → single phase plus an `inconsistent` flag; total 0, −5 or `NaN` → `null`; negative or `NaN` pre → no split; property: widths in `[0,100]` and summing to 100.
  - `layoutPhaseLabels` at 200/222/277/507/670px, en/tr: the 3/28 case → pre value goes to the caption; every visible label box sits inside its phase.
- [x] 19.8 Implement `apps/web/src/utils/brew-timeline.ts` (pure; uses `utils/chart` and the format helpers).
- [x] 19.9 Add `apps/web/src/utils/useElementWidth.ts` (`ResizeObserver` measured in `useLayoutEffect`, feature-detected, fallback width argument) with `useElementWidth.test.ts` covering the jsdom fallback and a stubbed observer.
- [x] 19.10 Rewrite `apps/web/src/components/recipe/BrewTimeline.tsx`:
  - The SVG holds shapes only (`preserveAspectRatio="none"`, `vector-effect="non-scaling-stroke"` on the stroke and the divider).
  - Phase labels are HTML boxes (`width: clampPct(pct)%`), with a caption row for hidden durations.
  - The axis comes from `durationTicks` at 200px, with `--text-secondary` ticks.
  - One `role="img"` wrapper with a formatted-duration `aria-label`; the invisible test-only flex div is removed.
  - Header uses `flex flex-wrap gap-x-3`; flow rate via `formatDecimal(flowRate, 1)` and `recipe.brewTimeline.flowRate`.
  - Returns `null` for an invalid total.
  - `createLogger('BrewTimeline')` emits `log.warn({ extractionTimeSeconds, preInfusionTimeSeconds }, 'inconsistent pre-infusion ignored')` once per mount from `useEffect`.
- [x] 19.11 Rewrite `apps/web/src/components/recipe/BrewTimeline.test.tsx`:
  - Keep the segment-width property (now on the phase boxes).
  - Replace the Property 5 step-formula tests with the new invariants (≤ 8 ticks, includes 0 and total, ascending).
  - Add cases for 43200s (`0 … 12h`), 2,147,483,647 (renders ≤ 8 ticks quickly), and `pre ≥ total` (no minus sign, one warn log via the `vi.hoisted` logger mock).
  - Assert there is no `<text>` inside the stretched SVG.
  - Add a property that every inline `width`/`left` percentage is finite and in `[0,100]`, for fast-check inputs in `[-10, 100000]` plus `NaN`.
- [x] 19.12 Verify `apps/web/src/pages/recipes/RecipeFocusModePage.tsx` and `RecipeDetailPage.tsx` need no prop changes, and that `RecipeFocusModePage.test.tsx` and `RecipeDetailPage.test.tsx` still pass.
- [x] 19.13 Add `--rating-star` to `:root`, `.dark` and `.coffee` in `apps/web/src/styles/globals.css` (`#b45309` / `#f59e0b` / `#fbbf24`).
- [x] 19.14 Add a contrast test `apps/web/src/utils/chart/contrast.test.ts` that parses the three theme blocks in `globals.css` and asserts chart text pairs ≥ 4.5:1 (`--text-secondary` on `--bg-secondary`) and mark pairs ≥ 3:1 (`--accent-primary` and `--rating-star` on `--bg-secondary`).
- [x] 19.15 Write failing tests in `apps/web/src/components/recipe/StarRating.test.tsx`:
  - Read-only: a single `role="img"` named "Rated 3.5 out of 5 stars", no buttons, tr "3,5"; 7.9 → 4 stars and label 4; 11 → 5; −1 and `NaN` → "Not rated".
  - Interactive keys: ArrowRight×3 + Enter → `onRate(6)`; Shift+ArrowRight → odd values; digit keys 1–5; Home/End; Escape revert; blur commits once.
  - Pointer: the left half of star 3 → 5.
  - Busy state: `aria-disabled` and focus retained.
  - `aria-valuetext` and `aria-describedby` hint.
- [x] 19.16 Rewrite `apps/web/src/components/recipe/StarRating.tsx`:
  - Read-only branch is `role="img"`; interactive branch is `role="slider"` with keyboard and pointer handling.
  - New `busy` prop.
  - Fill uses `var(--rating-star)`; drop the `overflow-visible` class on the star SVG.
  - Numeric label via `formatDecimal`.
- [x] 19.17 Update the rating form in `apps/web/src/pages/recipes/RecipeDetailPage.tsx` to pass `busy={ratingFetcher.state !== 'idle'}` instead of toggling `interactive`; keep the hidden `rating` input and `requestSubmit` flow.
- [x] 19.18 Update `apps/web/src/components/recipe-list/RecipeCard.tsx` to show `★ {formatDecimal(rating / 2, locale, 1)}`. Update `RecipeCard.test.tsx:149` and `pages/coffee-varieties/__tests__/CoffeeVarietyDetailPage.test.tsx:311` (expect `★ 2` for rating 4) and add a 7 → `★ 3.5` case.
- [x] 19.19 Clamp and round `intensity` to `[0,3]` in `apps/web/src/components/recipe/IntensityDots.tsx`, for both the fill and the label. Add 5, `NaN` and 2.4 cases to `IntensityDots.test.tsx`.
- [x] 19.20 Format `avgBrewRating` with `formatDecimal(…, 1)` + `/10` in `apps/web/src/components/brew-log/RecipeBrewStats.tsx`, and update `RecipeBrewStats.test.tsx` (en `7.5/10`, tr `7,5/10`).
- [x] 19.21 Update `apps/web/src/utils/stat-cards.ts` (`buildStatCards(version, unitSystem, locale)`): time via `formatDuration`; ratio `1:` + `formatDecimal(ratio, 1)`; EY via `formatDecimal(ey, 1)`.
- [x] 19.22 Update `stat-cards.test.ts` and `StatCards.test.tsx`: 43200 → `12h`/`12 sa`; 2.2222223 → `1:2.2`/`1:2,2`. Add a geometry assertion that every formatted card value at 24px bold estimates ≤ 100px.
- [x] 19.23 Update `apps/web/src/pages/recipes/RecipeComparePage.tsx` (ratio and duration formatters), `VersionDiffPage.tsx` (duration, ratio and flow-rate formatters) and `RecipeVersionsPage.tsx:141` (duration) to use the shared formatters, and extend their tests with one rounded-ratio and one long-duration case each.
- [x] 19.24 Render `apps/web/src/pages/admin/AdminDashboard.tsx` stat tile values via `formatNumber(value, locale)`, and update its test.
- [x] 19.25 Add `apps/web/src/utils/chart/chart-guards.test.ts`. It reads `ScaaRadarChart.tsx`, `BrewTimeline.tsx`, `StarRating.tsx`, `IntensityDots.tsx` and `apps/web/src/components/charts/**/*.tsx`, and asserts:
  - no `overflow: 'visible'`, `overflow-visible` or `overflow="visible"`;
  - no `<text`/`<tspan` inside an `<svg` that has `preserveAspectRatio="none"`;
  - no hex colour literals.
- [x] 19.26 Group check: run `make check-web`, `make lint`, `make test-web` and `make test-shared` (for i18n parity), then `make fmt` and confirm `make fmt-check` is clean.
- [ ] 19.27 Manual visual check on `make dev` (seeded DB) at viewports 320, 375, 768, 1024 and 1280px × themes light, dark and coffee × locales en and tr:
  - `/recipes/blue-mountain-cold-brew`: axis ≤ 8 labels, `12h` stat card, no stretched text.
  - The espresso recipes with 28s/5s and 27s/6s pre-infusion: phase labels inside their phase or in the caption.
  - A recipe whose taste notes cover all 9 SCAA categories: radar labels inside the card, Turkish labels under tr, chips stacking under 520px of card width.
  - A recipe with a single category: vertex marker visible.
  - Focus mode for the same recipes.
  - Print preview of a recipe detail page.
  - Keyboard-only rating (Tab, arrows, Shift+arrow, Enter, Escape) with focus retained during submit.
  - VoiceOver reading the read-only author and community ratings, the radar values and the timeline durations.
  - Record deviations in the PR description.

## 20. Deploy: migration runner, health and readiness, entrypoint modes and API runtime image (t4b, refine OQ4)

- [ ] 20.1 Add `packages/db/src/migrate.ts`: Drizzle `migrate()` from `drizzle-orm/postgres-js/migrator` with `migrationsFolder` resolved via `new URL('../drizzle', import.meta.url)`, the default `drizzle.__drizzle_migrations` table, console entry/exit lines, the client closed in `finally`, non-zero exit on error, guarded by `if (import.meta.main)`. Add `packages/db/src/migrate.test.ts` (DB-backed against `brewform_test`): running it twice succeeds and the second run applies nothing.
- [ ] 20.2 In `packages/db/src/migrate.ts`, call `await assertMigrationPreflight(client)` (from `./preflight.ts`, task 10.22) before `migrate()`; on a thrown pre-flight error print the message to stderr and exit 1 without applying migrations. Extend `packages/db/src/migrate.test.ts` (task 20.1) with a stub that fails the pre-flight and asserts `migrate` is never called. Verify `make test-db-provision` still passes on `postgres:18-trixie`.
- [ ] 20.3 Switch the `migrate` script in `packages/db/package.json` to the new runner (`node src/migrate.ts`); keep `generate`/`push`/`studio` on drizzle-kit. Verify `make test-db-provision` and `make db-migrate` still work and that `make db-generate` prints "No schema changes, nothing to migrate".
- [ ] 20.4 Rewrite `docker-entrypoint.sh`: `set -eu`; a mode argument (`serve` default, `migrate`, anything else prints usage and exits 2); print `Entrypoint mode: <mode>`; a `run_migrations` function (`node /app/packages/db/src/migrate.ts`, then `USER_COUNT=$(node /app/packages/db/src/check-users-empty.ts)` with cwd `/app/packages/db`, then the seed via `node src/seed.ts` when the count is `0`), keeping the existing log lines; `serve` honours `RUN_MIGRATIONS=false` (prints `Migrations skipped (RUN_MIGRATIONS=false).`); `serve` ends with `cd /app/apps/api && exec node src/main.ts`. Keep the header comments in sync with the new behaviour.
- [ ] 20.5 Update the header JSDoc of `packages/db/src/check-users-empty.ts` to the `node` invocation (no pnpm).
- [ ] 20.6 Write failing tests for the probe response schemas in `packages/shared/src/schemas/responses/health.test.ts`: `HealthOutputSchema` accepts only `{ status: 'ok' }`; `ReadinessOutputSchema` (`.strict()`) accepts `{ status: 'ready'|'not_ready', db: 'connected'|'disconnected'|'skipped', cache: 'ok'|'degraded'|'memory'|'disabled', rateLimitStore: same enum, storage: 'ok'|'ephemeral'|'degraded'|'s3', shuttingDown: boolean }` and rejects extra keys and unknown values. Then add `packages/shared/src/schemas/responses/health.ts` (JSDoc on both exports) and export both from the responses index. Run `make test-shared` and `make check`.
- [ ] 20.7 Write `apps/api/src/utils/lifecycle.test.ts` first, then add `apps/api/src/utils/lifecycle.ts` with JSDoc:
  - Exports: `markShuttingDown()`, `isShuttingDown()`, `resetLifecycleForTests()` and `createShutdownHandler({ closeServer, closeDb, closeTransporter, closeCache, exit, log })`.
  - The handler's first call sets the flag before `closeServer` runs, then closes the server, database, transporter and cache in that order with the existing log lines (`Shutting down gracefully...` … `Graceful shutdown complete`), then calls `exit(0)`.
  - A second call logs at `debug` and returns without closing anything.
  - A rejecting step logs `error` with `err` and calls `exit(1)`.
  - In `apps/api/src/main.ts`, build the SIGTERM/SIGINT handler with `createShutdownHandler` and keep the logger name `main`.
  - Update the shutdown-sequence JSDoc to "mark not ready → close HTTP server → database → email transporter → cache → exit".
- [ ] 20.8 Write failing tests for the health module.
  - `apps/api/src/modules/health/service.test.ts` calls `getReadiness(deps)` with injected `ping`, `getCacheStatus`, `getRateLimitStoreStatus`, `checkStorageHealth`, `isShuttingDown` and `log`, and asserts:
    - a healthy setup returns HTTP 200 and the exact body `{ status: 'ready', db: 'connected', cache: 'memory', rateLimitStore: 'memory', storage: 'ok', shuttingDown: false }`;
    - a rejecting `ping` gives 503 with `db: 'disconnected'`;
    - a `ping` that never settles gives 503 after 2000 ms (`vi.useFakeTimers()`);
    - ten concurrent calls while one ping is pending call `ping` once;
    - when shutting down, the result is 503 with `db: 'skipped'` and `shuttingDown: true`, and `ping` is never called;
    - a degraded cache and rate-limit store still give 200;
    - each storage value passes through;
    - a ready→not_ready change logs exactly one `warn` with `{ db, shuttingDown }`, the recovery logs one `info`, and repeated identical results log nothing above `debug`.
  - `apps/api/src/modules/health/index.test.ts` uses `app.request` on the real app with the service mocked through `vi.mock` and asserts:
    - `/health` returns 200 `{"status":"ok"}` with `Cache-Control: no-store`;
    - `/ready` mirrors the service status and body with `no-store`;
    - 150 `/ready` requests in a row never return 429;
    - with `OPENAPI_ENABLED=true`, `/api/v1/openapi.json` lists `GET /health` and `GET /ready` under tag `Health`, with 200 (and 503 for `/ready`) response schemas.
- [ ] 20.9 Implement the health module.
  - `apps/api/src/modules/health/model.ts`: `pingDatabase()`, which runs `db.select({ id: users.id }).from(users).limit(1)`. Its docblock says it is a connectivity probe that reads no row data and also fails on an unmigrated schema.
  - `service.ts`: `getLiveness()` and `getReadiness(deps = defaultHealthDeps)` with `READINESS_DB_TIMEOUT_MS = 2000`, a single-flight ping promise and transition logging. It uses the module logger `createLogger('health')` with entry/exit `debug` logs, and its imports are `pingDatabase` from `./model.ts`, `getCacheStatus()` (task 6.34), `getRateLimitStoreStatus()` (t2, task 6.36), `checkStorageHealth()` (task 3.6) and `isShuttingDown()`. No `drizzle-orm` import.
  - `index.ts`: a Hono router with `describeRoute({ tags: ['Health'], summary, description, responses })` on both routes. The responses are `resolver(HealthOutputSchema)` (200) and `resolver(ReadinessOutputSchema)` (200 and 503). Both routes call `c.header('Cache-Control', 'no-store')`.
  - Mount the router with `routes.route('/', health)` in `apps/api/src/routes/index.ts` and update its docblock.
  - Delete `apps/api/src/routes/health.ts` and the tautological `apps/api/src/routes/health.test.ts`, carrying t2's task-6.36 `memory`/`degraded` cases into the new tests.
  - Run `make test-specific filter=src/modules/health`, `make test-specific filter=src/routes/openapi.coverage.test.ts` and `make check-api`.
- [ ] 20.10 Write `apps/api/src/modules/health/probe.test.ts` first, then add `apps/api/scripts/healthcheck.mjs`.
  - The test starts a `node:http` server on an ephemeral port and spawns `process.execPath` with `fileURLToPath(new URL('../../../scripts/healthcheck.mjs', import.meta.url))` and `APP_PORT` set.
  - It asserts these exit codes:
    - a 200 response exits 0;
    - a 503 response exits 1;
    - a closed port exits 1;
    - a server that never answers exits 1 within 5 s;
    - the argument `http://example.com/` exits 1 and no request reaches the server.
  - The script uses no imports beyond Node built-ins. It takes a path argument (default `/ready`) that must match `^/[A-Za-z0-9/_-]*$`, and calls `fetch('http://127.0.0.1:' + (process.env.APP_PORT || 8000) + path, { signal: AbortSignal.timeout(4000) })`.
  - It exits 0 only on status 200. Otherwise it writes one stderr line with the status or error name and exits 1.
  - Add a header docblock naming its three callers: the image `HEALTHCHECK`, the compose healthcheck and the Coolify CMD check.
- [ ] 20.11 Spike, before refactoring: build the current `builder` stage, run `docker run --rm -w /app/apps/api <builder> node -e "await import('./src/main.ts')"` with dummy `DATABASE_URL`/`JWT_SECRET` and `APP_ENV=test`, and `node -e "await import('/app/packages/db/src/seed.ts'); await import('/app/packages/db/src/check-users-empty.ts')"` (their `import.meta.main` guards keep them from running), to confirm Node 26 native type stripping loads the whole graph. Record the outcome in the PR. If it fails, apply the fallback: move `tsx` to `dependencies` in `apps/api/package.json` and `packages/db/package.json` (then `make lockfile-update`) and use `node --import tsx` everywhere the entrypoint runs TypeScript.
- [ ] 20.12 In `Dockerfile`:
  - Remove `RUN pnpm --filter @brewform/db run generate`.
  - Add a `prod-deps` stage: `FROM builder`, `pnpm install --prod --frozen-lockfile --offline`, then `rm -rf apps/web openspec plans docs` plus the test and coverage dirs.
  - Rebuild `runner` to copy only `package.json`, `pnpm-workspace.yaml`, `node_modules`, `apps/api`, `packages/db`, `packages/shared` and `files` from `prod-deps`, without the global pnpm install.
  - Install `tini` with `apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*`.
  - Set `ENV NODE_ENV=production UPLOAD_DIR=/app/uploads` and run `RUN mkdir -p /app/uploads && chown node:node /app/uploads`.
  - Add `COPY apps/api/scripts/healthcheck.mjs /app/healthcheck.mjs`, then `USER node` and `ENTRYPOINT ["/usr/bin/tini","-g","--","/app/docker-entrypoint.sh"]`.
  - Add `HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --start-interval=2s --retries=3 CMD ["node", "/app/healthcheck.mjs", "/ready"]`.
  - Update the stage comments at the top of the file. They must say the image probes readiness and that `/health` is for uptime monitors.
- [ ] 20.13 Verify locally:
  - Run `make images`.
  - Run `docker run --rm --entrypoint sh brewform-api:local -c 'id -u; ls /app; test ! -e /app/apps/web; test -f /app/files/scaa-2.json; test -f /app/packages/db/drizzle/meta/_journal.json; test -f /app/healthcheck.mjs; ! command -v curl; ! command -v wget'`. `id -u` must print `1000`.
  - `docker inspect --format '{{json .Config.Healthcheck}}' brewform-api:local` must show `["CMD","node","/app/healthcheck.mjs","/ready"]` with the 15s/5s/180s/2s/3 values.
  - Confirm that `vitest`, `typescript`, `vite` and `drizzle-kit` cannot be resolved from `/app/apps/api`.
  - Compare the image size before and after in the PR description.
- [ ] 20.14 Confirm `make preview` (`compose.yml` `app-preview`, runner target) still boots with the new runner.
- [ ] 20.15 Group check: run `make check`, `make lint`, `make test-shared` (health schemas), `make test-api` (health module, probe and lifecycle tests, `openapi.coverage.test.ts`), `make test-specific filter=migrate.test.ts`, `make test-specific filter=preflight.test.ts` and `make db-generate` (expect "No schema changes, nothing to migrate"), then `sh -n docker-entrypoint.sh`, `make fmt` and `make fmt-check`. All must be green.

## 21. Deploy: web image edge, build context, data volumes and production compose (t4b, refine D5)

- [ ] 21.1 Restructure `apps/web/Caddyfile`:
  - a global block (`admin off`, `import /etc/caddy/global.d/*.caddy`);
  - `:80` with `encode zstd gzip`;
  - `handle /healthz { header Cache-Control "no-store"; respond "ok" 200 }`, a local liveness answer that never touches the upstream;
  - `import /etc/caddy/conf.d/*.caddy`;
  - a fallback `handle` holding the existing root, `/config.js` no-store, `try_files` and `file_server`.
  - Leave the static `handle` as the slot for the security-headers work (out of scope for wave 6).
- [ ] 21.2 Extend `docker-web-entrypoint.sh` (POSIX sh, `set -eu`): write `/etc/caddy/conf.d/api-proxy.caddy` only when `API_UPSTREAM` matches `^[A-Za-z0-9._-]+(:[0-9]{1,5})?$` (proxy matcher `path /api/* /uploads/* /share/* /health`, where `/health` is an exact path and `/ready` is deliberately not proxied, `request_body max_size {$EDGE_MAX_BODY_SIZE:16MB}`, `header_up X-Forwarded-For {client_ip}`, `header_up X-Real-IP {client_ip}`); write `/etc/caddy/global.d/trusted.caddy` only when `TRUSTED_PROXIES` matches `^[A-Za-z0-9_.:/ ]+$` (`servers { trusted_proxies static … ; trusted_proxies_strict }`); rewrite `index.html` and `robots.txt` from `*.orig` copies when `PUBLIC_APP_URL` passes the origin allowlist (replace `$BREWFORM_BUILD_PUBLIC_APP_URL`, `sed` with a `|` delimiter); log one line per decision (applied, disabled or invalid) without echoing invalid values; keep the existing `VITE_API_URL` logic. Task 22.3 checks that `/health` through the edge returns the API JSON.
- [ ] 21.3 In `Dockerfile.web` runner:
  - `RUN mkdir -p /etc/caddy/conf.d /etc/caddy/global.d`.
  - Re-declare `ARG VITE_PUBLIC_APP_URL=http://localhost:8080` and set `ENV BREWFORM_BUILD_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL`.
  - Add `HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --start-interval=1s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]` in exec form, using the BusyBox `wget` of the Alpine base. Confirm `docker run --rm --entrypoint sh brewform-web:local -c 'command -v wget'` prints a path.
  - Update the stage comments.
- [ ] 21.4 Add `scripts/ci/web-entrypoint.test.sh`, a shell test run in CI against the built web image: unset upstream gives `/api/v1/x` → `index.html`; an invalid `API_UPSTREAM` gives a warning and static-only mode; a valid `PUBLIC_APP_URL` rewrites `og:image` and `Sitemap:`; `javascript:` is ignored; a `VITE_API_URL` containing a quote writes the default `config.js`. Run it locally against `brewform-web:local`.
- [ ] 21.5 Verify Caddy 2.11.9 applies `header_up X-Forwarded-For {client_ip}` over its default `X-Forwarded-For` (echo-upstream check from the smoke script); if not, switch to `header_up -X-Forwarded-For` followed by `header_up X-Forwarded-For {client_ip}` and note it in the Caddyfile snippet comment.
- [ ] 21.6 Rewrite `.dockerignore` with `**/node_modules`, `**/coverage`, `**/dist`, `**/.turbo`, `.git`, `.github`, `uploads`, `**/uploads`, `backups`, `.claude`, `.kiro`, `.opencode`, `.vscode`, `.idea`, `plans`, `openspec`, `docs`, keep the env-file block, and add a comment that `files/`, `packages/db/drizzle/` and `apps/web/public/` must stay included. Verify with `docker build --no-cache --progress=plain` that the context size drops and both images still build.
- [ ] 21.7 Add `.env.production` and `backups/` to `.gitignore`; verify with `git check-ignore .env.production backups/x.dump`.
- [ ] 21.8 Add `scripts/ci/compose-smoke.env` and `scripts/ci/compose-config-check.sh`.
  - `compose-smoke.env` holds placeholder values: `POSTGRES_PASSWORD=ci-postgres-pw`, `VALKEY_PASSWORD=ci0valkey0pw`, `JWT_SECRET=ci-jwt-secret-0123456789`, `ADMIN_PASSWORD=ci-admin-pw-123`, `WEB_DOMAIN=localhost`, `WEB_PORT=8088`, `API_IMAGE=brewform-api`, `WEB_IMAGE=brewform-web`, `IMAGE_TAG=ci`.
  - `compose-config-check.sh` is POSIX sh with `set -eu`, `docker compose` and `jq`. It runs `docker compose -p brewform-ci --env-file scripts/ci/compose-smoke.env -f compose.production.yml config --format json` and asserts:
    - `postgres`, `valkey`, `api`, `web` and `backup` each have `.healthcheck.test`;
    - `api.depends_on` has `migrate: service_completed_successfully`, `postgres: service_healthy` and `valkey: service_healthy`;
    - `web.depends_on.api.condition == "service_healthy"`;
    - `migrate.depends_on.postgres.condition == "service_healthy"`;
    - `api.environment.UPLOAD_DIR == "/app/uploads"`;
    - the api mount at `/app/uploads` has `type == "volume"` and `source == "uploads"`;
    - when re-rendered with `UPLOADS_SOURCE=./ci-data/uploads`, that mount has `type == "bind"` and an absolute source ending in `/ci-data/uploads`, and the backup mount at `/uploads` is `read_only`;
    - `UPLOADS_SOURCE=photos` makes `config` fail;
    - no `healthcheck.test`, `command` or `entrypoint` string contains `ci0valkey0pw` or `ci-postgres-pw`;
    - `restore` appears only with `--profile restore`.
  - Run it now and confirm it fails against the current file.
- [ ] 21.9 Rewrite `compose.production.yml`:
  - `name: brewform-prod` and an `x-logging` anchor.
  - An `x-api-env` anchor: the existing api env plus the literal `UPLOAD_DIR: /app/uploads`, which is never interpolated; `S3_*` without `:-` defaults; t2's `TRUST_PROXY: ${TRUST_PROXY:-hops}`, `TRUST_PROXY_HOPS: ${TRUST_PROXY_HOPS:-1}` and `RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-redis}` (from task 6.43); and t7's optional `DB_STATEMENT_TIMEOUT_MS` passthrough (task 10.29).
  - Image refs: `${API_IMAGE:-ghcr.io/ardakilic/brewform-api}:${IMAGE_TAG:-latest}` and the web equivalent.
  - Data mounts: `${POSTGRES_DATA_SOURCE:-postgres_data}:/var/lib/postgresql` on postgres, `${UPLOADS_SOURCE:-uploads}:/app/uploads` on api, `valkey_data:/data` on valkey.
  - Drop the `API_DOMAIN` requirement.
- [ ] 21.10 Add the `migrate` one-shot service (`command: ["migrate"]`, `restart: "no"`, `depends_on: postgres: condition: service_healthy`, logging anchor, 512m limit).
  - The `api` service depends on `migrate: service_completed_successfully`, `postgres: service_healthy` and `valkey: service_healthy`.
  - The `api` service sets `RUN_MIGRATIONS: "false"` and `stop_grace_period: 30s`.
  - Its healthcheck is `test: ["CMD", "node", "/app/healthcheck.mjs", "/ready"]`, `interval: 15s`, `timeout: 5s`, `retries: 3`, `start_period: 60s`, `start_interval: 2s`.
- [ ] 21.11 Web service: `VITE_API_URL: ${VITE_API_URL:-/api/v1}`, `API_UPSTREAM: api:8000`, `PUBLIC_APP_URL: https://${WEB_DOMAIN}` and `TRUSTED_PROXIES: ${TRUSTED_PROXIES-private_ranges}` (unset gives the default, empty disables). It also gets `depends_on: api: condition: service_healthy` and a healthcheck: `test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]`, `interval: 30s`, `timeout: 3s`, `retries: 3`, `start_period: 10s`.
- [ ] 21.12 Valkey and Postgres health:
  - Valkey: generate the config in `sh -c` from env (`requirepass`, `maxmemory ${VALKEY_MAXMEMORY:-192mb}`, policy left at `noeviction`), written to `/tmp/valkey.conf`, then exec the official entrypoint.
  - The Valkey service `environment` holds `VALKEY_PASSWORD` and `VALKEYCLI_AUTH: ${VALKEY_PASSWORD:?…}`.
  - Valkey healthcheck: `test: ["CMD-SHELL", "valkey-cli ping | grep -q PONG"]`, `interval: 10s`, `timeout: 3s`, `retries: 5`, `start_period: 10s`.
  - Postgres healthcheck: `test: ["CMD-SHELL", "pg_isready -U \"$$POSTGRES_USER\" -d \"$$POSTGRES_DB\""]`, `interval: 10s`, `timeout: 5s`, `retries: 5`, `start_period: 30s`.
- [ ] 21.13 Add the backup service:
  - An inline `sh -euc` loop on `postgres:18-trixie` with `umask 077`.
  - `PGHOST`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` come from the `POSTGRES_*` values, plus `BACKUP_INTERVAL_SECONDS` (86400), `BACKUP_RETENTION_DAYS` (14), `BACKUP_UPLOADS` (true) and `BACKUP_ONESHOT`.
  - Volumes: `${BACKUPS_SOURCE:-backups}:/backups` and `${UPLOADS_SOURCE:-uploads}:/uploads:ro`.
  - Each run writes `pg_dump -Fc` to `/backups/.db-<ts>.partial` and renames it to `db-<ts>.dump` (timestamp format `%Y%m%dT%H%M%SZ`, UTC). The uploads tarball follows the same `.partial`-then-rename rule. Pruning uses `find /backups -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +$BACKUP_RETENTION_DAYS -delete`.
  - `depends_on: postgres: service_healthy`.
  - Healthcheck: `test: ["CMD-SHELL", "find /backups -maxdepth 1 -name 'db-*.dump' -mmin -$$(( $$BACKUP_INTERVAL_SECONDS / 30 )) | grep -q ."]`, `interval: 60s`, `timeout: 10s`, `retries: 3`, `start_period: 600s`.
  - No `BACKUP_DIR` variable exists.
- [ ] 21.14 Add the `restore` one-shot service: `profiles: ["restore"]`, `image: postgres:18-trixie`, `restart: "no"`, the logging anchor, `deploy.resources.limits.memory: 512m`, and `depends_on: postgres: service_healthy`.
  - Environment: `PGHOST=postgres`, plus `PGUSER`, `PGPASSWORD` and `PGDATABASE` from the `POSTGRES_*` values, plus `RESTORE_DB_DUMP` and `RESTORE_UPLOADS_ARCHIVE`.
  - Volumes: `${UPLOADS_SOURCE:-uploads}:/app/uploads` and `${BACKUPS_SOURCE:-backups}:/backups:ro`.
  - The inline `sh -euc` script:
    - validates `RESTORE_DB_DUMP` against `^db-[0-9]{8}T[0-9]{6}Z\.dump$` and `RESTORE_UPLOADS_ARCHIVE` against `^uploads-[0-9]{8}T[0-9]{6}Z\.tar\.gz$` with `grep -Eq`, printing the expected pattern and exiting 2 on a mismatch;
    - runs `pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "/backups/$RESTORE_DB_DUMP"` when a dump name is set;
    - runs `tar -xzf "/backups/$RESTORE_UPLOADS_ARCHIVE" -C /app/uploads` and then `chown -R 1000:1000 /app/uploads` when an archive name is set;
    - prints one line per step.
- [ ] 21.15 Add `deploy.resources.limits.memory` with env defaults to every service, `restart: unless-stopped` on long-running services, and the logging anchor everywhere.
- [ ] 21.16 Declare the top-level `volumes:` `postgres_data`, `valkey_data`, `uploads` and `backups`, with a comment that explains the `*_SOURCE` rule. Run `scripts/ci/compose-config-check.sh` until it passes.
- [ ] 21.17 Rewrite the file header: required vars, `make prod-*` usage, the single-replica rule, TLS in front, same-origin edge, split-domain option, `TRUSTED_PROXIES` guidance (empty when nothing is in front, Cloudflare ranges when Cloudflare connects directly), upgrade-notes pointer. Also document the data-location variables (`UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE`, `BACKUPS_SOURCE`; a value starting with `/`, `.` or `~` is a host folder, anything else a declared named volume) and the health checks (`/health` liveness, `/ready` readiness).
- [ ] 21.18 Verify:
  - `scripts/ci/compose-config-check.sh` passes.
  - `docker compose --env-file .env.production.example -f compose.production.yml config` renders with placeholder values, and an unset `API_DOMAIN` does not error.
  - `make prod-smoke` reaches all-healthy on a clean machine.
  - Manual pass: sign in through `http://localhost` and upload a photo; run `make prod-down && make prod-up` and confirm the photo still loads; set `UPLOADS_SOURCE=./data/uploads` after `sudo install -d -o 1000 -g 1000 ./data/uploads`, recreate, and confirm a new upload lands in `./data/uploads`; delete and re-create the folder as root and confirm that the api exits with the `not writable by uid 1000 gid 1000` log, and that `make prod-fix-uploads-owner && make prod-up` recovers.
  - `docker top` and the healthcheck commands show no Valkey or Postgres password.
  - `make prod-backup` writes `db-*.dump` and `uploads-*.tar.gz` (check with `make prod-backup-export DEST=./backup-export`).
- [ ] 21.19 Restore drill:
  - Copy that dump and archive into a second fresh project (`COMPOSE_PROJECT_NAME=brewform-drill`) with `docker compose cp <file> backup:/backups/`.
  - Run `make prod-restore DUMP=<dump> UPLOADS=<archive>`.
  - Compare recipe and user counts, and load a restored photo.
  - Repeat with `UPLOADS_SOURCE` and `BACKUPS_SOURCE` set to host folders.
  - Paste both results into the PR.
- [ ] 21.20 Group check: run `sh -n docker-web-entrypoint.sh scripts/ci/*.sh`, `scripts/ci/compose-config-check.sh`, `scripts/ci/web-entrypoint.test.sh` against `brewform-web:local`, `docker compose -f compose.yml config --quiet` and `docker compose --env-file scripts/ci/compose-smoke.env -f compose.production.yml config --quiet`, then `make lint`, `make fmt` and `make fmt-check`. All must exit 0.

## 22. Deploy: Makefile, CI workflow, deployment docs and env templates (t4b, refine U4)

- [ ] 22.1 Remove the `app-prod`/`web-prod` services and their comments from `compose.yml` (lines 214-246).
- [ ] 22.2 In `Makefile`:
  - `images` tags `brewform-api:local`/`brewform-web:local`.
  - Add `PROD_COMPOSE` and a `prod-env-check` prerequisite.
  - Add the targets `prod-up`, `prod-down`, `prod-logs`, `prod-ps`, `prod-pull`, `prod-backup` (`$(PROD_COMPOSE) run --rm -e BACKUP_ONESHOT=1 backup`), `prod-backup-export` (`DEST ?= ./backup-export`; `mkdir -p $(DEST) && $(PROD_COMPOSE) cp backup:/backups/. $(DEST)`) and `prod-restore`. `prod-restore` takes `DUMP`/`UPLOADS` and runs `$(PROD_COMPOSE) stop api web`, then `$(PROD_COMPOSE) --profile restore run --rm -e RESTORE_DB_DUMP=$(DUMP) -e RESTORE_UPLOADS_ARCHIVE=$(UPLOADS) restore`, then `$(PROD_COMPOSE) up -d`.
  - Add `prod-check-identifiers` (`$(PROD_COMPOSE) run --rm --no-deps --entrypoint node api /app/packages/db/src/check-identifiers.ts $(args)`; the operator runs it after `make prod-pull` and before `make prod-up`).
  - Add `prod-fix-uploads-owner` (`$(PROD_COMPOSE) run --rm --no-deps --user 0:0 --entrypoint chown api -R 1000:1000 /app/uploads`) and `prod-smoke` (`images`, then `IMAGE_TAG=local API_IMAGE=brewform-api WEB_IMAGE=brewform-web scripts/ci/smoke-compose.sh`).
  - Each target gets a `##` help line.
  - Delete `images-push`, `release` and `prod-up-build`, and update `.PHONY` and the "Production Images & Deploy" comment block.
  - Check `make help`, plus `make prod-up` without `.env.production` (expect a clear error) and `make release` (expect no such target).
- [ ] 22.3 Add `scripts/ci/smoke-images.sh` (throwaway network, `trap` cleanup, log dump on failure). It runs these checks:
  - Start `postgres:18-trixie`. Start the API with `APP_ENV=production`, test secrets and a named volume at `/app/uploads`, without a health-check override, and wait ≤180 s for the API container's own health status to become `healthy`.
  - Assert that `id -u` is `1000`, that `GET /health` returns `{"status":"ok"}`, and that `GET /ready` returns 200 with exactly the keys `status, db, cache, rateLimitStore, storage, shuttingDown` and `status: "ready"` (checked with `jq`).
  - Start the web image with `API_UPSTREAM`, wait for `healthy`, and assert: `/healthz` returns 200; `/` contains `id="root"`; `/health` through the edge returns the API JSON; `/api/v1/sitemap.xml` is XML.
  - Run the echo-upstream client-IP checks.
  - Negative bind-mount check: start the API with `RUN_MIGRATIONS=false`, an unreachable `DATABASE_URL` and `/app/uploads` bind-mounted from `mktemp -d` owned by root with mode 0755 (`sudo chown root:root`). Assert exit code 1 and the log `is not writable by uid 1000 gid 1000`.
  - Positive bind-mount check: same container with the directory chowned to `1000:1000` (`sudo chown 1000:1000`) and the real database; it must become `healthy`.
  - Run `scripts/ci/web-entrypoint.test.sh`.
  - Run the script locally against the `:local` images.
- [ ] 22.4 Add `scripts/ci/smoke-compose.sh` (POSIX sh, `set -eu`, `trap` that prints `docker compose logs` on failure and always runs `down -v`). It takes the env file and project name as arguments (defaults `scripts/ci/compose-smoke.env`, `brewform-ci`) and does the following:
  - Runs `docker compose … up -d`. It then polls `docker compose ps --format json` until `postgres`, `valkey`, `api`, `web` and `backup` are `healthy` and `migrate` has exited with code 0, and fails after 300 s.
  - Checks through `http://127.0.0.1:${WEB_PORT}` that `/healthz` returns 200 and `/health` returns `{"status":"ok"}`.
  - Runs `docker compose exec -T api node /app/healthcheck.mjs /ready`, which must exit 0.
  - Writes a 1×1 PNG with `docker compose exec -T -u node api node -e "require('node:fs').writeFileSync('/app/uploads/ci-probe.png', Buffer.from('<base64>','base64'))"`.
  - Runs `up -d --force-recreate api` and waits for `healthy`. Then `GET /uploads/ci-probe.png` through the web port must return 200 with `image/png`.
  - Runs `docker compose run --rm -e BACKUP_ONESHOT=1 backup`. In the backup container, `ls /backups` must show `db-*.dump` and `uploads-*.tar.gz`, `pg_restore --list` must succeed on the dump, and `tar -tzf` must list `ci-probe.png`.
  - Runs `docker compose stop api`. The api exit code (`docker inspect`) must be 0, and its logs must contain `Graceful shutdown complete`.
  - Run it locally against the `:local` images with `IMAGE_TAG=local`.
- [ ] 22.5 Rewrite `.github/workflows/ci.yml`:
  - Basics: `name: CI`; triggers `pull_request` (main) and `push` (main, tags `v*`); top-level `permissions: contents: read`; concurrency group `ci-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
  - Keep `quality` and `test`. Only `test` gets `actions: read` and `pull-requests: write`.
  - Add `images` (`needs: quality`, `timeout-minutes: 40`): set up buildx; run `docker/metadata-action` for OCI labels only; two `docker/build-push-action` builds with `load: true`, tags `brewform-api:ci`/`brewform-web:ci`, per-image gha cache scopes (`cache-to … mode=max,ignore-error=true`), and the web build args `${{ github.event_name == 'push' && secrets.VITE_API_URL || '/api/v1' }}` / `${{ github.event_name == 'push' && secrets.VITE_PUBLIC_APP_URL || 'http://localhost:8080' }}`; then run `scripts/ci/compose-config-check.sh`, `scripts/ci/smoke-images.sh` and `scripts/ci/smoke-compose.sh`; on `push` events only, record both image IDs as job outputs (`docker image inspect --format '{{.Id}}'`), then `docker save brewform-api:ci brewform-web:ci | gzip > images.tar.gz` and `actions/upload-artifact` (name `images-${{ github.sha }}`, `retention-days: 1`).
  - Add `publish` (`needs: [quality, test, images]`, `if: github.event_name == 'push'` with no `always()`, `permissions: contents: read, packages: write`, `timeout-minutes: 20`): `actions/download-artifact`, `gunzip -c images.tar.gz | docker load`, then fail unless both loaded IDs equal `needs.images.outputs.*`; `docker/login-action` to GHCR; `docker/metadata-action` per image (`images: ghcr.io/${{ github.repository_owner }}/brewform-<img>`; tags `type=raw,value=latest,enable={{is_default_branch}}`, `type=sha,format=long,prefix=`, `type=ref,event=tag`); a shell loop that runs `docker tag` and `docker push` for every tag. No build step. Task 28.6 appends `doc-drift` to `needs` when it adds that job (the job cannot exist earlier, because the doc-drift check passes only after the wave-6 archive).
  - Remove the stale "Images are deployed via the Release workflow" comment.
- [ ] 22.6 Add `scripts/ci/check-publish-needs.sh` (POSIX sh, `set -eu`, workflow path as the first argument, default `.github/workflows/ci.yml`). With `yq`, it collects every job id except `publish` and jobs whose `if:` is exactly `github.event_name == 'pull_request'`, compares them with `.jobs.publish.needs`, and exits 1 printing each missing id (`ci-image-publishing` requirement "Images are published only after CI succeeds", completeness guard). Add a `quality`-job step that runs it. Test it locally: a scratch copy of `ci.yml` without `images` in `publish.needs` exits 1 naming `images`, and the real file exits 0.
- [ ] 22.7 Pin `pnpm/action-setup` and `dawidd6/action-download-artifact` to full commit SHAs with `# vX.Y.Z` comments (look up the current release SHAs); confirm `renovate.json` keeps digests updated (add `helpers:pinGitHubActionDigests` if missing).
- [ ] 22.8 Delete `.github/workflows/pr.yml` and `.github/workflows/release.yml`.
- [ ] 22.9 Create `docs/deployment_compose.md` (self-hosting with compose): topology diagram (proxy → web edge → api/postgres/valkey), first install, required and optional vars, `TRUSTED_PROXIES` guidance, `make prod-*`, health and limits, backups (settings, off-host copy with `rsync`/`rclone`), the restore runbook (`pg_restore --clean --if-exists --no-owner`, uploads tar extract plus `chown 1000:1000`), upgrade (`prod-pull` + `prod-up`), rollback via `IMAGE_TAG`, the single-replica rule and expand/contract, and **Upgrading from the pre-wave-6 compose file** (rescue `/app/apps/api/uploads` with `docker compose cp` before pulling, then copy into the volume and `chown`; set `COMPOSE_PROJECT_NAME` to keep old volumes). Also include:
  - A **Data storage** section: the `UPLOADS_SOURCE`/`POSTGRES_DATA_SOURCE`/`BACKUPS_SOURCE` table and Compose's `/`, `.`, `~` rule; named-volume defaults and where Docker keeps them; host-folder setup (`sudo install -d -o 1000 -g 1000 -m 0750 ./data/uploads`; Postgres needs no chown); SELinux `chcon -Rt container_file_t` and the rootless/userns UID note; `make prod-fix-uploads-owner`; `docker compose down -v` deletes named volumes but not host folders.
  - A **Health checks** section: the per-service table (test, interval, timeout, retries, start period); `/health` versus `/ready` semantics and the `/ready` JSON keys; uptime monitors use `https://<WEB_DOMAIN>/health` and `/healthz`, never `/ready`.
  - Backups go to the named `backups` volume by default (`BACKUPS_SOURCE=./backups` for a host folder), with `make prod-backup-export` before `rsync`/`rclone`.
  - The restore runbook uses `make prod-restore DUMP=… UPLOADS=…`, with imports through `docker compose cp <file> backup:/backups/`.
  - The pre-wave-6 upgrade section uses the exact rescue commands from the production-operations "Upgrade notes" requirement: `docker compose cp` out before `git pull`, then the `docker compose run --rm --no-deps --user 0:0 --entrypoint sh -v "$PWD/uploads-rescue:/rescue:ro" api -c 'cp -a /rescue/. /app/uploads/ && chown -R 1000:1000 /app/uploads'` copy-in. It also runs `make prod-pull && make prod-check-identifiers` (task 22.2) before `make prod-up`, because the identifier indexes fail on case-duplicate data (the migration then rolls back and leaves the database unchanged).
- [ ] 22.10 Add the same "Photo storage security check (installs that ran before wave 6)" section to `docs/deployment_compose.md` inside "Upgrading from the pre-wave-6 compose file", for installs that used `STORAGE_DRIVER=s3` (copy the commands from the `docs/deployment_coolify.md` §10 section written in group 5, and add the Garage credential command first since compose users commonly self-host Garage or MinIO). Link it from the release notes drafted in task 17.17.
- [ ] 22.11 Update `docs/deployment_coolify.md`: §1/§13 publish flow is CI-gated (`ci.yml` `publish`, no `release.yml`); §5 says `valkey` instead of `redis`; §6 step 4 and §7 step 4 configure the dashboard health checks exactly as listed below; §7 gains the optional `PUBLIC_APP_URL` and the optional same-origin mode (`API_UPSTREAM`) with its caveats; replace §12 (webhook job removed) with manual Redeploy guidance; add the expand/contract note to §13; troubleshooting row "Invalid environment variables" notes that blank values now count as unset. Also apply t2's hand-off: replace the false Cloudflare "per-client limiting still works" claim at `docs/deployment_coolify.md:282-285` with the `TRUST_PROXY` topology table (`none`/`hops`/`cloudflare`, origin lockdown, Traefik `trustedIPs`), and keep t7's `DB_STATEMENT_TIMEOUT_MS` row (task 10.33). The health, storage and monitoring items:
  - §6 step 4: API Healthcheck enabled, Type `CMD`, Command `node /app/healthcheck.mjs /ready`, Interval 15, Timeout 5, Retries 3, Start period 180. Explain why it is `CMD` (the HTTP type needs curl/wget, which the image lacks) and that a disabled check falls back to the identical image `HEALTHCHECK`.
  - §7 step 4: web Healthcheck enabled, Type `HTTP`, Method `GET`, Scheme `http`, Host `localhost`, Port `80`, Path `/healthz`, expected code `200`, Interval 30, Timeout 3, Retries 3, Start period 10.
  - A **Monitoring** subsection: `https://api.brewform.cc/health` and `https://brewform.cc/healthz` for uptime monitors, never `/ready`. Changes need a redeploy.
  - §6 step 5 "Persistent Storage" becomes: none with `STORAGE_DRIVER=s3` (recommended). With `STORAGE_DRIVER=local`, use either Persistent Storage → Add → **Volume Mount** (Name `brewform-uploads`, Destination Path `/app/uploads`) or a **Directory Mount** (Source Path for example `/data/brewform/uploads`, Destination Path `/app/uploads`) plus `sudo chown -R 1000:1000 /data/brewform/uploads` on the server. Either way, set the API network alias `brewform-api` and the web `API_UPSTREAM=brewform-api:8000`, because local photo URLs are root-relative. Both resources must be on the same destination.
  - Coolify local-storage migration: `docker cp` the files out of `/app/apps/api/uploads` before redeploying, then `docker cp` them into `/app/uploads` and `docker exec -u 0 … chown -R 1000:1000 /app/uploads`.
  - Keep the "Before upgrading to wave 6" identifier-check step written by task 7.29.
  - A troubleshooting row for the `not writable by uid 1000 gid 1000` log and for `storage: "ephemeral"`.
- [ ] 22.12 Update `.env.production.example`: drop the `API_DOMAIN` requirement; add commented optional `IMAGE_TAG`, `API_IMAGE`/`WEB_IMAGE`, `TRUSTED_PROXIES`, `EDGE_MAX_BODY_SIZE`, `BACKUP_INTERVAL_SECONDS`, `BACKUP_RETENTION_DAYS`, `BACKUP_UPLOADS`, `*_MEMORY_LIMIT`, `VALKEY_MAXMEMORY`, `DOCKER_LOG_*`, `COMPOSE_PROJECT_NAME`, `STORAGE_DRIVER=s3` recommendation with `BACKUP_UPLOADS=false`. Also add t2's and t7's optional API overrides as commented lines with their compose defaults: `TRUST_PROXY` (`hops`; `cloudflare` when Cloudflare connects directly), `TRUST_PROXY_HOPS`, `TRUST_PROXY_CIDRS`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_STORE` (`redis`), `RATE_LIMIT_GLOBAL_MAX`, `CACHE_MEMORY_MAX_ENTRIES` and `DB_STATEMENT_TIMEOUT_MS`. Also add commented `UPLOADS_SOURCE=uploads`, `POSTGRES_DATA_SOURCE=postgres_data` and `BACKUPS_SOURCE=backups`, with one comment line saying that a value starting with `/`, `.` or `~` is a host folder (use an absolute or `./` path; the uploads folder must be owned by `1000:1000`) and anything else must be a declared volume name (`uploads`, `postgres_data`, `backups`). No `BACKUP_DIR` line.
- [ ] 22.13 Update `apps/api/.env.example`: `UPLOAD_DIR` comment (absolute; the image default is `/app/uploads`), the blank-means-unset note, `RUN_MIGRATIONS`. Also update `apps/web/.env.example`: the GitHub Actions note names the `publish` job of `ci.yml` instead of `release.yml`; `VITE_PUBLIC_APP_URL` stays the build-time default, but `PUBLIC_APP_URL` on the web container now rewrites `og:image`/`twitter:image` and the robots `Sitemap:` line at startup without a rebuild; and a commented "Web container runtime (not Vite)" block lists `API_UPSTREAM`, `PUBLIC_APP_URL`, `TRUSTED_PROXIES` and `EDGE_MAX_BODY_SIZE` (default `16MB`) with one line each.
- [ ] 22.14 Update `docs/docker.md`: preview uses the hardened runner (non-root, `UPLOAD_DIR=/app/uploads`), and a "Production" pointer to `docs/deployment_compose.md` and the `make prod-*` targets.
- [ ] 22.15 Update `coolify_deployment_plan.md` references to `release.yml`, the `deploy` webhook job and `make release`.
- [ ] 22.16 t2 (rate limiting): confirm that `/health` and `/ready` are exempt from the global limiter, including `/health` requests that arrive through the web edge. Confirm the edge contract (one `X-Forwarded-For` entry, `TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1`), and merge t2's api env lines into the `x-api-env` anchor.
- [ ] 22.17 t4a (upload security): confirm the env preprocessing (task 3.2) landed before t4a's `UPLOAD_*` env changes (task 5.29), and that `EDGE_MAX_BODY_SIZE` (16 MB) stays above `PHOTO_BODY_MAX_BYTES`.
- [ ] 22.18 Group check:
  - `make check` and `make lint` pass.
  - `make test-api` passes: env, storage startup, storage, health module, probe and lifecycle tests.
  - `make test-shared` (health schemas) and `make test-specific filter=migrate.test.ts` pass.
  - `make db-generate` prints "No schema changes, nothing to migrate".
- [ ] 22.19 `make images`, `scripts/ci/compose-config-check.sh`, `scripts/ci/smoke-images.sh`, `scripts/ci/check-publish-needs.sh` and `make prod-smoke` (which runs `scripts/ci/smoke-compose.sh`) succeed locally.
- [ ] 22.20 `make fmt` (Biome) and `pnpm run fmt-check` are clean; YAML and shell files are reviewed for consistent indentation (`docker compose config` and `sh -n docker-entrypoint.sh docker-web-entrypoint.sh scripts/ci/*.sh`).

## 23. Docs & specs: code remnants, workspace guards, merge truth fixes and lint policy (t8)

- [ ] 23.1 Rewrite stale Deno-era comments: `pnpm-workspace.yaml:5-7` (describe the pnpm catalog only), the `renovate.json` comment block (current managers only), `apps/api/vitest.config.ts:8` (explain serial files for DB count assertions), the Deno mention in `packages/db/src/schema.ts` and in `packages/shared/src/utils/date.ts`, and the sanitizer-options sentence in the docblock at `apps/api/src/modules/auth/model.test.ts:11`
- [ ] 23.2 In `apps/api/src/utils/openapi/index.ts:27` drop "v1.3.0" from the D34 P3 comment; check with Context7 (`/rhinobase/hono-openapi`) whether the installed 1.x types accept the `z.toJSONSchema` output for `requestBody`; if they do, remove the cast and its `biome-ignore`, otherwise keep both (lint-style "openapi/index.ts as-any cast …")
- [ ] 23.3 Replace the "D29 or later" reference in the `tasteNoteId` comment at `packages/shared/src/schemas/recipe.ts:149-160` with "D44 (`plans/D44-remove-taste-note-id-phase-2.md`)" (comment only)
- [ ] 23.4 Change `apps/web/package.json` `"vitest": "^5.1.0"` to `"vitest": "catalog:"` and run `make lockfile-update` (pnpm-workspace "catalog")
- [ ] 23.5 Relabel the `Makefile` `check-web` help text to "Type-check web frontend (tsc)" (pnpm-workspace "Make help text"; keep the `prod-*` targets from task 22.2)
- [ ] 23.6 Add `Allow: /equipments` and `Allow: /equipment/` above `Disallow: /equipment` in both the robots generator in `apps/web/vite.config.ts` (~:35-43) and `apps/web/public/robots.txt`, so the public catalog and detail pages stay crawlable while the private `/equipment` page stays disallowed; check the built `apps/web/dist/robots.txt` after `make build-web` (the web entrypoint from task 21.2 rewrites only the `Sitemap:` line at runtime; keep the `Allow` lines intact there)
- [ ] 23.7 Extend `packages/shared/src/workspace.test.ts` (failing first): every catalogued dependency is referenced as `"catalog:"` in every member; `devEngines.runtime.version` shares the `.nvmrc` major; both Dockerfiles use an exact `node:26.<minor>.<patch>-trixie-slim` tag; every `setup-node` step uses `node-version-file: '.nvmrc'`; `packageManager`, `devEngines.packageManager.version`, both Dockerfiles' `npm install -g pnpm@…` and every `pnpm/action-setup` `version:` agree (node-runtime, pnpm-workspace, dependency-management "Renovate and the workspace test …")
- [ ] 23.8 Extend `packages/shared/src/compose-config.test.ts` (failing first if absent): `app` and `web-dev` mount `node_modules:/app/node_modules` and build `target: deps`; keep the existing remnant, filter, tsx/vite and Caddy-pin assertions (local-dev-environment)
- [ ] 23.9 Run `make test-shared` and confirm both suites pass on the current tree
- [ ] 23.10 Add failing cases to `apps/api/src/modules/recipe/merge.test.ts`: a version whose recipe has `deletedAt` set throws `RECIPE_NOT_FOUND`; another user's `unlisted` recipe can be merged; another user's `private` and `draft` recipes throw `FORBIDDEN`
- [ ] 23.11 Add failing cases to `apps/api/src/modules/recipe/merge.route.test.ts`: `403 FORBIDDEN` for another user's private source and `404 NOT_FOUND` for a soft-deleted source; add a self-merge rejection case to `packages/shared/src/schemas/recipe.merge.test.ts` if it is missing
- [ ] 23.12 In `apps/api/src/modules/recipe/service.ts` `mergeRecipes` (~:847-858), treat `v.recipe.deletedAt != null` as missing and replace the local `canAccess` with `canViewRecipe(v.recipe, authorId)` (imported from `recipe/service.ts`); keep the existing entry/exit/error logs; make the tests pass
- [ ] 23.13 Update the merge route's `describeRoute` texts in `apps/api/src/modules/recipe/index.ts` (~:647-680): 403 "Email not verified, source recipe not viewable, or equipment compatibility violation"; 404 "Version not found or recipe deleted" (metadata only; `openapi.coverage.test.ts` stays green)
- [ ] 23.14 Measure inside Docker: `docker compose run --rm --no-deps app pnpm exec biome lint --only=suspicious/useAwait --only=suspicious/noEmptyBlockStatements --only=suspicious/noExplicitAny apps packages`; record per-rule counts in the PR description
- [ ] 23.15 Add `packages/shared/src/lint-policy.test.ts` (Vitest, paths from `import.meta.url`, docblocked helpers): fails with `file:line` for any `biome-ignore-all`/`biome-ignore-start`/`biome-ignore-end` under `apps/*/src` and `packages/*/src`, and for any `biome-ignore` comment without a `<category>/<group>/<rule>` path or with an empty or `<explanation>` justification
- [ ] 23.16 Fix `useAwait` violations (drop `async` or await the promise) in per-workspace commits
- [ ] 23.17 Fix `noEmptyBlockStatements` violations: user-facing catches call `toast.error(t('…'))` (new strings added to BOTH `packages/shared/src/i18n/en.json` and `tr.json`), service catches log `log.error({ err, …ids }, '<fn> failed')`, genuine fire-and-forget catches get an explanatory comment inside the block
- [ ] 23.18 Fix production `noExplicitAny` diagnostics with typed fixes, or justified line-level `biome-ignore` comments at true library boundaries
- [ ] 23.19 Final commit of the group: set `linter.rules.suspicious.noExplicitAny`, `useAwait` and `noEmptyBlockStatements` to `"error"` in `biome.json` (keep the web `noRestrictedImports` override from task 14.3); `make lint` exits 0
- [ ] 23.20 Group check: the lint fixes of tasks 23.16-23.18 touch production code, so run `make check`, `make check-tests`, `make lint` (exit 0 at error level), `make test-api` (after `make test-db-provision`), `make test-shared` (en/tr key parity for any new toast strings) and `make test-web`, then `make fmt` and `make fmt-check`. All must be green.

## 24. Docs & specs: docblock scanner, doc-drift guard and generated API reference (t8)

- [ ] 24.1 Port `openspec/changes/archive/2026-07-27-wave-5-debt-clearance/audit/docblock-scan.ts` to `scripts/docblock-scan.ts` (`node:fs/promises`, erasable syntax only, runnable with plain `node`; same export forms and scope; `--check` exits 1 listing `file:line symbol`; `--json` for tests)
- [ ] 24.2 Add docblock fixtures under `packages/shared/src/__fixtures__/docblock/` and cases in `packages/shared/src/doc-drift.test.ts` (documented export passes; `export const`, `export default X`, local `export { X }` without `/** */` fail; `//` comments do not count)
- [ ] 24.3 Run `node scripts/docblock-scan.ts --check`; backfill house-style `/** */` docblocks on exports added since wave 5 (brew-log, notification, search, merge, diff and any other flagged files) in docblock-only commits; `make check` and the test suites stay unchanged
- [ ] 24.4 Add a "Documentation comments" section to `docs/architecture.md` with the five house-style conventions and the bulk-category one-liners from the wave-5 inventory (code-documentation "Docblocks follow the captured house style")
- [ ] 24.5 Create fixture trees under `packages/shared/src/__fixtures__/doc-drift/` (`pass`, `fail-token`, `fail-allowlist-reason`, `fail-allowlist-stale`, `fail-archived-capability`, `fail-purpose`, `fail-link`, `fail-code-remnant`, `fail-stale-idiom` (one doc with `eq(t.deletedAt, null)` and one `AGENTS.md` listing `no-import-prefix`)) and `packages/shared/src/doc-drift.test.ts`, which spawns `node scripts/doc-drift-check.ts --root <fixture> --json` with `node:child_process` and asserts exit codes and reported `file:line` entries, plus one run against the repository root (fails until the script exists)
- [ ] 24.6 Implement `scripts/doc-drift-check.ts` (plain `node`, `node:` built-ins): documentation scope and token pattern `(?<![A-Za-z])deno(?:kv|land)?(?![A-Za-z])|jsr:` (case-insensitive) per the doc-drift-check spec; code-remnant scan over the node-runtime path list; allowlist loader rejecting empty reasons and globs that match nothing; archived-capability check with `retiredCapabilities`; "Purpose: TBD" check; relative-link check (skip URLs with a scheme, `mailto:` and pure `#anchors`); the `stale-idiom` rule from the doc-drift-check spec (`eq(<table>.deletedAt, null)` and the Deno lint rule names `no-import-prefix`/`no-unversioned-import`, honouring the allowlist); exclude `**/__fixtures__/**` and `openspec/changes/**` from the repository scan; `--root`, `--json`; output `file:line: rule: detail`; exit 1 on any finding
- [ ] 24.7 Create `scripts/doc-drift-allowlist.json` with the initial entries and reasons from the spec and `retiredCapabilities` = `deno-runtime`, `deno-workspace-management`, `remote-cache` → `wave-6-audit-remediation`
- [ ] 24.8 Add root `package.json` script `docs:check` (`node scripts/doc-drift-check.ts && node scripts/docblock-scan.ts --check`) and append it to the root `ci` script; add `make docs-check` (`docker compose run --rm --no-deps app pnpm run docs:check`, with a `##` help line) and add it to `make ci`
- [ ] 24.9 Add `.github/pull_request_template.md` with Summary and Testing sections and the "Docs & specs" checklist from the doc-drift-check spec
- [ ] 24.10 Run `node scripts/doc-drift-check.ts` locally and keep its findings list as the to-do list for the doc tasks below (expected to pass only after the final archive group)
- [ ] 24.11 Export the `openAPIRouteHandler` documentation options from `apps/api/src/routes/openapi.ts` as `openApiDocumentation` (no runtime change; keep every tag added earlier in this change, including `Health`) and confirm `routes/openapi.test.ts` and `openapi.coverage.test.ts` still pass
- [ ] 24.12 Add `apps/api/src/utils/openapi/reference.ts` (pure function: OpenAPI document → Markdown, one section per tag, rows with method, path, summary, auth marker from `security`, parameters, documented response codes, deterministic ordering, docblocked) and `reference.test.ts` covering grouping, ordering, auth marker and parameter rendering
- [ ] 24.13 Add `apps/api/scripts/generate-api-reference.ts` (sets test-safe env before a dynamic import like `openapi.coverage.test.ts`, builds the route tree from `routes/index.ts`, registers OpenAPI, requests `/api/v1/openapi.json`, writes `docs/api-reference.md` with a "Generated — do not edit" banner, warns about mounted routes missing from the spec; `createLogger('api-reference')` entry/exit debug logs, no PII) and the `docs:api` script in `apps/api/package.json`
- [ ] 24.14 Generate and commit `docs/api-reference.md`; confirm it lists brew logs, collections, notifications, `POST /api/v1/recipes/merge`, the version diff route, the sitemap and the cursor and advanced-search parameters
- [ ] 24.15 Add a step to the `quality` job of `.github/workflows/ci.yml`: `pnpm --filter @brewform/api run docs:api && git diff --exit-code docs/api-reference.md` (on top of the `ci.yml` from task 22.5)
- [ ] 24.16 Rewrite `docs/api.md` as conventions only: base URL and versioning; success/error envelope; error codes (including the 409 conflict mapping from the error-handling track, 413, 429, and t7's `503 QUERY_TIMEOUT`); authentication; offset and cursor pagination (`cursor`, `includeTotal`); advanced-search parameters (`author`, `dateFrom`/`dateTo`, `minRating`/`maxRating`, `search` max length, `sortBy=rating` per t7); t2's rate-limit contract (body, `Retry-After`, `RateLimit-*`); t4a's photo upload limits; deprecations (`tasteNoteId` + `Deprecation` header → D44); delete the endpoint tables, the removed `grinder` row (`:235`), the broken d28 link (`:234`) and the pre-F05 `emailNewFollowers` example (`:468`); link `docs/api-reference.md` and `/api/v1/docs`. This covers t2's `docs/api.md:530,557` hand-off (rate-limit headers and `Retry-After`) and folds in the earlier track edits to `docs/api.md` (t1, t3, t4a, t7).
- [ ] 24.17 Group check: run `make test-api` (reference renderer) and `make test-shared` (doc-drift and docblock fixtures). The repository-root doc-drift case is expected to fail until group 28.

## 25. Docs: AGENTS.md consolidation (t8, with inputs from t2, t4a, t4b, t5, t6 and t7)

- [ ] 25.1 Development commands: `make up` service list exactly as `compose.yml` ships it; granular targets add `make test-web`, `make check-tests`, `make test-coverage`, `make docs-check`; `make test-db-provision` mirrors `.github/workflows/ci.yml` (not `pr.yml`); read `.githooks/pre-commit` and state whether it needs host pnpm. Also state that `make test-specific` runs only the api, db and shared workspaces, and give the single web test command `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run <path>` (t6's note).
- [ ] 25.2 Architecture: Vite proxies `/api/*` to `VITE_API_PROXY_TARGET` (compose sets `http://app:8000`, default `http://localhost:8000`) — remove "host networking auto-detected"
- [ ] 25.3 API module pattern: middleware line updated with t4a's `bodyLimit` (1 MB global, photo cap on `/api/v1/photos`) and t2's trusted-proxy client identity / separate rate-limit store; cache DI rule worded per the `cache-driver` capability. This is also t4a's requested middleware-line edit.
- [ ] 25.4 OpenAPI section: replace "hono-openapi v1.3.0" with "the installed hono-openapi 1.x" while keeping the `jsonRequestBody` rule; state the coverage test's real scope (auth, recipes and admin excluded until covered); add "regenerate `docs/api-reference.md` with `pnpm --filter @brewform/api run docs:api`"
- [ ] 25.5 Database rules: replace the first bullet with t7's wording (Drizzle builders, `ilike` accepted, `sql` fragments only per the lint-style registry with a `// D03 raw-SQL exception:` comment, ADR-approved extensions such as `pg_trgm` through `drizzle-kit generate --custom`, bounded reads); soft-delete bullet → "filter with `isNull(t.deletedAt)`, e.g. `and(eq(t.id, id), isNull(t.deletedAt))`" and drop `findUnique`; keep the seed bullet (the production demo seed is unchanged in wave 6); the `db-reset` bullet states that it creates `pg_trgm` before `db-push` (task 10.23). Use t7's exact wording from `audit/t7-search.md` §4, including the new "Bounded reads" bullet. This merges t7's AGENTS.md task. Together with tasks 25.7 to 25.9, this satisfies the doc-drift-check requirement "Agent instructions state the current code idioms and stale idioms are rejected": `node scripts/doc-drift-check.ts` must report no `stale-idiom` finding for `AGENTS.md` (and, after task 26.8, for `docs/architecture.md:149`). Add these database-rules bullets as well:
  - "Recipe listings build their visibility filter only from `listableRecipeCondition`/`viewableRecipeCondition` in `apps/api/src/modules/recipe/model.ts` (discovery surfaces pass `null`); services use `canViewRecipe`/`canListRecipe`; never compare `recipes.visibility` inline (enforced by `visibility.enforcement.test.ts`; admin is exempt). Unlisted means direct-link only."
  - "Case-insensitive identifiers: compare `user.email`/`user.username` with `eq(lower(col), value.toLowerCase())` using the `lower()` helper from `@brewform/db/schema` (served by the `_lower_unique` indexes). Claim unique generated values (recipe slugs) with `insert … onConflictDoNothing({ target }).returning()` inside the transaction; never catch `23505` inside a transaction and keep using it (Postgres aborts the transaction). A soft-deleted join row with a composite unique key is revived with `onConflictDoUpdate` that clears `deleted_at`."
- [ ] 25.6 Testing: Vitest imports, `import '../../test-setup.ts'` first in API DB tests, serial DB files (`fileParallelism: false`), logger assertions with `vi.spyOn(log, '<level>')`
- [ ] 25.7 Code style: replace "Lint exclusions" with the Biome policy (recommended preset; `noExplicitAny`/`useAwait`/`noEmptyBlockStatements` are errors; web a11y/hook-deps overrides; the CI owner's warnings policy); suppressions are line-level `// biome-ignore <category>/<group>/<rule>: <justification>` with no file-level or range form (enforced by `lint-policy.test.ts`); every exported production symbol has a docblock (enforced by `scripts/docblock-scan.ts`). Add t6's "Charts" rule under Code style: use the `apps/web/src/utils/chart` primitives; no `<text>` in `preserveAspectRatio="none"` SVGs; colours from tokens; geometry tests required.
- [ ] 25.8 Add an i18n rule: every user-visible string goes through `t()`; flat keys are added to BOTH `en.json` and `tr.json` (deterministic parity test)
- [ ] 25.9 Logging: delete the `TODO_logs.md` pointer (`:162`); add "rate-limit keys and request logs never contain raw IPs or emails" (t2)
- [ ] 25.10 Insert t5's "Web data loading" section (loaders/actions/fetchers, `request.signal`, URL-state rules, `useEffect` allowlist). This merges t5's AGENTS.md task. The section also states the URL-state rules: the URL is the source of truth, a filter change resets the page, and text inputs use a 300 ms debounced replace.
- [ ] 25.11 Add a "Docs & specs" section: `make docs-check` and the PR template checklist; OpenSpec rules (first line of every requirement contains SHALL/MUST; use RENAMED to change a title; never ship an all-REMOVED delta — delete the folder and add it to `retiredCapabilities`; replace the TBD Purpose after archiving; `openspec validate <change> --strict`); historical docs live in `docs/history/`; ADR numbering in `docs/decisions.md`
- [ ] 25.12 Other conventions: deployment docs are `docs/deployment_compose.md` (compose) and `docs/deployment_coolify.md` (Coolify); images publish from the CI-gated `publish` job in `ci.yml` (no `release.yml`, no `make release`); cache: in-memory default, `CACHE_DRIVER=redis` + `REDIS_URL` (Valkey 9.1 in the compose files), `CACHE_ENABLED=false` → `NullCacheProvider`, rate-limit state independent of the cache (t2). This also covers t4b's `release.yml` line and t2's Coolify nuance: deployments behind a proxy set `TRUST_PROXY`. Health: `GET /health` is liveness and `GET /ready` is readiness (fixed keys, `503` while shutting down). The API image `HEALTHCHECK` and the compose api check run `node /app/healthcheck.mjs /ready`; the web image `HEALTHCHECK` and the compose web check run `wget -q -O /dev/null http://127.0.0.1/healthz`. The Coolify API check is the `CMD` type with that command and the web check is HTTP `/healthz`. Uptime monitors use `/health`. Compose data locations: `UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE`, `BACKUPS_SOURCE` (named volumes by default).
- [ ] 25.13 Group check: run `node scripts/doc-drift-check.ts` and confirm that no reported `file:line` is in `AGENTS.md` (the findings that remain are under `openspec/specs/` and are cleared by the archive and Purpose backfill in group 28); run `pnpm --filter @brewform/shared exec vitest run src/doc-drift.test.ts` inside the `app` container and confirm only the repository-root case fails; confirm every command, target and path `AGENTS.md` names exists (`make help`, root `package.json` scripts, `ls` of each path).

## 26. Docs: README, docs/ and root files (t8)

- [ ] 26.1 Features: add brew journal (F02), collections (F01), in-app notifications and @mentions (F05/F04), version diff and recipe comparison/merge (F09/F08), advanced search (F11), sitemap and social previews; reword "Admin Dashboard" to what ships (users, bans, audit log, dashboard stats; moderation queue and analytics charts are API-only until F15/F17 UI ships)
- [ ] 26.2 Tech stack table: Node 26 LTS (tsx in development), Biome, Vitest + Testing Library, PostgreSQL 18, cache "in-memory default or Redis-protocol via `CACHE_DRIVER=redis` (Valkey 9.1 in compose), `CACHE_ENABLED`", CI/CD "GitHub Actions → GHCR (CI-gated publish)"
- [ ] 26.3 Quick start: real clone URL (`https://github.com/Ardakilic/BrewForm.git`); admin credentials and the seed's demo accounts described exactly as the seed ships them today: the first boot of an empty database creates them, on a production install too (the seed is unchanged in wave 6 by the user's decision; the README states this plainly and does not call the accounts development-only); `make test-db-provision` before DB-backed tests
- [ ] 26.4 Development and Database blocks: `check-web` is a type-check; add `make test-web`, `make test-specific filter=…`, `make test-db-provision`, `make docs-check`; `db-push` = "prototyping only — use `db-generate` + `db-migrate` for schema changes" (matches AGENTS.md); `db-reset` and seed-count descriptions verified against the Makefile and `packages/db/src/seed*.ts`
- [ ] 26.5 Services table: add Valkey (dev compose) and align with t4b's compose changes; add a "Self-hosting" section linking `docs/deployment_compose.md`, `docs/deployment_coolify.md` and `make prod-*`
- [ ] 26.6 API section: link `docs/api.md`, `docs/api-reference.md` and the Scalar UI `/api/v1/docs`; drop "100+ endpoints"
- [ ] 26.7 Documentation table: add `api-reference.md`, `comments.md`, `logging.md`, `seo.md`, `deployment_compose.md`; move `deployment.md` to a "History" row per t4b's decision; fix the `:252` link to the superseded guide
- [ ] 26.8 `docs/architecture.md`: suppression wording at `:60-61`; cache section `:76-101` per the cache-driver spec (bounded memory, namespacing, degradation) and `c.get('cache')` per the DI decision; replace "Portability Rules (§6.2)" `:115-130` with the AGENTS.md database rules (drop the multi-database claim); schema overview `:136-144` → 32 tables and 15 enums including collections, collection items, brew logs and notifications; soft deletes `:146-150` → `isNull`; middleware stack `:179-186` → the full order from AGENTS.md with t2's rate-limit identity; OpenAPI `:195-226` → all mounted groups incl. brew-logs, collections, notifications, the real coverage scope, the generated reference; notifications `:223-233` → in-app + email; Background Jobs → per-replica note (node-runtime); Testing → Vitest conventions, `make test-web`, `make test-db-provision`; "Lint exclusions" `:303-306` → Biome policy; add t5's web data-flow section. Also fold in the inputs from the other tracks:
  - t2: `NullCacheProvider` no longer affects limiting, plus the LRU bound and fail-soft redis (`:92-101`), and the policy-table reference (`:179`).
  - t7: the amended portability rules, plus the three trigram indexes and the `pg_trgm` extension in the schema/index notes.
  - t5: the web data-flow section.
- [ ] 26.9 `docs/request-lifecycle.md`: middleware table `:54-60` → cors, requestId, secureHeaders, rateLimit, bodyLimit, cache injector, crawler, `onError`, `/uploads`, routes, with t2's client-identity text (`:17`, `:58`); side-effect path covers the in-app notification record and the email; background jobs per-replica note. t2 input: rate limiting is no longer CacheProvider-backed.
- [ ] 26.10 `docs/notifications.md`: retitle "Notifications"; categories table with in-app + email channels, the flat `notify*` flags (`notifyNewFollower`, `notifyRecipeLiked`, `notifyRecipeCommented`, `notifyFollowedUserPosted`, `notifyMentionedInComment`), one flag gating both the record and the email, @mention rules (F04), the `notifications` table and bell/list UI (F05), `APP_ENV=test` suppression, and "adding a notification type" (enum, both channels, preference, en+tr i18n, tests) — verify against `apps/api/src/modules/notification/` and `apps/api/src/utils/notify/`
- [ ] 26.11 `docs/decisions.md`: add an ADR index table; ADR-001 link → `openspec/changes/archive/<date>-remove-deno-node24-pnpm/` and the exact `node:26.13.0-trixie-slim` tag; ADR-006 marked "Superseded by ADR-015 and ADR-016"; ADR-013 marked "Superseded by ADR-020"; add ADR-015 (cache driver + `CACHE_ENABLED`, valkey), ADR-016 (rate-limit store and client identity), ADR-017 (pg_trgm search ranking), ADR-018 (web data loading), ADR-019 (server-generated upload keys), ADR-020 (JSDoc on every exported symbol, `scripts/docblock-scan.ts`), ADR-021 (generated API reference), taking content from the owning tracks' designs; refresh ADR-012's hono-openapi version note. Write ADR-015 and ADR-016 from t2's design, and verify that ADR-017 (t7), ADR-018 (t5) and ADR-019 (t4a), written earlier, carry their pre-allocated numbers.
- [ ] 26.12 `docs/seo.md`: replace `https://brewform.app` (`:47`, `:63`) with `${VITE_PUBLIC_APP_URL}`; document the sitemap (`/api/v1/sitemap.xml` and the robots `Sitemap:` line), the new robots `Allow` lines, and the share/OG topology after t4b's edge routing Also document that non-public recipe and collection pages render `noindex, nofollow` with no canonical link or JSON-LD, that version, diff and compare pages are always noindex, that the API sends `X-Robots-Tag: noindex, nofollow` for non-public items and for share/crawler misses, and that the sitemap, share and crawler OG pages cover public recipes only.
- [ ] 26.13 `docs/logging.md`: the AGENTS.md rules (entry/exit debug logs in services, mount/unmount in pages, never passwords, tokens, emails or IPs, `err` on error logs), request id propagation (`X-Request-ID`), `LOG_LEVEL=silent` in tests, t2's hashed rate-limit keys; no `TODO_logs.md` reference
- [ ] 26.14 `docs/auth.md`: `:52` registration-disabled logging without the raw IP (t2), login limits per IP and per account (t2), and the email-verification gate on fork/PATCH (t1 W11)
- [ ] 26.15 `docs/recipes.md`: `:26` `bumpVersion: false` semantics as implemented by t1, personal-notes ownership (t1 recipe-personal-notes), slug behaviour (recipe-slug owner), links to merge and version diff Add a "Visibility" subsection with the four values (unlisted = direct link only: never in search, lists, profiles, feeds, category pages, other users' collections, the sitemap or OG previews; Starred and the brew journal may show unlisted recipes the user saved; fork attribution is hidden unless the source is public).
- [ ] 26.16 Spot-check `docs/comments.md`, `docs/coffee-data.md`, `docs/coffee-equipments.md` and `docs/taste-notes.md` against code (paths, counts, behaviour) and fix any stale statement
- [ ] 26.17 `git mv docs/requirements-audit-report.md docs/history/2026-05-03-requirements-audit-report.md`, add a "Historical snapshot (2026-05-03), superseded — do not use as a work list" banner, and fix inbound links
- [ ] 26.18 Add `docs/README.md` indexing current docs and `docs/history/`, linked from the README documentation table
- [ ] 26.19 Verify t4b's `docs/deployment_coolify.md` / `docs/deployment_compose.md` / `coolify_deployment_plan.md` edits satisfy the deployment-guide requirements (Node 26 + pin pointers, frozen pnpm install, entrypoint start command, drizzle-kit via `@brewform/db` scripts, per-replica jobs note, prerequisites table) and pass `node scripts/doc-drift-check.ts`; fix any gap in those files directly Also verify: the exact Coolify health-check settings (CMD `node /app/healthcheck.mjs /ready`, web HTTP `/healthz`), the Coolify Persistent Storage steps with the network alias and `API_UPSTREAM`, and that no production step uses `pnpm` or drizzle-kit.
- [ ] 26.20 Re-check each open item in `TODO_logs.md` against code after the logging/API tracks land; move the still-open ones into `plans/D99-debts.md` as D99.20+ entries, then `git rm TODO_logs.md`
- [ ] 26.21 Group check: run `node scripts/doc-drift-check.ts` and confirm that no reported `file:line` is in `README.md`, another root `*.md` file, `docs/**` or `.github/**` (remaining findings are under `openspec/specs/` only, cleared in group 28); confirm `node scripts/docblock-scan.ts --check` still exits 0; run `make fmt` and `make fmt-check`.

## 27. Plans and backlog (t8)

- [ ] 27.1 `plans/ROADMAP.md`: replace "All ledgered debt … resolved" with a "Wave 6 — 2026-11-18 audit remediation" entry (link `plans/AUDIT-2026-11-18.md` and the archived change), add D44 and any D99.20+ deferrals to Remaining Debt, add a "Platform changes" history line (#135 Node 26/pnpm, #166 production compose + redis driver + `CACHE_ENABLED`, #168 valkey, wave 6), reconcile the F01/F11 ship dates with their merge commits, drop F24 from "quick wins", and record F03/F20/F25/F26/F28 as unblocked by F02. Include every deferral listed in `proposal.md` → Non-Goals as a D99.20+ entry.
- [ ] 27.2 `plans/FEATURE_SUGGESTIONS.md`: replace the Priority Matrix (`:236-256`) with a link to ROADMAP; rewrite the 34 `](plans/F…md)` links as `](F…md)`; update the header counts (21 API modules, 32 tables) and the "Notifications are email-only" line (`:116`); remove its Deno mention
- [ ] 27.3 `plans/F23-image-optimisation.md`: replace the "Deno/WASM codec" blocker with a sharp-based design (Node-API v9, Node ≥ 20.9, prebuilt glibc ≥ 2.28 binaries for the trixie images, no install script so no `allowBuilds` entry; server-side WebP/AVIF + responsive sizes, ADR-009 client thumbnails kept as fallback; t4a's sniffing remains the type check) and update its status in ROADMAP
- [ ] 27.4 `plans/F29-weekly-email-digest.md`, `plans/F30-bean-freshness-tracking.md`, `plans/F16-badge-expansion.md`: replace `Deno.cron` with `node-cron` (`cron.schedule(expr, fn, { name })` in `apps/api/src/utils/jobs/cron.ts`), `deno task email-build` with `pnpm run email-build`, and add the per-replica caveat with the `SET NX PX` lock option when `CACHE_DRIVER=redis`
- [ ] 27.5 `plans/F07-batch-calculator.md`, `plans/F17-admin-analytics.md`, `plans/F27-equipment-reviews.md`: replace Deno test notes and commands with Vitest / pnpm equivalents; re-scope F17 to "UI over the existing `/admin/analytics/*` endpoints first" using t6's chart primitive
- [ ] 27.6 `plans/F24-version-snapshots.md`: cut the diff/`computeVersionDiff` scope (shipped as F09) and keep only the immutability guards
- [ ] 27.7 `plans/F03-user-profile-stats.md`, `plans/F20-brew-logger-integration.md`, `plans/F25-pwa-offline.md`, `plans/F26-activity-feed.md`, `plans/F28-guided-brew-mode.md`: replace the "blocked by F02" banners with refresh notes pointing at `brewLogs` (`packages/db/src/schema.ts`), `/api/v1/brew-logs` and the existing `getUserBrewStats` / `/stats/recipe/:recipeId`
- [ ] 27.8 `plans/F31-recipe-embed-widgets.md`: note the global `xFrameOptions: 'DENY'` / `frameAncestors: ['none']` (`apps/api/src/main.ts:49-74`) and require an explicit per-route override for the embed route; `plans/F15-admin-moderation.md`: split into F15a (Report button/dialog + admin reports page) and F15b (auto-flagging)
- [ ] 27.9 `plans/TECHNICAL_DEBT.md:256`: "D28 phase 1 (deprecation headers) resolved 2026-06-22; phase 2 removal tracked as D44"; create `plans/D44-remove-taste-note-id-phase-2.md` (problem, telemetry/sunset criterion, removal steps for schema field, deprecation branch and docs row); update `plans/D99-debts.md` status line if D99.20+ entries are added
- [ ] 27.10 Group check: run `node scripts/doc-drift-check.ts` and confirm that no reported `file:line` (token or broken relative link) is in `plans/ROADMAP.md`, `plans/FEATURE_SUGGESTIONS.md` or `plans/F*.md`; confirm every D99.20+ entry from `proposal.md` → Non-Goals exists in `plans/ROADMAP.md` (task 27.1) and the two `plans/TECHNICAL_DEBT.md` entries from task 17.16 exist. Commit the group.

## 28. Archive wave 6 and wire the doc-drift guard (t8)

- [ ] 28.1 Commit all work so far, and confirm `openspec validate wave-6-audit-remediation --strict` passes before archiving.
- [ ] 28.2 `git rm -r openspec/specs/deno-runtime openspec/specs/deno-workspace-management openspec/specs/remote-cache` (retired capabilities; replaced by `node-runtime`, `pnpm-workspace`, `cache-driver`). This also completes t2's requested `remote-cache` retirement, which migrates to `cache-driver`.
- [ ] 28.3 Run `openspec validate wave-6-audit-remediation --strict`, then `openspec archive wave-6-audit-remediation -y`, and confirm "Specs updated successfully". After this task the change folder, including this `tasks.md`, lives at `openspec/changes/archive/<date>-wave-6-audit-remediation/`. Check the remaining boxes there.
- [ ] 28.4 Replace every "Purpose: TBD - created by archiving change …" in `openspec/specs/*/spec.md` (46 after the wave-6 archive per the 2026-11-19 sandbox run: the 26 pre-existing placeholders that survive the deletion of the three retired folders, plus one for each of the 20 capabilities wave 6 creates) with a 2-4 sentence purpose, and rewrite the Deno-era Purpose text of `lint-style`, `local-dev-environment` and `deployment-guide`. The `container-deployment` "Deno KV no longer…" remark was already rephrased at integration
- [ ] 28.5 Run `node scripts/doc-drift-check.ts` and fix every remaining finding until it exits 0
- [ ] 28.6 Add the `doc-drift` job to `.github/workflows/ci.yml` (no `needs:`, checkout, `setup-node` with `node-version-file: '.nvmrc'`, `node scripts/doc-drift-check.ts`, `node scripts/docblock-scan.ts --check`, no dependency install) and append it to the `publish` job's `needs:` (giving `[quality, test, images, doc-drift]`); `scripts/ci/check-publish-needs.sh` must still exit 0. The `doc-drift` job runs on `push` and `pull_request` alike (no pull-request-only `if:`), because `publish` needs it.
- [ ] 28.7 Run `openspec validate --all --strict` and confirm every spec passes

## 29. Final verification and pull request

- [ ] 29.1 Run `make check` and `make check-tests`; both exit 0.
- [ ] 29.2 Run `make lint`. It exits 0 with `noExplicitAny`, `useAwait` and `noEmptyBlockStatements` at error level and the web `noRestrictedImports` boundary at error level.
- [ ] 29.3 Run `make test-db-provision` (idempotent). `brewform_test` must have the `user_recipe_note` table, the `pg_trgm` extension, the three trigram indexes and the `user_email_lower_unique`, `user_username_lower_unique` and `setup_user_default_unique` indexes.
- [ ] 29.4 Run each suite separately and check each exit code. Never use `make test | tail`, because the pipe takes `tail`'s exit code and masks failures.
  - `make test-api`
  - `make test-shared`
  - `make test-web`
  - the db workspace: `docker compose run --rm -e DATABASE_URL=postgresql://brewform:brewform@postgres:5432/brewform_test app pnpm run test:db`

  Investigate every failure, and record any environment-only failure (host ICU, the known flaky Navbar keyboard test) in the PR description.
- [ ] 29.5 Run `make db-generate` and confirm it prints "No schema changes, nothing to migrate". This covers the per-track schema-freshness checks (t1, t3, t4a, t7).
- [ ] 29.6 Run `make docs-check` (the doc-drift script and docblock scan). Then run `pnpm --filter @brewform/api run docs:api` inside the `app` container and confirm `git diff --exit-code docs/api-reference.md` is clean.
- [ ] 29.7 Run `make fmt`, then `make fmt-check` (`pnpm run fmt-check`), and confirm it is clean. Also run `sh -n docker-entrypoint.sh docker-web-entrypoint.sh scripts/ci/*.sh`, and confirm `docker compose config` renders both compose files.
- [ ] 29.8 Build and boot-test both images exactly as CI does, and check each exit code: `make images`, `scripts/ci/compose-config-check.sh`, `scripts/ci/smoke-images.sh` (both images become `healthy` through their own `HEALTHCHECK`; `/health`, `/ready`, `/healthz` and the edge proxy answer), `make prod-smoke` (the full `compose.production.yml` stack with the `:local` images; uploads survive an api recreate; backup and graceful shutdown) and `scripts/ci/check-publish-needs.sh` (exit 0; `publish.needs` is `[quality, test, images, doc-drift]`). Paste the image sizes and the smoke summaries into the PR description.
- [ ] 29.9 Run `openspec validate --all --strict` and `node scripts/doc-drift-check.ts`; both exit 0.
- [ ] 29.10 Run `make ci` once end to end.
- [ ] 29.11 Read `AGENTS.md` and `README.md` once more against the `Makefile`, the root `package.json`, `biome.json` and `.github/workflows/ci.yml`, and fix any mismatch (t8 verification).
- [ ] 29.12 Commit the remaining changes with conventional commit messages, each ending with the `Co-Authored-By` attribution line, and push the `wave-6-audit-remediation` branch.
- [ ] 29.13 Open ONE pull request against `main` with `gh pr create`. The description contains:
  - a summary per track and the **BREAKING** list from `proposal.md`
  - upgrade notes: run the identifier check first (`make prod-check-identifiers` for compose, the one-off `docker run` from the Coolify guide); Coolify `TRUST_PROXY`, the `CMD` API health check and the HTTP `/healthz` web check; for compose, the photo rescue, `make prod-fix-uploads-owner` (or `UPLOADS_SOURCE` for a host folder) and `COMPOSE_PROJECT_NAME`; the S3 photo storage security check
  - t1's release-note text (task 17.17)
  - the user decisions (U1-U4, D1-D5, OQ1-OQ4) and every interpretation call listed in `design.md` → Open Questions → "Interpretation calls applied while folding in the answers", so the reviewer can confirm them
  - the evidence recorded during tasks: the native type-stripping spike outcome and image sizes, the Valkey integration result, the per-rule lint counts, `pg_relation_size` and the `EXPLAIN` output, the restore drill, and the visual-checklist deviations
  - the note that `pr_description.md` is git-ignored and untracked (`.gitignore:49`), so no repository change is needed
  - the completed "Docs & specs" checklist from `.github/pull_request_template.md`

  End the description with the Claude Code attribution line.
- [ ] 29.14 After opening the PR, confirm: exactly one `CI` run per push; `images` builds and smoke-tests both images; `publish` is skipped on the PR. After merge, confirm `publish` runs only after `quality`, `test`, `images` and `doc-drift` pass and that GHCR shows `latest` and `<sha>` for both images. On a personal fork, push a throwaway `v0.0.0-rc` tag, confirm the run does not move `latest`, then delete the tag.
