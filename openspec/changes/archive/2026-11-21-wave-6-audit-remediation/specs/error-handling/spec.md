## ADDED Requirements

### Requirement: API global error handler unwraps Drizzle-wrapped Postgres errors

The API global error handler (`apps/api/src/middleware/errorHandler.ts`, registered via `app.onError`) SHALL locate the underlying postgres-js `PostgresError` by walking the `cause` chain of the thrown error (at most 5 levels, starting with the error itself), because drizzle-orm 0.45 wraps every driver error in a `DrizzleQueryError` whose `name` is `Error` and whose `cause` holds the `PostgresError`.

Detection SHALL be structural (an object with `name === 'PostgresError'` and a 5-character string
`code`), implemented once in `apps/api/src/utils/errors.ts` as
`getPostgresError(err: unknown): PostgresErrorLike | null`, so neither the middleware nor services
need to import `drizzle-orm` or `postgres`.

When a `PostgresError` is found, the handler SHALL map its SQLSTATE as follows and SHALL respond with
the standard envelope `{ success: false, error: { code, message, requestId } }`:

| SQLSTATE | Meaning | Status | `error.code` | `error.message` |
|---|---|---|---|---|
| `23505` | unique violation | 409 | `CONFLICT` | `A record with this value already exists` |
| `23503` on an `insert`/`update` statement | referenced row missing | 400 | `VALIDATION_ERROR` | `A referenced record does not exist` |
| `23503` on a `delete` statement | row still referenced | 409 | `CONFLICT` | `The record is still referenced by other records` |
| `23502`, `23514`, and class `22` (`22001`, `22003`, `22007`, `22008`, `22P02`, …) | invalid stored value | 400 | `VALIDATION_ERROR` | `A value is invalid for this field` |
| `57014` | statement cancelled by `statement_timeout` (see the `advanced-search` capability) | 503 | `QUERY_TIMEOUT` | `The query took too long. Try a more specific search.` |
| anything else | — | 500 | `INTERNAL_ERROR` | production: `Something went wrong` |

The statement kind for `23503` SHALL be read from the leading keyword of the wrapper's `query`
string when present; when it is absent the handler SHALL use the `400` row. Responses SHALL NOT
include SQL text, parameters, constraint names, table names or column names.

#### Scenario: Wrapped unique violation returns 409

- **WHEN** a route handler throws `new DrizzleQueryError('insert into "user_follow" ...', [...], pgErr)` where `pgErr.name === 'PostgresError'` and `pgErr.code === '23505'`
- **THEN** the response status is `409` and `error.code` is `CONFLICT`
- **AND** the body contains no SQL text and no parameter values

#### Scenario: Unwrapped PostgresError keeps working

- **WHEN** a route handler throws a bare object-shaped `PostgresError` with `code === '23505'`
- **THEN** the response status is `409` and `error.code` is `CONFLICT`

#### Scenario: Foreign-key violation on insert returns 400

- **WHEN** `POST /api/v1/recipes` is called with a `vendorId` that does not exist and the insert raises `23503`
- **THEN** the response status is `400` and `error.code` is `VALIDATION_ERROR` (today it is `500`)

#### Scenario: Non-Postgres wrapped error stays 500

- **WHEN** a `DrizzleQueryError` whose `cause` is a connection error (`ECONNREFUSED`) reaches the handler
- **THEN** the response status is `500` and `error.code` is `INTERNAL_ERROR`

### Requirement: API global error handler maps Hono HTTPException to the standard envelope

The API global error handler SHALL detect `err instanceof HTTPException` (from `hono/http-exception`) before any other branch and SHALL respond with the exception's own `status` and the standard JSON error envelope, so framework-raised client errors are never reported as `500`.

- When the exception carries a custom response (`res`), the handler SHALL return
  `err.getResponse()` unchanged.
- Otherwise `error.code` SHALL be derived from the status: `400` → `BAD_REQUEST`, `401` →
  `UNAUTHORIZED`, `403` → `FORBIDDEN`, `404` → `NOT_FOUND`, `405` → `METHOD_NOT_ALLOWED`, `409` →
  `CONFLICT`, `413` → `PAYLOAD_TOO_LARGE`, `415` → `UNSUPPORTED_MEDIA_TYPE`, `422` →
  `VALIDATION_ERROR`, `429` → `RATE_LIMITED`, any other `4xx` → `BAD_REQUEST`, any `5xx` →
  `INTERNAL_ERROR`.
- For `4xx`, `error.message` SHALL be the exception message (these are framework- or
  author-controlled strings). For `5xx`, the production message SHALL be `Something went wrong`.
- `4xx` HTTPExceptions SHALL be logged with `log.warn({ requestId, status, method, path }, 'HTTP exception')`
  and SHALL NOT produce the `Unhandled error` log line; `5xx` SHALL be logged with `log.error`.
