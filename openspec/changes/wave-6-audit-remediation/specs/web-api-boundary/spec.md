## MODIFIED Requirements

### Requirement: Web app is type-checked in CI
The web app at `apps/web/src/` SHALL be type-checked in CI by the TypeScript compiler from the workspace catalog: the `apps/web/package.json` `check` script runs `tsc --noEmit -p tsconfig.json`, the root `check:web` script and the `Makefile` `check-web` target invoke it, and the root `check` script — run by the `quality` job of `.github/workflows/ci.yml` on every pull request — composes it. Linting is a separate gate (`biome check src/` via the `lint` script), and the `make check-web` help text SHALL describe the target as a type-check.

The `apps/web/tsconfig.json` SHALL keep `"allowImportingTsExtensions": true` in `compilerOptions` (the codebase uses explicit `.ts`/`.tsx` import extensions per AGENTS.md; without it `tsc` reports a `TS5097` error per import) and SHALL extend the root `tsconfig.json`.

**Reason:** Before D42 the web app was not type-checked anywhere — the Vite build does not type-check — so D42's type-safety guarantees were unverifiable. D42 added the gate and fixed the pre-existing errors honestly (887 at the time: 686 `TS5097`, 145 in test mocks, 56 in pages); the gate now runs on the catalog TypeScript (7.x) through pnpm.

#### Scenario: make check-web type-checks the web app
- **WHEN** `make check-web` is executed
- **THEN** `tsc --noEmit -p tsconfig.json` runs in `apps/web` and passes with zero type errors

#### Scenario: Type errors are fixed, not suppressed
- **WHEN** a type error appears in `apps/web/src/`
- **THEN** it is fixed in code — NOT suppressed with `// @ts-ignore`, `// @ts-expect-error` (outside the type-level regression test) or `as any`

#### Scenario: CI runs the web type-check
- **WHEN** the `quality` job in `.github/workflows/ci.yml` runs `pnpm run check`
- **THEN** `pnpm run check:web` executes as part of it and fails the build on any type error

### Requirement: No new untyped casts enter the web-API boundary

New and modified web code SHALL keep the boundary typed: every new API function in
`apps/web/src/api/index.ts` uses shared `z.infer` request/response types; no new
`Record<string, unknown>`, `as any`, or justification-free `biome-ignore` enters `apps/web/src`
(line-level ignores require a justification comment, per the lint-style spec); and pages consume API
results through the inferred return types rather than re-casting. The type-level regression test in
`apps/web/src/api/` (the `@ts-expect-error` non-existent-field assertion) SHALL be kept passing, and
the two grep gates above SHALL hold in CI review for every subsequent change.

**Reason:** D42's guarantee eroded within two waves (one client cast, 11 page casts, 10 `any` in two
pages) because it was a point-in-time cleanup with no forward rule. Writing the invariant into the
spec makes regressions reviewable violations instead of drift.

#### Scenario: Regression test still locks derived types

- **WHEN** `make check-web` runs on any wave-5-or-later change
- **THEN** the `@ts-expect-error` type-level assertion still fails-on-widen — proving the shared
  types have not degraded to `any`

#### Scenario: A new Record cast is a spec violation

- **WHEN** a PR introduces `as Record<string, unknown>` anywhere in `apps/web/src`
- **THEN** the grep gate surfaces it and review rejects it against this requirement — the author
  types the value with a shared schema type or `unknown` + schema parse

### Requirement: Missing request schema types are exported and re-exported

The following inferred request types SHALL be added to their respective schema files (via
`export type X = z.infer<typeof XSchema>`) and re-exported through `packages/shared/src/schemas/
index.ts`:

| Type | Schema file | Used by web API function |
|---|---|---|
| `RecipeCreate` | `packages/shared/src/schemas/recipe.ts` | `recipeApi.create` |
| `RecipeUpdate` | `packages/shared/src/schemas/recipe.ts` | `recipeApi.update` |
| `RecipeFork` | `packages/shared/src/schemas/recipe.ts` | `recipeApi.fork` |
| `RecipeRate` | `packages/shared/src/schemas/recipe.ts` | `recipeApi.rate` |
| `RecipeNotes` | `packages/shared/src/schemas/recipe.ts` | `recipeApi.saveMyNote` (`PUT /api/v1/recipes/:id/notes`, caller-scoped private note; wave 6 removed `recipeApi.saveNotes`) |
| `UserProfileUpdate` | `packages/shared/src/schemas/user.ts` | `userApi.updateProfile` |
| `UserPreferences` (request, nested) | `packages/shared/src/schemas/preferences.ts` | `OnboardingWizard`, `SettingsPage` PATCH `/preferences` |
| `TasteNoteCreate` | `packages/shared/src/schemas/taste.ts` | `tasteApi.create` |
| `TasteNoteUpdate` | `packages/shared/src/schemas/taste.ts` | `tasteApi.update` |
| `Follow` | `packages/shared/src/schemas/follow.ts` | `followApi.follow` |
| `CommentCreate` | `packages/shared/src/schemas/comment.ts` | `commentApi.create` |

Wave 2 already exported `BeanCreate`/`BeanUpdate`, `SetupCreate`/`SetupUpdate`,
`VendorCreate`/`VendorUpdate`, `EquipmentCreate`/`EquipmentUpdate` — these are NOT re-added.

**Reason:** The web API client's request-payload parameters (currently `Record<string, unknown>`)
must use the same types the API validates with. Wave 2 covered 4 domains; the remaining 6 domains
(11 types) are the gap.

#### Scenario: RecipeCreate type is exported and used by recipeApi.create

- **WHEN** `apps/web/src/api/index.ts` is type-checked
- **THEN** `recipeApi.create` accepts `RecipeCreate` (from `@brewform/shared/schemas`) — no
  `Record<string, unknown>`

#### Scenario: UserProfileUpdate replaces Record<string, unknown> in updateProfile

- **WHEN** `apps/web/src/api/index.ts:31` is type-checked
- **THEN** `userApi.updateProfile` accepts `UserProfileUpdate` — no `Record<string, unknown>`

### Requirement: apps/web/src/api/index.ts uses shared types, not Record<string, unknown>

All 28 lines containing `Record<string, unknown>` in `apps/web/src/api/index.ts` SHALL be replaced
with shared `z.infer`-derived types. (Some lines have 2 occurrences — a param and a return type —
totaling ~32 individual usages across 24 API functions.) Response generics use `*Output` types
(data payload — `api.get<T>` unwraps the envelope and returns `.data as T`). Request payloads use
the corresponding `*Create`/`*Update` request types. The replacement order (highest-traffic first):
recipes → users/profile → follow → setups/beans/equipment → taste hierarchy.

**Reason:** 23 `Record<string, unknown>` at the web↔API boundary mean the compiler cannot catch a
renamed field, and the D25 response schemas (which the API validates against) have no compile-time
link to the web app.

#### Scenario: grep gate passes

- **WHEN** `grep -n "Record<string, unknown>" apps/web/src/api/index.ts` is run
- **THEN** zero hits are returned

#### Scenario: recipeApi functions are typed

- **WHEN** `apps/web/src/api/index.ts` is type-checked
- **THEN** `recipeApi.create` accepts `RecipeCreate` and returns `RecipeDetailOutput`;
  `recipeApi.update` accepts `RecipeUpdate` and returns `RecipeDetailOutput`;
  `recipeApi.fork` accepts `{ title: string }` and returns `RecipeDetailOutput`;
  `recipeApi.compare` returns the compare response type;
  `recipeApi.like`/`favourite`/`feature` return their respective output types, and the private-note
  methods `recipeApi.getMyNote`/`saveMyNote`/`deleteMyNote` return `RecipeUserNoteOutput` (wave 6)

#### Scenario: No new `as` casts introduced

- **WHEN** `git diff` for `apps/web/src/api/index.ts` is inspected
- **THEN** no new `as` casts are introduced to paper over type mismatches — mismatches are fixed at
  the schema or consumer level

