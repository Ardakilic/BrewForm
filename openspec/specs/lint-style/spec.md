# Capability: lint-style

## Purpose

This spec defines linting conventions for the BrewForm API and shared packages to ensure style consistency and prevent unnecessary type escape hatches. It establishes that production TypeScript code under `apps/api/src/modules/` and `packages/shared/src/` shall not contain `as any` casts where TypeScript's own type inference (including rest-destructure typing on object literals and Drizzle-inferred row types) already produces an equivalent type, and that test files (`*.test.ts`) under `apps/api/src/` requiring `no-explicit-any` suppression shall use a single file-level `// deno-lint-ignore-file no-explicit-any require-await` directive on line 1 rather than scattered inline suppressions. Together these rules promote readable, type-safe code, keep lint suppressions auditable in one predictable location per file, and reduce noise from defensive casts that add no type information.
## Requirements
### Requirement: Production code shall not contain `as any` casts that are unnecessary for the type system

Production TypeScript files under `apps/api/src/modules/` and `packages/shared/src/` SHALL NOT contain `as any` casts where TypeScript's own type inference — including rest-destructure typing on object literals and Drizzle-inferred row types — produces an equally or more specific type. An `as any` cast is permitted only when a downstream library or runtime API genuinely requires a wider type than the source value carries.

#### Scenario: Password-hash stripping without `as any`
- **WHEN** a service function strips a sensitive field from a Drizzle-inferred user row using rest destructuring (e.g. `const { passwordHash: _passwordHash, ...safe } = user;`)
- **THEN** the file SHALL type-check under `deno check` without any `as any` cast
- **AND** the resulting `safe` object SHALL be inferred as `Omit<UserSelect, 'passwordHash'>` (or equivalent)

#### Scenario: No file-level or inline `deno-lint-ignore` for `no-explicit-any` in `apps/api/src/modules/user/service.ts`
- **WHEN** the file `apps/api/src/modules/user/service.ts` is linted
- **THEN** it SHALL contain zero `// deno-lint-ignore no-explicit-any` directives
- **AND** zero `// deno-lint-ignore-file` directives (the file is fully typed)

### Requirement: Test files shall use file-level `deno-lint-ignore-file` directives

Test files (`*.test.ts`) under `apps/api/src/` that need to suppress `no-explicit-any` SHALL use a single `// deno-lint-ignore-file no-explicit-any require-await` directive on line 1 of the file, followed by a blank line, followed by the file's content (imports, docblocks, test bodies). Inline `// deno-lint-ignore no-explicit-any` directives anywhere in the body of a test file are not permitted. When migrating from inline `// deno-lint-ignore no-explicit-any` directives to the file-level form, all inline `// deno-lint-ignore no-explicit-any` comments in the file body SHALL be removed.

#### Scenario: Inline suppression converted to file-level
- **WHEN** a test file is migrated from inline `// deno-lint-ignore no-explicit-any` directives to the file-level form
- **THEN** the file SHALL begin with `// deno-lint-ignore-file no-explicit-any require-await` on line 1
- **AND** all inline `// deno-lint-ignore no-explicit-any` comments within the file body SHALL be removed
- **AND** any `as any` casts in the file body SHALL be preserved (only the comment is removed, not the cast)
- **AND** the file SHALL continue to type-check under `deno check` and pass its tests under `deno test`

### Requirement: Production source has zero deno-lint-ignore-file directives

No file in production source across `packages/shared/src/` and `apps/api/src/` SHALL carry a
`// deno-lint-ignore-file` directive. Non-test files are in scope; test files (`*.test.ts`,
`*_test.ts`, `*.test.tsx`, `*.pbt.test.ts`, `*.exploration.test.ts`) are excluded from this
requirement — they SHALL continue to follow the `lint-style` spec's existing test-file directive
convention.

The following 9 production files SHALL have their `deno-lint-ignore-file` directives removed:

