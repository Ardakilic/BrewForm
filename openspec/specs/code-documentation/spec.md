# code-documentation Specification

## Purpose
TBD - created by archiving change wave-5-debt-clearance. Update Purpose after archive.
## Requirements
### Requirement: Every exported production symbol carries a JSDoc docblock

Every exported symbol in production source SHALL carry a `/** ... */` JSDoc docblock immediately
above its declaration — functions, classes, React components, hooks, AND const/type/interface/ enum
exports, including Zod schemas, `z.infer` type aliases, constant tables, Drizzle `pgTable`/`pgEnum`
consts, Hono router consts, and module singletons (`log`, `deps`, `db`, `config`). Scope:
`apps/api/src`, `apps/web/src`, `packages/shared/src`, `packages/db/src`, excluding
`*.test.*`/`*_test.*`/`*.spec.*` files, `generated/` output, and ambient `*.d.ts` declarations. The
rule covers all export forms: direct `export const/function/type`, `export default X;` (the docblock
sits on `X`'s declaration), and local `export { X };` (the docblock sits on `X`'s declaration, or on
the export statement for re-exported JSON bundles like `i18n`'s `en`/`tr`). Line comments (`//`) and
plain block comments (`/* */`) do NOT satisfy the rule — upgrade them to `/** */`.

This is the blanket rule for new code: any PR that adds an exported symbol without a docblock is
incomplete. Enforcement is by review — no Deno lint plugin matches the house style, and none SHALL
be added (design.md Decision 9).

**Reason:** The 2026-07-19 inventory measured 890/1059 exported symbols documented (84%);
function-like coverage is near-total (1 undocumented true function repo-wide), so the entire
remaining debt is the const/type category this requirement brings into scope — and
`packages/db/src/schema.ts`'s tables, the worst file (43 missing), are the highest-value docs for
newcomers.

#### Scenario: New exported symbol without a docblock is rejected

- **WHEN** a PR adds `export const fooRouter = new Hono()...` with no preceding `/** */` block
- **THEN** review flags it against this requirement — the symbol gains a house-style docblock before
  merge

#### Scenario: Comment style is JSDoc, not line comments

- **WHEN** an exported symbol carries only a `//` comment (e.g. the pre-wave-5
  `schema.ts:43 visibilityEnum`)
- **THEN** it does not satisfy the rule — the comment is upgraded to a `/** */` block

### Requirement: Docblocks follow the captured house style

Docblocks SHALL follow the house style captured in `audit/docblock-inventory.md` (five verified
conventions — apply, do not invent):

1. **API service functions** — imperative first sentence, then vertically aligned
   `@param name - desc` lines and `@returns` (the `collection/service.ts:91-96` idiom).
2. **Small shared utils** — single-line `/** ... */`, verb-first "does X: mechanics" summary, no
   tags (the `slug.ts:1` idiom).
3. **React hooks/components** — tag-less prose stating behaviour and what is returned in words;
   components may add interaction notes, cross-file references, and known limitations (the
   `useDebounce.ts:6-10` / `RecipeCard.tsx:5-20` idioms).
4. **Zod schemas** — "Validates X; response envelope for METHOD /route" one-liners (the
   `responses/user.ts:63-64` idiom).
5. **Cross-references** — `{@link Symbol}` for related types/functions; backtick code refs;
   declarative present tense.

For the bulk backfill categories the style is prescribed: `pgTable` consts get one-liners naming the
entity and notable columns/constraints (soft-delete, unique targets); `pgEnum` consts name the
driving `*_VALUES` constant; `z.infer` aliases get "Inferred type of {@link XSchema}"-style
one-liners; Hono router consts get "Hono router for `/api/v1/x` — mounted in routes/index.ts"
one-liners; `log`/`deps` singletons get one-liners naming the module and (for `deps`) the injectable
seam.

**Reason:** The codebase already has a consistent, verified style at 84% coverage; a second style
would create churn and review ambiguity. Prescribing the bulk-category one-liners keeps the
196-symbol backfill mechanical.

#### Scenario: Backfilled schema table follows the idiom

- **WHEN** the docblock added to a `pgTable` const (e.g. `schema.ts` `recipes`) is inspected
- **THEN** it is a one-liner naming the entity and notable columns/constraints, in `/** */` form —
  not a multi-tag block

#### Scenario: z.infer aliases cross-link their schema

- **WHEN** the docblock on an inferred type (e.g. `RecipeDetailOutput`) is inspected
- **THEN** it references the source schema via `{@link RecipeDetailOutputSchema}`-style
  cross-reference

### Requirement: The 196-symbol docblock backfill is complete

All 196 missing docblocks inventoried in `audit/docblock-inventory.md` SHALL be added, per its
file-by-file tables: **apps/api/src 50** (the 22 `export default` Hono router consts in Section B,
the `app`/`logger` locals in Section C, and 26 main-scan symbols — route consts, `AppEnv`/
`AppVariables`, `config`, upload/storage interfaces, module `log`/`deps` singletons), **apps/web/src
13** (loader-data interfaces, chart/filter types, `router`, `CACHE_BUST_KEY`; note
`RecipeCard.styles.ts:1` resolves by deletion in T3 — its replacement `AuthorButton` is documented
instead), **packages/shared/src 73** (49 `z.infer` aliases across `schemas/**`, 21 constants-table
symbols, the `en`/`tr` locale re-exports), **packages/db/src 60** (`schema.ts`'s 43 — all 13 pgEnums
and 28 pgTables plus `RecipeVisibility` — the seed-data consts, `db`/`client`, and
`seed.ts:927 main()`, the repo's only undocumented true exported function). Existing `//` comments
flagged "upgrade" in the inventory SHALL become `/** */` blocks, preserving their content where
accurate. Docblock-only edits SHALL NOT change any runtime code.

**Reason:** The inventory is exact (scanner-generated, spot-check-validated, one scanner bug fixed
during validation), so "complete" is objectively checkable — re-running the scanner from
`audit/docblock-scan.ts` yields zero missing.

#### Scenario: Scanner reports zero missing

- **WHEN** the inventory scanner (`audit/docblock-scan.ts`) is re-run over the four production roots
  after the backfill
- **THEN** it reports 0 missing docblocks (all export forms: main scan, `export default`
  declarations, and local `export { X }` declarations)

#### Scenario: Worst file is fully documented

- **WHEN** `packages/db/src/schema.ts` is inspected
- **THEN** every exported pgEnum, pgTable, and type carries a `/** */` docblock in the prescribed
  one-liner style

#### Scenario: Backfill is behaviour-free

- **WHEN** `git diff` for a docblock backfill commit is inspected and the full check/test suites run
- **THEN** only comment lines are added or upgraded — no runtime code changes — and `make check`
  plus the test suites pass unchanged

