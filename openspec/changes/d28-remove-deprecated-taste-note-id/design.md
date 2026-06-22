## Context

The recipe domain in `apps/api/src/modules/recipe/` follows the project's
standard 3-layer pattern: `model.ts` (data access) → `service.ts` (business
logic) → `index.ts` (HTTP controller). The deprecated singular `tasteNoteId`
parameter is declared on the public `RecipeFilterSchema` at
`packages/shared/src/schemas/recipe.ts:134-135` and is honoured inside the
`buildRecipeFilters` helper in `apps/api/src/modules/recipe/model.ts:167-176`
via an `else if (filters.tasteNoteId)` branch that takes effect only when the
plural `tasteNoteIds` is absent.

D12 (recipe-filter-logic, merged and archived at
`openspec/changes/archive/2026-06-06-d12-recipe-filter-logic/`) extracted
`buildRecipeFilters` into `model.ts:83-179` and brought the `else if` branch
to `findStarred` (via the shared helper), closing the parity gap. D12
explicitly deferred the deprecation cycle itself. D28 is that deprecation
cycle, **Phase 1 only** — emit the signal, do not remove the field. Phase 2
(field removal) becomes a separate plan once production telemetry from D28
confirms no significant callers remain.

The frontend never sends the singular form. Audit of
`apps/web/src/components/recipe-list/useRecipeFilters.ts`,
`RecipeListView.tsx`, `RecipeCreatePage.tsx`, `RecipeEditPage.tsx`,
`TasteNotesPage.tsx`, and `TastingNotesSection.tsx` confirms that only
`tasteNoteIds` is generated as a filter parameter. (The singular
`tasteNoteId` that appears in `TastingNotesSection.tsx` and
`radar-chart-data.ts` is a property on the `TasteNote` domain object, not a
filter query parameter.) Any usage of `tasteNoteId` as a filter parameter in
production therefore comes from third-party API consumers — and there is
currently no mechanism to count or attribute them.

### Codebase facts (verified against `main` on 2026-06-22)

- `packages/shared/src/schemas/recipe.ts:134-135` declares
  `tasteNoteId: z.uuid().optional()` with a one-line inline comment marking
  it deprecated; there is no `@deprecated` JSDoc tag and no `.meta()` call.
  The codebase uses **Zod v4.4.3** (per `deno.lock` and `package.json`),
  whose `.meta()` method stores metadata in the `globalRegistry` that
  `zod-openapi` v5.4.6 (pulled in by `hono-openapi@1.3.0`) reads during
  OpenAPI generation.
- `apps/api/src/modules/recipe/model.ts:67-77` defines the
  `RecipeFilterCriteria` interface. Line 73 already carries a JSDoc
  `@deprecated` tag on `tasteNoteId`. This is the data-access-layer type;
  the public Zod schema (`RecipeFilterSchema` in `packages/shared`) is the
  one D28 annotates.
- `apps/api/src/modules/recipe/model.ts:83-179` defines
  `buildRecipeFilters(filters: RecipeFilterCriteria): SQL[]`. The `else if
  (filters.tasteNoteId)` branch is at lines 167-176. This helper is called
  by `buildListRecipesWhere` (model.ts:206-217, called by
  `service.listRecipes` at service.ts:504) and by `findStarred`
  (model.ts:870). Both listing endpoints honour the singular parameter
  identically.
- `apps/api/src/modules/recipe/service.ts:492-568` is `listRecipes`. It
  has **no explicit return type annotation** and returns a **union** of two
  shapes: `{ recipes, total }` (offset mode, from `model.findMany`) and
  `{ recipes, hasMore, nextCursor, total? }` (cursor mode, from
  `model.findCursor`). The function receives `_requestingUserId` (passed
  through from the controller) but **no `requestId`** — the service has no
  access to the Hono context.
- `apps/api/src/modules/recipe/service.ts:583-596` is
  `listStarredRecipes`, a thin wrapper around `model.findStarred` that
  returns `{ recipes, total }` verbatim. No `deprecations` field is
  propagated today.
- `apps/api/src/modules/recipe/index.ts:73-107` is the `/recipes`
  controller handler. It has a **two-branch return**: `cursorPaginated(...)`
  for cursor mode (line 87) and `paginated(...)` for offset mode (line 94).
  The `describeRoute` metadata is at lines 37-70; its `parameters` array
  (lines 42-49) lists only `page`, `perPage`, `sortBy`, `sortOrder`,
  `cursor`, `includeTotal` — it does **not** document `tasteNoteId` or
  `tasteNoteIds` as query parameters.
