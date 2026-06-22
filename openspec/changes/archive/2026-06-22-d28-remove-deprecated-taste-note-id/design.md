## Context

The recipe domain in `apps/api/src/modules/recipe/` follows the project's
standard 3-layer pattern: `model.ts` (data access) → `service.ts` (business
logic) → `index.ts` (HTTP controller). The deprecated singular `tasteNoteId`
parameter is declared on the public `RecipeFilterSchema` at
`packages/shared/src/schemas/recipe.ts:134-135` and is honoured inside the
service / model filter blocks via an `else if (filters.tasteNoteId)` branch
that takes effect only when the plural `tasteNoteIds` is absent.

D12 (separate change, in progress) extracts the shared filter-building logic
into `buildRecipeFilters` and brings the missing `else if` branch over to
`findStarred`, closing the parity gap. D12 explicitly defers the deprecation
cycle itself (see `openspec/changes/d12-recipe-filter-logic/design.md:90`).
D28 is that deprecation cycle, **Phase 1 only** — emit the signal, do not
remove the field. Phase 2 (field removal) becomes a separate plan once
production telemetry from D28 confirms no significant callers remain.

The frontend never sends the singular form. Audit of
`apps/web/src/components/recipe-list/useRecipeFilters.ts`,
`RecipeListView.tsx`, `RecipeCreatePage.tsx`, `RecipeEditPage.tsx`,
`TasteNotesPage.tsx`, and `TastingNotesSection.tsx` confirms that only
`tasteNoteIds` is generated. Any usage of `tasteNoteId` in production
therefore comes from third-party API consumers — and there is currently no
mechanism to count or attribute them.

### Codebase facts (verified)

- `packages/shared/src/schemas/recipe.ts:134-135` declares
  `tasteNoteId: z.uuid().optional()` with a one-line comment marking it
  deprecated; there is no `@deprecated` JSDoc tag.
- `apps/api/src/modules/recipe/service.ts:544-551` contains the existing
  `else if (filters.tasteNoteId)` branch in `listRecipes` that applies the
  legacy single-id filter.
- `apps/api/src/modules/recipe/index.ts:42-55` is the `/recipes` controller;
  `index.ts:72-82` is the `/recipes/starred` controller. Both currently call
  `paginated(c, result.recipes, { page, perPage, total, totalPages })`.
- `apps/api/src/utils/response/index.ts:30-40` defines `paginated<T>()`. It
  accepts no options object today; all responses are 200 with a
  `{ success, data, meta }` envelope.
- `docs/api.md:234` lists the row
  `| tasteNoteId | — | Single taste note UUID (deprecated, use tasteNoteIds) |`.

### Stakeholders

- **API (`apps/api/`)** — primary, all code changes live here.
- **Shared package (`packages/shared/`)** — one JSDoc tag added to the
  schema; no shape change.
- **Docs (`docs/api.md`)** — one row updated.
- **Web app, DB package** — unaffected.
- **Product / Ops** — gains the telemetry needed to plan Phase 2.

## Goals / Non-Goals

**Goals:**

- Emit an RFC 8594 `Deprecation: true` response header on every response
  whose request used the singular `tasteNoteId` without the plural form.
- Emit a structured `warn` log line in the same conditions, with traceable
  IDs only (no payload, no PII).
- Surface the deprecation in generated types / OpenAPI via a JSDoc
  `@deprecated` tag on the schema field.
- Document the deprecation status (and link to the OpenSpec change folder)
  in `docs/api.md`.
- Cover the four deprecation cases with focused unit tests; optionally add a
  controller-level header assertion.
- Pass `make check-api`, `make lint`, and `make test-api` with zero
  regressions.

**Non-Goals:**

- **Field removal.** Phase 2 / D29+ removes `tasteNoteId` from the schema,
  the service / model branches, the docs, and any remaining consumers. D28
  does not touch any of that.
- **`Sunset` header.** Phase 1 emits `Deprecation: true` only. Setting a
  `Sunset` date implies a removal commitment that belongs to Phase 2.
- **Other deprecations.** D28 only addresses `tasteNoteId`. Future deprecated
  fields get their own plans, even if they reuse the helper extension.
- **Filter semantics.** No SQL changes. The existing `else if` precedence
  (plural wins) is preserved exactly.
- **Third-party client outreach.** Notifying API consumers is an operations
  concern downstream of the telemetry D28 produces.

## Decisions

### Decision 1: Detect the deprecated parameter in the service / model, not the controller

**Rationale.** The decision _"this request used a deprecated input"_ is the
same logical decision the filter branch already makes (`else if
(filters.tasteNoteId)`). Surfacing it from the service / model means there is
a single source of truth: if the filter applies, the flag is set. Detecting
in the controller would require duplicating the precedence check (plural
wins) in a second place, which is exactly the kind of drift D12 was created
to eliminate.

