# Refinement: slugs and uniqueness (KEY = slug-uniqueness)

User question (2026-11-19): "for slugs and uniqueness, what can we do, investigate". The user prefers
built-in methods and approved random suffixes (OQ2). Owned folders: `specs/recipe-slug/` (rewritten)
and `specs/unique-identifiers/` (new, ADDED). Validation: `openspec validate wave-6-audit-remediation
--strict` reports the change as valid.

## 1. Findings

### 1.1 Recipe slugs (current code)

| # | Finding | Evidence |
|---|---|---|
| S1 | `generateUniqueSlug` pre-checks with `model.findBySlug` (filters `isNull(deletedAt)`) and then calls `ensureUniqueSlug(slug, [])`. With an empty list it never adds a suffix. | `apps/api/src/modules/recipe/service.ts:57-63`, `packages/shared/src/utils/slug.ts:13-22`, `apps/api/src/modules/recipe/model.ts:338-341` |
| S2 | `forkRecipe` (service) calls `ensureUniqueSlug(generateSlug(forkTitle), [])` with no pre-check at all, and stores `title` unsanitized. | `service.ts:396-400` |
| S3 | `mergeRecipes` delegates to `createRecipe`, so it inherits S1. | `service.ts:846-893` (`createRecipe(authorId, mergedData)` at `:891`) |
| S4 | `recipe.slug` is `.notNull().unique()` (constraint `recipe_slug_unique`) over every row, soft-deleted ones included. A redundant plain `recipe_slug_idx` also exists. | `packages/db/src/schema.ts:139,166` |
| S5 | The recipe insert is the FIRST statement in both transactions. A `23505` there aborts the transaction: retrying with the same `tx` would fail with `25P02`. Drizzle rolls back when the callback throws. | `model.ts:694-704` (`createRecipeWithRelations`), `model.ts:478-488` (`forkRecipe`) |
| S6 | `forkRecipe` (model) increments the source `forkCount` inside the same transaction (a row lock on the source recipe). The slug claim must come before it. | `model.ts:598` |
| S7 | `ensureUniqueSlug` is imported by two API test files besides its own test. The existing task 7.3 missed them. | `apps/api/src/utils/qrcode/qrcode.test.ts:1,15`; `apps/api/src/modules/recipe/service.test.ts:22,49-54` |
| S8 | The QR route validates the filename twice: with `QrCodeFilenameSchema` and with an inline copy of its regex. Neither accepts `_`, so legacy slugs from the old `\w`-based generator can never get a QR code. | `packages/shared/src/schemas/common.ts:22-24`; `apps/api/src/modules/qrcode/index.ts:56` |
| S9 | The old generator returns `''` for all-CJK or all-Cyrillic titles. The first such recipe was stored with `slug = ''` and can never be opened by slug (cards link to `/recipes/`). Any later one returned 500. | `slug.ts:2-10` |
| S10 | Static siblings of `:slug` today: web `recipes/new`, `recipes/starred`, `recipes/unavailable`, `recipes/compare/...`; API `/starred`, `/meta/:slug`, `/merge`. | `apps/web/src/router.tsx:87-132`; `apps/api/src/modules/recipe/index.ts:257,334,647` |
| S11 | `SlugSchema` is exported but unused by any route, so tightening it has no runtime effect. | `grep -rn SlugSchema apps packages` (only the definition and the index export) |
| S12 | The seed claims recipe slugs with `onConflictDoNothing({ target: recipes.slug })`, the same mechanism recommended below. | `packages/db/src/seed.ts:502` |

Library behaviour checked (Context7 and installed source, drizzle-orm 0.45.2):

- `onConflictDoNothing({ target: recipes.slug })` renders `on conflict ("slug") do nothing`
  (`drizzle-orm/pg-core/query-builders/insert.js:100-110`). With `.returning()`, Postgres returns an
  empty array when the row was skipped.
- Nested `tx.transaction()` uses SAVEPOINTs (documented). It works, but it is not needed with
  `ON CONFLICT`.
- `PgDialect.migrate` applies ALL pending migrations inside ONE `session.transaction`
  (`pg-core/dialect.js:44-72`). A failing `CREATE UNIQUE INDEX` therefore rolls back the whole
  batch, which makes the stricter constraints data-safe to deploy.
- Drizzle documents case-insensitive unique email exactly as
  `uniqueIndex('…').on(lower(table.email))` with a `lower()` `sql` helper, and lookups as
  `eq(lower(users.email), email.toLowerCase())`. drizzle-kit renders
  `CREATE UNIQUE INDEX … USING btree (lower("email"))`. Partial indexes use ``.where(sql`…`)``.
- Zod 4: a format schema such as `z.email()` installs its own check at index 0, so it runs before a
  chained `.trim()` (`zod/src/v4/core/schemas.ts`). `z.email().trim()` therefore rejects
  `' a@b.co '`. The correct form is `z.string().trim().toLowerCase().pipe(z.email())`.
  `z.toJSONSchema` resolves a pipe to its output side (`z.email()`), so `jsonRequestBody` (which
  calls `z.toJSONSchema(schema, { unrepresentable: 'any' })`, `apps/api/src/utils/openapi/index.ts:29`)
  still documents an email string. Zod's default email regex is ASCII-only, so JavaScript
  `toLowerCase()` and Postgres `lower()` agree on every accepted email.
- Built-ins: `'İ'.toLowerCase()` is `i` + U+0307 (removed by the NFKD mark-strip), `'I'.toLowerCase()`
  is `i` (not `ı`), and `ı` has no decomposition (it is in the explicit map). `toLocaleLowerCase('tr')`
  would make the output depend on locale and turn `I` into `ı`, which is wrong for slugs.
  `globalThis.crypto.getRandomValues` is available in Node 26 and browsers. `node:crypto.randomInt`
  would break the web bundle, because `@brewform/shared` is bundled into it.

### 1.2 Other uniqueness rules (audit of `schema.ts`)