- `apps/api/src/modules/recipe/index.ts:124-134` is the `/starred`
  controller handler. Its `describeRoute` (lines 112-121) is thinner — it
  has `security` and `401` but no `parameters` array and no typed `200`
  response schema.
- `apps/api/src/utils/response/index.ts:31-40` defines `paginated<T>()`.
  `cursorPaginated<T>()` is at lines 52-61. Neither accepts a `headers`
  argument today; both hardcode status 200 and emit
  `{ success, data, meta }`.
- `docs/api.md:234` lists the row
  `| tasteNoteId | — | Single taste note UUID (deprecated, use tasteNoteIds) |`.
- `requestId` is set on the Hono context by `requestIdMiddleware`
  (`hono/request-id`, registered in `main.ts:24,42`) and is available as
  `c.get('requestId')` in controllers. It is declared in `AppVariables`
  (`types/hono.ts:13-18`).
- The controller file `index.ts` does **not** import `createLogger` and has
  no logger setup. The service layer (`service.ts:63`) has
  `createLogger('recipe-service')`; the model layer (`model.ts:46`) has
  `createLogger('recipe-model')`.
- The OpenAPI coverage test (`openapi.coverage.test.ts`) is purely
  spec-driven (it introspects `/api/v1/openapi.json`) and does not inspect
  response headers. `/api/v1/recipes` is NOT in its `IN_SCOPE_BASE_PATHS`
  list, so the P1 coverage check does not apply to the recipes router.
  Adding a `Deprecation` header to recipe responses will not affect this
  test.

### Stakeholders

- **API (`apps/api/`)** — primary, all code changes live here.
- **Shared package (`packages/shared/`)** — JSDoc tag + `.meta()` added to
  the schema; no shape change.
- **Docs (`docs/api.md`)** — one row updated.
- **Web app, DB package** — unaffected.
- **Product / Ops** — gains the telemetry needed to plan Phase 2.

## Goals / Non-Goals

**Goals:**

- Emit an RFC 8594 `Deprecation: true` response header on every response
  whose request used the singular `tasteNoteId` without the plural form —
  on **both** offset-paginated and cursor-paginated responses.
- Emit a structured `warn` log line in the same conditions, with traceable
  IDs only (no payload, no PII).
- Surface the deprecation in generated types / OpenAPI via a JSDoc
  `@deprecated` tag and Zod `.meta({ deprecated: true })` on the schema field.
- Document the deprecation status (and link to the OpenSpec change folder)
  in `docs/api.md`.
- Update `describeRoute` metadata on both routes to declare the
  `tasteNoteId` parameter (with `deprecated: true`) and the `Deprecation`
  response header — per AGENTS.md's mandatory OpenAPI rule.
- Cover the four deprecation cases with focused unit tests for both
  endpoints; add a controller-level test asserting the `Deprecation: true`
  HTTP header (both offset and cursor modes).
- Pass `make check-api`, `make lint`, and `make test-api` with zero
  regressions.

**Non-Goals:**

- **Field removal.** Phase 2 / D29+ removes `tasteNoteId` from the schema,
  the `buildRecipeFilters` branch, the docs, and any remaining consumers.
  D28 does not touch any of that.
- **`Sunset` header.** Phase 1 emits `Deprecation: true` only. Setting a
  `Sunset` date implies a removal commitment that belongs to Phase 2.
- **Other deprecations.** D28 only addresses `tasteNoteId`. Future
  deprecated fields get their own plans, even if they reuse the helper
  extension.
- **Filter semantics.** No SQL changes. The existing `else if` precedence
  (plural wins) in `buildRecipeFilters` is preserved exactly.
- **`findStarred` filter type cleanup.** The inline anonymous filter type
  at `model.ts:855-866` is a pre-existing drift from `RecipeFilterCriteria`.
  D28 may optionally replace it but this is not required for the
  deprecation signal.
- **Explicit `ListRecipesResult` interface.** The current `listRecipes`
  has no explicit return type annotation (it returns a union). D28 adds
  the `deprecations` field via spread; introducing a formal interface is
  out of scope.