- The envelope SHALL be built with `c.json(...)` so headers already set on the context (CORS,
  request id, secure headers) are preserved.

#### Scenario: Malformed JSON body returns 400

- **WHEN** `POST /api/v1/collections` is sent with `Content-Type: application/json` and the body `{"name":`
- **THEN** the response status is `400`, `error.code` is `BAD_REQUEST` and `error.message` is `Malformed JSON in request body` (today it is `500`)
- **AND** no `Unhandled error` log line is emitted

#### Scenario: HTTPException status is preserved

- **WHEN** a handler throws `new HTTPException(429, { message: 'Too many requests' })`
- **THEN** the response status is `429` and `error.code` is `RATE_LIMITED`

#### Scenario: Custom HTTPException response is honoured

- **WHEN** a handler throws `new HTTPException(401, { res: new Response('nope', { status: 401 }) })`
- **THEN** the response is that custom response

### Requirement: Typed AppError hierarchy is mapped by the global error handler

The API SHALL provide a small typed error hierarchy in `apps/api/src/utils/errors.ts` and the global error handler SHALL map any thrown `AppError` to its declared status and envelope without per-route `try/catch` code.

```ts
/** Base class for expected, client-facing API errors. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: ContentfulStatusCode,
    message: string,
    readonly details?: Array<{ field: string; message: string }>,
    options?: { cause?: unknown },
  );
}
export class NotFoundError extends AppError {}   // 404, code 'NOT_FOUND', message '<Resource> not found'
export class ForbiddenError extends AppError {}  // 403, code 'FORBIDDEN'
export class ConflictError extends AppError {}   // 409, code defaults to 'CONFLICT' (e.g. 'SLUG_CONFLICT')
export class ValidationError extends AppError {} // 400, code 'VALIDATION_ERROR', optional details
```

- Each class SHALL set `name` to its class name and SHALL have a JSDoc docblock.
- The handler SHALL respond `{ success: false, error: { code, message, details?, requestId } }`
  with `status`, and SHALL log `AppError`s at `debug` (`4xx`) without the `Unhandled error` line.
- Code introduced or touched by this change (slug conflicts, title validation) SHALL throw these
  classes. Migrating the remaining string-coded throw sites is out of scope; existing controller
  `message === 'X'` mappings SHALL keep working unchanged.

#### Scenario: ConflictError maps to 409 with its code

- **WHEN** a service throws `new ConflictError('SLUG_CONFLICT', 'Could not allocate a unique recipe slug')`
- **THEN** the response status is `409`, `error.code` is `SLUG_CONFLICT` and `error.message` is `Could not allocate a unique recipe slug`

#### Scenario: ValidationError carries details

- **WHEN** a service throws `new ValidationError('Title cannot be empty', [{ field: 'title', message: 'Title cannot be empty' }])`
- **THEN** the response status is `400`, `error.code` is `VALIDATION_ERROR` and `error.details[0].field` is `title`

### Requirement: String-coded domain errors that escape controllers map to client statuses

The API global error handler SHALL map legacy string-coded domain errors (thrown as `new Error('UPPER_SNAKE')`) that no controller handled to a client status instead of `500`, using these message conventions:

| `err.message` | Status | `error.code` | `error.message` |
|---|---|---|---|
| `FORBIDDEN` | 403 | `FORBIDDEN` | `Not authorized` |
| matches `/^[A-Z][A-Z0-9_]*_NOT_FOUND$/` | 404 | `NOT_FOUND` | humanized subject + ` not found` (e.g. `COFFEE_VARIETY_NOT_FOUND` → `Coffee variety not found`) |
| matches `/^ALREADY_[A-Z0-9_]+$/` or `/^[A-Z0-9_]+_ALREADY_EXISTS$/` | 409 | `CONFLICT` | `A record with this value already exists` |
| starts with `VALIDATION_ERROR` | 400 | `VALIDATION_ERROR` | text after the first `:` trimmed, or `Validation failed` |

- The existing `COFFEE_VARIETY_NOT_FOUND` branch SHALL be subsumed by this mapping with an
  identical response.
- Each such mapping SHALL be logged at `warn` as
  `log.warn({ requestId, domainCode, method, path }, 'Unmapped domain error reached global handler')`
  so remaining controller gaps stay visible, and SHALL NOT produce the `Unhandled error` line.
- Any other message SHALL fall through to the `500` branch unchanged.

#### Scenario: Title that sanitizes to empty returns 400

- **WHEN** `POST /api/v1/recipes` is called with `title: '<b></b>'` (passes `z.string().min(1)`, sanitizes to `''`)
- **THEN** the response status is `400`, `error.code` is `VALIDATION_ERROR` and `error.message` is `Title cannot be empty` (today it is `500`)