| Rule | Current behaviour | Risk | Recommendation |
|---|---|---|---|
| `user.email` `.unique()` (`schema.ts:80`) | Case-sensitive. `z.email()` with no trim or lowercase (`packages/shared/src/schemas/auth.ts:25,40,59`; `admin.ts:11,30`). Lookups use `eq(users.email, email)` (`auth/model.ts:24,143`; `admin/model.ts:69`). | `Foo@x.io` and `foo@x.io` can be two accounts. Login with a different case fails with 401. Rate-limit keys (t2) normalize while the DB does not. | `EmailSchema` (trim + lowercase, then pipe to `z.email()`) on every account-email input. Expression unique index `user_email_lower_unique`. `lower()` lookups. The exact constraint is kept. |
| `user.username` `.unique()` (`schema.ts:82`) | Case-sensitive. Regex `[a-zA-Z0-9_-]` (`auth.ts:26-30`). Lookups are exact (`user/model.ts:56`, `auth/model.ts:35,156`, `admin/model.ts:81`, `notification/model.ts:191`). | `Arda` and `arda` can coexist: impersonation, and profile links and mentions that depend on casing. | Keep the display case. Add `user_username_lower_unique` and `lower()` lookups, including mention targets. `parseMentions` de-duplicates case-insensitively. |
| Soft-deleted users vs. registration | `isEmailTaken`/`isUsernameTaken` filter `isNull(deletedAt)` (`auth/model.ts:142-165`, `admin/model.ts:68-89`), but both constraints are global. Self-delete (`user/model.ts:75-82`) and admin delete (`admin/model.ts:241-248`) keep the email and username. | The pre-check passes and the insert hits `23505`: 500 today, 409 after t3, but only through a failed insert and a warn log. | Pre-checks stop filtering `deletedAt` (a documented exception), so 409 is deterministic. Identifiers of deleted accounts stay reserved in wave 6. Tombstoning a self-deleted account's email is deferred to account-deletion anonymisation (open question 1). |
| Seed vs. new indexes | The seed uses `onConflictDoNothing({ target: users.email })` (`seed.ts:219,243`). | Dropping the exact `.unique()` would break `ON CONFLICT ("email")` inference ("no unique or exclusion constraint matching"). | KEEP the exact constraints and ADD the lower indexes. Normalize `ADMIN_EMAIL` in the seed. |
| Web own-profile check | `viewer?.username === username` (URL param) (`apps/web/src/pages/users/UserProfilePage.tsx:74,123`). | With case-insensitive profile URLs, `/u/arda` for user `Arda` would not be recognised as the viewer's own profile. | Compare `viewer.id` with `profile.id`. |
| Route namespace for usernames | `GET /api/v1/users/me` is a static sibling of `/:username` (`user/index.ts:23,121`). `me` is blocked by `min(3)`. | No current shadowing. Impersonation through `admin`, `support` or `brewform` is possible. | `RESERVED_USERNAMES` at self-registration only, reported as "taken". |
| `setup.is_default` (implicit "one default per user") | Clear and set run as two separate statements with no transaction (`setup/service.ts:47-49,89-92,147-149`; `setup/model.ts:78-85`). | A concurrent create or `setDefault` can leave two defaults (or none). | Partial unique index `setup_user_default_unique` on `(user_id) WHERE is_default = true AND deleted_at IS NULL`. Clear and set inside one `db.transaction` in the model. |
| Likes / favourites (`schema.ts:744,767`) | Hard delete. Toggle via `onConflictDoNothing` (`recipe/model.ts:925-980`). | None. | Keep. Add a re-add regression test. |
| Ratings (`schema.ts:792`) | Select-then-insert race (`recipe/model.ts:834-857`). | Handled by t3 task 2.8 (`onConflictDoUpdate`). | Keep the t3 fix. |
| Follows (`schema.ts:707`) | Pre-check plus plain insert, hard delete (`follow/model.ts:24,32`). | A race gives `23505`, which becomes `409 CONFLICT` after t3. | Keep. Add a re-add regression test. |
| Collection items (`schema.ts:1052`) | Insert, catch `23505` and map to `ALREADY_IN_COLLECTION`; hard delete (`collection/model.ts:226,236`). | t3 replaces the substring sniffing (task 2.10). | Keep. Add a re-add regression test. |
| User badges (`schema.ts:833`) | `onConflictDoNothing` (`badge/model.ts:151-153`). | None. | Keep. |
| `user_recipe_note` (new, t1) | Unique `(user_id, recipe_id)`, soft-deleted, revived by `onConflictDoUpdate` that sets `deleted_at = null` (`specs/recipe-personal-notes/spec.md:11,74,116,130`). | None. This is the correct pattern for a soft-deleted join row. | Keep. Require the same pattern for any future soft-deleted join table. |
| Version join tables (`schema.ts:297,324,406`) | Unique per version. Client-supplied `tasteNoteIds`/`equipmentIds` are `z.array(z.uuid())` with no uniqueness check (`packages/shared/src/schemas/recipe.ts:51-52`). Merge de-duplicates (`service.ts:811-828`). | A duplicate id in a create or update gives `23505`: 500 today, 409 after t3, where the correct answer is 400. | Cross-folder request to `recipe-write`: reject duplicate ids with 400. |
| `recipe_version (recipe_id, version_number)` (`schema.ts:253`) | Concurrent bumps race. | Handled by t1 task 8.9 (`FOR UPDATE`) and the t3 global 409. | Keep. |
| `badge.rule`, `brew_method_equipment_rule (brew_method, equipment_type)`, `user_preferences.user_id` | Seed and registration use `onConflictDoNothing` or insert inside the user transaction (`seed.ts:172,186,225`). | None. | Keep. |
| `password_reset.token` (`schema.ts:926`) | Random UUID, stored in plaintext, consumed non-atomically (`auth/service.ts:201-238`). | A security issue (audit §3.7), not a uniqueness one. The proposal lists "hashed reset tokens" as having no wave-6 owner. | Out of scope (D99 auth-session). Not changed here. |
| `email_verification_token.token` (`schema.ts:950`) | SHA-256 hash, atomic consume (`auth/model.ts:174-220`). | None. | Keep. |
| Catalog names (equipment, vendors, coffee varieties, taste notes), collection names, setup names | No unique constraints (`schema.ts:416-603,1003-1025`). | Duplicate catalog entries are a data-quality issue. Case and spacing variants and soft-deletes make a constraint risky. Duplicate collection and setup names are legitimate. | No change in wave 6 (open question 7). |
| Redundant plain indexes duplicating unique ones | `recipe_slug_idx`, `user_email_idx`, `user_username_idx`, `password_reset_token_idx`, `badge_rule_idx` (`schema.ts:95-96,166,814,932`). | Extra write cost only. | Follow-up cleanup, not in wave 6 (open question 6). |
| `generateUniqueUsername` | Numeric `-1..-100` suffixes. No production caller, only a commented import (`packages/shared/src/utils/username.ts:6-23`; `auth/service.ts:17-18`). | None today. | Leave it. A future OAuth flow must pass the `lower()`-aware `isUsernameTaken`. |

## 2. Design text (paste into design.md)

### 2a. In "Slugs, collection visibility and error mapping (t3)" → **Context** → *Slugs.*, append these bullets

- The recipe insert is the first statement of both creation transactions (`model.ts:694-704`,
  `:478-488`). A `23505` there aborts the transaction, so a retry inside it needs either a savepoint
  or a statement that cannot fail on the slug. `forkRecipe` also increments the source `forkCount`
  in the same transaction (`:598`).
- `ensureUniqueSlug` is also imported by `apps/api/src/utils/qrcode/qrcode.test.ts` and
  `recipe/service.test.ts`.
- The QR route repeats the filename regex inline (`qrcode/index.ts:56`). Neither copy accepts `_`.
  The old generator could store `slug = ''` once (all-CJK or all-Cyrillic title).
- Account identifiers: `user.email` and `user.username` are unique but case-sensitive. Inputs are
  not normalized, the availability checks ignore soft-deleted rows although the constraints do not,
  and the "one default setup per user" rule has no database guarantee. Full table:
  `audit/_refine/slug-uniqueness.md` §1.2.

### 2b. Replace t3 **Decisions** 2, 3, 4 and 5 with

