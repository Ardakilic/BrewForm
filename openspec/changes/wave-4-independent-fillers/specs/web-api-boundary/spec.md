## ADDED Requirements

### Requirement: Web app is type-checked in CI

The web app at `apps/web/src/` SHALL be type-checked in CI via
`deno run -A npm:typescript/tsc --noEmit -p tsconfig.json`. The `apps/web/deno.json` `"check"` task
SHALL run this command (in addition to `deno lint src/`). The root `deno.json` `"check:web"` task
and the `Makefile` `check-web` target SHALL invoke this task. The invocation
`deno run -A npm:typescript/tsc` executes the TypeScript compiler via Deno's npm compatibility
layer — no Node installation needed (verified in the Docker `app` container, which is Deno-only).
`typescript` 6.0 is already a dev-dep in `apps/web/package.json`.

The `apps/web/tsconfig.json` SHALL include `"allowImportingTsExtensions": true` in
`compilerOptions` (the codebase uses explicit `.ts`/`.tsx` import extensions per AGENTS.md; without
this flag, `tsc` reports 686 `TS5097` errors — one per import statement). The `tsconfig.json` SHALL
also include `"ignoreDeprecations": "6.0"` to silence the `baseUrl` deprecation warning (the
`baseUrl` is needed for path alias resolution; migrating away from it is out of scope).

**Reason:** The web app is currently NOT type-checked in CI. `make check-web` runs only
`deno lint src/`; the Vite build does not type-check; `apps/web/tsconfig.json` is consumed only by
IDE language servers. D42's type-safety guarantees are unverifiable without a type-check gate. This
is the prerequisite for all other D42 requirements — without it, replacing `Record<string, unknown>`
with real types cannot be verified.

**Pre-existing error breakdown (verified 2026-07-06):** Running `tsc --noEmit` produces 881 errors,
but 686 are `TS5097` (fixed by `allowImportingTsExtensions: true`), 145 are in test files (mock
`AuthContextType` missing `sessionError`/`clearSessionError` from D38 — mechanical fix), and 56 are
in non-test files (mostly `RecipeDetailPage.tsx` shadow-type mismatch — exactly what D42 fixes).
The single-phase approach is tractable.

#### Scenario: make check-web type-checks the web app

- **WHEN** `make check-web` is executed
- **THEN** `tsc --noEmit -p apps/web/tsconfig.json` runs and passes with zero type errors
- **AND** `deno lint src/` also runs and passes

#### Scenario: Pre-existing type errors are fixed

- **WHEN** `tsc --noEmit` is first run on `apps/web/src/`
- **THEN** any pre-existing type errors (in files D42 does not touch) are fixed as part of D42's
  "fix fallout honestly" step — NOT suppressed with `// @ts-ignore` or `as any` casts

#### Scenario: CI pr.yml runs the web type-check

- **WHEN** the `check` job in `.github/workflows/pr.yml` runs `deno task check`
- **THEN** `deno task check:web` invokes the web type-check and fails the build on any type error

### Requirement: Shared response types are re-exported through the schemas barrel

The `packages/shared/src/schemas/index.ts` barrel SHALL re-export all inferred `*Output` types
from `packages/shared/src/schemas/responses/` via `export type { ... } from './responses/...'`.
This includes (at minimum) the following response types that D42 consumes:

- `RecipeDetailOutput`, `RecipeListItemOutput`, `RecipeVersionRow`, `RecipeRow`,
  `RecipeWithAuthorOutput`, `RecipeWithVersionsOutput`, `FeedRecipeOutput`
- `BeanOutput`, `SetupOutput`, `EquipmentOutput`, `EquipmentRecipesResponse`,
  `EquipmentDeleteRequestResponse`
- `PublicUserOutput`, `SelfUserOutput`, `UserPreferencesOutput`
- `TasteNoteNodeOutput`, `TasteNoteOutput`
- `FollowerListItemOutput`, `FollowingListItemOutput`, `FollowOutput`
- `CommentOutput`, `CommentWithRepliesOutput`
- `BadgeOutput`, `VendorOutput`, `PhotoOutput`, `CoffeeVarietyOutput`, `ReportOutput`

The per-domain response files already export these types (added by D25/Wave 2); the barrel gap is
that they are not re-exported through `schemas/index.ts`, making them unreachable via
`@brewform/shared/schemas`.

**Reason:** The web app imports exclusively from `@brewform/shared/schemas` (Vite aliases in
`apps/web/vite.config.ts` resolve `@brewform/shared/*`). Without barrel re-exports, the web cannot
reach the response types and must continue using hand-duplicated shadow types.

#### Scenario: Response types are importable from @brewform/shared/schemas

- **WHEN** `import { RecipeDetailOutput } from '@brewform/shared/schemas'` is used in
  `apps/web/src/api/index.ts`
- **THEN** the type resolves to `z.infer<typeof RecipeDetailOutputSchema>` — no "module has no
  exported member" error

#### Scenario: Existing schema object exports unchanged