#### Scenario: Unhandled not-found code returns 404

- **WHEN** a service throws `new Error('RECIPE_NOT_FOUND')` on a route whose controller does not map it
- **THEN** the response status is `404`, `error.code` is `NOT_FOUND` and `error.message` is `Recipe not found`

#### Scenario: Coffee variety not-found response is unchanged

- **WHEN** a service throws `new Error('COFFEE_VARIETY_NOT_FOUND')`
- **THEN** the response is `404` with `error.code === 'NOT_FOUND'` and `error.message === 'Coffee variety not found'`, exactly as before

#### Scenario: Arbitrary errors still return 500

- **WHEN** a handler throws `new Error('boom')`
- **THEN** the response status is `500` and `error.code` is `INTERNAL_ERROR`

### Requirement: Database error logs never contain query parameters or row values

The API SHALL NOT write `DrizzleQueryError` parameters, its parameter-bearing `message`, or `PostgresError` `detail` text to logs, because those values contain user data (emails, usernames, bcrypt password hashes) that the AGENTS.md logging rules forbid.

- Mapped database errors (`4xx`) SHALL be logged at `warn` with only
  `{ requestId, pgCode, constraint, table, method, path }`.
- Unmapped database errors (`500`) SHALL be logged at `error` with a sanitized error object built by
  a helper in `apps/api/src/utils/errors.ts` (`toLoggableError(err)`) that keeps the error name,
  the SQL text without parameters, the SQLSTATE, the constraint name and the stack, and drops
  `params`, `parameters` and `detail`.
- In non-production environments the `500` response message SHALL NOT echo a `DrizzleQueryError`
  message (it embeds parameters); it SHALL use `Database error` instead.

#### Scenario: Re-registration conflict does not log the password hash

- **WHEN** a user registration insert fails with `23505` on `user_email_unique`
- **THEN** no log line produced for the request contains the submitted email, the username or a bcrypt hash (`$2a$`/`$2b$` prefix)

#### Scenario: Development 500 does not echo parameters

- **WHEN** `APP_ENV=development` and an unmapped `DrizzleQueryError` reaches the handler
- **THEN** the response `error.message` is `Database error` and does not contain the `params:` text

### Requirement: Unique-violation detection uses one shared helper

The API SHALL detect unique violations through `isUniqueViolation(err: unknown, constraint?: string): boolean` exported from `apps/api/src/utils/errors.ts` (built on `getPostgresError`), and SHALL remove every ad-hoc unwrapping or message-substring check.

- `apps/api/src/modules/admin/model.ts` `throwIfUniqueViolation` SHALL use the helper instead of
  reading `err.cause` by hand, keeping its `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS` output
  for both the exact and the `_lower_unique` constraints.
- `apps/api/src/modules/collection/service.ts` `addRecipeToCollection` SHALL use
  `isUniqueViolation(err, 'collection_item_collection_id_recipe_id_unique')` instead of searching
  `message`/`cause.message` for `unique` or `duplicate`, keeping its `ALREADY_IN_COLLECTION` output.
- Recipe slug allocation SHALL NOT catch unique violations: it claims slugs with
  `insert … on conflict ("slug") do nothing returning` inside the creation transaction (see the
  `recipe-slug` capability). A `recipe_slug_unique` violation that still reaches the global handler
  maps to `409 CONFLICT` like any other unique violation.
- `apps/api/src/modules/auth` registration SHALL translate a `23505` on `user_email_unique` /
  `user_email_lower_unique` / `user_username_unique` / `user_username_lower_unique` from the user
  insert into the existing `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS` errors (already mapped
  to `409` by the auth controller). The availability pre-checks cover soft-deleted rows (see
  `unique-identifiers`), so this mapping is the race fallback.
- `grep -rn "includes('unique')\|includes('duplicate')\|\.cause" apps/api/src/modules` SHALL return
  no unique-violation detection code after the change.

#### Scenario: Duplicate collection add is detected structurally

- **WHEN** `addRecipeToCollection` hits `23505` on `collection_item_collection_id_recipe_id_unique` (wrapped in `DrizzleQueryError`)
- **THEN** it throws `ALREADY_IN_COLLECTION` and the route returns `409` with `error.code === 'CONFLICT'`

#### Scenario: Unrelated unique violation is not misreported

- **WHEN** `addRecipeToCollection` fails with a unique violation on a different constraint
- **THEN** it does not throw `ALREADY_IN_COLLECTION`; the error propagates to the global handler (which returns `409 CONFLICT`)

### Requirement: Known race and conflict paths never return 500

The API SHALL answer the audit's reproducible conflict paths with the correct client status and SHALL NOT log them as `Unhandled error`.