2. **Clean base first, random suffixes after, claimed in the transaction with `ON CONFLICT (slug) DO NOTHING`.**
   - Choice:
     - Candidates come from `slugCandidates(title, suffixes)`: the bare base (unless it is empty,
       reserved or UUID-shaped), then `<base>-<suffix>` for 5 fresh `randomSlugSuffix()` values.
     - Model helper `claimRecipeSlug(tx, row, candidates)` runs
       `tx.insert(recipes).values({ …row, slug }).onConflictDoNothing({ target: recipes.slug }).returning()`
       per candidate, as the FIRST write of `createRecipeWithRelations` and `forkRecipe`.
     - An empty result moves to the next candidate. If every candidate is taken, the model returns
       `null` and the service throws `ConflictError('SLUG_CONFLICT')` (409).
     - Suffix: 6 characters from `23456789bcdfghjkmnpqrstvwxz` (27 characters, no vowels, no
       look-alikes), drawn with `globalThis.crypto.getRandomValues` and rejection of bytes `>= 243`.
   - Alternatives:
     - Check-then-insert (the current shape): racy, costs an extra query, and the soft-delete
       filter in `findBySlug` caused the bug.
     - Catch `23505` and re-run the whole transaction from the service: works today, but breaks if
       creation ever runs inside an outer transaction (that transaction stays aborted). It also
       turns every collision into a logged DB error and depends on error parsing.
     - A savepoint per attempt (nested `tx.transaction()`): correct, but it uses exceptions for
       control flow and adds two round trips per attempt.
     - Advisory locks: Postgres-specific.
     - Numeric `-2/-3`: race-prone, and leaks counts of private or deleted recipes.
     - Always suffixing: every URL is uglier and the claim is still needed.
     - `[a-z0-9]` suffixes: can spell words, and `0/o` and `1/l` are ambiguous on printed QR labels.
     - `node:crypto.randomInt`: breaks the web bundle of `@brewform/shared`.
   - Rationale: `ON CONFLICT DO NOTHING` never raises, so the transaction stays usable.
     - Under READ COMMITTED, a concurrent uncommitted holder of the same slug makes the insert wait,
       then skip (holder committed) or insert (holder rolled back). Concurrent requests always end
       with distinct slugs and no error.
     - Claiming first means a waiting transaction holds no other locks.
     - With 27^6 = 387,420,489 suffixes and 1,000 recipes on the same base, a suffixed candidate is
       taken with probability about 2.6e-6, and all five with about 1e-28.
     - The seed already uses the same mechanism (`seed.ts:502`). No pre-check query is needed, so
       `model.slugExists` is not added.
3. **Reserved and UUID-shaped bases are always suffixed, with drift guards.**
   - `RESERVED_RECIPE_SLUGS` = `new`, `edit`, `starred`, `unavailable`, `compare`, `meta`, `merge`,
     `versions`, `diff`, `focus`, `fork`, `search`, `feed`, `share`, `recipe`, `recipes`.
   - Two tests fail when a new static sibling of `:slug` lands without a reserved word: one walks the
     Hono recipe router's `routes`, the other parses the `recipes/...` paths in `router.tsx`.
   - This keeps `getRecipe(slugOrId)` unambiguous without renaming routes.
4. **Global uniqueness (soft-deleted rows included), immutable slugs, no history table, slug-only URLs.**
   - Choice: keep `recipe_slug_unique` global. Never rewrite an issued slug. Keep `/recipes/<slug>`,
     with `getRecipe` still accepting a UUID.
   - Alternatives:
     - A partial unique index `WHERE deleted_at IS NULL`: allows reuse, but old links, QR codes and
       notifications for a deleted recipe would then open a different recipe. `ON CONFLICT` would
       also need `targetWhere`.
     - A slug-history redirect table: there is no rename-URL feature, and it adds a lookup to every
       miss.
     - ID-plus-cosmetic-slug URLs (`/recipes/<id>-<slug>`): collision-free by construction, but it
       changes every existing URL, the sitemap, QR codes and notifications, and is unnecessary once
       collisions are handled.
5. **Fork and merge reuse the pipeline; legacy slugs stay addressable.**
   - The fork title is sanitized, falling back to `Fork of <source title>`. Merge keeps delegating
     to `createRecipe`.
   - `QR_CODE_FILENAME_PATTERN` (`^([a-z0-9_]+(?:-[a-z0-9_]+)*)\.(png|svg)$`, case-insensitive) is
     exported once and used by both the schema and the route. `SlugSchema` stays strict for new
     slugs.
   - A legacy `slug = ''` is reported by `check-identifiers.ts` and rewritten to `recipe-<sfx>` only
     with `--fix-empty-slugs`. This is the single exception to immutability, because that slug
     never worked as a link.

### 2c. In t3 **Decisions** 16 ("Race paths"), replace the third bullet with

- Registration and admin user writes map `23505` on `user_email_unique`/`user_email_lower_unique` →
  `EMAIL_ALREADY_EXISTS` and `user_username_unique`/`user_username_lower_unique` →
  `USERNAME_ALREADY_EXISTS`, using `USER_EMAIL_CONSTRAINTS`/`USER_USERNAME_CONSTRAINTS` from
  `auth/model.ts`. The availability pre-checks cover soft-deleted rows (decision U4), so this
  mapping is only the race fallback. Freeing a self-deleted account's email is deferred to the
  account-deletion anonymisation work.

### 2d. Append after t3 Decision 16: **Identifier uniqueness decisions (refinement 2026-11-19)**

- **U1 Emails are normalized once, in the shared schema.**
  - Choice: `EmailSchema = z.string().trim().toLowerCase().max(255).pipe(z.email())` in
    `packages/shared/src/schemas/common.ts`, used by register, login, forgot-password and admin
    create/update. The seed normalizes `ADMIN_EMAIL` the same way.
  - Alternatives: `z.email().trim()` (Zod 4 runs the format check first, so padded input is
    rejected); normalizing in each service (easy to miss a path).
  - Rationale: one definition. It also matches t2's `emailKey` normalization.
- **U2 Case-insensitive uniqueness through expression unique indexes; the exact constraints stay.**
  - Choice: `lower()` helper exported from `schema.ts` (with a `// D03 raw-SQL exception:` comment),
    plus `uniqueIndex('user_email_lower_unique').on(lower(table.email))` and the username
    equivalent. The migration is generated by `make db-generate`.
  - Alternatives:
    - `citext`: an extension, Postgres-specific, and needs an ADR.
    - `CHECK (email = lower(email))` plus a backfill: needs a hand-written data migration, which
      AGENTS.md forbids, and legacy mixed-case logins break until the backfill runs.
    - Lowercasing usernames on write: loses the user's chosen display case and changes existing
      profile URLs.
    - Dropping the exact constraints: breaks the seed's `ON CONFLICT (email)` inference.
  - Rationale: this is the pattern Drizzle documents, it needs no data rewrite, and legacy rows
    keep working.
- **U3 Every identifier lookup uses `eq(lower(col), v.toLowerCase())`.** The lookups are login,
  forgot password, the profile route, mention targets and the availability checks. They are served
  by the expression index, so no backfill is needed. `parseMentions` de-duplicates
  case-insensitively. The web own-profile check compares ids.
- **U4 Identifiers of soft-deleted accounts stay reserved; pre-checks agree with the indexes.**
  - Choice: `isEmailTaken` and `isUsernameTaken` stop filtering `deletedAt` (a documented
    exception). Registration answers 409 with the existing messages before any insert.
  - Alternatives:
    - A partial unique index `WHERE deleted_at IS NULL`: frees identifiers, but keeps PII on
      deleted rows, lets a stranger inherit a deleted user's profile links and mentions, and breaks
      the seed's conflict target.
    - Tombstoning the email on self-deletion: the recommended follow-up, together with
      account-deletion anonymisation (D99.20+).
  - Rationale: keeps the current data semantics, removes the failed-insert path, and blocks
    username takeover.
- **U5 Reserved usernames at self-registration.**
  - Choice: `RESERVED_USERNAMES` (17 names) plus the `deleted-` prefix, refused with
    `USERNAME_ALREADY_EXISTS` (the list is not revealed). Admin and seed writes are exempt.
  - Alternative: a client-side-only check.
  - Rationale: cheap protection against impersonating the operator or the project.
- **U6 One active default setup per user.**
  - Choice: partial unique index `setup_user_default_unique` and a transactional switch in the
    setup model.
  - Alternative: row locks only (no database guarantee).
  - Rationale: the database states the invariant, and the rare race surfaces as 409, never as two
    defaults.