The carrier is an optional `deprecations?: { tasteNoteId?: boolean }` field
on the return shape:

```ts
export interface ListRecipesResult {
  recipes: Recipe[];
  total: number;
  deprecations?: {
    tasteNoteId?: boolean;
  };
}
```

This is forward-compatible: future deprecation flags add new keys without
breaking existing readers (`result.deprecations?.someFutureFlag`).

**Alternatives considered.**

- Detect in the controller by inspecting `c.req.valid('query')` directly —
  rejected; duplicates the `if (filters.tasteNoteIds) … else if (filters.tasteNoteId)`
  precedence in a second location.
- Throw a typed warning object from the service — rejected; mixes control
  flow with the success path.

### Decision 2: Emit the header in the controller, not in the service

**Rationale.** The service layer is HTTP-agnostic by convention (it returns
domain data and is reused by background jobs that have no `Context`). Setting
a response header from inside `listRecipes` would couple the service to Hono
and break the layering rule documented in AGENTS.md (_"Services import from
model files, never from `drizzle-orm` directly"_ — the spirit being that each
layer touches only its own neighbours).

The controllers at `apps/api/src/modules/recipe/index.ts:42-55` and
`index.ts:72-82` already own the HTTP envelope (`paginated(c, …)`). Adding
one conditional argument there keeps HTTP concerns where they belong.

**Alternatives considered.**

- Use a Hono middleware that reads a context-scoped flag set by the service
  — rejected; introduces a second cross-layer carrier (the context flag) in
  addition to the return-shape flag, doubling the indirection.
- Set the header via `c.header()` in the service by injecting the context —
  rejected; same coupling problem.

### Decision 3: Header name is `Deprecation: true` (RFC 8594, no `Sunset`)

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

### Decision 4: Log level is `warn`, not `error`