| Path | Reproduction | Required result |
|---|---|---|
| Double follow | two concurrent `POST /api/v1/follow/:userId` from one user; both pass `isFollowing`, second insert hits `user_follow_follower_id_following_id_unique` | one `200`/`201`, the other `409` `CONFLICT` |
| Concurrent first rating | two concurrent `POST /api/v1/recipes/:id/rate` from one user with no prior rating | both succeed; exactly one `user_recipe_rating` row holds the last-written value |
| Re-register after deletion | register with the email (any letter case) of a soft-deleted account; the availability pre-check covers soft-deleted rows and the `user_email_unique`/`user_email_lower_unique` mapping is the race fallback | `409` `CONFLICT` `Email already registered` |
| Register race | two concurrent registrations with the same username | one `201`, the other `409` `CONFLICT` `Username already taken` |
| Concurrent version bump | two concurrent `PATCH /api/v1/recipes/:id` with `bumpVersion` computing the same next version number | one success, the other `409` `CONFLICT` |
| Malformed JSON | any JSON route with an unparsable body | `400` `BAD_REQUEST` |
| Duplicate title / second fork | see the `recipe-slug` capability | `201` |

`upsertUserRating` in `apps/api/src/modules/recipe/model.ts` SHALL become a single
`insert … onConflictDoUpdate({ target: [userRecipeRatings.userId, userRecipeRatings.recipeId], set: { rating, updatedAt } })`
statement instead of select-then-insert-or-update.

#### Scenario: Concurrent first rating does not 500

- **WHEN** the same user sends two `POST /api/v1/recipes/:id/rate` requests concurrently with ratings 3 and 4 and no prior rating exists
- **THEN** both responses are `2xx` and exactly one rating row exists with value 3 or 4

#### Scenario: Re-registration with a deleted account's email returns 409

- **WHEN** account A is soft-deleted with its email still stored and a new registration uses A's email
- **THEN** the response is `409` with `error.code === 'CONFLICT'` and `error.message === 'Email already registered'` (today it is `500`)

#### Scenario: Racing follow returns 409

- **WHEN** the follow insert raises `23505` after the `isFollowing` pre-check passed
- **THEN** the response is `409` with `error.code === 'CONFLICT'`

### Requirement: Error handler tests use realistic error shapes

The API test suite SHALL replace the tautological checks in `apps/api/src/middleware/errorHandler.test.ts` (which assert on objects the test itself builds) with tests that call `errorHandler` with realistic errors and exercise the full Hono pipeline.

- Unit tests SHALL construct a real `DrizzleQueryError` (imported from `drizzle-orm` in the test
  file only) whose `cause` is a `PostgresError`-shaped object, for codes `23505`, `23503` (insert and
  delete), `23514`, `22P02` and an unknown code, plus a bare `PostgresError`, an `HTTPException`, an
  `AppError` of each subclass, each legacy string convention, and an arbitrary `Error`.
- Each unit test SHALL assert status, `error.code`, `error.message`, `requestId` and, for database
  errors, that the body and the captured log calls contain no parameter values.
- A route-level test SHALL mount the real app (`createTestApp` / `app.request`) and send a malformed
  JSON body, asserting `400 BAD_REQUEST`.
- A DB-backed test against `brewform_test` SHALL trigger a real unique violation through a model
  insert (e.g. inserting the same `user_follow` pair twice via the model, or adding the same recipe to
  a collection twice by calling `model.addItem` directly) and assert the HTTP response is `409`.

#### Scenario: Old wrapped-error blind spot is covered

- **WHEN** the new `DrizzleQueryError` 23505 unit test is run against the pre-change `errorHandler.ts`
- **THEN** it fails (status `500`), proving the regression test exercises the bug

#### Scenario: Suite passes after the fix

- **WHEN** `make test-api` runs after the change
- **THEN** all error-handler unit, route and DB-backed tests pass

### Requirement: OpenAPI documents newly reachable error statuses

Routes whose reachable error statuses change in this change SHALL document them in `describeRoute` with `resolver(ErrorEnvelopeSchema)`, keeping `zValidator` as the request validator and without changing success response shapes.

- `POST /api/v1/recipes`, `PATCH /api/v1/recipes/:id`, `POST /api/v1/recipes/:id/fork` and
  `POST /api/v1/recipes/merge` SHALL document `400` (validation, including a title that sanitizes
  to empty) and `409` (`SLUG_CONFLICT` on create/fork/merge; version conflict on update).
- `POST /api/v1/auth/register` SHALL document `409` for email/username conflicts if not already
  documented.

#### Scenario: Coverage test passes with the new responses

- **WHEN** `apps/api/src/routes/openapi.coverage.test.ts` runs after the change
- **THEN** it passes and the generated spec at `/api/v1/openapi.json` lists `409` for `POST /api/v1/recipes`
