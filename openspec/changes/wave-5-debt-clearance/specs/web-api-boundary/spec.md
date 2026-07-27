## ADDED Requirements

### Requirement: The web API client directory contains zero Record of string unknown

`apps/web/src/api/` SHALL contain zero occurrences of `Record<string, unknown>`. The single survivor
— D42's off-by-one — is the envelope unwrap at `apps/web/src/api/client.ts:72`
(`return (data as Record<string, unknown>).data as T;`). It SHALL be replaced with a typed envelope:
type the parsed response as the envelope shape (e.g. an `ApiEnvelope<T>` /
`{ success: true; data: T; meta: ... }` interface matching the shared response envelope, or at
minimum `{ data: unknown }` with the single `as T` on the unwrap), so the intermediate
`Record<string, unknown>` disappears. The fix SHALL NOT change runtime behaviour — the unwrap
semantics stay identical; only the typing tightens. The ledger claim "zero `Record<string, unknown>`
at the boundary" (TECHNICAL_DEBT.md's D42 entry) becomes literally true.

**Reason:** The 2026-07-19 type-safety sweep confirmed client.ts:72 is the only
`Record<string, unknown>` left under `apps/web/src/api/` — an unjustified double-assert that
contradicts the D42 ledger entry. Closing it makes the directory-level guarantee grep-checkable with
no exception list.

#### Scenario: Directory grep gate passes

- **WHEN** `grep -rn "Record<string, unknown>" apps/web/src/api/` is run
- **THEN** zero hits are returned

#### Scenario: Envelope unwrap stays behaviourally identical

- **WHEN** `api.get<RecipeDetailOutput>(...)` executes against a success envelope after the change
- **THEN** it returns the envelope's `data` payload exactly as before, `make check-web` passes, and
  the existing client tests pass unchanged

### Requirement: Page-level Record casts are eliminated

The page/component-level `Record<string, unknown>` casts that bypass the typed boundary SHALL be
replaced with shared `z.infer` types (the same source of truth `api/index.ts` uses):

- **Response casts:** `AdminAuditLogPage.tsx:38` and `RecipeCreatePage.tsx:98`
  (`data as Record<string, unknown>`), `RecipeFocusModePage.tsx:42` (the
  `(data: Record<string, unknown>)` annotation on a `recipeApi.get` response — becomes
  `RecipeDetailOutput`), `components/photos/PhotoUpload.tsx:87`
  (`api.upload<Record<string, unknown>>` — becomes the shared `PhotoOutput`-based type).
- **Request-body casts** (`as Record<string, unknown>` on `api.patch`/`api.post` bodies) in 7 admin
  pages: `AdminRecipesPage.tsx:44`, `AdminEquipmentPage.tsx:50,60`, `AdminCompatibilityPage.tsx:40`,
  `AdminTasteNotesPage.tsx:46`, `AdminUserCreatePage.tsx:54`, `AdminUserEditPage.tsx:79`,
  `AdminCoffeeVarietiesPage.tsx:178`. The client's mutation helpers SHALL accept a generic typed
  body parameter (e.g. `api.patch<TOut, TIn>(path, body: TIn)`), so call sites pass shared
  `*Create`/`*Update` types instead of widening to `Record`.

Together with the client-directory requirement above, this makes the whole web app free of
`Record<string, unknown>`: any genuinely dynamic JSON SHALL be typed `unknown` and narrowed via a
shared schema parse — never widened to `Record`.

**Reason:** D42 typed `api/index.ts`, but consumers re-erase the types one layer up — 4 response
casts and 7 request-body casts mean field renames in shared schemas are invisible to `tsc` at
exactly the sites that render/submit the data.

#### Scenario: Web-wide grep gate passes

- **WHEN** `grep -rn "Record<string, unknown>" apps/web/src` is run
- **THEN** zero hits are returned

#### Scenario: Admin mutation bodies are typed

- **WHEN** `AdminEquipmentPage.tsx` is type-checked after the change
- **THEN** its create/update calls pass shared `EquipmentCreate`/`EquipmentUpdate`-typed bodies with
  no `as Record<string, unknown>` cast — a renamed field in the shared schema fails `make check-web`

#### Scenario: PhotoUpload response is typed

- **WHEN** `PhotoUpload.tsx:87` is inspected
- **THEN** `api.upload` is parameterized with the shared photo output type, and the component reads
  fields off that type (no `Record` indexing)

### Requirement: No new untyped casts enter the web-API boundary

New and modified web code SHALL keep the boundary typed: every new API function in
`apps/web/src/api/index.ts` uses shared `z.infer` request/response types; no new
`Record<string, unknown>`, `as any`, or justification-free `deno-lint-ignore` enters `apps/web/src`
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

## MODIFIED Requirements

### Requirement: Five real `as` casts at the web boundary are removed

The following 5 `as` casts in the web app SHALL be removed (they become unnecessary once API
functions return typed payloads):

| File:line                                                       | Cast                              | Why it becomes unnecessary                                            |
| --------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `apps/web/src/pages/setups/SetupListPage.tsx:38`                | `data as Setup[]`                 | `setupApi.list` returns `SetupOutput[]` — cast redundant              |
| `apps/web/src/pages/equipment/EquipmentListPage.tsx:40`         | `data as EquipmentItem[]`         | `equipmentApi.list` returns `EquipmentOutput[]` — cast redundant      |
| `apps/web/src/pages/TasteNotesPage.tsx:234`                     | `(data ?? []) as TasteCategory[]` | `tasteApi.hierarchy` returns `TasteNoteNodeOutput[]` — cast removable |
| `apps/web/src/components/onboarding/OnboardingWizard.tsx:26,36` | `as Record<string, unknown>`      | `api.patch('/preferences', body)` second param becomes typed          |
| `apps/web/src/pages/settings/SettingsPage.tsx:75`               | `as Record<string, unknown>`      | same as OnboardingWizard                                              |

Wave 4 exempted the infrastructure casts in `apps/web/src/api/client.ts:72,76,124` (envelope unwrap,
FormData headers) as out of scope. Wave 5 narrows that exemption: the envelope-unwrap
`Record<string, unknown>` at `client.ts:72` SHALL be replaced with a typed envelope (see "The web
API client directory contains zero Record of string unknown"); only the FormData-header casts
(`client.ts:76,124`) remain exempt, as genuine fetch-API infrastructure with no shared type to name.

**Reason:** These casts exist _because_ the API functions returned `Record<string, unknown>`. Once
the functions return typed payloads, the casts are redundant and hide real type relationships. The
wave-4 client-infrastructure carve-out was one line too wide — the envelope unwrap CAN be expressed
with a typed envelope, and keeping it as `Record` leaves a standing contradiction with the "zero
`Record<string, unknown>` at the boundary" guarantee.

#### Scenario: SetupListPage cast removed

- **WHEN** `SetupListPage.tsx:38` is inspected
- **THEN** the `as Setup[]` cast is gone — `setupApi.list()` return type flows directly

#### Scenario: TasteNotesPage cast removed

- **WHEN** `TasteNotesPage.tsx:234` is inspected
- **THEN** the `as TasteCategory[]` cast is gone — `tasteApi.hierarchy()` return type flows directly
  (and `TasteCategory` local interface is deleted, replaced with `TasteNoteNodeOutput`)

#### Scenario: Client exemption is narrowed, not widened

- **WHEN** `apps/web/src/api/client.ts` is inspected after wave 5
- **THEN** no `Record<string, unknown>` remains; only the FormData-header casts persist, each
  adjacent to its infrastructure justification