- **WHEN** the barrel is modified to add type re-exports
- **THEN** the existing Zod schema object exports (`RecipeDetailOutputSchema`, etc.) are unchanged
  — the type re-exports are additive

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
| `RecipeNotes` | `packages/shared/src/schemas/recipe.ts` | `recipeApi.saveNotes` |
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

### Requirement: RecipeListItemOutputSchema and extended RecipeDetailOutputSchema exist in shared

**`RecipeListItemOutputSchema`** SHALL be added to `packages/shared/src/schemas/responses/recipe.ts`
matching the API's actual list-endpoint return shape. It SHALL include (at minimum): `id`, `slug`,
`title`, `author` (mini author ref), `visibility`, `currentVersion` (optional nested version badge
data: `brewMethod`, `drinkType`, `rating`), `likeCount`, `commentCount`, `forkCount`,
`favouriteCount`, `avgRating`, `userLiked`, `userFavourited`, `featured`, `createdAt`. The inferred
type `RecipeListItemOutput` SHALL be exported. The schema SHALL be derived from the ACTUAL
`recipe/model.ts findMany` / `findCursor` return shape (per AGENTS.md OpenAPI rule).

**`RecipeDetailOutputSchema`** SHALL be extended to include the per-request overlay fields that
`recipe/model.ts findById` returns: `userLiked` (boolean), `userFavourited` (boolean),
`avgRating` (number | null), `userRating` (number | null), `favouriteCount` (number), and
`currentVersion` (optional `RecipeDetailVersionOutput` — the latest version's nested
`tasteNotes[]`, `equipment[]`, `bean`). The existing `versions[]` array and `forkedFrom` field
stay. The `RecipeDetailOutput` inferred type is already exported; the extension flows through.

**`PaginatedResponse<T>`** SHALL be exported from `packages/shared/src/schemas/response.ts` (or a
sibling) matching `paginatedEnvelope()`'s shape:
```typescript
export type PaginatedResponse<T> = {
  success: true;
  data: T[];
  meta: { requestId: string; pagination: PaginationMeta };
};
```

**Reason:** The web's hand-written `RecipeListItem` and `RecipeDetailResponse` (in
`api/types.ts`) have shapes that diverge from the shared schemas. `FeedRecipeOutput` has the wrong
shape for list items (full row, no user-state overlay). `RecipeDetailOutput` lacks the per-request
overlay fields the API actually returns. These schema gaps force the web to maintain shadow types;
closing them lets the web delete `api/types.ts` entirely.

#### Scenario: RecipeListItemOutputSchema matches the API list return

- **WHEN** `RecipeListItemOutputSchema` is compared against the actual `recipe/model.ts findMany`
  return shape
- **THEN** every field the model returns is present in the schema, and every field in the schema is
  returned by the model (no phantom fields, no missing fields)

#### Scenario: RecipeDetailOutputSchema includes per-request overlay

- **WHEN** `RecipeDetailOutput` is used to type `recipeApi.getDetail`'s return
- **THEN** `userLiked`, `userFavourited`, `avgRating`, `userRating`, `favouriteCount`, and
  `currentVersion` are accessible on the type — matching what `RecipeDetailPage.tsx` reads

#### Scenario: PaginatedResponse type matches paginatedEnvelope shape

