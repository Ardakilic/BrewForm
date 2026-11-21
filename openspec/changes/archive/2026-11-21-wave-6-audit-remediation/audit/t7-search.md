# t7-search: search ranking and database-side pagination (research and validation notes)

Track: t7-search. Capability owned: `advanced-search` (modified).
Audit sources: `plans/AUDIT-2026-11-18.md` §6.E, and findings `api-architecture/recipe-query-scalability`,
`data-layer/unbounded-search-ranking` and `security/search-unbounded-load` in the audit JSON.

User decision (verbatim): "what does this mean? does it mean that if it has 1000 matches, but 10 page
pagination, will it load 1000 matches to ram / browser and paginate on client side? This should be
addressed."

---

## 1. Plain answer for the user

**Short version:** the 1000 matches are loaded into the **API server's memory**, not the browser's. The
browser still gets only one page. But the server pulls all 1000 recipes, with **every version's coffee
name and personal notes**, out of Postgres on every search request. It ranks them in JavaScript, keeps
10 or 20, and throws the rest away. Page 2 repeats the whole thing.

What happens today for `GET /api/v1/recipes?search=a&page=1&perPage=20` when N recipes match:

| Step | Where | What is loaded | Evidence |
|---|---|---|---|
| 1 | Postgres → API process | **N recipe rows** (all ~19 recipe columns + author) **plus every version of each** (`id`, `productName` ≤255 chars, `personalNotes` ≤10,000 chars). No `LIMIT`. | `model.ts:410-432` (`findAllForRanking`), `service.ts:589-590` |
| 2 | Postgres → API process (in parallel) | `COUNT(*)` with the same filter, on a **second** pool connection | `model.ts:419-429` (`Promise.all`) |
| 3 | API process (CPU) | `rankRecipes` lowercases the title and every version's `productName` and `personalNotes`, which copies all that text again, then sorts all N | `service.ts:444-465` |
| 4 | API process | `slice((page-1)*perPage, …)` keeps 20 and discards N-20 | `service.ts:595-596` |
| 5 | API → browser | **One page only** (≤ `perPage`, default 20, max 100). Each item still carries its full `versions[]` array with all personal notes, which the list UI never reads. | `index.ts:236-245` (`paginated(c, result.recipes, …)` serializes rows as-is); `RecipeCard.tsx:51-66` only renders an explicitly passed `version` |

Worked numbers for **N = 1000 matches, 3 versions each, about 1.5 KB of notes per version**:

- Rows read per request: 1000 recipe rows and 3000 version objects, about 4.5 MB of notes text through the
  driver. The relational query returns versions as aggregated JSON, so that text sits in memory as the raw
  JSON string, then as the parsed JS strings, then again as the lowercase copies `rankRecipes` makes. That
  is **on the order of 10–20 MB of transient heap per search request**, to return 20 recipes. Strings with
  non-Latin-1 characters such as `ş`, `ğ` or `ı` are stored two bytes per character in V8, which pushes this
  toward the top of the range.
- At the schema maximum (10,000-char notes), that becomes about 30 MB of text and **on the order of 60–100 MB
  of transient heap per request** (estimated, not measured).
- Sent to the browser: 20 recipes plus their 60 versions' notes, about 90 KB in this example. That is
  wasteful, but it is bounded by `perPage`.
- **Pool impact:** every search holds 2 of the 10 pool connections (`packages/db/src/index.ts:7`,
  `max: 10`) while Postgres seq-scans `recipe` and `recipe_version`. Leading-wildcard `ILIKE '%a%'`
  cannot use the B-tree indexes, and `schema.ts:160-205,252-276` has no trigram or FTS index. **5
  concurrent searches occupy the whole pool.** Every other request (login, recipe detail, the
  `/ready` probe at `health.ts:32`) then queues indefinitely, because there is no `statement_timeout`, no
  `connect_timeout` and no `idle_timeout`.