- **U7 Join tables.**
  - Hard delete (likes, favourites, follows, collection items, badges) or upsert (ratings) stays.
  - `user_recipe_note` revives by upsert.
  - Any future soft-deleted join table must use the same revive-on-conflict upsert.
  - Re-add regression tests lock this in.
- **U8 Data safety before stricter constraints.**
  - Choice: `packages/db/src/check-identifiers.ts` (`make db-check-identifiers`).
    - It reports email and username case duplicates, multiple active defaults and empty slugs,
      with ids only and never emails.
    - It exits 1 on blocking issues.
    - Opt-in fixes: `--fix-deleted-duplicates` (tombstones only soft-deleted members),
      `--fix-setup-defaults`, `--fix-empty-slugs`.
    - Groups of two or more active accounts get a printed manual path (admin rename after contact).
  - Rationale: all pending migrations apply in one transaction, so a violation rolls back
    everything. The script lets an operator fix data first instead of reading a raw Postgres error.
- **U9 Not changed in wave 6.**
  - Plaintext reset tokens (D99 auth-session).
  - Catalog name uniqueness (community data; needs a de-duplication UI).
  - Duplicate collection and setup names (legitimate).
  - The redundant plain indexes (follow-up perf cleanup).
  - `generateUniqueUsername` (unused).

### 2e. In **Risks / Trade-offs**, add

- [The identifier indexes fail to build on existing case-duplicate data, or on users with two
  default setups] → Mitigation: the migration batch is atomic, so the database is left unchanged.
  The upgrade notes say to run `check-identifiers.ts` first, and its opt-in fixes cover
  soft-deleted duplicates and setup defaults.
- [A lookup written as `eq(users.email, …)` would bypass the expression index and miss legacy
  mixed-case rows] → Mitigation: every lookup in §U3 is converted in one task. The AGENTS.md
  database rules gain a bullet (cross-folder request to group 24).

## 3. Tasks to add

Group placement: no new group is needed. **Replace the whole of group 7** (header and tasks 7.1–7.11)
with the block below. The identifier work stays in group 7, so later groups need no renumbering. The
schema change in 7.15 runs after t1's notes migration (group 4) and before t1's recipe-write work
(group 8), which then extends the new `createRecipeWithRelations`/`forkRecipe` signatures.
`<m>` means a per-test random marker (`crypto.randomUUID().slice(0, 8)`). `<sfx>` means
`[23456789bcdfghjkmnpqrstvwxz]{6}`.

```markdown
## 7. Recipe slugs and identifier uniqueness (t3)

- [ ] 7.1 Write failing tests first in `packages/shared/src/utils/slug.test.ts` (delete the `ensureUniqueSlug` block):
  - `generateSlug`: `Türk Kahvesi` → `turk-kahvesi`, `İSTANBUL Şehir Rehberi` → `istanbul-sehir-rehberi`, `Iğdır Usulü` → `igdir-usulu`, `ŞEKERSİZ ÇAY` → `sekersiz-cay`, `Bob's V60_Pour Over` → `bobs-v60-pour-over`, `Crème brûlée ﬁlter ①` → `creme-brulee-filter-1`, `Straße Æble` → `strasse-aeble`; `東京コーヒー`, `Кофе` and `!!!` → `''`; a 200-character word title → at most 93 characters, no trailing `-`, ends on a word boundary; every non-empty output matches `SlugSchema`.
  - `randomSlugSuffix`: 1,000 calls all match `^<sfx>$` and at least 995 are distinct. With `vi.spyOn(globalThis.crypto, 'getRandomValues')` filling byte `250` on the first call and `5` afterwards, the result is `777777` (restore the spy in `afterEach`).
  - `slugCandidates`: `('Morning V60', ['bbbbbb','cccccc'])` → `['morning-v60','morning-v60-bbbbbb','morning-v60-cccccc']`; `('New', ['bbbbbb'])` → `['new-bbbbbb']`; a UUID title → `['<uuid>-bbbbbb']`; `('東京コーヒー', ['bbbbbb'])` → `['recipe-bbbbbb']`; `('Espresso', ['bbbbbb','bbbbbb'])` → `['espresso','espresso-bbbbbb']`.
  - `isReservedRecipeSlug`: `true` for every `RESERVED_RECIPE_SLUGS` entry and for `123e4567-e89b-12d3-a456-426614174000`; `false` for `morning-v60`.
  - Run `make test-shared` and confirm the new cases fail.
- [ ] 7.2 Rewrite `packages/shared/src/utils/slug.ts`:
  - `generateSlug`: apostrophe strip → `toLowerCase()` → the 9-entry map (`ı ß æ œ ø đ ð ł þ`) → `normalize('NFKD')` + `/\p{M}+/gu` strip → `[^a-z0-9]+` → `-` → trim → 93-character cap at a hyphen boundary.
  - `SLUG_SUFFIX_ALPHABET = '23456789bcdfghjkmnpqrstvwxz'`, `SLUG_SUFFIX_LENGTH = 6` and `SLUG_SUFFIX_ATTEMPTS = 5`.
  - `randomSlugSuffix(length = SLUG_SUFFIX_LENGTH)`: `globalThis.crypto.getRandomValues` on a `Uint8Array`; discard bytes `>= 243`; map `SLUG_SUFFIX_ALPHABET[b % 27]`; refill until `length` characters.
  - `RESERVED_RECIPE_SLUGS` (the 16 words in the recipe-slug spec, `as const`), `isReservedRecipeSlug(base)` (list or UUID regex) and `slugCandidates(title, suffixes)`.
  - No `node:` import. JSDoc on every export: state the 27^6 space and the no-vowel, no-look-alike rationale.
  - Re-run `make test-shared` until green.
- [ ] 7.3 Remove `ensureUniqueSlug`:
  - Delete it from `slug.ts`. Set the export line in `packages/shared/src/utils/index.ts` to `export { generateSlug, isReservedRecipeSlug, RESERVED_RECIPE_SLUGS, randomSlugSuffix, SLUG_SUFFIX_ALPHABET, SLUG_SUFFIX_ATTEMPTS, SLUG_SUFFIX_LENGTH, slugCandidates } from './slug.ts';`.
  - Delete its cases and imports in `apps/api/src/utils/qrcode/qrcode.test.ts` (`:1`, `:15`) and `apps/api/src/modules/recipe/service.test.ts` (`:22`, `:49-54`).
  - Confirm `grep -rn ensureUniqueSlug apps packages` prints nothing.
- [ ] 7.4 Verify that no slug or transliteration package was added: `grep -n "slugify\|transliterat\|limax" package.json apps/*/package.json packages/*/package.json` prints nothing.
- [ ] 7.5 Legacy slugs and QR codes:
  - Add failing cases to `packages/shared/src/schemas/common.test.ts`: `QrCodeFilenameSchema` accepts `cold_brew.png` and `cold-brew.svg`, and rejects `../x.png`, `a--b.png`, `-a.png` and `a.gif`.
  - Export `QR_CODE_FILENAME_PATTERN = /^([a-z0-9_]+(?:-[a-z0-9_]+)*)\.(png|svg)$/i` from `common.ts` and build `QrCodeFilenameSchema` from it. Its docblock says legacy slugs may contain `_` and new slugs never do. Keep `SlugSchema` unchanged.
  - Replace the inline regex at `apps/api/src/modules/qrcode/index.ts:56` with `QR_CODE_FILENAME_PATTERN`.
  - Add a DB-backed case to `apps/api/src/modules/qrcode/index.test.ts`: a public recipe inserted with slug `cold_brew_<m>` returns `200 image/png` from `GET /api/v1/qrcode/recipe/cold_brew_<m>.png`.