| File | Current directive | Fix |
|---|---|---|
| `packages/shared/src/schemas/compatibility.ts:1` | `// deno-lint-ignore-file no-explicit-any require-await` | Delete line 1 (vestigial — file has no `any`, no `async`; rules are in `deno.json` `rules.exclude`) |
| `packages/shared/src/schemas/report.ts:1` | `// deno-lint-ignore-file no-explicit-any require-await` | Delete line 1 (vestigial — same) |
| `packages/shared/src/logger/index.ts:1` | `// deno-lint-ignore-file no-explicit-any require-await` | Delete line 1 (vestigial — file is 3 lines, no `any`/`async`) |
| `packages/shared/src/logger/types.ts:1` | `// deno-lint-ignore-file no-explicit-any require-await` | Delete line 1 (vestigial — interface already uses `Record<string, unknown>`) |
| `apps/api/src/modules/coffee-variety/model.ts:1` | `// deno-lint-ignore-file require-await` | Delete line 1 (vestigial — all async functions use await; rule is excluded) |
| `apps/api/src/modules/coffee-variety/service.ts:1` | `// deno-lint-ignore-file require-await` | Delete line 1 (vestigial — same) |
| `apps/api/src/utils/openapi/index.ts:1` | `// deno-lint-ignore-file no-explicit-any` | Remove file-level directive; narrow to line-level (see next requirement) |

**Reason:** File-level `ignore-file` directives disable rules for all future edits to a file, not
just the original offending line. 6 of the 9 are vestigial — they suppress `no-explicit-any` and/or
`require-await`, both of which are in `deno.json`'s `rules.exclude` list (the rules are off, so the
directives mask nothing today). The remaining 1 (`openapi/index.ts`) is narrowed to a line-level
directive. The 2 middleware files are covered by the next requirement (dead code deletion). This
requirement tightens the `lint-style` spec, which was previously silent on production file-level
directives.

**Note on the 2 missed files:** The D35 plan listed 7 production files but the actual total is 9.
The 2 files omitted from D35's "July 2026 sweep" are `apps/api/src/modules/coffee-variety/model.ts`
and `apps/api/src/modules/coffee-variety/service.ts` (documented in D09's baseline,
`plans/D09-fix-lint-suppressions.md` lines 100-101). These 2 `coffee-variety` files are already
included in the table above (rows 5-6) and are 2 of the 9; without removing their
`// deno-lint-ignore-file require-await` directives, the acceptance criterion
"zero `deno-lint-ignore-file` in production source" cannot be satisfied. The remaining 2 of the 9
— `apps/api/src/middleware/cors.ts` and `apps/api/src/middleware/requestId.ts` — are not in this
table because they are covered by the next requirement (dead code deletion). The 7 files in the
table plus these 2 middleware files total the 9 production files in scope.

#### Scenario: grep gate passes

- **WHEN** `rg -n "deno-lint-ignore-file" packages/shared/src apps/api/src -g '*.ts' -g '*.tsx' -g '!*.test.ts' -g '!*.test.tsx' -g '!*_test.ts'` is run
- **THEN** zero matches are returned — no production file carries a `deno-lint-ignore-file`
  directive

#### Scenario: Vestigial directive deletion has zero lint impact

- **WHEN** `make lint` is run after deleting the 6 vestigial directives
- **THEN** lint passes with zero new violations — the deleted directives suppressed only
  `no-explicit-any` / `require-await` (both in `rules.exclude`), so removing them changes nothing

#### Scenario: Logger types unchanged

