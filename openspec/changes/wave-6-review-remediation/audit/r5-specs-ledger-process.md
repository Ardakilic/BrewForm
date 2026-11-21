# r5: specs, ledger and process (cross-cutting)

Track r5 of `wave-6-review-remediation`. Scope: finding #32 (raw-SQL registry), the debt-ledger
mapping of all 34 findings, the wave-6 decisions and spec text the fixes contradict, wave-6
leftovers, process facts for the assembler, the doc-drift scope gaps, and OpenSpec delta pitfalls.
Researched 2026-11-21 at `e18f2bd` (branch `wave-6-audit-remediation`, PR #172).

| Item | Verdict | Capability touched | Effort |
|---|---|---|---|
| #32 raw-SQL registry | bigger: 3 missing rows, 3 stale rows, 17 fragments without a D03 comment, no test enforces any of it | `lint-style` (MODIFIED); `equipment-recipe-query` (RENAMED + MODIFIED, recommended) | S |
| Ledger mapping (34 findings) | 3 entries to close (D99.42, D99.51, D99.52); 1 to 3 new entries depending on how the other tracks scope their fixes | plans only | S |
| Wave-6 leftovers (10.36, 16.9, 17.22, 19.27, 29.14) | carry them as tasks in this change, and re-run 16.9/17.22/19.27 after the fixes | none | S |
| Process facts (branch, ADR, docs, doc-drift) | facts only. No fix needs an ADR (ADR-022 stays the next free number) | none | none |
| Doc-drift scope gaps; OpenSpec pitfalls | scope gaps: refuted as actionable (out of scope). Pitfalls: verified against openspec 1.4.1 | none | none |

---

## Finding 32: The raw-SQL registry is missing three new uses

### 1. Verification

Registry today: `openspec/specs/lint-style/spec.md:96-131`, header
`### Requirement: Raw SQL is confined to an accepted-exception registry` (copy it byte for byte; see
the pitfalls section). Rows: health probe `SELECT 1`, atomic ±1 counters, the conditional
not-featured toggle, `count(distinct ...)` "where Drizzle lacks a helper", the equipment correlated
`EXISTS`, schema `check()` expressions, and the row-value keyset. The only enforcement is a grep in a
scenario. No test checks the registry: `grep -rn D03` finds only test prose
(`model.search.explain.test.ts:13`). `packages/shared/src/lint-policy.test.ts` checks lint
suppressions only.

I grepped every raw-SQL site in non-test code
(`grep -rnE '\b(sql|client)(<[^`]*>)?`|\.unsafe\(|sql\.(raw|join|identifier)\(' apps/*/src packages/*/src`,
comment lines dropped):