- **Third-party client outreach.** Notifying API consumers is an
  operations concern downstream of the telemetry D28 produces.

## Decisions

### Decision 1: Detect the deprecated parameter in the service layer, not in `buildRecipeFilters` and not in the controller

**Rationale.** D12 moved the `else if (filters.tasteNoteId)` branch into
`buildRecipeFilters` (`model.ts:167-176`). That function is a pure
data-access helper that returns `SQL[]` — `model.ts:2-4` explicitly
documents it as _"Pure Drizzle ORM operations — no business logic, no side
effects."_ Adding a `warn` log there would violate the layering.

The controller is the other candidate, but D28's original Decision 1
rejected controller-side detection because it duplicates the precedence
check. With D12's extraction, the precedence check is now trivially
expressible as a single boolean (`!filters.tasteNoteIds &&
filters.tasteNoteId`) at the service call site — the `else if` SQL logic is
fully encapsulated in `buildRecipeFilters`, so the service is not
duplicating filter logic, only checking which input shape was provided.

The service layer is the right home: it has the `logger` already
instantiated (`createLogger('recipe-service')` at `service.ts:63`), it is
the layer the controller calls, and it returns the result the controller
consumes. The carrier is an optional `deprecations?: { tasteNoteId?:
boolean }` field on the return shape:

```ts
// Spread into both cursor and offset return paths:
return { ...result, ...(deprecations.tasteNoteId ? { deprecations } : {}) };
```

This is forward-compatible: future deprecation flags add new keys without
breaking existing readers (`result.deprecations?.someFutureFlag`).

**Alternatives considered.**

- Detect in `buildRecipeFilters` — rejected; it's a pure `SQL[]` helper
  with no logger and no side effects (by declaration at `model.ts:2-4`).
- Detect in the controller by inspecting `c.req.valid('query')` directly —
  rejected; would duplicate the precedence check in a second location and
  couples HTTP-layer input inspection to the deprecation decision.
- Throw a typed warning object from the service — rejected; mixes control
  flow with the success path.

### Decision 2: Emit the header in the controller, not in the service

**Rationale.** The service layer is HTTP-agnostic by convention (it returns
domain data and is reused by background jobs that have no `Context`). Setting
a response header from inside `listRecipes` would couple the service to Hono
and break the layering rule documented in AGENTS.md.

The controllers at `index.ts:73-107` ( `/recipes`) and `index.ts:124-134`
(`/starred`) already own the HTTP envelope (`paginated(c, …)` /
`cursorPaginated(c, …)`). Adding one conditional argument there keeps HTTP
concerns where they belong.

**Alternatives considered.**

- Use a Hono middleware that reads a context-scoped flag set by the service
  — rejected; introduces a second cross-layer carrier (the context flag) in
  addition to the return-shape flag, doubling the indirection.
- Set the header via `c.header()` in the service by injecting the context —
  rejected; same coupling problem.

### Decision 3: Both `paginated()` AND `cursorPaginated()` get the `{ headers }` argument

**Rationale.** The `/recipes` controller has a two-branch return
(`index.ts:86-99`): `cursorPaginated(...)` for cursor mode (line 87) and
`paginated(...)` for offset mode (line 94). If a client sends
`?tasteNoteId=<uuid>&cursor=<...>&sortBy=createdAt`, the response goes
through `cursorPaginated`. Extending only `paginated` would silently drop
the `Deprecation` header in cursor mode — violating the spec's unqualified
claim that the header is emitted. Both helpers must accept the optional
`{ headers }` argument.

The extension is purely additive — every existing
`paginated(c, data, pagination)` and `cursorPaginated(c, data, cursorMeta)`
call site works unchanged because the new fourth argument is optional.

### Decision 4: `requestId` is plumbed through as a new optional service parameter

**Rationale.** The service layer has no access to the Hono context. The
module-scoped `logger` (`createLogger('recipe-service')` at `service.ts:63`)
carries no per-request context. D28's log shape `{ filter, userId, requestId }`
requires `requestId`, which is available as `c.get('requestId')` in the
controller. The cleanest approach is to add an optional `requestId?: string`
parameter to both `listRecipes` and `listStarredRecipes`, passed from the
controller. The parameter is optional so existing callers (tests, etc.)
work unchanged.

**Alternatives considered.**