- [ ] 7.6 Write failing DB-backed model tests in `apps/api/src/modules/recipe/model.create.test.ts`:
  - (a) `createRecipeWithRelations({ …, slugCandidates: [taken, free] })`, where `taken` belongs to a soft-deleted recipe, returns slug `free` with exactly one `recipe_version` row.
  - (b) With every candidate taken, it returns `null`. The `recipe` and `recipe_version` row counts for that author are unchanged.
  - (c) `forkRecipe(sourceId, authorId, 'Fork of X', [taken, free])` returns slug `free` and the source `forkCount` goes up by 1. With every candidate taken, it returns `null` and `forkCount` is unchanged.
- [ ] 7.7 In `apps/api/src/modules/recipe/model.ts`:
  - Add a private `claimRecipeSlug(tx, row, slugCandidates)`. For each candidate, it runs `tx.insert(recipes).values({ ...row, slug }).onConflictDoNothing({ target: recipes.slug }).returning()`. It returns the first inserted row, or `null`, and logs `modelLog.debug({ authorId, attempt }, 'recipe slug candidate taken')` for each taken candidate.
  - Replace `CreateRecipeWithRelationsInput.slug` with `slugCandidates: readonly string[]`. Run the claim as the first write in `createRecipeWithRelations`. When it returns `null`, return `null` from the transaction callback and the function, and skip the `findById` reload.
  - Change `forkRecipe(sourceId, authorId, title, slugCandidates)` the same way. The claim replaces the bare insert at `:479-488` and runs before the version insert and the `forkCount` update.
  - Update both docblocks: the `ON CONFLICT` semantics, and why there is no savepoint and no `23505` catch.
  - Run the 7.6 tests until green.
- [ ] 7.8 Write failing DB-backed tests in a new `apps/api/src/modules/recipe/service.slug.test.ts`. Every title carries `<m>`.
  - The same title twice: the second slug is `^<base>-<sfx>$`.
  - The title of a soft-deleted recipe (deleted via `deleteRecipe`): the new slug is suffixed and the deleted row keeps its slug.
  - `New`, `Starred` and a UUID title: suffixed.
  - `東京コーヒー`, `Кофе` and `!!!`: `^recipe-<sfx>$`.
  - Two forks without a title: `fork-of-<base>`, then suffixed.
  - A fork titled `<b>My</b> Fork` stores `My Fork`. A fork titled `<b></b>` stores `Fork of <source title>`.
  - Two merges with the same title: distinct slugs.
  - `Promise.all` of two `createRecipe` calls with the same new title: both resolve, distinct slugs, one version row each.
  - `updateRecipe` with a new title (amend and bump) keeps the slug.
- [ ] 7.9 Write failing exhaustion tests in a new `apps/api/src/modules/recipe/service.slug-exhaustion.test.ts`, using `vi.mock('@brewform/shared/utils', async (importOriginal) => ({ ...(await importOriginal()), randomSlugSuffix: () => 'bbbbbb' }))`:
  - Create title `Exhaust <m>` twice (taking `<base>` and `<base>-bbbbbb`). A third `createRecipe` rejects with `ConflictError` whose code is `SLUG_CONFLICT`.
  - Through `app.request`, the third `POST /api/v1/recipes` returns `409` with `error.code === 'SLUG_CONFLICT'` and `error.message === 'Could not allocate a unique recipe slug'`.
  - A third untitled fork of the same recipe returns `409 SLUG_CONFLICT`.
  - No `Unhandled error` log line (spy on the error-handler logger).
- [ ] 7.10 In `apps/api/src/modules/recipe/service.ts`:
  - Replace `generateUniqueSlug` with `buildRecipeSlugCandidates(title)`, which returns `slugCandidates(title, Array.from({ length: SLUG_SUFFIX_ATTEMPTS }, () => randomSlugSuffix()))`. Import both from `@brewform/shared/utils`, which keeps the 7.9 mock effective.
  - `createRecipe` passes `slugCandidates`.
  - `forkRecipe` sanitizes the supplied title with `sanitizeText`, falls back to `Fork of ${source.title}` when the result is empty, and passes `buildRecipeSlugCandidates(forkTitle)`.
  - On a `null` model result, both log `logger.warn({ authorId, attempts, constraint: 'recipe_slug_unique' }, 'recipe slug candidates exhausted')` and `throw new ConflictError('SLUG_CONFLICT', 'Could not allocate a unique recipe slug')`.
  - `mergeRecipes` keeps delegating to `createRecipe`.
  - Remove the `ensureUniqueSlug` import. Update the docblocks of `createRecipe`, `forkRecipe` and `mergeRecipes`, and keep the entry/exit debug logs.
  - Run 7.6–7.9 until green.
- [ ] 7.11 Replace the three `throw new Error('VALIDATION_ERROR: Title cannot be empty')` sites in `recipe/service.ts` with `throw new ValidationError('Title cannot be empty', [{ field: 'title', message: 'Title cannot be empty' }])`. Add a route test that `POST /api/v1/recipes` with `title: '<b></b>'` returns `400 VALIDATION_ERROR`.
- [ ] 7.12 Add a route test to `apps/api/src/modules/recipe/index.test.ts` that posts the same create payload twice and asserts `201` both times with different slugs.
- [ ] 7.13 Add drift guards:
  - `apps/api/src/modules/recipe/reserved-slugs.test.ts` iterates `recipe.routes` (the default export of `apps/api/src/modules/recipe/index.ts`). It asserts that every first path segment that is not a `:param` is in `RESERVED_RECIPE_SLUGS`.
  - `apps/web/src/router.reserved-slugs.test.ts` reads `apps/web/src/router.tsx` with `node:fs`. It asserts that every `path: 'recipes/<segment>…'` whose `<segment>` is not a `:param` is in `RESERVED_RECIPE_SLUGS`.
  - Both name the missing word on failure.
- [ ] 7.14 Write failing schema tests:
  - `packages/db/src/schema-indexes.test.ts`, via `getTableConfig`: `users` has indexes `user_email_lower_unique` and `user_username_lower_unique` with `config.unique === true`, and `setups` has `setup_user_default_unique` with `config.unique === true` and a defined `config.where`.
  - `packages/db/src/schema-constraints.test.ts` (DB-backed): inserting emails `Case<m>@example.com` and `case<m>@example.com` fails on the second with `cause.code === '23505'` and `cause.constraint_name === 'user_email_lower_unique'`. Usernames `Arda<m>`/`arda<m>` fail the same way on `user_username_lower_unique`. Two active default setups for one user fail on `setup_user_default_unique`. A soft-deleted default plus an active default succeed.
- [ ] 7.15 Edit `packages/db/src/schema.ts`:
  - Export `lower(column: AnyPgColumn): SQL`, returning `` sql`lower(${column})` ``, with the comment `// D03 raw-SQL exception: Drizzle has no lower() builder; used by the case-insensitive unique indexes and the matching lookups.` Import `SQL` from `drizzle-orm` and `uniqueIndex` from `drizzle-orm/pg-core`.
  - Add `uniqueIndex('user_email_lower_unique').on(lower(table.email))` and `uniqueIndex('user_username_lower_unique').on(lower(table.username))` to `users`. Keep `.unique()` on both columns and the existing plain indexes.
  - Add ``uniqueIndex('setup_user_default_unique').on(table.userId).where(sql`${table.isDefault} = true and ${table.deletedAt} is null`)`` to `setups`.
  - Update the `users` and `setups` docblocks.
  - Run `make db-generate`. Inspect, without editing, the new SQL: two `CREATE UNIQUE INDEX … USING btree (lower(…))` statements and `CREATE UNIQUE INDEX "setup_user_default_unique" ON "setup" USING btree ("user_id") WHERE …`.
  - Run `make db-migrate` and `make test-db-provision`. Run `make db-generate` again and confirm `No schema changes, nothing to migrate`.
  - Run `make test-specific filter=src/schema-indexes.test.ts` and `make test-specific filter=src/schema-constraints.test.ts`.