| # | Site | Fragment | Registry row today | D03 comment today | Gap |
|---|---|---|---|---|---|
| 1 | `apps/api/src/modules/coffee-variety/model.ts:122` (`getRecipesUsingVariety`) | `` sql<number>`count(distinct ${recipes.id})` `` | "count(distinct) where Drizzle lacks a helper" | no | The row's condition is false. drizzle-orm 0.45.4 has `countDistinct()`, and `brew-log/model.ts:195` already uses it. Convert this site. |
| 2 | `apps/api/src/modules/admin/model.ts:743` (`getVarietyRecipeCount`) | same | same | no | same: convert |
| 3 | `apps/api/src/modules/equipment/model.ts:156` (`getRecipesUsingEquipment` count) | same | same | no | same: convert (also MODIFY `equipment-recipe-query`, see Spec impact) |
| 4 | `apps/api/src/modules/equipment/model.ts:144` (`equipmentExists`) | correlated `EXISTS` | yes | a `// NOTE:` block (135-143), no D03 tag | add the D03 tag |
| 5 | `apps/api/src/modules/recipe/model.ts:595` | `CASE` per-version score | **missing** (ADR-017 and the advanced-search spec approve it) | yes (592) | add a row |
| 6 | `recipe/model.ts:610` | `CASE` + `COALESCE` recipe score | **missing** | yes (608) | add a row |
| 7 | `recipe/model.ts:628-629` | `NULLS LAST` pair | **missing** | yes (624) | add a row |
| 8 | `recipe/model.ts:1137` (`forkRecipe`) | `forkCount + 1` | counters (the row says "recipe/comment counter increments") | no | add D03; widen the row wording |
| 9 | `recipe/model.ts:1505, 1515` (`incrementLikes`/`decrementLikes`) | `likeCount ±1` | counters | no | dead code (#34): deleted |
| 10 | `recipe/model.ts:1525, 1535` (`incrementComments`/`decrementComments`) | `commentCount ±1` | counters | no | add D03 (each function, 10 lines apart) |
| 11 | `recipe/model.ts:1647, 1660` (`toggleLike`) | `likeCount ±1` | counters | no | add D03 (two, 13 lines apart) |
| 12 | `recipe/model.ts:1768, 1770` (`buildCursorWhere`) | row-value keyset | yes | yes (1763) | none |
| 13 | `packages/db/src/schema.ts:47` (`lower()`) | `` sql`lower(${column})` `` | **missing** | yes (46) | add a row |
| 14 | `schema.ts:329, 357, 858, 896, 1194, 1195, 1196` | 7 `check()` bodies (896 is new in wave 6) | yes | no | add D03 (one comment covers 1194-1196) |
| 15 | `schema.ts:701` (`setup_user_default_unique` `.where`) | partial-index predicate | **missing** | **no** (the review's point) | add a row and a D03 comment |
| 16 | `packages/db/src/preflight.ts:77` | postgres-js tagged template `` client`select …` `` (fixed text) | **missing**. Not caught by a `sql\`` grep at all. | yes (74-76) | add a row; the scan must detect `client\`` |
| 17 | (none) | health probe `SELECT 1` | listed | n/a | **stale**: `health/model.ts:20` `pingDatabase` is `db.select({ id: users.id }).from(users).limit(1)` |
| 18 | (none) | atomic not-featured toggle | listed (conditional) | n/a | **stale**: converted to `not(recipes.featured)` (`recipe/model.ts:1706`) |
| 19 | `apps/api/scripts/flush-db.ts:30` | `client.unsafe(\`TRUNCATE …\`)` with schema-derived names | not listed | no | Outside `src`, a dev tool (`make flush-db`). State it as out of scope in the requirement. |

Other lines that mention `sql` and are not sites: `collection/model.ts:393` (comment),
`recipe/model.ts:569` (docblock), `equipment/model.ts:140` (comment), `preflight.ts:29` (docblock).
The scan must skip comment lines.

Verdict: **bigger** than the review says. Besides the three missing rows (#13, #15, #16), the CASE and
NULLS LAST uses (#5-7) were approved by ADR-017 but never added to the table. Two rows are stale
(#17, #18), the `count(distinct)` row's justification is false (#1-3), and 17 fragments have no D03
comment: 7 check() lines, 5 surviving counter lines, 3 count(distinct) lines, line 701, and the
EXISTS, which has only a NOTE. AGENTS.md says every fragment must carry the D03 comment. The review's
remark that line 701 is the only one missing it is true only for fragments added by PR #172.

### 2. Root cause

The registry is prose that is checked by hand, and the scenario's grep (`` sql` ``) cannot see typed
`sql<T>` tags or postgres-js tags. D99.16 recorded the same blind spot on 2026-07-19. Wave 6 added
fragments in three tracks (t3 `lower()` and the partial index, t7 CASE/NULLS LAST and the
pre-flight). Each was documented in its own spec (unique-identifiers, advanced-search) but never in
the lint-style table.

### 3. Fix design

1. Make the registry executable: extend `packages/shared/src/lint-policy.test.ts`, the lint-style
   meta-test, which already walks `apps/*/src` and `packages/*/src` through `listScannedFiles()`.
   Reuse its `ROOT`, `Violation` and `formatViolation`. A separate file would duplicate the walker.
   ```ts
   /** Test files and test support, skipped by the raw-SQL scan. */
   const TEST_FILE = /(?:\.test\.tsx?|\/test-helpers\.ts|\/test-setup\.ts)$|\/test-fixtures\//;
   /** A raw-SQL site: a Drizzle `sql` tag (plain or typed) or the pre-flight's postgres-js `client` tag. */
   const RAW_SQL_SITE = /\b(?:sql|client)(?:<[^`\n]*>)?`/;
   /** String-built SQL, never allowed in the source trees. */
   const STRING_SQL = /\bsql\.raw\(|\.unsafe\(/;
   /** The D03 marker with a non-empty reason. */
   const D03_MARKER = /\/\/\s*D03 raw-SQL exception:\s*\S/;
   /** Lines above a site in which its D03 marker must appear. */
   const D03_WINDOW = 10;
   /** Prose lines (line, block and docblock comments) are never sites. */
   const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
   /** lint-style registry: production file → number of raw-SQL site lines. Set from the final code. */
   const RAW_SQL_REGISTRY: Record<string, number> = {
     'apps/api/src/modules/equipment/model.ts': 1,
     'apps/api/src/modules/recipe/model.ts': 11,
     'packages/db/src/preflight.ts': 1,
     'packages/db/src/schema.ts': 9,
   };
   ```
   A pure `findRawSqlSites(source, file)` returns `{ sites, violations }`. Rules: a line counts as a
   site when it matches `RAW_SQL_SITE` and is not a comment line. It is a violation when no line in
   `[L-10, L-1]` matches `D03_MARKER`. Any `STRING_SQL` match is a violation. Only `.ts`/`.tsx` files
   that do not match `TEST_FILE` are scanned. The repository test asserts that the violations list is
   empty and that the map of files with at least one site equals `RAW_SQL_REGISTRY`. The failure
   prints the actual map, so the implementer copies it after adding the spec row. The counts above
   assume the three count(distinct) sites are converted, `incrementLikes`/`decrementLikes` are deleted
   (#34), and #26 adds no new site (see Cross-track notes). Recompute them from the final code.
   - Window size: the farthest marker today is the keyset (1763 → 1770, 7 lines). For the equipment
     EXISTS, turning the `// NOTE:` line (135) into the D03 line leaves it 9 lines above 144. With 10,
     each counter function needs its own marker (1525 → 1535 is 10 lines).
   - Known limit: a postgres-js query through a client variable that is not named `client` is not
     detected. Today only `preflight.ts` runs raw postgres-js, and the per-file count still pins it.
   - Alternatives rejected: (a) the grep in the scenario, which drifted twice already; (b) a Biome
     rule: GritQL plugins could match the tag but cannot hold the per-file registry, and they add
     tooling; (c) markers only, with no count map: a new commented fragment would pass without a
     registry row, which is exactly how CASE/NULLS LAST slipped in.
2. **Convert the three `count(distinct)` sites** to `countDistinct(recipes.id)` and drop the
   now-unused `sql` imports (coffee-variety; admin still needs `type SQL`). Context7
   `/drizzle-team/drizzle-orm/0.45.4` (changelog 0.29.1): `countDistinct(users.id)` is a built-in
   aggregate helper that maps to a number. Callers wrap it in `Number(...)` today, which stays
   harmless.
3. **Add the D03 comments** listed in the inventory. Comments do not change drizzle-kit snapshots, so
   `make db-generate` must still print "No schema changes, nothing to migrate".
4. **Rewrite the registry block** (Spec impact below). Rows added: CASE/COALESCE score, NULLS LAST,
   `lower()`, partial-index predicates, migration pre-flight. Rows widened: counters (fork, comment,
   like). Rows removed: `SELECT 1`, not-featured toggle, `count(distinct)`. The requirement text also
   states that `sql.raw(`/`.unsafe(` are banned in the source trees and that dev scripts are out of
   scope.

Library facts checked (Context7):
- `/drizzle-team/drizzle-orm/0.45.4`, changelog 0.29.1: `countDistinct` exists.
- `/drizzle-team/drizzle-orm/0.45.4`, changelog 0.31.0: an index's `.where()` takes `` sql`` ``
  ("sql expression"), and expression indexes use `` sql`lower(${col})` ``.
- `/drizzle-team/drizzle-orm-docs`, guide "unique-case-insensitive-email": Drizzle ships no `lower()`
  builder; the guide defines `export function lower(email: AnyPgColumn): SQL { return sql\`lower(${email})\`; }`,
  the same helper as `schema.ts:45`.

Edge cases: comment lines that quote `` `sql` `` (four today) must not count. Typed tags
(`sql<number>`) must count. The fixture strings in `lint-policy.test.ts` itself are skipped because
it is a test file.

### 4. Tests

- `packages/shared/src/lint-policy.test.ts`: new `describe('findRawSqlSites')` self-test on
  in-memory fixtures, written first. Assertions:
  - a bare `` sql`x` `` is a violation;
  - a typed `` sql<number>`count(*)` `` with a marker 10 lines above passes, and fails at 11 lines;
  - an empty marker reason fails;
  - `` await client`select 1` `` counts as a site;
  - ` * the \`sql\` tag` and `// no sql\`false\` fragment` are not sites;
  - `sql.raw(x)` and `client.unsafe(x)` are violations.
- New repository test (`it('confines raw SQL to the lint-style registry')`): it fails first on the
  missing comments (counters, count(distinct), check(), 701, EXISTS) and on the map, and passes after
  tasks R5.2-R5.4.
- Existing tests that guard the conversions, which must pass unchanged:
  `apps/api/src/modules/coffee-variety/model.test.ts`, `apps/api/src/modules/admin/model.test.ts`,
  `apps/api/src/modules/equipment/model.test.ts` (the "count branch matches data branch" assertions).

### 5. Spec impact

**MODIFIED `lint-style`**, header `### Requirement: Raw SQL is confined to an accepted-exception registry`.
Both existing scenario names are kept, with new content. OpenSpec 1.4.1 silently drops omitted
scenarios, and newer versions reject the delta instead (see pitfalls). This full block was
trial-archived in a scratch copy of `openspec/`: it validated with `--strict` and archived cleanly.

````markdown
## MODIFIED Requirements

### Requirement: Raw SQL is confined to an accepted-exception registry

Raw SQL in production code under `apps/*/src` and `packages/*/src` SHALL be confined to the accepted-exception registry below: every Drizzle `` sql`…` `` fragment (plain or typed, `` sql<T>`…` ``) and every raw postgres-js statement SHALL match a registry row, SHALL interpolate only Drizzle tables, columns, expressions and bound values (never concatenated text), and SHALL carry a `// D03 raw-SQL exception: <why>` comment within the 10 lines above it; `sql.raw(` and postgres-js `.unsafe(` SHALL NOT appear there.

| Accepted exception | Where | Why Drizzle cannot express it |
|---|---|---|
| Atomic ±1 counters | `apps/api/src/modules/recipe/model.ts`: `forkCount` in `forkRecipe`, `commentCount` in `incrementComments`/`decrementComments`, `likeCount` in both branches of `toggleLike` | `.set()` has no increment helper; `` sql`${col} + 1` `` keeps the update atomic in one statement |
| Correlated `EXISTS` | `apps/api/src/modules/equipment/model.ts` `getRecipesUsingEquipment` (`equipmentExists`) | `exists()` correlates against the physical table name, not the relational query's `recipes` alias (see `equipment-recipe-query`) |
| Relevance score (`CASE`, `COALESCE`) | `apps/api/src/modules/recipe/model.ts` `buildListPageQuery` (two fragments) | no `CASE` or `COALESCE` builder (ADR-017) |
| `NULLS LAST` ordering | `apps/api/src/modules/recipe/model.ts` `buildListPageQuery` (the asc/desc pair) | `asc()`/`desc()` take no nulls option (ADR-017) |
| Row-value keyset comparison | `apps/api/src/modules/recipe/model.ts` `buildCursorWhere` (the asc/desc pair) | no row-value operator; `(created_at, id) < ($1, $2)` keeps `recipe_created_at_id_idx` sargable |
| `lower()` | `packages/db/src/schema.ts` `lower()` helper, used by the `user_email_lower_unique`/`user_username_lower_unique` expression indexes and the identifier lookups | no `lower()` builder (Drizzle's own case-insensitive email guide defines the same helper) |
| Schema `check()` expressions | `packages/db/src/schema.ts` (the seven `check()` constraints) | `check()` takes an SQL expression by API |
| Partial-index predicates | `packages/db/src/schema.ts` `setup_user_default_unique` `.where()` | index `.where()` takes an SQL expression, and DDL cannot carry bound parameters |
| Migration pre-flight catalog query | `packages/db/src/preflight.ts` `assertMigrationPreflight` (one postgres-js tagged template with fixed text and no interpolated values) | it runs before any migration against catalog views (`pg_extension`, `pg_available_extensions`) and `has_database_privilege()`, which have no Drizzle model |

`packages/shared/src/lint-policy.test.ts` SHALL enforce this requirement. It scans the production files of the four source trees (it skips `*.test.ts`, `*.test.tsx`, `test-helpers.ts`, `test-setup.ts`, `test-fixtures/` and comment lines) and fails with `file:line` when a fragment has no D03 comment within the 10 lines above it, when `sql.raw(` or `.unsafe(` appears, or when a file's fragment count differs from its entry in the test's `RAW_SQL_REGISTRY` map (a file without an entry allows none). A new exception therefore changes this table and that map in the same change. Developer scripts outside the source trees (`apps/api/scripts/flush-db.ts` truncates tables by schema-derived names with `.unsafe`) are out of scope.

**Reason:** The D-series waves established the registry; D99.16 converted the five sites that had drifted outside it by 2026-07-19 (`count()`, `max()`, `isNull()`, and `not()` for the featured toggle). Wave 6 then added `lower()`, the partial-index predicate and the migration pre-flight without registry rows, while the table still listed a health-probe `SELECT 1` and a featured-toggle row that no longer exist, and a `count(distinct …)` row although drizzle-orm has shipped `countDistinct()` since 0.29.1 (0.45.4 is installed, and `brew-log/model.ts` already uses it). A grep-only rule drifted twice, so the meta-test makes the registry executable.

#### Scenario: Every raw sql site is a registry entry

- **WHEN** `make test-shared` runs `lint-policy.test.ts` on the repository
- **THEN** every raw-SQL fragment it finds is in a file listed in `RAW_SQL_REGISTRY` with a matching count, each fragment has a `// D03 raw-SQL exception:` comment within the 10 lines above it, and the test passes

#### Scenario: Converted sites behave identically

- **WHEN** the three `` sql<number>`count(distinct ${recipes.id})` `` selects in `coffee-variety/model.ts`, `admin/model.ts` and `equipment/model.ts` are rewritten with `countDistinct(recipes.id)` and `make test-api` runs
- **THEN** the existing count assertions for `getRecipesUsingVariety`, `getVarietyRecipeCount` and `getRecipesUsingEquipment` pass unchanged

#### Scenario: An unregistered fragment fails the tests

- **WHEN** a contributor adds a new commented `sql` fragment to `apps/api/src/modules/recipe/model.ts` without updating the registry
- **THEN** `make test-shared` fails and names the file with its expected and actual fragment counts

#### Scenario: A fragment without its D03 comment fails the tests

- **WHEN** a raw-SQL fragment has no `// D03 raw-SQL exception: <why>` comment, or one with an empty reason, in the 10 lines above it
- **THEN** `make test-shared` fails with that `file:line`

#### Scenario: String-built SQL is rejected

- **WHEN** `sql.raw(` or `.unsafe(` appears in a production file under `apps/*/src` or `packages/*/src`
- **THEN** `make test-shared` fails with that `file:line`
````

If #26 widens `lower()` to take a bound value, change the `lower()` row's "Where" cell to
"`lower()` helper over a column or a bound identifier value". Keep it one site; see Cross-track
notes.

**RENAMED + MODIFIED `equipment-recipe-query`** (recommended, in scope of "the registry is
accurate"). Its first requirement still prescribes the `exists()` rewrite that Wave 2 abandoned. The
code (`equipment/model.ts:135-144`, git history: since `86ab9f5`, 2026-07-06) and
`plans/TECHNICAL_DEBT.md` §1.3 say the `sql` EXISTS was kept, and the new registry row points at
that spec. Converting the count to `countDistinct` also contradicts
`### Requirement: getRecipesUsingEquipment retains the count branch's innerJoin chain`, which says
"The `sql<number>\`count(distinct …)\`` expression SHALL be retained (Drizzle's `count()` helper does
not support `DISTINCT` …)". This delta was trial-archived too.

````markdown
## RENAMED Requirements

- FROM: `### Requirement: Equipment recipe query uses the Drizzle query builder exclusively`
- TO: `### Requirement: Equipment recipe query keeps its correlated EXISTS as a registered raw-SQL exception`

## MODIFIED Requirements

### Requirement: Equipment recipe query keeps its correlated EXISTS as a registered raw-SQL exception

The `getRecipesUsingEquipment` function in `apps/api/src/modules/equipment/model.ts` SHALL select the recipes linked to the equipment through one correlated `EXISTS` subquery written as a Drizzle `sql` fragment (`equipmentExists`) that interpolates only Drizzle tables, columns and the bound `equipmentId`, carries a `// D03 raw-SQL exception:` comment and is the "Correlated `EXISTS`" row of the lint-style raw-SQL registry; every other part of the query SHALL use the Drizzle query builder.

Drizzle's `exists()` combinator cannot be used here: under the relational `db.query.recipes.findMany` API the outer table is aliased (`"recipe" "recipes"`), and an `exists()` subquery correlates `recipes.currentVersionId` against the physical table name, which PostgreSQL rejects with "invalid reference to FROM-clause entry". The `sql` fragment resolves `${recipes.currentVersionId}` against the aliased outer query.

**Reason:** The D03 plan replaced the raw `IN (...)` subquery with `exists()`, but that rewrite failed against the relational-query alias, so Wave 2 kept a documented `sql` `EXISTS` (`plans/TECHNICAL_DEBT.md` §1.3: "resolved with an accepted, documented raw-SQL exception"). This requirement still described the abandoned rewrite; it now matches the code and the registry.

#### Scenario: getRecipesUsingEquipment returns public recipes linked to the equipment

- **WHEN** `getRecipesUsingEquipment(equipmentId, 1, 10)` is called with the ID of an equipment that is linked (via `recipeEquipment`) to several recipes' current versions, where some of those recipes are `public` and some are `draft`/`private`/`unlisted`
- **THEN** only the `public` recipes appear in `data`, and `total` reflects the count of public recipes

#### Scenario: getRecipesUsingEquipment excludes soft-deleted recipes

- **WHEN** `getRecipesUsingEquipment(equipmentId, 1, 10)` is called and some of the linked public recipes have `deletedAt` set
- **THEN** the soft-deleted recipes do NOT appear in `data` and are NOT counted in `total`

#### Scenario: getRecipesUsingEquipment paginates correctly

- **WHEN** `getRecipesUsingEquipment(equipmentId, 2, 5)` is called with 12 matching public recipes
- **THEN** `data` contains 5 recipes (page 2, offset 5), ordered by `createdAt DESC`, and `total` is 12

#### Scenario: getRecipesUsingEquipment joins the author relation

- **WHEN** `getRecipesUsingEquipment` returns a recipe
- **THEN** each recipe in `data` has an `author` object with `username`, `displayName`, and `avatarUrl` fields

#### Scenario: getRecipesUsingEquipment count branch matches data branch

- **WHEN** `getRecipesUsingEquipment(equipmentId, 1, 10)` is called with any set of linked recipes
- **THEN** `total` equals the number of rows the data branch WOULD return if `limit`/`offset` were removed (the count and data branches use the same filtering logic)

### Requirement: getRecipesUsingEquipment retains the count branch's innerJoin chain

The count branch SHALL keep its Drizzle `innerJoin` chain (`recipes → recipeVersions → recipeEquipment`) filtered by `eq(recipeEquipment.equipmentId, equipmentId)` and the shared `recipeConditions`, and SHALL count with Drizzle's `countDistinct(recipes.id)` helper instead of a raw `` sql<number>`count(distinct …)` `` fragment.

**Reason:** The earlier text kept the raw fragment because "Drizzle's `count()` helper does not support `DISTINCT`". drizzle-orm has shipped `countDistinct()` since 0.29.1 (0.45.4 is installed, and `brew-log/model.ts` already uses it), so the fragment is not an accepted raw-SQL exception (lint-style registry).

#### Scenario: Count branch uses innerJoin, not a subquery

- **WHEN** the source of `getRecipesUsingEquipment` is inspected at the count branch
- **THEN** the query uses `db.select({ count: countDistinct(recipes.id) }).from(recipes).innerJoin(recipeVersions, ...).innerJoin(recipeEquipment, ...).where(and(eq(recipeEquipment.equipmentId, equipmentId), recipeConditions))` — NOT a subquery
````

The `equipment-recipe-query` Purpose ("Replaces the sole raw-SQL violation … with a Drizzle
`exists()` correlated subquery") cannot be changed by a delta: a delta Purpose is ignored for an
existing capability. Edit `openspec/specs/equipment-recipe-query/spec.md` → `## Purpose` directly
after archiving, the same way wave 6 backfilled Purposes. Note also that archiving moves the renamed
requirement to the end of that spec (verified quirk, harmless).

### 6. Docs / ledger impact

- `AGENTS.md` → "Database rules", the raw-SQL bullet (lines 141-150). Append: "`packages/shared/src/lint-policy.test.ts`
  (`make test-shared`) enforces the registry: a fragment needs the D03 comment within the 10 lines
  above it, `sql.raw(`/`.unsafe(` are rejected under `apps/*/src` and `packages/*/src`, and each
  file's fragment count must match the test's `RAW_SQL_REGISTRY`, so a new exception updates the
  spec row and that map together."
- `docs/architecture.md:159-165` ("mirror `AGENTS.md`"). It lacks the clause "only for a use listed
  in the accepted-exception registry of the `lint-style` spec". Add it plus the enforcement
  sentence. The advanced-search requirement "Search architecture decision recorded in project rules"
  requires the two to match.
- `docs/decisions.md` ADR-004 trade-off (line 121) says "approved raw-SQL fragments are listed in
  ADR-017", which is incomplete. Optionally repoint it to the lint-style registry. ADR-004 is
  Accepted, not superseded, so this pointer edit is allowed.
- Ledger: nothing open. D99.16 (resolved 2026-07-27) created the registry; leave that history
  unedited.
- No OpenAPI or `docs/api-reference.md` change.

### 7. Draft tasks

- [ ] R5.1 Write the failing raw-SQL tests in `packages/shared/src/lint-policy.test.ts`: the pure
  `findRawSqlSites(source, file)` self-test on in-memory fixtures (plain and typed `sql` tags and the
  postgres-js `client` tag are sites; `//`, `/*` and ` *` lines are not; a marker
  `// D03 raw-SQL exception: <why>` 10 lines above passes, 11 lines above or an empty reason fails;
  `sql.raw(` and `.unsafe(` always fail) and the repository test comparing per-file site counts with
  `RAW_SQL_REGISTRY` and requiring a marker per site. Update the module docblock (it now also covers
  lint-style "Raw SQL is confined to an accepted-exception registry"). Run
  `make test-specific filter=src/lint-policy.test.ts` and confirm it fails on the missing comments.
- [ ] R5.2 Replace the three `` sql<number>`count(distinct ${recipes.id})` `` selects with
  `countDistinct(recipes.id)` from `drizzle-orm` in `apps/api/src/modules/coffee-variety/model.ts`
  (`getRecipesUsingVariety`), `apps/api/src/modules/admin/model.ts` (`getVarietyRecipeCount`) and
  `apps/api/src/modules/equipment/model.ts` (`getRecipesUsingEquipment`). Remove the now-unused `sql`
  imports. Run `make test-specific filter=src/modules/coffee-variety`,
  `make test-specific filter=src/modules/admin/model.test.ts` and
  `make test-specific filter=src/modules/equipment/model.test.ts`: totals unchanged.
- [ ] R5.3 Add a `// D03 raw-SQL exception: <why>` comment directly above each remaining fragment:
  `forkRecipe` (`recipe/model.ts:1137`), `incrementComments`, `decrementComments`, both branches of
  `toggleLike`, the `equipmentExists` statement (turn the `// NOTE:` first line into the D03 line and
  keep the explanation), the `check()` lines in `packages/db/src/schema.ts` (329, 357, 858, 896, one
  comment above 1194-1196) and the `setup_user_default_unique` `.where(...)` (701). Run
  `make db-generate`: it must print "No schema changes, nothing to migrate".
- [ ] R5.4 After the #26 `lower()` change and the #34 deletions have landed, set `RAW_SQL_REGISTRY`
  from the test's printed actual map and make R5.1 pass (`make test-shared`).
- [ ] R5.5 Write `openspec/changes/wave-6-review-remediation/specs/lint-style/spec.md` (the MODIFIED
  block above, with the `lower()` row matching #26's final helper) and
  `specs/equipment-recipe-query/spec.md` (RENAMED + 2 MODIFIED above). After archiving, rewrite the
  `equipment-recipe-query` Purpose in `openspec/specs/equipment-recipe-query/spec.md` directly.
- [ ] R5.6 Update the `AGENTS.md` "Database rules" raw-SQL bullet and `docs/architecture.md`
  "Database rules" (registry clause + enforcement sentence), and optionally the ADR-004 pointer in
  `docs/decisions.md`.
- [ ] R5.7 Run `make check`, `make lint` (read warnings), `make test-shared`, `make test-api`,
  `make fmt`, `make docs-check`.

### 8. Risks / migration notes

No data or schema change: comments and `countDistinct` only, so `make db-generate` stays clean. The
window rule is a heuristic: a marker 10 lines up could cover an unrelated new fragment, but the
per-file count still fails. Self-hosters are unaffected.

---

## Debt-ledger mapping (all 34 findings)

Sources searched: `plans/D99-debts.md` (D99.1-.62), `plans/TECHNICAL_DEBT.md` (open: §3.10 = D99.20,
§3.11 = D99.21), `plans/ROADMAP.md` (status table), wave-6 `proposal.md` → Non-Goals, `design.md` →
"Risks / Trade-offs" and "Follow-ups recorded in the debt ledger".

| # | Ledger / wave-6 record | Action |
|---|---|---|
| 1 | none (new in PR #172) | none |
| 2 | none. Wave-6 design Migration Plan §5 ("No data needs undoing") and the production-operations rollback text rely on this restore. | none |
| 3 | none. D99.47 (immutable caching of the web edge's `/assets/*`) and D99.30 (upload-side limits) are related only. | none |
| 4 | none. **Same bug class as D99.61** (taste search, unescaped case-sensitive `like`). | none; recommend closing D99.61 in the same task (same helpers, one test); see Cross-track notes |
| 5 | **D99.42** (Open, P2): "Cross-recipe comment replies" | **close**: `## D99.42 — … — ✅ Resolved (2026-11-2x, wave-6-review-remediation)`; remove the ROADMAP P2 row. D99.59 (thread-author reply button) touches the same function and stays open. |
| 6 | not in the ledger. Wave-6 design t2 risk: "Failure-only counting is check-then-act, so parallel wrong passwords can exceed 5 → Accepted: bounded by `auth-login-ip`". | none; the new design.md must say it reverses that accepted risk |
| 7 | none (inside wave-6 manual check 16.9) | none |
| 8 | none | none |
| 9 | none | none |
| 10 | none | none |
| 11 | none | none |
| 12 | **D99.52** (Accepted, user decision 2026-11-19) and wave-6 Non-Goal "Production demo-account seed … The seed is unchanged" | **close** once the user confirms (the revisit trigger is met: GHCR images plus a self-hosting guide); remove the ROADMAP P4 row |
| 13 | none. Wave-6 t4b risk on `private_ranges` with rootless Docker/NAT is related. | none |
| 14 | none | none |
| 15 | none (D99.35 is the analogous `extractionTimeSeconds` bound) | none |
| 16 | none (D99.8 resolved: the keyset rewrite; leave the history) | none |
| 17 | none | none |
| 18 | none. **Mirror of D99.50** (`/ready` shows `cache: "ok"` while Valkey is down). | none; D99.50 stays open unless that track folds it |
| 19 | none (wave-6 19.27; D99.32 Playwright screenshots) | none |
| 20 | none (related: D99.24 guessable unlisted URLs, D99.25 visibility of like/rate) | none |
| 21 | none | none |
| 22 | none (TECHNICAL_DEBT §3.8 is a resolved, different bug) | none |
| 23 | none (D18 / TECHNICAL_DEBT §4.4 resolved) | none |
| 24 | none | none |
| 25 | none | none |
| 26 | none. Wave-6 design t7 risk: "Case folding depends on the DB ctype → Unchanged … **A Turkish collation is a follow-up**". **That follow-up was never ledgered.** | none for identifiers; optionally add a D99 entry "Locale-aware case folding for search (Turkish I/ı)" (P4) |
| 27 | none | none |
| 28 | none | none |
| 29 | none | none |
| 30 | none | none |
| 31 | none (D99.21 is the related setup-default trap; it stays open) | none |
| 32 | none open (D99.16 resolved, history) | none |
| 33 | none (D99.58 is the robots `Sitemap:` URL) | if the fix caps at 50,000 URLs without a sitemap index, add a D99 entry "Sitemap index past 50,000 URLs" (P4) |
| 34 | **D99.51** (Open, P4): "Unused `recipe/model.ts#update`". Not in the review's list, but the same class in the same file. Verified still unused (`recipe/service.ts` imports `* as model` and never calls `model.update`). | **close** in the #34 task (delete `update` and the tests that cover only it); remove the ROADMAP P4 row |

Ledger edits when closing:
- `plans/D99-debts.md`: change each closed heading to `— ✅ Resolved (<date>, wave-6-review-remediation)` with
  a `> **Resolved …**` line, as D99.17 does. Update the header status line 4 ("**D99.20–.62 open**")
  to name the exceptions.
- `plans/ROADMAP.md`: remove the D99.42/.51/.52 rows. Line 45 ("The open items are D44 and
  D99.20–.62") must name the exceptions. Add a History bullet for this change. Any link to the new
  archive must use the real `openspec/changes/archive/<YYYY-MM-DD>-wave-6-review-remediation/`
  folder name: ROADMAP is link-checked.
- `plans/TECHNICAL_DEBT.md`: no change needed. Its summary row points to ROADMAP, and the file is
  outside every doc-drift scan.
- New entries go after D99.62 as D99.63+ in the compact wave-6 style (status line, evidence line,
  fix line).

## Wave-6 decisions and spec text that the fixes contradict (MODIFY, not ADD)

| Fix | Contradicted text | Delta |
|---|---|---|
| #1 | `recipe-write` "Referenced records are validated before writing" ("Checks (all excluding soft-deleted rows): every `tasteNoteIds` entry exists; …"; only `beanId` carry-forward is exempt). Also `recipe-write` "Coffee variety is linkable and persisted", scenario "Unknown variety is rejected" (a soft-deleted id on update → 400). | MODIFY both (exempt ids already on the current version) |
| #2, #29 | `production-operations` "Restore, upgrade and rollback runbook" ("run `pg_restore --clean --if-exists --no-owner` …"; "`make prod-restore` SHALL stop `api` and `web`, run the restore service …, and start the stack again"). Wave-6 Migration Plan §5. | MODIFY |
| #6 | `api-rate-limiting` "Login is protected per IP and per account" ("Failure-only policies SHALL check the counter before the handler runs … consume one point only when the response status is 401"). Wave-6 design t2 accepted risk. `docs/auth.md:126` says the same. | MODIFY |
| #8 | `optimistic-rollback` "Resource route actions return error data instead of throwing" names only like/favourite/follow (`web-data-loading` "Mutations go through route actions …" already covers rate) | MODIFY, optional (add rate) |
| #9 | `web-data-loading` "Auth-guarded loaders redirect to login with a return path" ("Every loader and action of an auth-guarded route SHALL be wrapped by … `requireAuth` … `redirect('/login?next=…')`"). `web-data-loading` "API client supports cancellation, single-flight refresh and defensive parsing" has no refresh-skip rule. | MODIFY both |
| #10 | `production-operations` "Uploads are backed up with the database when stored locally" (no rule for tar exit 1) | MODIFY (add scenario) |
| #11 | `container-deployment` "Docker build context excludes local state and nested artifacts" (the fixed list of excluded dirs) | MODIFY |
| #12 | Wave-6 proposal Non-Goal plus D99.52 (user decision). `container-deployment` "Entrypoint runs seed only on first boot" defers seed content to "the seed capability", **which does not exist** in `openspec/specs/`. | ADD a requirement (new or existing capability) plus user confirmation |
| #17 | `advanced-search` "Date range filter" ("inclusive on both ends (`>= dateFrom AND <= dateTo`)"; the literal operator conflicts with `lt(createdAt, dateTo + 1 day)`) | MODIFY wording + same-day scenario |
| #18 | `api-rate-limiting` "Limiter degrades safely when the shared store is unavailable" (recovery is logged "once on recovery", tied to `ready`) | MODIFY (scenario: a command error without reconnect recovers on the next success) |
| #21 | `chart-rendering` "Shared chart primitives module" (`niceTicks(min, max, maxCount)` contract) | MODIFY (return `null` for unsafe bounds) |
| #23 | `optimistic-rollback` "Optimistic UI rollback on action failure" (revert to `initialLiked`/`initialCount`/`initialFollowing`; success item 5, "show the original state from props until loader revalidation", never resolves because `web-data-loading` forbids detail revalidation for social toggles). Also "Error path test coverage for button components" (`onToggleRollback` called with `initialFollowing`). | MODIFY both |
| #26 | `unique-identifiers`: "Email and username lookups are case-insensitive" (`eq(lower(<column>), value.toLowerCase())`); "Email addresses are normalized before validation, storage and lookup" ("`toLowerCase()` and Postgres `lower()` agree"); "Email and username uniqueness is case-insensitive at the database level" (`lower(column: AnyPgColumn): SQL`). Wave-6 t7 risk. `AGENTS.md:164`, `docs/architecture.md:44,181`, `docs/auth.md:268-282`. | MODIFY (3) |
| #32 | `lint-style` registry; `equipment-recipe-query` (2 requirements, pre-existing drift) | MODIFY; RENAMED + MODIFIED |
| #34 | `recipe-visibility` "An enforcement test keeps every recipe listing on the shared condition" lists `comment#getRecipeAuthorId` among the expected exemptions | MODIFY (drop it) |
| #5, #3, #13, #20, #33 | no contradiction: `comment-authz` keeps 403 "only where it already exists, e.g. the reply-permission rule", so a foreign parent → 404 is additive. QR text in `recipe-visibility` names no status code. | ADD scenarios/requirements |
| #24 | Wave-6 t5 risk ("opt out only for optimistic actions whose result carries the new state"): the code broke the design, and the fix restores it | none / ADD scenario |

## Wave-6 leftovers

Exact unticked text in `openspec/changes/archive/2026-11-21-wave-6-audit-remediation/tasks.md`:

- **10.36** (line 670): "Manual acceptance: with the dev stack up, run `GET /api/v1/recipes?search=a&perPage=20`
  and `?search=espresso&page=2`. Confirm 20 items, no `versions` keys, the correct
  `meta.pagination.total`, and `sortBy=rating` ordering in the UI ("Top rated"). Paste
  `EXPLAIN (ANALYZE, BUFFERS)` of the search page query (with `enable_seqscan = off`) into the PR
  description."
- **16.9** (line 853): "Manually verify in `make dev`: each of the five admin pages opens; `/recipes`
  Next/Prev keeps filters and Back/Forward works; typing in search produces one history entry;
  `/settings` while signed out redirects to `/login?next=%2Fsettings` and returns after login"
- **17.22** (line 912): "Manual smoke test with `make dev`: As user B on user A's recipe: save,
  reload and delete a private note, and confirm A's brewer note is unchanged. / As A: edit
  `grindSize` without the checkbox and confirm it persists with no new version. / As A: tick the
  checkbox and confirm a new version keeps taste notes and equipment. / Clear the grinder and
  confirm it is gone. / Set a coffee variety and confirm the recipe appears on
  `/coffee-varieties/:id`."
- **19.27** (line 1014): visual check at 320/375/768/1024/1280 px × light/dark/coffee × en/tr:
  blue-mountain cold brew axis ≤ 8 labels and a `12h` card; espresso 28s/5s and 27s/6s phase labels;
  a 9-category radar; a single-category vertex; focus mode; print preview; keyboard-only rating;
  VoiceOver; "Record deviations in the PR description."
- **29.14** (line 1385): post-merge half pending: "After merge, confirm `publish` runs only after
  `quality`, `test`, `images` and `doc-drift` pass and that GHCR shows `latest` and `<sha>` for both
  images. On a personal fork, push a throwaway `v0.0.0-rc` tag, confirm the run does not move
  `latest`, then delete the tag." The status note records run 44887464763 green, with publish
  skipped.

How to carry them: they are manual and cannot be automated here. The fixes change exactly what three
of them check (#7 and #9 → 16.9; #1 → 17.22; #19, #21, #34 → 19.27). Run them once, after the fixes,
on the final branch.

- [ ] R5.8 After the web fixes for #7 and #9, run wave-6 check 16.9 as written, plus: type `latte`
  and click a brew-method chip within 300 ms (the URL keeps `search=latte` and `brewMethod`); type
  into search and then author (both stay); with an expired access token (older than 15 min) and a
  valid refresh cookie, click "Resend verification" (no logout) and mark a notification read (no
  redirect to a `/resources/...` path, a toast instead). Record the result in the PR description.
- [ ] R5.9 After #1, run wave-6 check 17.22 as written, plus: as admin soft-delete a taste note that
  A's recipe uses; as A, change only the title, save (200), and confirm the taste note is still
  linked.
- [ ] R5.10 After the chart fixes (#19, #21, #34), run wave-6 check 19.27's matrix. In dark and
  coffee themes, confirm the BrewTimeline phase titles are legible on both the pre-infusion and the
  extraction background. Record deviations in the PR description.
- [ ] R5.11 After #16 and #17, run wave-6 check 10.36 once on the final branch and paste the
  `EXPLAIN (ANALYZE, BUFFERS)` output into the description of the PR that merges these fixes.
- [ ] R5.12 After the merge, do the post-merge half of wave-6 29.14 (publish ordering, GHCR
  `latest`/`<sha>` for both images, the fork `v0.0.0-rc` tag test).
- If the fixes land on `wave-6-audit-remediation` before merge, the archived wave-6 `tasks.md` is
  still editable in the PR. Add a `Status: carried to wave-6-review-remediation R5.x` sub-bullet
  under 10.36/16.9/17.22/19.27/29.14, the pattern 29.12/29.14 already use, rather than ticking boxes
  that were not done in wave 6.

## Process facts for the assembler

### Branch strategy (facts, no decision)

- `gh pr view 172`: `state: OPEN`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`,
  `isDraft: false`, no review decision. Checks: doc-drift, quality, test, images SUCCESS; publish
  SKIPPED; CodeRabbit SKIPPED. Head `e18f2bd` = local `HEAD` = `origin/wave-6-audit-remediation`;
  103 commits ahead of `main`. `main` has not moved since the merge-base `ada9f6e`, so no conflicts
  are pending.
- `main` is **not protected** (`gh api …/branches/main/protection` → 404 "Branch not protected").
  Wave-6 Migration Plan step 5 enables protection only after the merge.
- `.github/workflows/ci.yml`: `publish` runs on pushes to `main` and on `v*` tags after every other
  job passes. **Merging PR #172 as it is publishes `latest` and `<sha>` to GHCR** with #2
  (half-restore rollback), #3 (unauthenticated OOM through `/uploads`), #11 (`make images` fails or
  ships data) and #12 (demo accounts with a published password on every fresh install). The new
  self-hosting guide points self-hosters at that image.
- Option A, fix on `wave-6-audit-remediation` before the merge: one PR, one publish, and the wave-6
  29.14 post-merge checks run once. This change is archived on the same branch (as wave 6 was). The
  PR #172 description needs the new BREAKING items and evidence. The PR grows past 103 commits.
- Option B, a new branch after the merge: a smaller, separately reviewable PR, but a vulnerable
  `latest` exists until it lands, plus a second release. Wave-6 29.14 then completes on the PR #172
  merge.
- The untracked `pontytail-review-result.md` at the repo root is a root-level `*.md`, so it is in the
  doc-drift documentation scope from the working tree whether or not it is committed. It is clean
  today (`node scripts/doc-drift-check.ts` → "no findings"). Do not commit it; the review lives in
  `audit/review.md`.

### ADR

- The next free number is **ADR-022** (`AGENTS.md:395`; `docs/decisions.md:37`, "ADR-022 onwards").
  If one is added, update both places to ADR-023 and add an index row.
- No fix needs a new ADR:
  - #2 (restore strategy) is runbook detail inside `production-operations`; no ADR covers backups.
  - #6 (consume first, then refund): ADR-016 says only "Login follows the OWASP failure-counting
    pattern" and never says check-then-act, so it stays accurate. Update `docs/auth.md:126` and the
    spec.
  - #12 (demo-seed policy) reverses a recorded **user decision** (D99.52, wave-6 Non-Goal) and needs
    the user's confirmation. Record the reason in proposal.md/design.md and in the D99.52 closure; the
    seed's contents are not an architectural decision. The review's minimum alternative (a warning
    and a cleanup step in both guides) keeps the decision in place.
  - #26 (`lower()` on both sides) is a database rule that lives in `AGENTS.md` and
    `unique-identifiers`; no ADR covers identifier comparison.
  - #32: the lint-style spec plus `AGENTS.md`. Optionally repoint ADR-004's sentence that sends the
    reader to ADR-017.

### Docs each fix touches (grep-verified where a path is given; "check" = verify the wording)

| # | AGENTS.md | docs/ and others |
|---|---|---|
| 1 | none | check `docs/recipes.md:62` ("referenced records" validation wording) |
| 2 | none | `docs/deployment_compose.md` §11 (415-422: "runs `pg_restore --clean --if-exists --no-owner` into the running database") and the rollback text at 448-449; `docs/deployment_coolify.md:642` (rollback note) |
| 3 | the middleware bullet stays true | `docs/api.md` (uploads reads: add `Cache-Control: public, max-age=31536000, immutable`); check `docs/request-lifecycle.md` |
| 4 | none | none |
| 5 | none | `docs/comments.md` reply rules (31-40): a foreign parent → 404 `COMMENT_NOT_FOUND`; regenerate `docs/api-reference.md` if `describeRoute` responses change |
| 6 | none | `docs/auth.md:126` |
| 7 | the "URL state" bullet stays | none |
| 8 | none | none |
| 9 | the "Web data loading" → **Auth** bullet ("guarded loaders and actions are wrapped in requireAuth … redirect a 401 to /login?next=") needs the resource-action exception | check the requireAuth paragraph in `docs/architecture.md` |
| 10 | none | `docs/deployment_compose.md` backups section |
| 11 | none | check `docs/deployment_compose.md` §7 (`./data/*` examples) |
| 12 | check the seed bullets | `docs/deployment_compose.md`, `docs/deployment_coolify.md` (first boot, plus a cleanup step for existing installs), `README.md` (seed/admin text), `docs/docker.md`, `.env.production.example` |
| 13 | none | `docs/deployment_compose.md` §5 (front proxy must set `X-Forwarded-For`), `.env.production.example` (`TRUSTED_PROXIES` comment) |
| 14 | none | none |
| 15 | none | regenerate `docs/api-reference.md` (schema `maxItems`) |
| 16 | none | check the cursor section of `docs/api.md`; migration notes in the PR |
| 17 | none | `docs/api.md:197` already says inclusive |
| 18 | none | none |
| 19, 21, 23, 24, 25 | none | none |
| 20 | none | `docs/api.md` (QR status), regenerate `docs/api-reference.md` |
| 22 | none | check `docs/auth.md` (logout) |
| 26 | "Case-insensitive identifiers" bullet (`AGENTS.md:164`) | `docs/architecture.md:44,181`; `docs/auth.md:268-282` |
| 27 | none | optional: the `S3_PUBLIC_URL` rows in both guides and `.env.production.example` |
| 28, 31, 34 | none | none |
| 29 | none | `docs/deployment_compose.md:234` (Makefile table) and §11; `docs/docker.md:94` |
| 30 | none | `docs/deployment_coolify.md:677` |
| 32 | "Database rules" raw-SQL bullet | `docs/architecture.md:159-165`; optionally the ADR-004 pointer |
| 33 | the bounded-reads rule stays (the fix complies) | `docs/seo.md` → Sitemap |
| all | none | `plans/D99-debts.md`, `plans/ROADMAP.md`, the PR description ("Docs & specs" checklist) |

### Doc-drift implications

- `openspec/changes/**` is outside every content scan (`isExcluded`, `scripts/doc-drift-check.ts:95-97`).
  The change folder, its audit notes and links inside it need nothing special.
- At archive time:
  - every `specs/<capability>/` must exist in `openspec/specs/` (rule `archived-capability`);
  - a **new** capability gets the placeholder Purpose "TBD - created by archiving change", which the
    `purpose` rule rejects until it is backfilled (AGENTS.md OpenSpec rule);
  - an all-REMOVED delta must never be shipped.
- `docs/**/*.md`, `AGENTS.md`, `README.md`, `plans/ROADMAP.md` and `plans/F*.md` are link-checked.
  `plans/D99-debts.md` is not.
- `make docs-check` also runs `scripts/docblock-scan.ts --check`, so every new or changed exported
  production symbol needs a `/** */` docblock.

## Doc-drift scope gaps (prompt item 5): out of scope

- Verified in `scripts/doc-drift-check.ts:128-164`. `codeScope` covers `apps/`, `packages/`,
  `scripts/`, `.github/`, `.githooks/` and the root files `Dockerfile*`, `compose*.yml`,
  `docker-*.sh`, `.env*.example`, `Makefile`, `pnpm-workspace.yaml` and `renovate.json`. So
  `package.json`, `biome.json`, `tsconfig.json`, `.dockerignore` and the root `Caddyfile` are indeed
  not scanned. (`apps/web/Caddyfile` is scanned. The root `Caddyfile` is the live `:8080` preview
  config mounted by `compose.yml:218`, not a remnant.)
- **No concrete drift case.** A remnant-pattern grep over those five files finds 0 matches. Adding
  them would also require a MODIFIED `doc-drift-check` and `node-runtime` requirement (both
  enumerate the scope) for zero findings.
- The `plans/D*.md`, `plans/TECHNICAL_DEBT.md` and `plans/AUDIT-*.md` allowlist entries do exempt
  files that no scan reads (`docScope` takes only `plans/ROADMAP.md` and `plans/F*.md`; `codeScope`
  skips `plans/`). They are harmless, and they are **mandated verbatim** by `doc-drift-check` "Allowlist
  entries are explicit, justified and minimal" ("The initial allowlist SHALL be limited to: … `plans/D*.md`,
  `plans/TECHNICAL_DEBT.md` and `plans/AUDIT-*.md` …"). Removing them means a spec change with no
  behaviour change.
- The only real remnant found outside the scan: `.gitignore:13-14` (`# Deno` / `.deno/`). It is
  harmless. If anyone wants it gone, delete the two lines; that needs no scanner change.

## OpenSpec delta rules and pitfalls (verified)

Read: wave-6 deltas `lint-style` (RENAMED + MODIFIED), `container-deployment` (MODIFIED + REMOVED
with `**Reason**`/`**Migration**` + ADDED), `recipe-write`, `unique-identifiers`, `web-data-loading`.
Context7 `/fission-ai/openspec`: a MODIFIED delta must hold the complete requirement, uses the same
header text, and is matched with case-sensitive equality after trimming; after a RENAME, MODIFIED
uses the NEW header; REMOVED needs Reason and Migration.

I tested the installed CLI (`openspec --version` → 1.4.1) on a scratch copy of `openspec/`. Results:

1. **A header that differs in letter case passes `openspec validate --strict` but makes `openspec archive` abort**:
   `lint-style MODIFIED failed for header "### Requirement: Raw sql is confined …" - not found. Aborted.`
   The same happens with an ADDED header that already exists: `… ADDED failed … - already exists`.
   `validate` does not catch either.
   **Before archiving, run a trial archive on a copy:**
   `cp -R openspec <scratch>/ && cd <scratch> && openspec archive wave-6-review-remediation -y`.
2. The first line after `### Requirement:` must contain SHALL or MUST. Otherwise `--strict` fails:
   `MODIFIED "…" must contain SHALL or MUST`. A blank line between the header and that line is fine.
3. **MODIFIED replaces the whole block, and omitted scenarios are deleted silently** in 1.4.1
   (verified). Newer OpenSpec versions reject the delta instead ("MODIFIED … omits scenario(s) the
   current spec still has", Context7 troubleshooting). Keep every surviving scenario name, rewriting
   its content if needed. The lint-style draft above does this.
4. Archiving with RENAMED moves the renamed requirement to the **end** of the main spec (verified;
   the existing lint-style spec shows the same effect from wave 6). Harmless.
5. `- WHEN` without bold passes validation. Keep the house style `- **WHEN**` / `- **THEN**`
   anyway.
6. A delta `## Purpose` is ignored for an existing capability. Edit the main spec's Purpose directly
   when it is wrong (equipment-recipe-query).
7. Never ship an all-REMOVED delta. Delete the capability folder and list it in
   `retiredCapabilities` instead (AGENTS.md).
8. Copy each MODIFIED block from the **current** `openspec/specs/<cap>/spec.md` (not the wave-6
   delta), because archiving may have normalised it. Paste it whole, then edit.

## Cross-track notes

1. **New problem: other catalog searches have the #4 bug** (case-sensitive, unescaped `like`), not in
   the review and not ledgered except taste (D99.61): `equipment/model.ts:50-52` (`search`, used by
   the recipe editor's server-side EquipmentPicker) and `:100-102` (list `search`),
   `vendor/model.ts:46`, `admin/model.ts:687-689` (admin coffee varieties), `taste/model.ts:40`
   (D99.61) and `user/model.ts:171` (`searchUsers`, dead per #34). Concrete case: typing `hario`
   never finds equipment branded `Hario`, and `_` matches every row. Owner: the #4 track. Either use
   `ilike` + `toContainsPattern(normalizeSearchTerm(q))` everywhere (and close D99.61) or add one
   D99 entry.
2. **#26 and the registry:** to keep the raw-SQL site count at one, consider widening the existing
   helper to `lower(value: AnyPgColumn | string): SQL` instead of adding a second fragment. The #26
   track must verify, with Context7 (postgres-js and PostgreSQL function resolution), that a bound
   text parameter resolves `lower(unknown)` to `lower(text)`. Specs and docs to change:
   `unique-identifiers` (3 requirements), `AGENTS.md:164`, `docs/architecture.md:44,181`,
   `docs/auth.md:268-282`.
3. **#12:** `container-deployment` "Entrypoint runs seed only on first boot" says seed contents are
   "defined by the seed capability", but `openspec/specs/` has no seed capability. The #12 track must
   ADD one or put the production rule in an existing capability. It also reverses user decision
   D99.52, which needs confirmation.
4. **#16 and #2 ordering:** a `precision: 3` migration means that rolling back across it needs a
   restore (production-operations rollback text), and a restore only works after #2's fix. Ship them
   together and mention the order in the upgrade notes. Casting timestamp(6) to timestamp(3) rounds
   existing values; the #16 track should confirm with Context7/PostgreSQL that the `(created_at, id)`
   ordering stays deterministic.
5. **#34:** delete only `admin/model.ts` `isEmailTaken`/`isUsernameTaken`. The `auth/model.ts` copies
   are live (`auth/service.ts:111,120`), and the wave-6 design default says a future OAuth flow must
   use the `lower()`-aware `isUsernameTaken` (auth's). Fold D99.51 (`recipe/model.ts#update`, verified
   unused) into the same task. Deleting `getRecipeAuthorId` forces a MODIFY of the `recipe-visibility`
   enforcement-test requirement and the removal of the `EXEMPT_UNITS` entry
   (`visibility.enforcement.test.ts:48`; stale entries fail the test).
6. **#23:** the `optimistic-rollback` spec contradicts `web-data-loading`. Success item 5 waits for a
   revalidation that `web-data-loading` forbids for social toggles. The fix must MODIFY
   `optimistic-rollback` to roll back to the last confirmed value.
7. **#18 / D99.50:** these are the same class of problem (readiness reports a stale Valkey state for
   the limiter and for the cache). Consider closing D99.50 in the same task.
8. **#5:** the guard sits in the same function as D99.59 (the reply button is shown to the thread
   author while the API answers 403). D99.59 stays open unless decided separately.
9. **#33:** a `.limit(50_000)` without a sitemap index silently drops URLs past the cap. Add the
   ledger entry, or build a sitemap index.