- Move detection + log to the controller — rejected (Decision 1).
- Use a child-logger pattern with per-request context — rejected; would
  require a larger refactor of the logger setup and is out of scope for D28.
- Omit `requestId` from the log — rejected; traceability is a core
  requirement per AGENTS.md.

### Decision 5: Header name is `Deprecation: true` (RFC 8594, no `Sunset`)

**Rationale.** [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594) defines the
`Deprecation` response header for exactly this purpose. The value can be
either the literal token `true` or an HTTP-date indicating when the resource
became deprecated. The literal `true` form is appropriate when the
deprecation date is not material to the caller — which is the case here, since
the schema-level deprecation has existed for as long as the plural form has.

The companion `Sunset` header (RFC 8594 §3) carries an HTTP-date indicating
when the deprecated input will stop working. D28 explicitly does **not** set
`Sunset` because Phase 1 makes no commitment about the removal date — that
commitment belongs to Phase 2 / D29+ once telemetry exists to inform it.

### Decision 6: Log level is `warn`, not `error`

**Rationale.** The request still succeeds end-to-end; the deprecated input
produces a correct response (the singular filter is applied). An `error`
level would mis-signal to alerting systems that something is broken. `warn`
is the level used elsewhere in the codebase for "recoverable, but worth
noticing" events (per AGENTS.md log-level guidance) and matches the semantics
of RFC 8594 §6.1 ("Deprecation does not by itself signal a problem with the
request or response"). The existing `logger.warn` in `service.ts:522` for
cursor/sort incompatibility is the precedent.

### Decision 7: Log shape is `{ filter, userId, requestId }` — IDs only, no payload

**Rationale.** AGENTS.md is explicit:
_"Never log passwords, tokens, secrets, API keys, or PII (emails, IPs)"_ and
_"Use `log.debug({ relevantIds }, 'message')` — include traceable IDs,
exclude payloads."_ The same rule applies at `warn` level. The chosen shape:

```ts
logger.warn(
  { filter: 'tasteNoteId', userId: _requestingUserId, requestId },
  'Deprecated query parameter used',
);
```

…carries exactly enough to count usage (`filter`), attribute to authenticated
callers when present (`userId`, which is `null` for anonymous requests on
`/recipes`), and correlate with the request trace (`requestId`). The actual
UUID value of the taste note is omitted because it is not needed to act on
the telemetry and could leak data about the caller's taste-note inventory.

### Decision 8: Controller checks `result.deprecations?.tasteNoteId === true`

**Rationale.** Strict-equality check against `true` keeps the controller
forward-compatible: a future flag with a non-boolean value (e.g., a Date or
an enum) would not accidentally trigger header emission via truthy coercion.
The optional-chained access (`?.`) means controllers that read a result
without the flag (e.g., during a test that stubs the service) see
`undefined`, not a thrown reference error.

```ts
const depHeaders = result.deprecations?.tasteNoteId === true
  ? { headers: { Deprecation: 'true' } }
  : undefined;

// Both branches use the same depHeaders:
if ('hasMore' in result) {
  return cursorPaginated(c, result.recipes, { ... }, depHeaders);
}
return paginated(c, result.recipes, { ... }, depHeaders);
```

### Decision 9: Schema annotation uses both JSDoc `@deprecated` AND Zod `.meta({ deprecated: true })`

**Rationale.** The codebase uses **Zod v4.4.3**, whose `.meta()` method stores
metadata in the `globalRegistry`. `zod-openapi` v5.4.6 (pulled in transitively
by `hono-openapi@1.3.0`) reads from this same `globalRegistry` during OpenAPI
generation. Adding `.meta({ deprecated: true })` makes the deprecation visible
in the generated OpenAPI spec's parameter/schema objects. The JSDoc
`@deprecated` tag provides TypeScript editor strikethrough for developers
consuming the schema directly. Both are needed because they serve different
toolchains:

| Mechanism | Visible to |
| --- | --- |
| JSDoc `@deprecated` | TypeScript language server (editor strikethrough) |
| `.meta({ deprecated: true })` | `zod-openapi` → `hono-openapi` → OpenAPI spec |

The `RecipeFilterCriteria` interface in `model.ts:73` already has a JSDoc
`@deprecated` tag — D28 brings the public Zod schema to the same level and
adds the `.meta()` for OpenAPI visibility.

Note: because the `/recipes` route's `describeRoute` `parameters` array is
the sole source of documented query parameters ( `zValidator` does not
auto-generate OpenAPI parameters — see Codebase facts), the `deprecated:
true` flag on the OpenAPI `ParameterObject` in the `parameters` array is
also needed for full OpenAPI visibility. The `.meta()` on the Zod schema is
belt-and-suspenders for any consumer that introspects the schema directly.

### Decision 10: OpenAPI `describeRoute` is updated (mandatory per AGENTS.md)

**Rationale.** AGENTS.md mandates: _"Every new route (or change to a route's
request/response shape) MUST include OpenAPI metadata."_ Adding a
`Deprecation` response header changes the response shape. Both routes'
`describeRoute` blocks must:

1. Add `tasteNoteId` (with `deprecated: true`) and `tasteNoteIds` to the
   `parameters` array — currently neither filter parameter is documented.
2. Declare the `Deprecation` response header on the `200` response via
   `headers: { Deprecation: { schema: { type: 'string' } } }`.

The OpenAPI coverage test (`openapi.coverage.test.ts`) is purely spec-driven
and does not inspect response headers, so this addition will not affect the
test. But the AGENTS.md convention requires it regardless.

### Decision 11: Test strategy — focused service tests + controller-level header test

**Rationale.** Four deprecation cases need coverage:

| Case | Expected behaviour |
| --- | --- |
| `tasteNoteId` set, `tasteNoteIds` not set | `deprecations.tasteNoteId === true`; header on response |
| `tasteNoteIds` set, `tasteNoteId` not set | `deprecations.tasteNoteId` is `undefined` or absent |
| Both set (plural wins per existing `else if`) | `deprecations.tasteNoteId` is `undefined` or absent |
| Neither set | `deprecations.tasteNoteId` is `undefined` or absent |

These are added to a new file
`apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`. Putting
them in a dedicated file (rather than extending `model.test.ts` from D12)
keeps the deprecation concern grouped for easy removal when Phase 2 lands —
deleting one file is cleaner than picking scenarios out of a shared file.

The service-level tests follow the existing mock pattern from
`service.preservation.test.ts` (hand-rolled Drizzle-like stubs, mock
`model.findMany` / `model.findStarred`). The controller-level test uses
Hono's `app.request(...)` pattern (no `hono/testing` import — the codebase
uses the built-in instance method) to assert the `Deprecation: true` header
is present on `GET /api/v1/recipes?tasteNoteId=<uuid>` and absent on
`GET /api/v1/recipes?tasteNoteIds=<uuid>`. A cursor-mode test asserts the
header is also present when `cursor` is used with the singular parameter.

The response-helper test (`response.test.ts`) is extended to assert that
`paginated(c, data, meta, { headers: { Deprecation: 'true' } })` and
`cursorPaginated(c, data, meta, { headers: { Deprecation: 'true' } })`
correctly set the header via `c.header()`.

### Decision 12: Data-flow diagram

```text
+---------------------------+
| GET /api/v1/recipes       |
| ?tasteNoteId=<uuid>       |
| [&cursor=...&sortBy=      |
|  createdAt]              |
+-------------+-------------+
              |
              v
+---------------------------+        +---------------------------+
| index.ts:73-107           |        | index.ts:124-134          |
| (/recipes controller)    |        | (/starred controller)     |
|                           |        |                           |
| requestId = c.get(        |        | requestId = c.get(        |
|   'requestId')            |        |   'requestId')            |
+-------------+-------------+        +-------------+-------------+
              |                                    |
              v                                    v
+---------------------------+        +---------------------------+
| service.ts:listRecipes    |        | service.ts:               |
| (lines 492-568)           |        |  listStarredRecipes       |
|                           |        |  (lines 583-596)          |
| if (!tasteNoteIds &&      |        |                           |
|     tasteNoteId) {        |        | if (!tasteNoteIds &&      |
|   deprecations            |        |     tasteNoteId) {        |
|     .tasteNoteId = true  |        |   deprecations            |
|   logger.warn(            |        |     .tasteNoteId = true  |
|     {filter,userId,       |        |   logger.warn(            |
|      requestId},          |        |     {filter,userId,       |
|     'Deprecated...')      |        |      requestId},          |
| }                         |        |     'Deprecated...')      |
|                           |        | }                         |
| returns { ...result,      |        | returns { ...result,      |
|   ...(dep.tasteNoteId ?   |        |   ...(dep.tasteNoteId ?   |
|     {deprecations}:{}) }  |        |     {deprecations}:{}) }  |
+-------------+-------------+        +-------------+-------------+
              |                                    |
              | { recipes, total,                   | { recipes, total,
              |   deprecations? }                   |   deprecations? }
              |   OR                                |
              | { recipes, hasMore,                 |
              |   nextCursor, total?,                |
              |   deprecations? }                   |
              v                                    v
+----------------------------------------------------+
| controller checks                                  |
|   result.deprecations?.tasteNoteId === true        |
| -> depHeaders = { headers: { Deprecation: 'true' } |
|                                                    |
| /recipes: passes depHeaders to BOTH                |
|   cursorPaginated(c, ..., depHeaders)              |
|   paginated(c, ..., depHeaders)                    |
|                                                    |
| /starred: passes depHeaders to                    |
|   paginated(c, ..., depHeaders)                   |
+-------------+--------------------------------------+
              |
              v
+---------------------------+
| HTTP response             |
|   200 OK                  |
|   Deprecation: true       |
|   { success, data, meta } |
+---------------------------+
```