- [ ] 7.16 Write failing shared tests:
  - `packages/shared/src/schemas/common.test.ts`: `EmailSchema.parse('  Mixed.Case@Example.COM ') === 'mixed.case@example.com'`, and `'not-an-email'` fails.
  - `auth.test.ts`: `AuthRegisterSchema`, `AuthLoginSchema` and `PasswordResetSchema` lower-case and trim the email. A register username `' Arda '` parses to `'Arda'`.
  - `admin.test.ts`: the same for admin create/update email.
  - `packages/shared/src/utils/username.test.ts`: `isReservedUsername('Support')`, `('ADMIN')` and `('deleted-abc123')` are `true`; `('arda')` is `false`.
  - `mention.test.ts`: `parseMentions('@Arda @arda @bob')` → `['Arda', 'bob']`.
- [ ] 7.17 Implement the shared changes:
  - `EmailSchema = z.string().trim().toLowerCase().max(255).pipe(z.email())` in `packages/shared/src/schemas/common.ts`. Its JSDoc explains why the email check comes after the pipe (Zod 4 runs format checks before chained transforms). Export it from `schemas/index.ts`.
  - Use it in place of `z.email()` at `auth.ts:25,40,59` and `admin.ts:11,30` (`.optional()` on update). Leave the contact schema untouched.
  - Put `.trim()` first on the register and admin username schemas.
  - Add `RESERVED_USERNAMES` (the 17 names in the unique-identifiers spec) and `isReservedUsername` to `packages/shared/src/utils/username.ts`, and export them from `utils/index.ts`.
  - Make `parseMentions` de-duplicate by `toLowerCase()` key, keeping the first spelling.
  - JSDoc on every new export. Run `make test-shared` until green.
- [ ] 7.18 Write failing API tests in `apps/api/src/modules/auth/index.test.ts`:
  - Register `Mixed<m>@Example.com`: the stored email is `mixed<m>@example.com`. Registering `MIXED<m>@example.com` again gives `409 Email already registered`.
  - Login with `MIXED<m>@EXAMPLE.COM` gives `200`.
  - A legacy row inserted directly with `Legacy<m>@Example.com` logs in with `legacy<m>@example.com`, and forgot-password with `LEGACY<m>@example.com` creates a `password_reset` row.
  - `Arda<m>` and then `arda<m>` gives `409 Username already taken`.
  - After soft-deleting `Del<m>` / `del<m>@example.com`: registering `DEL<m>@Example.com` gives `409 Email already registered`, registering username `del<m>` gives `409 Username already taken`, and neither logs `Database constraint violation`.
  - `Support` and `deleted-abc<m>` give `409 Username already taken`.
  - Concurrent `Race<m>`/`race<m>` registrations give one `201` and one `409`.
  - In `apps/api/src/modules/admin/index.test.ts`: renaming user B to `ARDA<m>` while A holds `Arda<m>` gives `409 Username is already taken by another user.` Creating a user with the reserved username `brewform` through `POST /api/v1/admin/users` returns `201`. Before the request, the test hard-deletes any leftover `brewform` row through `db`, and it hard-deletes the created row in `finally` (`user_preferences` cascades).
- [ ] 7.19 Change the models:
  - `apps/api/src/modules/auth/model.ts`:
    - `findUserByEmail`, `findUserByUsername`, `isEmailTaken` and `isUsernameTaken` compare with `eq(lower(users.<col>), value.toLowerCase())`.
    - The two `is…Taken` functions drop `isNull(users.deletedAt)`. Their docblocks and the module docblock state the exception (the unique indexes cover soft-deleted rows, and deleted usernames stay reserved).
    - Export `USER_EMAIL_CONSTRAINTS = ['user_email_unique', 'user_email_lower_unique'] as const` and `USER_USERNAME_CONSTRAINTS = ['user_username_unique', 'user_username_lower_unique'] as const`.
  - `apps/api/src/modules/admin/model.ts`: `isEmailTaken`/`isUsernameTaken` change the same way, keeping `excludeId`. `throwIfUniqueViolation` maps through `USER_EMAIL_CONSTRAINTS.some((c) => isUniqueViolation(err, c))` and the username equivalent.
  - `apps/api/src/modules/user/model.ts`: `findByUsername` uses `eq(lower(users.username), username.toLowerCase())`.
  - `apps/api/src/modules/notification/model.ts`: `findMentionTargets` uses `inArray(lower(users.username), usernames.map((u) => u.toLowerCase()))`.
  - Import `lower` from `@brewform/db/schema`. Services never import it.
- [ ] 7.20 In `apps/api/src/modules/auth/service.ts`, `register` throws `USERNAME_ALREADY_EXISTS` when `isReservedUsername(data.username)` (before `isUsernameTaken`). The `23505` race mapping from task 2.11 uses `USER_EMAIL_CONSTRAINTS`/`USER_USERNAME_CONSTRAINTS`. Keep the existing `register started/completed` debug logs (no identifiers in logs). Run `make test-specific filter=src/modules/auth` and `make test-specific filter=src/modules/admin`.
- [ ] 7.21 Write case-insensitive lookup tests:
  - `apps/api/src/modules/user/index.test.ts`: `GET /api/v1/users/ARDA<m>` for user `Arda<m>` returns `200` with `username === 'Arda<m>'`.
  - `apps/api/src/modules/comment/service.test.ts`: a comment containing `@arda<m>` creates exactly one `mention` notification for `Arda<m>`.
- [ ] 7.22 Fix the own-profile check:
  - In `apps/web/src/pages/users/UserProfilePage.tsx`, compare ids instead of usernames: the loader's brews-tab check (`:74`) becomes `viewer?.id === profile.id`, and `isSelf` (`:123`) becomes `user?.id === profile.id`.
  - Add a case to `UserProfilePage.test.tsx`: viewer `{ id: 'u1', username: 'Arda' }` at `/u/arda` with profile `{ id: 'u1', username: 'Arda' }` renders the own-profile UI (no follow button) and requests the brew journal for `?tab=brews`.
  - Run `make test-web`.
- [ ] 7.23 In `packages/db/src/seed.ts`, add an exported pure `normalizeAdminEmail(raw: string | undefined): string` (`(raw || 'admin@brewform.local').trim().toLowerCase()`) and use it for the admin insert and the fallback select. Unit-test it in `packages/db/src/seed.test.ts` (`' Admin@BrewForm.Local '` → `'admin@brewform.local'`; `undefined` → the default). Confirm `packages/db/src/seed.idempotent.test.ts` still passes.
- [ ] 7.24 Make the default-setup switch transactional:
  - Write failing tests first. In `apps/api/src/modules/setup/service.test.ts`: `Promise.all` of `setDefault` on two setups of one user leaves exactly one active default, and each call resolves or rejects with an error that the route maps to `409`. `createSetup({ isDefault: true })` clears the previous default.
  - In `apps/api/src/modules/setup/index.test.ts`: the concurrent route calls return `200`/`409`, never `500`.
  - Then in `apps/api/src/modules/setup/model.ts`, `create(data)` and `update(id, data, ownerId)` run "clear the owner's other active default + write" in one `db.transaction` when `data.isDefault === true`. Remove `clearDefaultForUser`.
  - In `service.ts`, `createSetup`, `updateSetup` and `setDefault` stop calling it, and `setDefault` calls `model.update(id, { isDefault: true }, userId)`.
  - Update the docblocks and keep the entry/exit logs.
