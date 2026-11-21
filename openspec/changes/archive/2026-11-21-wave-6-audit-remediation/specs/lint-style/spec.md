## RENAMED Requirements

- FROM: `### Requirement: Production source has zero deno-lint-ignore-file directives`
- TO: `### Requirement: Source files carry no file-level or range lint suppressions`

- FROM: `### Requirement: no-explicit-any, require-await, and no-empty are enforced repo-wide`
- TO: `### Requirement: noExplicitAny, useAwait, and noEmptyBlockStatements are enforced as errors repo-wide`

## MODIFIED Requirements

### Requirement: Production code shall not contain `as any` casts that are unnecessary for the type system

Production TypeScript files under `apps/api/src/modules/` and `packages/shared/src/` SHALL NOT contain `as any` casts where TypeScript's own type inference — including rest-destructure typing on object literals and Drizzle-inferred row types — produces an equally or more specific type. An `as any` cast is permitted only when a downstream library or runtime API genuinely requires a wider type than the source value carries, and such a cast SHALL carry a line-level `// biome-ignore lint/suspicious/noExplicitAny: <justification>` comment.

#### Scenario: Password-hash stripping without `as any`
- **WHEN** a service function strips a sensitive field from a Drizzle-inferred user row using rest destructuring (e.g. `const { passwordHash: _passwordHash, ...safe } = user;`)
- **THEN** the file SHALL type-check under `tsc --noEmit` (`make check-api`) without any `as any` cast
- **AND** the resulting `safe` object SHALL be inferred as `Omit<UserSelect, 'passwordHash'>` (or equivalent)

#### Scenario: No file-level or inline `noExplicitAny` suppression in `apps/api/src/modules/user/service.ts`
- **WHEN** the file `apps/api/src/modules/user/service.ts` is linted
- **THEN** it SHALL contain zero `// biome-ignore lint/suspicious/noExplicitAny` comments
- **AND** zero file-level (`// biome-ignore-all`) or range (`// biome-ignore-start`) suppressions (the file is fully typed)

### Requirement: Source files carry no file-level or range lint suppressions
No source file under `apps/api/src/`, `apps/web/src/`, `packages/shared/src/` or `packages/db/src/` — production or test — SHALL carry a file-level or range lint suppression: Biome's `// biome-ignore-all …` and `// biome-ignore-start …` / `// biome-ignore-end …` forms are prohibited, as is any file-level directive left over from a previous toolchain.

Suppressions SHALL be line-level `// biome-ignore <category>/<group>/<rule>: <justification>` comments covering exactly one statement (see "Surviving line-level lint directives carry a justification comment"). The rule is enforced by `packages/shared/src/lint-policy.test.ts`, a Vitest meta-test that scans the four source roots and fails with `file:line` for every file-level or range suppression.

**Reason:** File-level and range suppressions disable a rule for every future edit to the covered code, not just the original offending line. Wave 5 removed every file-level directive (9 production files, ~40 test files); the Biome migration replaced the remaining line-level ones with `biome-ignore` comments, and today zero `biome-ignore-all`/`biome-ignore-start` comments exist. The meta-test keeps it that way.

#### Scenario: Grep gate passes
- **WHEN** `grep -rnE "biome-ignore-(all|start|end)" apps/api/src apps/web/src packages/shared/src packages/db/src` is run
- **THEN** zero matches are returned

#### Scenario: A new file-level suppression fails the tests
- **WHEN** a contributor adds `// biome-ignore-all lint/suspicious/noExplicitAny: legacy` to the top of any source or test file
- **THEN** `make test-shared` fails in `lint-policy.test.ts` and names the file and line

### Requirement: openapi/index.ts as-any cast narrowed to line-level with justification
`apps/api/src/utils/openapi/index.ts` SHALL NOT carry a file-level or range suppression; the single `as any` cast that wraps `z.toJSONSchema(...)` for the `hono-openapi` `requestBody` schema SHALL carry exactly one line-level `// biome-ignore lint/suspicious/noExplicitAny: <justification>` comment immediately above it, and the explanatory D34 P3 comment above that SHALL be preserved without a stale library version number.

```typescript
// hono-openapi's requestBody content schema type doesn't accept zod-openapi's JSON Schema output; cast required (D34 P3).
// biome-ignore lint/suspicious/noExplicitAny: hono-openapi requestBody schema type incompatible with zod-openapi output; cast required
schema: z.toJSONSchema(schema, { unrepresentable: 'any' }) as any,
```