The service layer never touches HTTP plumbing; the controller never
re-derives the precedence check. The `deprecations` discriminator is the
only contract between them. The `buildRecipeFilters` helper in `model.ts`
is untouched — it remains a pure `SQL[]`-returning function.

## Risks / Trade-offs

- **Log volume.** A misbehaving client polling with the singular parameter
  could produce noisy `warn` lines. Mitigation: high volume is itself the
  signal that prompts Phase 2; if it becomes operationally painful before
  then, the line can be rate-limited or downgraded to `info` without
  touching the header behaviour.
- **Spec-extension drift.** Adding `deprecations` to the return shape sets a
  precedent that future deprecations will follow the same pattern. This is
  intentional — codifying the pattern now means Phase 2 / future deprecation
  plans can lean on it — but it should be revisited if a deprecation arises
  that does not fit a per-response flag (e.g., a deprecated endpoint, where
  the signal applies before any service call).
- **Phase 2 timing is open-ended.** D28 produces telemetry but does not
  commit to a removal date. This is the right call (no `Sunset` until we
  know), but it means the deprecation could remain in Phase 1 indefinitely
  if telemetry shows no callers — which is fine, the header is a no-op for
  conforming clients.
- **Two response helpers extended.** Extending both `paginated` and
  `cursorPaginated` doubles the surface area of the response-helper change.
  Mitigation: the extension is identical for both (a 3-line loop) and is
  purely additive.

## Migration Plan

This is a pure backend additive change — no data migration, no feature flag,
no deploy sequencing.

1. **Extend `paginated()` and `cursorPaginated()`** in
   `apps/api/src/utils/response/index.ts` with the optional `{ headers }`
   argument. `make check-api` must pass.
2. **Add the `deprecations` detection + `warn` log** to
   `service.listRecipes` and `service.listStarredRecipes`, including the
   new `requestId?: string` parameter. `make check-api` and `make test-api`
   must pass.
3. **Update both controllers** in `apps/api/src/modules/recipe/index.ts` to
   pass `requestId`, check the flag, and pass headers to both
   `cursorPaginated` and `paginated` ( `/recipes`) or `paginated` only
   (`/starred`). `make check-api` must pass.
4. **Update `describeRoute` metadata** on both routes to add
   `tasteNoteId`/`tasteNoteIds` parameters and the `Deprecation` response
   header declaration.
5. **Annotate the schema** in `packages/shared/src/schemas/recipe.ts` with
   JSDoc `@deprecated` + `.meta({ deprecated: true })` and **update
   `docs/api.md`**.
6. **Add the deprecation test file** and extend the response-helper test.
7. **Final verification** — `make check-api`, `make lint`, `make test-api`.

### Rollback

A single `git revert` of the merge commit removes the header, the log line,
the return-shape flag, the controller diff, the `describeRoute` updates, the
JSDoc tag, the `.meta()` call, and the docs note atomically. No database
state to undo.

## Open Questions

- **None blocking.** Whether to set a `Sunset` date is a Phase 2 decision and
  is intentionally deferred. Whether to optionally replace the inline
  anonymous filter type in `findStarred` with `RecipeFilterCriteria` is left
  to the implementer's discretion.