- [ ] 7.25 Add join-row re-add regression tests:
  - `apps/api/src/modules/recipe/index.test.ts`: `POST /:id/like` three times (like, unlike, like) leaves one `user_recipe_like` row. The same for `POST /:id/favourite`.
  - `apps/api/src/modules/follow/index.test.ts`: follow, unfollow, follow leaves one `user_follow` row.
  - `apps/api/src/modules/collection/service.test.ts`: add, remove, add leaves one `collection_item` row.
- [ ] 7.26 Write failing tests in a new `packages/db/src/check-identifiers.test.ts`:
  - Pure cases: `groupCaseInsensitiveDuplicates` over `A@x.io` (active), `a@x.io` (soft-deleted) and `b@x.io` returns one group with both ids, the deleted member marked fixable. `findMultipleDefaults` lists the older default for clearing. `formatReport` output contains no email address. `hasBlockingIssues` is `true` for any email, username or default group and `false` for empty slugs only.
  - DB-backed cases against `brewform_test`: `runCheck(db, {})` reports zero blocking issues. A recipe inserted with `slug = ''` is reported by id (skip when one already exists; delete it in `finally`), and `runCheck(db, { fixEmptySlugs: true })` gives it a slug matching `^recipe-<sfx>$`.
- [ ] 7.27 Implement `packages/db/src/check-identifiers.ts`:
  - Module docblock modelled on `check-users-empty.ts`: purpose, invocation, output contract and the "never prints emails" rule.
  - Exported pure functions plus `runCheck(database, { fixDeletedDuplicates?, fixSetupDefaults?, fixEmptySlugs? })`.
  - It loads only the columns listed in the unique-identifiers spec.
  - Fixes, each in its own transaction:
    - deleted duplicates → `email = deleted+<id>@deleted.invalid`, `username = deleted-<first 12 hex of id without dashes>`;
    - setup defaults → keep the newest `updatedAt`;
    - empty slugs → `slugCandidates('', suffixes)` from `@brewform/shared/utils`, trying the next candidate on a unique violation.
  - CLI via `node:util` `parseArgs` (`--fix-deleted-duplicates`, `--fix-setup-defaults`, `--fix-empty-slugs`), guarded by `if (import.meta.main)`. Exit code `1` on blocking issues left after fixes. `client.end()` in `finally`.
  - For active-account groups, print the manual admin-rename instructions.
  - Add `"check-identifiers": "tsx src/check-identifiers.ts"` to `packages/db/package.json`.
  - Run `make test-specific filter=src/check-identifiers.test.ts`.
- [ ] 7.28 Add a `db-check-identifiers` target to the `Makefile`: `docker compose run --rm app pnpm --filter @brewform/db run check-identifiers -- $(args)`, with a `##` help line and a `.PHONY` entry. Verify `make db-check-identifiers` exits `0` on the dev DB and `make db-check-identifiers args=--fix-setup-defaults` runs.
- [ ] 7.29 Docs:
  - `docs/api.md` gets an "Account identifiers" note: emails are trimmed and lower-cased; emails and usernames are unique case-insensitively, and usernames keep their display case; identifiers of deleted accounts stay reserved (`409`); reserved usernames are refused as taken.
  - `docs/deployment_coolify.md` upgrade notes add a "Before upgrading to wave 6" step. Run `docker compose -f compose.production.yml run --rm -w /app/packages/db --entrypoint node api src/check-identifiers.ts`, fix what it reports (opt-in flags, or the admin rename path), and then deploy. A failed migration leaves the database unchanged.
