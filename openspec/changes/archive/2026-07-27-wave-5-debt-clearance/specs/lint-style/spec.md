## ADDED Requirements

### Requirement: no-explicit-any, require-await, and no-empty are enforced repo-wide

The root `deno.json` `rules.exclude` SHALL NOT list `no-explicit-any`, `require-await`, or
`no-empty` — all three rules are active repo-wide. The re-enable is fix-first, flip-config-LAST:
all production violations are fixed before the exclusion is removed, so `make lint` is green at
every intermediate commit. The measured production surface to fix:

- **`no-empty` (14 prod):** every one a silent `catch {}` on a user mutation (the D17 failure
  class). User-facing failures surface via the wave-5 Toast primitive (`toast.error`); genuinely
  fire-and-forget catches get an explicit justified comment in the block instead of being empty.
- **`require-await` (44 prod):** drop `async` or await the thing.
- **`no-explicit-any` (7 prod):** including `taste/service.ts`'s 3 undocumented `any` and the
  RecipeComparePage/RecipeFocusModePage cluster (10 `any` behind 8 justification-free line
  ignores).

The `deno.json` flip SHALL be the final commit of the track, proving zero remaining violations.

**Reason:** The three excluded rules mask exactly the failure classes prior waves existed to kill
(D17 silent catches, D09/D35 `any` hygiene). Measured cost is ~184 diagnostics, most mechanical —
re-measuring later costs more than fixing now (design.md Decision 3).

#### Scenario: rules.exclude no longer disables the three rules

- **WHEN** the root `deno.json` is inspected after the track lands
- **THEN** `rules.exclude` contains none of `no-explicit-any`, `require-await`, `no-empty`

#### Scenario: Lint is green with the rules active

- **WHEN** `make lint` runs after the flip
- **THEN** it passes with zero diagnostics from the three re-enabled rules

#### Scenario: Empty catches on user mutations surface failures

- **WHEN** the 14 former `catch {}` sites are inspected
- **THEN** user-facing ones call `toast.error(...)` (or equivalent user feedback) and the rest
  contain an explicit justification comment — none is an empty block

### Requirement: Test-file lint suppressions are line-level and justified

Test files SHALL NOT carry file-level `// deno-lint-ignore-file` directives (this covers
`*.test.ts`, `*_test.ts`, `*.test.tsx`, `*.pbt.test.ts`, `*.exploration.test.ts`). The ~40
existing no-op file-level test directives (vestigial while the rules were excluded) SHALL be
deleted. For the ~119 test-file `no-explicit-any` diagnostics exposed by the re-enable: apply a
typed fix where trivial (most are mock objects that can use `Partial<T>` / `vi.mocked`), otherwise
a line-level `// deno-lint-ignore no-explicit-any` WITH a one-line justification comment on the
preceding line — never file-level.

**Reason:** File-level directives disable rules for every future edit to the file — the same
vestigial pattern D35 deleted from production, still present in ~40 test files. Line-level +
justification keeps each suppression auditable and intentional.

#### Scenario: No file-level directives remain in tests

- **WHEN** `rg -n "deno-lint-ignore-file" apps packages -g '*.test.ts' -g '*_test.ts' -g '*.test.tsx'` is run
- **THEN** zero matches are returned

#### Scenario: Surviving test suppressions are justified

- **WHEN** `rg -n "// deno-lint-ignore " apps packages -g '*.test.ts' -g '*_test.ts' -g '*.test.tsx'` is run
- **THEN** every match is a line-level directive immediately preceded by a justification comment

### Requirement: Raw SQL is confined to an accepted-exception registry

Raw `` sql`...` `` tag usage in production code SHALL be confined to a documented
accepted-exception registry; any site outside the registry is a violation. The registry:

| Accepted exception | Where |
|---|---|
| Health probe `SELECT 1` | health route |
| Atomic ±1 counters | recipe/comment counter increments |
| Atomic not-featured toggle | `recipe/model.ts:830` — ONLY if the Drizzle `not()` rewrite is not clean; otherwise the site is converted and this row is not added |
| `count(distinct ...)` | where Drizzle lacks a helper |
| Correlated `EXISTS` | `equipment/model.ts:116-124` (existing NOTE) |
| Schema `check()` constraint expressions | `packages/db/src/schema.ts` |

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
  count(distinct), equipment EXISTS, schema check())

#### Scenario: Converted sites behave identically

- **WHEN** `make test-api` and `deno task test:db` run after the 5 conversions
- **THEN** all existing assertions over the affected queries (counts, max-sortOrder, badge
  thresholds, seed idempotency) pass unchanged

## MODIFIED Requirements

### Requirement: Surviving line-level lint directives carry a justification comment

Any surviving line-level `// deno-lint-ignore` directive SHALL carry a one-line justification
comment on the immediately preceding line — in ANY source file, production AND test, across
`packages/` and `apps/`. The justification SHALL explain why the rule is suppressed. The
directive SHALL cover exactly one statement. (Line-level directives are NOT file-level
`// deno-lint-ignore-file` directives — those are prohibited in production source by the
requirement above, and in test files by the wave-5 test-suppression requirement.)

Production baseline before wave 5: the only surviving line-level production directive is
`openapi/index.ts`'s `// deno-lint-ignore no-explicit-any` (justified by the D34 P3 comment).
Wave 5 extends the same standard to the RecipeComparePage/RecipeFocusModePage cluster (8
currently justification-free line ignores — each gets a typed fix or a justification) and to all
test-file suppressions.

**Reason:** Line-level directives are sometimes necessary at library boundaries, but they should
be explicit about why. A justification comment ensures the next reader understands the
suppression is intentional, not a mistake. Wave 5 widens the scope from production-only to all
source, because the re-enabled rules now bite in test files too.

#### Scenario: Surviving line-level directive has justification

- **WHEN** `rg -n "// deno-lint-ignore " packages apps -g '*.ts' -g '*.tsx' | rg -v "ignore-file"` is run
- **THEN** every matched line-level directive is immediately preceded by a comment line explaining
  the justification

#### Scenario: Compare/FocusMode ignores are fixed or justified

- **WHEN** `RecipeComparePage.tsx` and `RecipeFocusModePage.tsx` are inspected after the track
- **THEN** none of the former 8 justification-free line ignores remains — each is either removed
  (typed fix) or carries a justification comment

## REMOVED Requirements

### Requirement: Test files shall use file-level `deno-lint-ignore-file` directives

This requirement SHALL be removed: test files no longer use file-level directives — the
replacement policy is the ADDED requirement "Test-file lint suppressions are line-level and
justified" above.

**Reason:** The file-level convention was a workaround from the era when `no-explicit-any` and
`require-await` were globally excluded; with the rules re-enabled, file-level suppression would
mask real violations in every future edit to a test file.

#### Scenario: Old convention no longer validated

- **WHEN** a new test file is added after wave 5
- **THEN** review does not require (or permit) a line-1 `// deno-lint-ignore-file` header

#### Scenario: Migration removed the old headers

- **WHEN** the ~40 test files that carried the header are inspected after the track
- **THEN** the header line is gone and the files lint clean (or carry justified line-level
  ignores)