- **WHEN** `api.getWithMeta<PaginatedResponse<RecipeListItemOutput>>` is used
- **THEN** the return type includes `success: true`, `data: RecipeListItemOutput[]`, and
  `meta: { requestId: string; pagination: PaginationMeta }` — no missing `success` or
  `meta.requestId` (the web's hand-written version was missing both)

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
  `recipeApi.like`/`favourite`/`feature`/`saveNotes` return their respective output types

#### Scenario: No new `as` casts introduced

- **WHEN** `git diff` for `apps/web/src/api/index.ts` is inspected
- **THEN** no new `as` casts are introduced to paper over type mismatches — mismatches are fixed at
  the schema or consumer level

### Requirement: apps/web/src/api/types.ts is deleted; shadow types sourced from shared

`apps/web/src/api/types.ts` (185 lines, 14+ hand-duplicated interfaces) SHALL be deleted. All 25+
import sites SHALL import from `@brewform/shared/schemas` or `@brewform/shared/types` instead. The
following shadow types are eliminated:

- `RecipeDetailResponse` → `RecipeDetailOutput` (shared, extended per requirement above)
- `RecipeListItem` → `RecipeListItemOutput` (shared, new per requirement above)
- `RecipeVersionResponse`, `RecipeAuthorResponse`, `RecipeTasteNoteResponse`,
  `RecipeEquipmentResponse`, `RecipeBeanResponse`, `RecipePhotoResponse` → shared `*Output` types
- `RateResponse`, `EquipmentListItem`, `SetupListItem`, `TasteNoteFlatItem`, `CommentAuthor`,
  `CommentData` → shared `*Output` types
- `PaginatedResponse<T>` → shared `PaginatedResponse<T>` (new, per requirement above)

Additionally, per-page shadow types in `apps/web/src/pages/**/*.tsx` SHALL be deleted and replaced
with shared type imports. This includes (at minimum): `BeanListPage.Bean`,
`SetupListPage.Setup`, `EquipmentListPage.EquipmentItem`, `EquipmentDetailPage.EquipmentDetail`/
`RecipeEntry`, `UserProfilePage.UserProfile`/`FollowRecord`, `TasteNotesPage.TasteCategory`,
`CoffeeVarietiesPage.CoffeeVarietyItem`, `CoffeeVarietyDetailPage.VarietyDetail`/`RecipeEntry`,
`RecipeVersionsPage.VersionSummary`, `SettingsPage.Preferences`, and all 15 admin-page local
interfaces.

**Reason:** Hand-duplicated shadow types drift from the shared schemas (e.g. `RecipeDetailResponse`
lacks `versions[]`/`forkedFrom` and adds per-request fields the shared schema didn't model). The
shared schemas are the single source of truth — deriving types via `z.infer` eliminates drift.

#### Scenario: api/types.ts is deleted

- **WHEN** `ls apps/web/src/api/types.ts` is run
- **THEN** the file does not exist

#### Scenario: No per-page shadow type interfaces remain

- **WHEN** `grep -rn "^interface Bean\b\|^interface Setup\b\|^interface EquipmentItem\b\|^interface UserProfile\b\|^interface TasteCategory\b\|^interface CoffeeVarietyItem\b" apps/web/src/pages/` is run
- **THEN** zero matches are returned — all shadow types are deleted

#### Scenario: BeanListPage productName fallout is fixed

- **WHEN** `BeanListPage.tsx` is inspected after the type replacement
- **THEN** the bean name field access matches `BeanOutput.name` (the shared schema's field) — if
  the page previously used `productName` and the API returns `name`, the page is fixed to use
  `name`. If the API genuinely returns `productName`, the shared `BeanOutputSchema` is extended to
  include `productName` and the OpenAPI spec is updated. **This is a latent bug — fix it honestly,
  do not paper over it with a cast.**

### Requirement: Five real `as` casts at the web boundary are removed

The following 5 `as` casts in the web app SHALL be removed (they become unnecessary once API
functions return typed payloads):

| File:line | Cast | Why it becomes unnecessary |
|---|---|---|
| `apps/web/src/pages/setups/SetupListPage.tsx:38` | `data as Setup[]` | `setupApi.list` returns `SetupOutput[]` — cast redundant |
| `apps/web/src/pages/equipment/EquipmentListPage.tsx:40` | `data as EquipmentItem[]` | `equipmentApi.list` returns `EquipmentOutput[]` — cast redundant |
| `apps/web/src/pages/TasteNotesPage.tsx:234` | `(data ?? []) as TasteCategory[]` | `tasteApi.hierarchy` returns `TasteNoteNodeOutput[]` — cast removable |
| `apps/web/src/components/onboarding/OnboardingWizard.tsx:26,36` | `as Record<string, unknown>` | `api.patch('/preferences', body)` second param becomes typed |
| `apps/web/src/pages/settings/SettingsPage.tsx:75` | `as Record<string, unknown>` | same as OnboardingWizard |

The infrastructure casts in `apps/web/src/api/client.ts:72,76,124` (envelope unwrap, FormData
headers) are NOT in scope — they stay.

**Reason:** These casts exist *because* the API functions returned `Record<string, unknown>`. Once
the functions return typed payloads, the casts are redundant and hide real type relationships.

#### Scenario: SetupListPage cast removed

- **WHEN** `SetupListPage.tsx:38` is inspected
- **THEN** the `as Setup[]` cast is gone — `setupApi.list()` return type flows directly

#### Scenario: TasteNotesPage cast removed

- **WHEN** `TasteNotesPage.tsx:234` is inspected
- **THEN** the `as TasteCategory[]` cast is gone — `tasteApi.hierarchy()` return type flows
  directly (and `TasteCategory` local interface is deleted, replaced with `TasteNoteNodeOutput`)

### Requirement: Type-level regression test locks derived types

A type-level regression test SHALL be added to `apps/web/src/api/` asserting that the derived
response types are real (not `any` in disguise). The test uses `// @ts-expect-error` on accessing a
non-existent field of a derived response type:

```typescript
import type { RecipeDetailOutput } from '@brewform/shared/schemas';

// @ts-expect-error — nonExistentField does not exist on RecipeDetailOutput
const _test: RecipeDetailOutput['nonExistentField'] = null;
```

**Reason:** Locks that the types are real and restrictive. If someone accidentally widens the type
to `any` or adds a phantom field, this test fails.

#### Scenario: Type-level regression test passes

- **WHEN** `make check-web` (or `tsc --noEmit`) is run
- **THEN** the `@ts-expect-error` assertion is satisfied (the type error is expected and caught) —
  proving the derived type is restrictive