**Rationale.** The request still succeeds end-to-end; the deprecated input
produces a correct response (the singular filter is applied). An `error`
level would mis-signal to alerting systems that something is broken. `warn`
is the level used elsewhere in the codebase for "recoverable, but worth
noticing" events (per AGENTS.md log-level guidance) and matches the semantics
of RFC 8594 §6.1 ("Deprecation does not by itself signal a problem with the
request or response").

### Decision 5: Log shape is `{ filter, userId, requestId }` — IDs only, no payload

**Rationale.** AGENTS.md is explicit:
_"Never log passwords, tokens, secrets, API keys, or PII (emails, IPs)"_ and
_"Use `log.debug({ relevantIds }, 'message')` — include traceable IDs,
exclude payloads."_ The same rule applies at `warn` level. The chosen shape:

```ts
log.warn(
  { filter: 'tasteNoteId', userId, requestId },
  'Deprecated query parameter used',
);
```

…carries exactly enough to count usage (`filter`), attribute to authenticated
callers when present (`userId`, which is `null` for anonymous requests on
`/recipes`), and correlate with the request trace (`requestId`). The actual
UUID value of the taste note is omitted because it is not needed to act on
the telemetry and could leak data about the caller's taste-note inventory.

### Decision 6: Controller checks `result.deprecations?.tasteNoteId === true`

**Rationale.** Strict-equality check against `true` keeps the controller
forward-compatible: a future flag with a non-boolean value (e.g., a Date or
an enum) would not accidentally trigger header emission via truthy coercion.
The optional-chained access (`?.`) means controllers that read a result
without the flag (e.g., during a test that stubs the service) see
`undefined`, not a thrown reference error.

```ts
return paginated(
  c,
  result.recipes,
  { page: filters.page, perPage: filters.perPage, total: result.total, totalPages: ... },
  result.deprecations?.tasteNoteId === true
    ? { headers: { Deprecation: 'true' } }
    : undefined,
);
```

### Decision 7: `paginated()` gains an optional `{ headers }` argument

**Rationale.** Two implementation options were considered for the controller
plumbing:

1. Call `c.header('Deprecation', 'true')` directly in the controller before
   `paginated(...)`. Hono accumulates `c.header()` calls and applies them
   to the next response, so this works.
2. Extend `paginated()` to accept `options?: { headers?: Record<string, string> }`
   and apply them internally.

Option 2 was chosen because it keeps the controller's contract _declarative_:
the controller passes everything that should affect the response (envelope,
pagination, headers) as arguments to one function. Option 1 would leave a
"set this header magically before the next response" sequencing requirement
that future readers might overlook when reordering code. The extension is
purely additive — every existing `paginated(c, data, pagination)` call site
works unchanged.

The implementation is one short loop:

```ts
if (options?.headers) {
  for (const [name, value] of Object.entries(options.headers)) {
    c.header(name, value);
  }
}
```

### Decision 8: Backward compatibility is unconditional

**Rationale.** The new header is additive at the wire level. Clients that do
not inspect response headers see no behavioural change. Clients that inspect
all response headers may begin to see `Deprecation: true` on responses they
were already getting; the field still filters correctly so no observable
behaviour changes. The `paginated()` extension is additive at the API level —
no existing call site needs to pass the new options object.

There is no migration step, no feature flag, and no rollout sequencing
beyond "land D12 first" (a hard dependency documented in the proposal).

### Decision 9: Test strategy — focused service tests + optional controller test

**Rationale.** Four deprecation cases need coverage:

| Case                                                  | Expected behaviour                                        |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `tasteNoteId` set, `tasteNoteIds` not set             | `deprecations.tasteNoteId === true`; header on response   |
| `tasteNoteIds` set, `tasteNoteId` not set             | `deprecations.tasteNoteId` is `undefined` or `false`      |
| Both set (plural wins per existing `else if`)         | `deprecations.tasteNoteId` is `undefined` or `false`      |
| Neither set                                           | `deprecations.tasteNoteId` is `undefined` or `false`      |

These are added to a new file
`apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`. Putting
them in a dedicated file (rather than extending `model.test.ts` from D12)
keeps the deprecation concern grouped for easy removal when Phase 2 lands —
deleting one file is cleaner than picking scenarios out of a shared file.

An optional Hono-test-client integration test asserts the
`Deprecation: true` header is present on
`GET /api/v1/recipes?tasteNoteId=<uuid>` and absent on
`GET /api/v1/recipes?tasteNoteIds=<uuid>`. This crosses the
service → controller boundary that the unit tests cover separately, but is
optional because the boundary is exercised manually via the controller diff
review.

### Decision 10: Data-flow diagram

```text
+---------------------------+
| GET /api/v1/recipes       |
| ?tasteNoteId=<uuid>       |
+-------------+-------------+
              |
              v
+---------------------------+        +---------------------------+
| index.ts:42-55            |        | index.ts:72-82            |
| (recipes controller)      |        | (starred controller)      |
+-------------+-------------+        +-------------+-------------+
              |                                    |
              v                                    v
+---------------------------+        +---------------------------+
| service.ts:listRecipes    |        | model.ts:findStarred      |
|                           |        |  (after D12)              |
|   if (!tasteNoteIds       |        |   if (!tasteNoteIds       |
|        && tasteNoteId) {  |        |        && tasteNoteId) {  |
|     deprecations          |        |     deprecations          |
|       .tasteNoteId = true |        |       .tasteNoteId = true |
|     log.warn(...)         |        |     log.warn(...)         |
|   }                       |        |   }                       |
+-------------+-------------+        +-------------+-------------+
              |                                    |
              | { recipes, total,                  | { recipes, total,
              |   deprecations? }                  |   deprecations? }
              v                                    v
+----------------------------------------------------+
| controller checks                                  |
|   result.deprecations?.tasteNoteId === true        |
| -> calls paginated(c, data, meta, {                |
|      headers: { Deprecation: 'true' }              |
|    })                                              |
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

The service / model layer never touches HTTP plumbing; the controller never
re-derives the precedence check. The `deprecations` discriminator is the only
contract between them.

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

## Migration Plan

This is a pure backend additive change — no data migration, no feature flag,
no deploy sequencing beyond the D12 dependency.

1. **Rebase on D12** so that `findStarred` already honours the singular
   `tasteNoteId`. If D12 has not merged yet, sequence D28 to merge after.
2. **Extend `paginated()`** in `apps/api/src/utils/response/index.ts` with
   the optional `{ headers }` argument. `make check-api` must pass.
3. **Add the `deprecations` field** to the service / model return shapes,
   detect the deprecated parameter, emit the `warn` log. `make check-api`
   and `make test-api` must pass.
4. **Update both controllers** in `apps/api/src/modules/recipe/index.ts` to
   pass the optional `{ headers }` argument when the flag is set.
   `make check-api` must pass.
5. **Annotate the schema** in `packages/shared/src/schemas/recipe.ts` and
   **update `docs/api.md`**.
6. **Add the deprecation test file** and run
   `make test-specific filter=apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`.
7. **Final verification** — `make check-api`, `make lint`, `make test-api`.

### Rollback

A single `git revert` of the merge commit removes the header, the log line,
the return-shape flag, the controller diff, the JSDoc tag, and the docs note
atomically. No database state to undo.

## Open Questions

- **None blocking.** Whether to set a `Sunset` date is a Phase 2 decision and
  is intentionally deferred. Whether to add a controller-level integration
  test (over and above the service-level unit tests) is left to the
  implementer's discretion.