- **Cost model:** it grows linearly with catalogue size. A one-character search (`?search=a`) matches
  nearly everything. `search` has **no length limit** (`packages/shared/src/schemas/recipe.ts:163`
  is `z.string().optional()`), and the endpoint is unauthenticated, so this is a cheap DoS. The global
  rate limiter is bypassable (another track's finding).

**Without search**, `findMany` (`model.ts:369-396`) does apply `LIMIT perPage`, so the row count is fine.
But it still attaches every version's `productName` and `personalNotes` to each item. The comment at
`model.ts:388` says these were loaded "for rankRecipes", but `findMany` is never ranked. That payload goes
to the browser on every list, feed and offset page.

**After this change**, Postgres computes the score, sorts, and returns exactly one page (≤ `perPage` rows).
The total comes from `COUNT(*)`. No version rows reach the API at all. Trigram indexes make the
`ILIKE '%term%'` scans index-assisted, and a statement timeout bounds the worst case.

---

## 2. Validation of audit claims (read against the code on 2026-11-18)

| Claim | Verdict | Evidence / notes |
|---|---|---|
| `findAllForRanking` has no LIMIT and loads all matching recipes plus all versions | **Confirmed** | `model.ts:410-432`; `with: { versions: { columns: { id, productName, personalNotes } } }` and no `limit` |
| Ranked and sliced in JS | **Confirmed** | `service.ts:586-603` |
| Leading-wildcard ILIKE on title/productName/personalNotes across all versions, no trigram/FTS index | **Confirmed** | `model.ts:128-150` (`%${sanitized}%`); `schema.ts` recipe indexes `:160-205`, version indexes `:252-276`. Only B-trees exist |
| `mainBrewer` also ILIKEs `brewerDetails` across all versions | **Confirmed** (secondary) | `model.ts:152-166`. It is a filter, not ranked. Out of scope for indexing here (noted as a follow-up) |
| Pool `max: 10` with no statement/idle/connect timeout | **Confirmed** | `packages/db/src/index.ts:7` |
| `/ready` uses the same pool with no timeout | **Confirmed** | `apps/api/src/routes/health.ts:32`. The `/ready` timeout itself is left to the ops/infra track. This track's statement timeout bounds the `SELECT 1` execution, but not the wait for a free connection |
| "A one-letter search pulls most of the table" | **Confirmed** | No minimum or maximum length on `search` (`recipe.ts:163`) |
| `personalNotes` up to 10,000 chars | **Confirmed** | `packages/shared/src/schemas/recipe.ts:45` |
| Browser receives all matches / client-side pagination | **Refuted (clarification)** | The browser gets one page. The over-fetch is in the API process. Each list item does leak an undocumented `versions[]` (not in `FeedRecipeOutputSchema`, `packages/shared/src/schemas/responses/recipe.ts:120-140`) |
| "This conflicts with the AGENTS.md rule *no Postgres-specific operators*" | **Partially**: the rule is already bent | `ilike` (Postgres-only `ILIKE`) is used throughout (`recipe/model.ts`, `coffee-variety/model.ts`, ...). `sql` fragments already exist as documented "D03 raw-SQL exceptions" (`model.ts:1066-1073` row-value cursor; `equipment/model.ts:136`). Trigram indexes are a schema-level feature, which AGENTS.md already permits in spirit ("schema-level Postgres features like index ordering and CHECK constraints are permitted"). They do need an extension, so the ADR and rule wording are amended explicitly |

### Additional defects discovered while validating (in this track's code path)

1. **`sortBy=rating` is silently a no-op.** `RecipeFilterSchema` accepts `rating` (`recipe.ts:191`), the UI
   offers "Top rated" (`RecipeListView.tsx:410`) and OpenAPI documents it (`index.ts:75`). But `findMany`
   (`model.ts:376`), `findAllForRanking` (`:415`) and `findStarred` (`:1212`) all map anything other than
   `likeCount` to `createdAt`. So "Top rated" shows newest first.
2. **Offset pagination is non-deterministic on ties.** `ORDER BY like_count` (or a `createdAt` collision) has no
   unique tie-break, so Postgres may repeat or skip rows across OFFSET pages. `likeCount = 0` ties are the
   common case.
3. **JS ranking disagrees with Postgres case folding.** `'İstanbul'.toLowerCase()` is `'i̇stanbul'` (i +
   U+0307 COMBINING DOT ABOVE), so `.includes('istanbul')` is false. Postgres `ILIKE` under the image's
   `en_US.utf8` ctype folds `İ` to `i` and matches. Result: a Turkish title the filter matched gets title
   score 0 and is ranked below productName-only matches. Scoring in SQL with the same predicate fixes this
   by construction.
4. **Backslash is not neutralized.** Sanitization strips `%` and `_` only (`model.ts:129`, `service.ts:445,502`).
   `\` is ILIKE's default escape character, so `search=foo\` builds `%foo\%`. The trailing wildcard
   becomes a literal `%`, which silently yields wrong results.
5. **Raw search term can leak into error logs.** Drizzle ≥0.44 wraps driver errors in `DrizzleQueryError`
   whose `message` embeds the SQL and **bound params** (Context7: drizzle-orm `errors.ts`). The global
   `errorHandler` logs `{ err }`, so any failed search query logs `%term%`, which contradicts the F11 rule
   "the raw search string SHALL NOT be logged". (Cross-track: the same mechanism can log emails from
   failed auth queries. Flagged for the logging/error-contract tracks.)
6. **`errorHandler`'s `err.name === 'PostgresError'` check never matches Drizzle-issued queries**, because the
   PostgresError is on `err.cause` (`errorHandler.ts:40-57`). This is the root of the "409 → 500" design
   problem owned by another track. This track's 503 timeout mapping must unwrap `cause` too.
7. **Starred search is unranked** (`findStarred`, `model.ts:1191-1232`), which is inconsistent with `/recipes`.
   The shared bounded query builder fixes it at no extra cost.

---

## 3. Research (Context7 + Postgres docs + web)

- **Drizzle (Context7 `/drizzle-team/drizzle-orm-docs`, `/drizzle-team/drizzle-orm` 0.45):**
  - GIN indexes with operator classes are first-class in `schema.ts`:
    `index('name').using('gin', table.col.op('gin_trgm_ops'))` (pg indexes-constraints docs, v0.31+ API).
  - Generated `tsvector` columns use `customType({ dataType: () => 'tsvector' })` +
    `.generatedAlwaysAs(sql\`to_tsvector(...)\`)` + `index().using('gin', col)` (guide
    "full-text-search-with-generated-columns"). Generated columns can only reference the **same row**, so
    `recipe.title` and `recipe_version.product_name/personal_notes` would need two vectors and a join.
  - Ranking uses `sql\`ts_rank(...)\`` and the `@@` operator. There is no builder for these, so they are
    raw `sql` fragments in query code.
  - `sql` fragments are the sanctioned escape hatch in `select`/`orderBy` (`sql\`${col} desc nulls first\``).
    There is no `CASE` builder in 0.45. `max()`/`avg()`/`count()` accept SQL expressions. Subqueries
    `.as()` and `$dynamic()` joins are supported in the core select API, which avoids the relational-API
    alias problem documented in D03.
  - `drizzle-kit` does **not** manage extensions. `CREATE EXTENSION` needs a `drizzle-kit generate --custom`
    migration (Context7 "Custom migrations"). Extensions aren't tracked in the snapshot, so the
    copied snapshot needs no edits.
  - Drizzle ≥0.44 wraps driver errors in `DrizzleQueryError` (message = SQL + params, `cause` = driver
    error with SQLSTATE `code`).
- **postgres.js (Context7 `/porsager/postgres`):** `connection: { statement_timeout: <ms> }` sets the server
  GUC per connection at startup. `idle_timeout`, `connect_timeout` and `max_lifetime` are pool options.
  (The README also lists `queue_timeout`/`query_timeout`. Verify they exist in the installed 4.1.x types
  before relying on them.)
- **pg_trgm (postgresql.org/docs/current/pgtrgm.html):** "considered *trusted*", so it can be installed by
  non-superusers with `CREATE` privilege on the database. GIN/GiST trigram opclasses "support trigram-based
  index searches for `LIKE`, `ILIKE`, `~`, `~*`"; "the search string need not be left-anchored". "A pattern
  with no extractable trigrams will degenerate to a full-index scan", so 1–2-character terms get little
  benefit and are bounded by the statement timeout instead.
- **Full-text search (postgresql.org textsearch-controls):** `websearch_to_tsquery` "will not recognize …
  prefix-match labels", so there is no `:*` prefix search without hand-building `to_tsquery` input. `ts_rank`
  default weights `{0.1, 0.2, 0.4, 1.0}` (D, C, B, A) are frequency-based, which is not the current boolean
  3/2/1 model. The Turkish Snowball stemmer reduces `kelime` to `kel` (pgsql list), and it would mis-stem
  English. `simple` does not stem but is still lexeme-based: `yirga` does not match `Yirgacheffe`.
- **Environment:** Postgres 18 everywhere (`compose.yml:148` `postgres:18-trixie`; CI `postgres:18-alpine`
  in `pr.yml:71`, `ci.yml:57`). The official images ship contrib, but this was **not verified for the
  alpine variant from a primary source**, so a task verifies `pg_available_extensions` in both images.

---

## 4. Options compared

| | (a) SQL-side scoring (CASE + ILIKE) + ORDER BY + LIMIT/OFFSET + COUNT | (b) FTS: generated `tsvector` + GIN + `ts_rank` | (c) `pg_trgm` GIN indexes + (a) | (d) Bounded candidate set (top K by recency) + JS ranking |
|---|---|---|---|---|
| API memory per request | O(perPage) ✅ | O(perPage) ✅ | O(perPage) ✅ | O(K × versions × notes); K=500 still ~15 MB worst case ⚠️ |
| DB work per request | Seq scans (leading wildcard), bounded by statement timeout | Index-assisted | **Index-assisted** for terms ≥3 chars | Seq scans + K-row transfer |
| Relevance parity with F11 (3/2/1, best version, sort-key ties) | **Exact**, and fixes `İ` mismatch | **Breaks it**: lexeme matching, frequency ranking, no substring/infix | **Exact** (same predicate; index is lossy and rechecked) | Wrong: relevant recipes older than the top K never appear; total inaccurate |
| Existing spec scenarios (substring `yirgacheffe`, `V60`) | Pass | Partial-word scenarios fail | Pass | Pass within K |
| Turkish handling | Same as today's filter (DB ctype folding: `İ`→`i`, `I`→`i`) | Must pick `simple` (no stemming, still lexemes) or `turkish` (breaks English) | Same as (a); trigram extraction uses the same lowercasing | JS/DB mismatch remains |
| AGENTS.md impact | `sql` CASE/NULLS LAST fragments = D03-style exception (already precedent) | `@@`/`ts_rank` in query code + custom type + generated cols. Needs a rule change for operators | Schema-level extension + opclass index (amend wording) + (a)'s fragments | None, but violates the spirit (unbounded-ish reads) |
| Migration complexity | None | High: 2 generated columns, custom type, 2 GIN indexes, query rewrite, cross-table rank join | Low–medium: 1 custom `CREATE EXTENSION` migration + 3 index declarations; `db-reset` (push) needs the extension first | None |
| Index size / write cost | None | tsvector columns stored (≈ text size) + GIN | GIN on `personal_notes` ≈ order of the column size (tens of MB at ~30k versions); title/product small. Versions are insert-mostly | None |

### Recommendation

**Primary: (c) = (a) + trigram indexes, in one change.**

1. Move scoring and ordering into SQL in `model.ts`. Use a core `db.select()` page query with `$dynamic()` joins:
   a grouped `recipe_version` score subquery (`max(CASE … 2 + CASE … 1)`), an optional rating aggregate,
   and an inner join to `user` for the author projection. `ORDER BY score DESC, <sort key>, id`, then
   `LIMIT perPage OFFSET …`, plus a parallel `COUNT(*)`. Delete `findAllForRanking`/`rankRecipes`.
2. Enable `pg_trgm` and add GIN `gin_trgm_ops` indexes on `recipe.title`, `recipe_version.product_name`
   and `recipe_version.personal_notes`. Restructure the search predicate as `recipes.id IN (title ids
   UNION version recipe ids)` so every branch can bitmap-scan its index.
3. Set a server-side `statement_timeout` (default 10 s, env `DB_STATEMENT_TIMEOUT_MS`) plus
   `connect_timeout`/`idle_timeout`. Map SQLSTATE 57014 to 503 `QUERY_TIMEOUT`.
4. Cap `search` at 200 chars (trimmed), neutralize `%`, `_` and `\`, and stop serializing `versions[]` in list items.
5. Record ADR "Database-side search ranking with pg_trgm" and amend `AGENTS.md` and `docs/architecture.md`.

**Fallback:** if a deployment cannot enable `pg_trgm` (a managed DB without contrib, or a role without
`CREATE`), ship (a) alone. Drop the custom extension migration and the three index declarations. Every
correctness and memory requirement still holds. Only the "plan uses trigram indexes" acceptance
scenario is waived, and DB scan cost stays linear but bounded by the statement timeout. (b) FTS remains
the long-term option if word-level relevance is ever preferred over substring matching. It would be a
separate, user-visible behaviour change.

**Not recommended:** (d). It is a stopgap that still loads thousands of rows of notes and returns wrong
results beyond K.

### Proposed AGENTS.md "Database rules" wording (replaces the first bullet)

> - **No raw SQL statements** — Drizzle ORM only. No JSONB/UUID columns. Query code in `model.ts` uses
>   Drizzle builders. `ilike` is the accepted case-insensitive match operator. A `sql` template
>   **fragment** is allowed only where Drizzle has no builder (e.g. `CASE` expressions, row-value
>   comparisons, `NULLS LAST`). It must interpolate Drizzle columns and bound values, never concatenate
>   user input, and must carry a `// D03 raw-SQL exception: <why>` comment. No other Postgres-specific
>   operators (`@@`, `%`, `~*`, JSON operators) in application query code. Schema-level Postgres
>   features are permitted: index ordering, CHECK constraints, GIN indexes with operator classes, and
>   extensions approved by an ADR in `docs/decisions.md` (currently `pg_trgm`, ADR "Database-side search
>   ranking"). An extension is enabled only through a `drizzle-kit generate --custom` migration
>   containing `CREATE EXTENSION IF NOT EXISTS <name>;`.
> - **Bounded reads** — every list or search query in `model.ts` applies `limit` (at most the schema's
>   `perPage` maximum). Ordering, ranking and pagination happen in SQL, never by loading a full result
>   set into the API process.

---

## 5. Cross-track coordination notes

- **t5-web-state / web-url-state** owns debouncing the `/recipes` search input (`RecipeListView.tsx:275`).
  This track only needs `maxLength={200}` on that input (and `maxLength={100}` on the author input, matching
  `author: z.string().max(100)`). Whichever track lands second rebases onto the other.
- **Error-contract track (error-handling capability)**: if it introduces an `AppError` hierarchy or a
  `DrizzleQueryError` unwrapping helper, the `57014 → 503 QUERY_TIMEOUT` mapping should live there. Otherwise
  this track adds it to `errorHandler.ts`, unwrapping `err.cause`.
- **Ops/infra track**: if it also edits `packages/db/src/index.ts` (pool timeouts, `/ready` timeout), merge
  into one pool config. This track needs `statement_timeout`, `connect_timeout` and `idle_timeout` there.
- **Data-layer "filter-version-semantics" finding** (any-version vs current-version filters): this spec ties
  the score's version scope to the filter's version scope, so a later switch to current-version only stays
  consistent.
- **cursor-pagination spec** "Fallback to offset pagination" says ranking happens "in application code". This
  is rationale text only (behaviour unchanged). The cursor-pagination owner may reword it. It is not modified here.
- **Docs track**: `docs/api.md` rows for `search` (maxLength, ranking) and `sortBy=rating`.
- **Migration ordering with other tracks**: the custom `pg_trgm` migration must get a lower sequence number
  than the trigram-index migration. Other tracks' schema migrations may interleave, so rebase the journal
  carefully and re-run `make db-generate` for freshness.

## Sources

- [PostgreSQL docs: pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)
- [PostgreSQL docs: Controlling Text Search](https://www.postgresql.org/docs/current/textsearch-controls.html)
- [pgsql-general thread: Full text search prefix matching (stemming vs prefix)](https://postgrespro.com/list/thread-id/1547045)
- [docker-library/postgres PR #906 (alpine contrib modules)](https://github.com/docker-library/postgres/pull/906)
- Context7: `/drizzle-team/drizzle-orm-docs` (full-text search guides, indexes & constraints, custom migrations, `sql` operator), `/drizzle-team/drizzle-orm` (DrizzleQueryError), `/porsager/postgres` (connection options)