- [ ] 7.30 Group check: run `make check`, `make lint`, `make test-shared`, `make test-api` (after `make test-db-provision`), `make test-web`, `make test-specific filter=src/check-identifiers.test.ts`, `make db-check-identifiers` (exit `0`) and `make db-generate` (`No schema changes, nothing to migrate`), then `make fmt` and `make fmt-check`. All must be green.
```

## 4. Tasks to modify or remove

- **Group 7 (header + 7.1–7.11):** replace completely with the block in section 3. Old content maps
  as follows: 7.1→7.1, 7.2→7.2, 7.3→7.3 (now also cleans the two API test files), 7.4→7.4,
  7.5→7.8/7.9, 7.6 (`slugExists`)→**removed** (no pre-check, superseded by 7.6/7.7),
  7.7→7.7/7.10, 7.8→7.10, 7.9→7.11, 7.10→7.12, 7.11→7.30.
- **2.9** replace with:

  ```markdown
  - [ ] 2.9 Replace the manual `err.cause` unwrapping in `apps/api/src/modules/admin/model.ts#throwIfUniqueViolation` with `isUniqueViolation`: map any of `USER_EMAIL_CONSTRAINTS` (`user_email_unique`, `user_email_lower_unique`) to `EMAIL_ALREADY_EXISTS` and any of `USER_USERNAME_CONSTRAINTS` (`user_username_unique`, `user_username_lower_unique`) to `USERNAME_ALREADY_EXISTS`. Define both constants in `apps/api/src/modules/auth/model.ts` here; the `_lower_unique` indexes are created in task 7.15.
  ```

- **2.11** replace with:

  ```markdown
  - [ ] 2.11 In `apps/api/src/modules/auth` registration (`model.createUser` call path), translate `23505` on any of `USER_EMAIL_CONSTRAINTS` / `USER_USERNAME_CONSTRAINTS` into `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS` using the shared helper. This is the race fallback: task 7.19 makes the `isEmailTaken`/`isUsernameTaken` pre-checks cover soft-deleted rows and compare case-insensitively. Add entry/exit debug logs if missing.
  ```

- **2.7**: keep, but replace the phrase
  "re-registration with a soft-deleted user's stored email returns `409` `Email already registered`"
  with:

  ```markdown
  re-registration with a soft-deleted user's stored email returns `409` `Email already registered` (through the availability pre-check), and the error-handling "Re-registration conflict does not log the password hash" case reaches the insert through two concurrent registrations with the same new email
  ```

- **9.14** replace with:

  ```markdown
  - [ ] 9.14 Add a "Slugs" section to `docs/recipes.md`: built-in ASCII transliteration (Turkish included); a `recipe-<suffix>` fallback for non-Latin titles; a 6-character suffix from `23456789bcdfghjkmnpqrstvwxz` when the bare slug is taken (soft-deleted recipes included); reserved words and UUID-shaped titles always suffixed; the in-transaction `ON CONFLICT (slug) DO NOTHING` claim with `409 SLUG_CONFLICT` on exhaustion; slug immutability on rename; and legacy `_` slugs accepted by the QR route.
  ```

## 5. Cross-folder requests

1. **`specs/error-handling/spec.md` → "Unique-violation detection uses one shared helper"** (MODIFIED
   block owned by t3/error-handling). Replace this bullet:

   ```markdown
   - The recipe slug retry SHALL use `isUniqueViolation(err, 'recipe_slug_unique')`.
   ```

   with:

   ```markdown
   - Recipe slug allocation SHALL NOT catch unique violations: it claims slugs with `insert … on conflict ("slug") do nothing returning` inside the creation transaction (see the `recipe-slug` capability). A `recipe_slug_unique` violation that still reaches the global handler maps to `409 CONFLICT` like any other unique violation.
   ```

   Replace the registration bullet (the one that starts "`apps/api/src/modules/auth` registration SHALL
   translate a `23505` on") with:

   ```markdown
   - `apps/api/src/modules/auth` registration SHALL translate a `23505` on `user_email_unique` / `user_email_lower_unique` / `user_username_unique` / `user_username_lower_unique` from the user insert into the existing `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS` errors (already mapped to `409` by the auth controller). The availability pre-checks cover soft-deleted rows (see `unique-identifiers`), so this mapping is the race fallback.
   ```

   In the admin bullet, replace the tail
   "keeping its `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS` output." with
   "keeping its `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS` output for both the exact and the
   `_lower_unique` constraints."
2. **`specs/error-handling/spec.md` → "Known race and conflict paths never return 500"**, table row
   "Re-register after deletion". Replace the reproduction cell with: "register with the email (any
   letter case) of a soft-deleted account; the availability pre-check covers soft-deleted rows and the
   `user_email_unique`/`user_email_lower_unique` mapping is the race fallback". Keep the result
   `409 CONFLICT Email already registered`. The scenario "Re-registration conflict does not log the
   password hash" (requirement "Database error logs never contain query parameters or row values")
   keeps its text. Its test must reach the insert through two concurrent registrations with the same
   new email.
3. **`specs/recipe-write/spec.md`** (t1): add to the create/update schema requirement that
   `tasteNoteIds`, `equipmentIds` and `photoIds` SHALL reject duplicate ids with
   `400 VALIDATION_ERROR` (Zod `.refine((ids) => new Set(ids).size === ids.length, { message:
   'Duplicate ids are not allowed' })` on the shared array schemas in
   `packages/shared/src/schemas/recipe.ts`), because a duplicate otherwise violates
   `recipe_taste_note_recipe_version_id_taste_note_id_unique` /
   `recipe_equipment_recipe_version_id_equipment_id_unique` /
   `recipe_version_photo_recipe_version_id_photo_id_unique` and returns 409 (500 today). Suggested
   scenario: "WHEN `POST /api/v1/recipes` sends `tasteNoteIds: [a, a]` THEN the response is `400`
   `VALIDATION_ERROR` and no recipe row is written". Suggested task in group 8 (after 8.1):
   "- [ ] 8.? Add failing cases to `packages/shared/src/schemas/recipe.test.ts` that duplicate ids in
   `tasteNoteIds`, `equipmentIds` and `photoIds` are rejected on create and update, then add the
   refine to the three array schemas; add a route test in `apps/api/src/modules/recipe/index.test.ts`
   for `tasteNoteIds: [a, a]` → `400`."
4. **`proposal.md`**:
   - In "Slugs, collection visibility and error mapping (t3)", replace the first bullet with: "Built-in
     slug pipeline (Turkish and Latin transliteration, `recipe-<suffix>` fallback) with real uniqueness
     across active and soft-deleted rows: the bare slug first, then a random 6-character suffix from a
     no-vowel alphabet, claimed inside the transaction with `ON CONFLICT (slug) DO NOTHING` (no retry
     loop, no savepoints), reserved-word and UUID guards with drift tests, and `409 SLUG_CONFLICT` on
     exhaustion. Duplicate titles, repeat forks and repeat merges stop returning 500. Slugs stay
     immutable, and legacy `_` slugs get QR codes."
   - Add a bullet after it: "Account identifiers: emails are trimmed and lower-cased by one shared
     schema; email and username uniqueness becomes case-insensitive through `lower()` unique indexes
     (usernames keep their display case); availability checks cover soft-deleted accounts; reserved
     usernames are refused; one active default setup per user is enforced; an operator script detects
     and fixes conflicting data before the migration."
   - Replace the `recipe-slug` capability line with: "- `recipe-slug`: built-in transliterating slugs,
     random no-vowel suffixes claimed in-transaction with `ON CONFLICT DO NOTHING`, reserved guards,
     `SLUG_CONFLICT`, immutability and legacy-slug addressability." and add after it: "-
     `unique-identifiers`: normalized, case-insensitive email and username uniqueness, reserved
     identifiers of deleted accounts, reserved usernames, one default setup per user, join-row
     re-creation, and the identifier-check script."
   - In "Impact" → "Shared and DB code", append: "`packages/db/src/check-identifiers.ts` (operator
     check, `make db-check-identifiers`), new unique indexes `user_email_lower_unique`,
     `user_username_lower_unique` and `setup_user_default_unique`".
5. **`design.md`**: apply section 2 (2a–2e). Also extend the risk line "Migration numbering across
   tracks (t1 notes table, t7 extension and indexes)" to "(t1 notes table, t3 identifier indexes, t7
   extension and indexes)".
6. **AGENTS.md consolidation (group 24, t8)**: add to the "Database rules" bullets: "Case-insensitive
   identifiers: compare `user.email`/`user.username` with `eq(lower(col), value.toLowerCase())` using
   the `lower()` helper from `@brewform/db/schema` (served by the `_lower_unique` indexes). Claim
   unique generated values (recipe slugs) with `insert … onConflictDoNothing({ target }).returning()`
   inside the transaction; never catch `23505` inside a transaction and keep using it (Postgres aborts
   the transaction). A soft-deleted join row with a composite unique key is revived with
   `onConflictDoUpdate` that clears `deleted_at`."
7. **`specs/web-data-loading` / group 14 (t5)**: when `UserProfilePage` is touched by the loader
   work, keep the id-based own-profile checks from task 7.22 (`viewer?.id === profile.id`,
   `user?.id === profile.id`).

## 6. Remaining open questions (defaults chosen; nothing blocks implementation)

1. **Can a user who deleted their account register again with the same email?** Default: no in wave
   6. Identifiers of deleted accounts stay reserved, and the API answers `409 Email already
   registered`. The recommended follow-up is to tombstone the email
   (`deleted+<id>@deleted.invalid`) on self-deletion only, so admin-deleted (moderated) accounts stay
   blocked. It belongs with the deferred account-deletion anonymisation (D99.20+), which the proposal
   lists as having no wave-6 owner.
2. **Should deleted usernames ever be released?** Default: never. This prevents a stranger
   inheriting old `/u/<name>` links and `@mentions`.
3. **Reserved usernames list.** Default: the 17 names plus the `deleted-` prefix. Applied at
   self-registration only. Admins and the seed are exempt.
4. **Setup default index in this change.** Default: included (small, and the same migration as the
   identifier indexes). The data check covers it, and `--fix-setup-defaults` remediates.
5. **Empty legacy slug.** Default: rewritten only with the opt-in `--fix-empty-slugs`. Every other
   existing slug stays untouched.
6. **Redundant indexes** (`recipe_slug_idx`, `user_email_idx`, `user_username_idx`,
   `password_reset_token_idx`, `badge_rule_idx`, and the kept exact email/username constraints).
   Default: keep them in wave 6 (the seed's conflict target needs the exact constraints). Drop the
   plain duplicates in a later perf cleanup.
7. **Catalog name uniqueness** (equipment, vendors, coffee varieties, taste notes). Default: no
   constraint in wave 6. It needs a de-duplication and merge UI first.
8. **Duplicate ids in recipe payloads.** Default: reject with `400` (cross-folder request 3). If the
   recipe-write owner declines, the t3 global `409 CONFLICT` still prevents a `500`.
9. **`generateUniqueUsername`** (unused, numeric suffixes). Default: leave it. Any future OAuth flow
   must use the `lower()`-aware `isUsernameTaken`.