- **WHEN** `packages/shared/src/logger/types.ts` is inspected after directive removal
- **THEN** the `Logger` / `ChildLogger` / `CreateLogger` interfaces are unchanged — they already
  use `Record<string, unknown>` for structured payloads (no `any` to replace, contrary to the D35
  plan's premise)

### Requirement: openapi/index.ts as-any cast narrowed to line-level with justification

`apps/api/src/utils/openapi/index.ts` SHALL NOT carry a file-level
`// deno-lint-ignore-file no-explicit-any` directive. Instead, a line-level
`// deno-lint-ignore no-explicit-any` SHALL be placed immediately above the `as any` cast on line 29
(the cast that wraps `z.toJSONSchema(...)` for the `hono-openapi` `requestBody` schema).

The justification comment on line 28 (added by D34 P3) SHALL be preserved:
```typescript
// hono-openapi v1.3.0's requestBody content schema type doesn't accept zod-openapi's JSON Schema output; cast required (D34 P3).
// deno-lint-ignore no-explicit-any
schema: z.toJSONSchema(schema, { unrepresentable: 'any' }) as any,
```

**Reason:** The `as any` cast is a genuine library-boundary cast — `zod-openapi`'s
`ZodStandardJSONSchemaPayload<T>` is structurally incompatible with `hono-openapi`'s
`OpenAPIV3_1.SchemaObject` (zod's `type` is `string | string[]`; OpenAPI's is a narrower
string-union). D34 P3 documented this with the justification comment. D35 narrows the file-level
directive to a line-level one so the `no-explicit-any` rule (if re-enabled in the future) applies
to the rest of the file. This satisfies D35's acceptance criterion: "Any surviving line-level
directive has a one-line justification comment and covers exactly one statement."

#### Scenario: File-level directive removed

- **WHEN** line 1 of `apps/api/src/utils/openapi/index.ts` is inspected
- **THEN** no `// deno-lint-ignore-file` directive is present

#### Scenario: Line-level directive covers exactly the as-any cast

- **WHEN** lines 27-30 of `openapi/index.ts` are inspected
- **THEN** the justification comment is followed by `// deno-lint-ignore no-explicit-any` followed
  by the `as any` cast line — the directive covers exactly one statement

### Requirement: Dead logger code in cors.ts and requestId.ts is deleted

`apps/api/src/middleware/cors.ts` and `apps/api/src/middleware/requestId.ts` SHALL have their
module-level `const log = createLogger(...)` declarations deleted entirely. These declarations are
never called (no `log.*()` calls exist in either file). The following SHALL be deleted:

- `cors.ts`: delete the `import { createLogger } from '../utils/logger/index.ts'` line (line 3),
  the `// deno-lint-ignore no-unused-vars` directive (line 5), and the
  `const log = createLogger('cors-middleware')` line (line 6).
- `requestId.ts`: delete the `import { createLogger } from '../utils/logger/index.ts'` line (line 2),
  the `// deno-lint-ignore no-unused-vars` directive (line 12), and the
  `const log = createLogger('request-id-middleware')` line (line 13).

The `no-unused-vars` rule is NOT in `deno.json`'s `rules.exclude` (it's part of `recommended` and
enforced), so removing the directives without deleting the `const log` declarations would cause
`make lint` to fail with `error[no-unused-vars]: 'log' is never used`.

**Reason:** The loggers are genuinely unused — no `log.*()` calls exist in either file. Keeping
`_log` (underscore-prefixed) would preserve a side-effect-free no-op with a wasteful pino
child-logger allocation. The `lint-style` spec does not mandate loggers in every middleware;
AGENTS.md's "create a module-scoped logger" convention is for modules that *log*, not a mandate to
add loggers to modules that don't. If future logging is needed, re-add the logger then.

#### Scenario: cors.ts has no logger import or const

- **WHEN** `apps/api/src/middleware/cors.ts` is inspected
- **THEN** no `createLogger` import, no `const log` declaration, and no `// deno-lint-ignore`
  directive are present

#### Scenario: requestId.ts has no logger import or const

- **WHEN** `apps/api/src/middleware/requestId.ts` is inspected
- **THEN** no `createLogger` import, no `const log` declaration, and no `// deno-lint-ignore`
  directive are present

#### Scenario: make lint passes after dead code deletion

- **WHEN** `make lint` is run after deleting the dead logger code and directives
- **THEN** lint passes with zero violations — `no-unused-vars` is satisfied because the unused
  variable is gone, and no directive is needed

### Requirement: Surviving line-level lint directives carry a justification comment

Any surviving line-level `// deno-lint-ignore` directive in production source SHALL carry a
one-line justification comment on the immediately preceding line. The justification SHALL explain
why the rule is suppressed. The directive SHALL cover exactly one statement. (Line-level directives
are NOT file-level `// deno-lint-ignore-file` directives — those are prohibited by the requirement
above.)

After D35, the only surviving line-level production directive is `openapi/index.ts`'s
`// deno-lint-ignore no-explicit-any` (justified by the D34 P3 comment).

**Reason:** Line-level directives are sometimes necessary at library boundaries, but they should be
explicit about why. A justification comment ensures the next reader understands the suppression is
intentional, not a mistake.

#### Scenario: Surviving line-level directive has justification

- **WHEN** `rg -n "// deno-lint-ignore " packages/shared/src apps/api/src -g '*.ts' -g '*.tsx' -g '!*.test.ts' -g '!*.test.tsx' -g '!*_test.ts' | rg -v "ignore-file"` is run
- **THEN** every matched line-level directive is immediately preceded by a comment line explaining
  the justification