If a future `hono-openapi` release types `requestBody` content so that the JSON Schema output is accepted without widening (re-verify against the installed version's docs when bumping it), the cast and its suppression SHALL be removed instead.

**Reason:** The `as any` cast is a genuine library-boundary cast — `zod-openapi`'s `ZodStandardJSONSchemaPayload<T>` is structurally incompatible with `hono-openapi`'s `OpenAPIV3_1.SchemaObject` (zod's `type` is `string | string[]`; OpenAPI's is a narrower string-union). D34 P3 documented it; D35 narrowed the original file-level directive to one line; the Biome migration converted it to the `biome-ignore` form. The comment previously named "hono-openapi v1.3.0" although `^1.5.0` is installed.

#### Scenario: No file-level suppression
- **WHEN** `apps/api/src/utils/openapi/index.ts` is inspected
- **THEN** it contains no `biome-ignore-all` or `biome-ignore-start` comment

#### Scenario: Line-level suppression covers exactly the cast
- **WHEN** the lines around the `as any` cast are inspected
- **THEN** the justification comment is followed by one `// biome-ignore lint/suspicious/noExplicitAny: …` line and then the cast — the suppression covers exactly one statement

### Requirement: Dead logger code in cors.ts and requestId.ts is deleted
`apps/api/src/middleware/cors.ts` and `apps/api/src/middleware/requestId.ts` SHALL NOT import `createLogger` or declare a module-level `const log = createLogger(...)` unless the module actually emits log calls, and SHALL carry no lint suppression for an unused variable or import.

**Reason:** Both loggers were never called; wave 5 deleted them rather than keeping a wasteful pino child logger behind a suppression. Biome's `correctness/noUnusedVariables` and `correctness/noUnusedImports` rules would flag a re-introduced unused logger. AGENTS.md's "create a module-scoped logger" convention applies to modules that log, not to every module.

#### Scenario: cors.ts has no logger import or const
- **WHEN** `apps/api/src/middleware/cors.ts` is inspected
- **THEN** no `createLogger` import, no `const log` declaration and no `biome-ignore` comment are present

#### Scenario: requestId.ts has no logger import or const
- **WHEN** `apps/api/src/middleware/requestId.ts` is inspected
- **THEN** no `createLogger` import, no `const log` declaration and no `biome-ignore` comment are present

#### Scenario: make lint passes
- **WHEN** `make lint` is run
- **THEN** it reports no unused-variable or unused-import diagnostic for either file

### Requirement: Surviving line-level lint directives carry a justification comment
Every lint suppression in any source file under `apps/` and `packages/` (production and test) SHALL be a line-level Biome comment of the form `// biome-ignore <category>/<group>/<rule>: <justification>` that names exactly one rule, carries a non-empty justification after the colon, and covers exactly one statement.

The justification SHALL NOT be Biome's `<explanation>` placeholder. In production files it SHALL state the concrete reason (library boundary, intentional pattern, measured exception); test files MAY use a short generic reason such as "test assertion cast". A separate explanatory comment line above the suppression is optional — Biome's colon suffix is the required justification. `packages/shared/src/lint-policy.test.ts` SHALL fail for a suppression without a rule path or without a justification.

**Reason:** Line-level suppressions are sometimes necessary at library boundaries or in test doubles, but each must be explicit about why. Wave 5 established the justification rule; the Biome migration moved the justification into the comment itself (today 265 suppressions, all with a rule path and a reason; 263 are `noExplicitAny` in tests, 2 are justified production suppressions).

#### Scenario: Every suppression names one rule and a reason
- **WHEN** `lint-policy.test.ts` scans `apps/*/src` and `packages/*/src`
- **THEN** every `biome-ignore` comment matches `biome-ignore (lint|assist|syntax)/<group>/<rule>: <non-empty text>`

#### Scenario: A bare suppression is rejected
- **WHEN** a contributor adds `// biome-ignore lint/suspicious/noExplicitAny: <explanation>` or a suppression with no rule path
- **THEN** `make test-shared` fails and names the file and line

#### Scenario: Compare/FocusMode ignores stay fixed or justified
- **WHEN** `RecipeComparePage.tsx` and `RecipeFocusModePage.tsx` are inspected
- **THEN** none contains a suppression without a rule path and justification

### Requirement: noExplicitAny, useAwait, and noEmptyBlockStatements are enforced as errors repo-wide
`biome.json` SHALL set `linter.rules.suspicious.noExplicitAny`, `linter.rules.suspicious.useAwait` and `linter.rules.suspicious.noEmptyBlockStatements` to `"error"` for every workspace, so a violation fails `pnpm run lint` — and therefore `make lint`, the pre-commit hook and CI — independently of how warning-level diagnostics are treated.

Biome's `noExplicitAny` is part of the `recommended` preset but defaults to warning severity, which never fails the CLI; `useAwait` and `noEmptyBlockStatements` are not in the preset at all. The Biome migration therefore silently dropped the wave-5 guarantees against silent `catch {}` blocks (the D17 failure class) and needless `async`. The re-enable is fix-first, flip-last: existing violations are fixed (empty catches surface the failure through `toast.error` or carry an explicit comment explaining why they are fire-and-forget; needless `async` is dropped or the promise awaited; `any` gets a typed fix or a justified line-level suppression), and the `biome.json` change is the final commit, proving zero remaining violations.

**Reason:** These three rules guard exactly the failure classes earlier waves existed to remove (D17 silent catches, D09/D35/D34 `any` hygiene). Explicit `"error"` severity keeps them blocking even if the repository later decides to tolerate other warnings.

#### Scenario: biome.json enables the three rules as errors
- **WHEN** `biome.json` is inspected
- **THEN** `linter.rules.suspicious` sets `noExplicitAny`, `useAwait` and `noEmptyBlockStatements` to `"error"`

#### Scenario: Lint is green with the rules active
- **WHEN** `make lint` runs after the flip
- **THEN** it exits 0 with no diagnostic from the three rules

#### Scenario: A new empty catch fails lint
- **WHEN** a contributor adds `try { await save(); } catch {}` to any source file
- **THEN** `make lint` exits non-zero with a `lint/suspicious/noEmptyBlockStatements` error

### Requirement: Test-file lint suppressions are line-level and justified
Test files (`*.test.ts`, `*.test.tsx`, `*.pbt.test.ts`, `*.exploration.test.ts`, `*.preservation.test.ts`) SHALL NOT carry file-level or range lint suppressions; every surviving suppression SHALL be a line-level `// biome-ignore lint/<group>/<rule>: <justification>` comment, and a typed fix (`Partial<T>`, `vi.mocked(...)`, `satisfies`, or `unknown` plus narrowing) SHALL be preferred wherever it is trivial.

**Reason:** File-level suppressions disable a rule for every future edit to the file. Line-level comments with a justification keep each suppression auditable and intentional; the same rule applies to production code.

#### Scenario: No file-level suppressions remain in tests
- **WHEN** `grep -rnE "biome-ignore-(all|start)" --include='*.test.ts' --include='*.test.tsx' apps packages` is run
- **THEN** zero matches are returned

#### Scenario: Surviving test suppressions are justified
- **WHEN** `lint-policy.test.ts` scans test files
- **THEN** every `biome-ignore` comment names one rule and carries a non-empty justification

### Requirement: Raw SQL is confined to an accepted-exception registry

Raw `` sql`...` `` tag usage in production code SHALL be confined to a documented
accepted-exception registry; any site outside the registry is a violation. The registry:

| Accepted exception | Where |
|---|---|
| Health probe `SELECT 1` | health route |
| Atomic ±1 counters | recipe/comment counter increments |
| Atomic not-featured toggle | `recipe/model.ts:830` — ONLY if the Drizzle `not()` rewrite is not clean; otherwise the site is converted and this row is not added |
| `count(distinct ...)` | where Drizzle lacks a helper |
| Correlated `EXISTS` | `equipment/model.ts` `getRecipesUsingEquipment` (`equipmentExists`, existing NOTE) |
| Schema `check()` constraint expressions | `packages/db/src/schema.ts` |
| Row-value keyset comparison | `recipe/model.ts` `buildCursorWhere` — `(created_at, id) < ($1, $2)` for composite index sargability; Drizzle has no native row-value operator |

The 5 stray sites outside the registry SHALL be converted to Drizzle helpers:
`coffee-variety/model.ts:46` `count(*)` → `count()`; `collection/model.ts:219` → `max()`;
`badge/model.ts:78` → `coalesce(max())` via helpers; `seed.ts:93/404/697` `is null` → `isNull()`.
`recipe/model.ts:830` is rewritten with `not()` if clean, else documented as the atomic-toggle
registry entry above. The verified-intact accepted exceptions are untouched.

**Reason:** D-series waves already established the registry concept informally; the 2026-07-19
sweep found 5 sites that drifted outside it. A written registry makes the next sweep a grep, not
an investigation.

#### Scenario: Every raw sql site is a registry entry

- **WHEN** production code is grepped for `` sql` `` after the conversion
- **THEN** every match corresponds to a registry row (health probe, counters/toggle,
  count(distinct), equipment EXISTS, schema check(), row-value keyset)

#### Scenario: Converted sites behave identically

- **WHEN** `make test-api` and `pnpm run test:db` (inside Docker via `make test`) run after the 5 conversions
- **THEN** all existing assertions over the affected queries (counts, max-sortOrder, badge
  thresholds, seed idempotency) pass unchanged
