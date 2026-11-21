# r7-extras-2: TasteAutocomplete i18n, bounded replies, deleted-account identity

Research notes for E9 to E11 (`audit/decisions.md`, "Added after r6"). Every claim was re-checked
against the working tree on 2026-11-21 (branch `wave-6-audit-remediation` @ `e18f2bd`). Line
numbers are as of that commit. Task ids use the track prefix `R7.`; the assembler renumbers.

| Extra | Verdict | Capability touched | Effort |
|---|---|---|---|
| E9 `TasteAutocomplete` hard-codes English | **bigger**: the attribute guard matches only single-quoted values (Biome writes JSX attributes in double quotes), so it has never matched one; 1 more template attribute (`AdminUserDetailPage` avatar `alt`); hard-coded JSX text in `TasteNotesFilter`, `SessionRestoreBanner`, `MetadataBadges` | `i18n` (MODIFIED ×1, ADDED ×1) | S |
| E10 replies query of `findByRecipe` has no limit | **confirmed**; the decision's default (one `LIMIT parents × cap`) is wrong: one long thread uses up the whole limit and other threads lose their replies. Fixed with a limit for each parent through Drizzle's relational `with` (one query, no raw SQL, no window function) | `comment-pagination` (ADDED) | M |
| E11 comments of a deleted account show its name | **bigger**: the decision's premise is false: account deletion does NOT soft-delete recipes. Recipe list, detail, feed, cursor, crawler meta, collections (detail, items, public browse), equipment and coffee-variety recipe lists and the `?author=` filter all expose the deleted account | `account-deletion` (ADDED) | L |

Library facts checked:

- **drizzle-orm** (Context7 `/drizzle-team/drizzle-orm-docs`, joins): with a nested select object
  under `leftJoin`, "type inference will mark the entire nested object as nullable", and the object
  is `null` when the join misses. Putting `isNull(users.deletedAt)` into the join condition
  therefore returns `author: null` for a deleted account. This is the existing pattern in
  `notification/model.ts:74,158`.
- **drizzle-orm 0.45.4, installed source** (read in the `app` container,
  `node_modules/.pnpm/drizzle-orm@0.45.4_postgres@4.1.0/node_modules/drizzle-orm`):
  - `relations.d.ts:102-124` `DBQueryConfig`: `where`, `orderBy` and `limit` exist only when
    `TRelationType extends 'many'`. A `one` relation (`author: { columns }`) takes no `where`, so
    relational loads must select `deletedAt` and mask it in code.
  - `pg-core/dialect.js:1029-1047` (`buildRelationalQueryWithoutPK`): every nested relation is a
    `left join lateral (…)` subquery built with that relation's own `where`/`orderBy`/`limit`.
    A `limit` on a `many` relation is therefore applied **for each parent row**.
  - `relations.js:205-243` (`normalizeRelation`): for a `many` relation without `relationName`,
    every relation of the target table whose `referencedTable` is the source table counts as a
    reverse relation, the `many` relation itself included. `commentsRelations` has
    `parentComment: one(comments, …)` and `replies: many(comments)` (`schema.ts:1517-1521`), so
    `with: { replies: … }` throws today: "There are multiple relations between "comments" and
    "comments". Please specify relation name". With `relationName` on both, the
    `relation !== referencedTableRelation` check leaves exactly `parentComment`.
- **drizzle-orm** (Context7 docs, joins): `crossJoinLateral(subquery)` and
  `leftJoinLateral(subquery, sql\`true\`)` exist. Rejected for E10: the left variant needs a raw
  `sql\`true\`` fragment (outside the D03 registry), and the cross variant needs a self-alias of
  `comments` plus flat column aliases for the duplicated `id` columns of `comments` and `users`.

---

## Extra E9: TasteAutocomplete hard-codes English, and the literal guard is blind

### 1. Verification

- `apps/web/src/components/taste/TasteAutocomplete.tsx` (uses `useSafeT()`, `:42`):
  - `:261` `` title={`Intensity ${intensity}/3 — click to change`} ``
  - `:316` `Loading taste notes...` (JSX text)
  - `:406` `No taste notes found.`
  - `:413` `Click intensity dots on selected notes to adjust (1–3).`
  - `:420` `SCAA Flavor Wheel Reference` (link text). The key `taste.reference` already holds this
    exact English text (`en.json:185`, tr `SCAA Lezzet Tekerleği Referansı`).
- **The guard is blind.** `apps/web/src/i18n-literals.test.ts:45`
  `LITERAL_ATTR_RE = /(?:placeholder|aria-label|alt|title)='([A-Za-z][^']*)'/g` matches only
  single-quoted values. Biome's JSX quote style defaults to double quotes (`biome.json` sets only
  `javascript.formatter.quoteStyle: "single"`, not `jsxQuoteStyle`), and every literal attribute in
  the tree is double-quoted: `grep -rnE '(placeholder|aria-label|alt|title)="…"'` lists only
  `RegisterPage.tsx:113,124`, `LoginPage.tsx:66`, `ForgotPasswordPage.tsx:75`, which are the
  allowlisted examples. So the first assertion has never matched anything. The test also scans
  line by line, so a value that Biome wraps onto the next line is missed.
- `:47` `TEMPLATE_ARIA_RE` covers only `aria-label`, and `:90` exempts any template that contains
  `t(` (so `` `${t('x')} more English` `` passes).
- The spec codifies the single-quote form: `openspec/specs/i18n/spec.md:536-569` ("A
  literal-attribute regression test …", `placeholder='[A-Za-z]...'`). Its allowlist line numbers
  are stale, and its `'YYYY-MM-DD'` (`SettingsPage.tsx:289`) example no longer exists.
- **Sweep, template-literal attributes** (`grep -rnE "(placeholder|aria-label|alt|title|label)=\{\s*\`"`,
  production `.tsx`):
  | Site | Static text after removing `${…}` | Flag? |
  |---|---|---|
  | `TasteAutocomplete.tsx:261` `title` | `Intensity /3 — click to change` | **yes** |
  | `pages/admin/AdminUserDetailPage.tsx:110` `` alt={`${…}'s avatar`} `` | `'s avatar` | **yes**: reuse `a11y.userAvatar` (`en.json:485`, used by `UserProfilePage.tsx:134`) |
  | `CommentSection.tsx:342` `` aria-label={`${t('comment.commentBy')} ${getAuthorName(comment)}`} `` | ` ` | no |
  | `RecipeVersionsPage.tsx:67`, `VersionDiffPage.tsx:140` SEOHead `title` | ` – ` | no |
  | `AdminTasteNotesPage.tsx:81` `label` | ` *` | not a guarded attribute |
  No multi-line template attribute and no `{'…'}` literal attribute exists today. With quotes
  fixed, the string-literal check flags only the four allowlisted placeholders.
- **Sweep, JSX text** (same failing class, found while sweeping, not attributes):
  - `components/recipe/TasteNotesFilter.tsx:319` `No taste notes found.` (uses `useSafeT()`, `:38`).
  - `components/SessionRestoreBanner.tsx:40-42,57,60`: both messages ("Couldn't reach the
    server…", "Couldn't restore your session…"), `Retrying...`/`Retry`, `Dismiss`; no translation
    hook. It is rendered by `Layout.tsx:30` (inside `AppProviders`). No test file.
  - `components/recipe/MetadataBadges.tsx:94,98` `{priorVersions} prior {… 'version' : 'versions'}`;
    no translation hook (its tests render without a provider). This file shows on every recipe page.
  - Already owned elsewhere: `FollowButton.tsx:82` (r4 #23); `CommentSection.tsx:84` `'Unknown'`
    and `RecipeCard.tsx:79` `'unknown'` (fixed by E11 as the deleted-user label). Left as is:
    `ShareSection.tsx` `Facebook`/`Reddit` (brand names) and `SettingsPage.tsx:186` language
    endonyms. `RecipeDetailPage.tsx:107` JSON-LD `'recipe'` is machine-facing structured data.
- Tests: `TasteAutocomplete.test.tsx` asserts the English texts (`:130` "No taste notes found.",
  `:274,:294` "Loading taste notes..."), with no tr case. `MetadataBadges.test.tsx:122,128` asserts
  "2 prior versions"/"1 prior version".

**Verdict: bigger.** Besides the reported strings, the guard has never caught a double-quoted
attribute, and three more components hard-code English.

### 2. Root cause

The component was never converted. The guard was written for single quotes and for one attribute
in template form, which let both slip.

### 3. Fix design

**Keys** (flat dotted, en and tr in the same change):

| Key | en | tr |
|---|---|---|
| `taste.autocomplete.loading` | `Loading taste notes...` | `Tat notları yükleniyor...` |
| `taste.notFound` | `No taste notes found.` | `Tat notu bulunamadı.` |
| `taste.autocomplete.intensityHint` | `Click intensity dots on selected notes to adjust (1–3).` | `Yoğunluğu ayarlamak için seçili notlardaki noktalara tıklayın (1–3).` |
| `a11y.taste.intensityTitle` | `Intensity {level}/3 — click to change` | `Yoğunluk {level}/3 — değiştirmek için tıklayın` |
| `session.restore.networkError` | `Couldn't reach the server. Check your connection and retry.` | `Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.` |
| `session.restore.serverError` | `Couldn't restore your session — the server had an error. Retry?` | `Oturumunuz geri yüklenemedi — sunucuda bir hata oluştu. Tekrar denensin mi?` |
| `common.retrying` | `Retrying...` | `Yeniden deneniyor...` |
| `common.dismiss` | `Dismiss` | `Kapat` |
| `recipe.priorVersions.one` | `{count} prior version` | `{count} önceki sürüm` |
| `recipe.priorVersions.other` | `{count} prior versions` | `{count} önceki sürüm` |

Reused: `taste.reference` (flavour-wheel link), `common.retry` (`Retry` / `Tekrar dene`),
`a11y.userAvatar` (`{name}'s avatar`). The English values match the current literals, so the
existing English assertions keep passing.

**Component edits:**
- `TasteAutocomplete.tsx`: `title={t('a11y.taste.intensityTitle').replace('{level}', String(intensity))}`,
  `{t('taste.autocomplete.loading')}`, `{t('taste.notFound')}`,
  `{t('taste.autocomplete.intensityHint')}{' '}`, link text `{t('taste.reference')}`. These lines are
  separate from r6 E4's `selectedNotes`/`linkedNotes` change (`:237`, props), so the edits do not
  overlap. Apply after R6.9.
- `TasteNotesFilter.tsx:319`: `{t('taste.notFound')}`.
- `AdminUserDetailPage.tsx:110`: `alt={t('a11y.userAvatar').replace('{name}', user.displayName || user.username)}`.
- `SessionRestoreBanner.tsx`: `const { t } = useTranslation();` (it renders under `I18nProvider`
  in `Layout`); messages from `session.restore.networkError`/`serverError`, button texts
  `common.retrying`/`common.retry`, `common.dismiss`.
- `MetadataBadges.tsx`: `const t = useSafeT();` (bare test renders have no provider);
  `t(priorVersions === 1 ? 'recipe.priorVersions.one' : 'recipe.priorVersions.other').replace('{count}', String(priorVersions))`
  in both branches. E11 also edits this file (deleted-author label); same hook.

**Guard rewrite** (`apps/web/src/i18n-literals.test.ts`), one scanner over whole file contents
(line numbers come from the match index):

```ts
const ATTR = String.raw`(?<![\w-])(placeholder|aria-label|alt|title)`;
// "…" or '…'
const QUOTED_RE = new RegExp(`${ATTR}=(?:"([^"]*)"|'([^']*)')`, 'g');
// {'…'} / {"…"}
const EXPR_LITERAL_RE = new RegExp(`${ATTR}=\\{\\s*(?:'([^']*)'|"([^"]*)")\\s*\\}`, 'g');
// {`…`}, also when wrapped onto the next line
const TEMPLATE_RE = new RegExp(`${ATTR}=\\{\\s*\`([^\`]*)\`\\s*\\}`, 'g');
const LETTERS_RE = /\p{L}{2,}/u;

/** Static text of a template literal body: every `${…}` interpolation removed (brace depth counted). */
export function templateStaticText(body: string): string { /* scan chars, skip from "${" to its matching "}" */ }

/** Every untranslated attribute in one file's source, with 1-based line numbers. */
export function scanSource(source: string): Array<{ line: number; text: string }> { … }
```

- A quoted or expression literal is a violation when its value matches `LETTERS_RE`, except a
  `placeholder` in `ALLOWED_PLACEHOLDERS` (`you@example.com`, `coffee_lover`).
- A template is a violation when `templateStaticText(body)` matches `LETTERS_RE`. The `t(`
  exemption is removed.
- `\p{L}{2,}` (two letters) keeps a single version letter such as `` `v${n}` `` legal and catches
  Turkish letters.
- The two existing `it`s are merged into one walk with one failure message. A
  `describe('scanSource')` checks inline fixtures: double-quoted, single-quoted, `{'…'}` and
  template violations are flagged; a template wrapped onto the next line is flagged with the
  attribute's line number; `` `${a} – ${t('b')}` `` passes; an allowlisted placeholder passes;
  `data-title="x"` is ignored. Without this, a broken regex could silently match nothing again.
- Rejected: a TSX AST walk (TypeScript compiler API) is more exact but much more code, and the
  current tree has no case the regex scanner misses. Also rejected: guarding JSX text; it needs a
  JSX parser, and regexes over JSX text flag code. The new requirement below covers the
  JSX-text items by name with tr render tests.

### 4. Tests (failing first)

- `apps/web/src/i18n-literals.test.ts`: the rewritten walk fails on `TasteAutocomplete.tsx:261` and
  `AdminUserDetailPage.tsx:110`. The `scanSource` fixture cases pass once the scanner exists.
- `apps/web/src/components/taste/TasteAutocomplete.test.tsx`, new `describe('tr locale')` using
  `renderWithAppProviders([{ path: '/', element: <TasteAutocomplete … /> }, { path: '/resources/taste-notes', loader: tasteNotesLoader }], { locale: 'tr' })`
  and `t(key, 'tr')` from `@brewform/shared/i18n` (the `EquipmentPicker.test.tsx:95-98` pattern):
  - the hint `t('taste.autocomplete.intensityHint','tr')` and the link `t('taste.reference','tr')` render;
  - focus with a never-resolving lookup → `t('taste.autocomplete.loading','tr')`;
  - `selectedIds: ['leaf-1']` after load → the intensity button has
    `title === t('a11y.taste.intensityTitle','tr').replace('{level}','2')`;
  - type `zzz` → `t('taste.notFound','tr')`.
  These fail today (English is rendered).
- `apps/web/src/components/recipe/TasteNotesFilter.test.tsx`: tr empty state shows `t('taste.notFound','tr')`.
- New `apps/web/src/components/SessionRestoreBanner.test.tsx`:
  `renderWithAppProviders(<SessionRestoreBanner />, { locale: 'tr', auth: { sessionError: 'network', refreshUser: vi.fn() } })`
  shows `t('session.restore.networkError','tr')`, `t('common.retry','tr')`, `t('common.dismiss','tr')`;
  `sessionError: 'server'` shows `serverError`.
- `apps/web/src/components/recipe/MetadataBadges.test.tsx`: the en cases (`:122,:128`) stay; add a
  case rendered under an `I18nProvider` with `brewform_locale = 'tr'` asserting
  `t('recipe.priorVersions.other','tr').replace('{count}','2')`.
- `packages/shared/src/i18n/i18n.test.ts` (parity) covers the new keys.

### 5. Spec impact

`openspec/specs/i18n/spec.md`. No other track touches this capability.

MODIFIED (full block):

```markdown
### Requirement: A literal-attribute regression test guards against new stragglers

A regression test (`apps/web/src/i18n-literals.test.ts`) SHALL walk `apps/web/src/**/*.tsx` (excluding `*.test.*`) and SHALL fail on every `placeholder`, `aria-label`, `alt` or `title` attribute whose value carries untranslated text, in every quoting form, outside an explicit in-test allowlist.

The test SHALL scan whole file contents, so an attribute value that Biome wraps onto the next line
is still checked, and SHALL flag:

- a quoted string value in either quote style (`title="Enter name"`, `title='Enter name'`; Biome
  writes JSX attributes in double quotes) that contains two consecutive letters;
- a string-literal expression value (`title={'Enter name'}`, `title={"Enter name"}`) that contains
  two consecutive letters;
- a template-literal value whose static text, after removing every `${…}` interpolation,
  contains two consecutive letters. A template made only of interpolations and punctuation
  (`` `${data.title} – ${t('recipe.versionHistory')}` ``) passes; a `t()` call inside a template
  does not exempt its static text.

Letters are matched with the Unicode property `\p{L}`. The test SHALL also check its own matcher
against inline fixtures (each flagged form, a wrapped template, an allowlisted value and an
interpolation-only template), so a broken pattern cannot silently match nothing. The allowlist
documents the deliberate exceptions:

- Locale-neutral input examples, kept untranslated by policy (D40): `you@example.com` (register,
  login and forgot-password pages) and `coffee_lover` (register page).
- Format tokens such as `YYYY-MM-DD`.
- Brand names and other locale-invariant values.

**Reason:** D99.7 recurred because nothing gates literal attributes: D40's conversion held for
visible JSX text, but placeholders, aria labels and SEO strings regressed within one wave. The
parity test guards key symmetry; this test guards key _usage_. The first version matched only
single-quoted values and only template `aria-label`s, so it never matched a Biome-formatted
attribute and missed the taste picker's intensity `title` and the admin avatar `alt`.

#### Scenario: Regression test passes on the converted tree

- **WHEN** the web test suite runs
- **THEN** the literal-attribute test passes: every non-allowlisted attribute value routes
  through `t()`

#### Scenario: A new literal fails CI

- **WHEN** a developer adds `placeholder="Enter name"` (or `placeholder='Enter name'`) to a component without a `t()` call
- **THEN** the regression test fails, naming the file, line and attribute

#### Scenario: A template-literal title fails CI

- **WHEN** a developer adds `` title={`Intensity ${level}/3`} ``, on one line or wrapped onto the next
- **THEN** the regression test fails, naming the file and the attribute's line

#### Scenario: An interpolation-only template passes

- **WHEN** a component renders `` title={`${data.title} – ${t('recipe.versionHistory')}`} ``
- **THEN** the regression test does not flag it
```

ADDED:

```markdown
### Requirement: Taste picker, session banner and version badge strings are translated

`TasteAutocomplete`, `TasteNotesFilter`, `SessionRestoreBanner` and `MetadataBadges` SHALL render every user-visible string through `t()` with en and tr values.

- `TasteAutocomplete`: loading (`taste.autocomplete.loading`), empty (`taste.notFound`), hint
  (`taste.autocomplete.intensityHint`), flavour-wheel link (`taste.reference`) and the intensity
  button `title` (`a11y.taste.intensityTitle`, `{level}` filled with `.replace`).
- `TasteNotesFilter`: empty state (`taste.notFound`).
- `SessionRestoreBanner`: `session.restore.networkError`, `session.restore.serverError`,
  `common.retry`, `common.retrying`, `common.dismiss`.
- `MetadataBadges`: `recipe.priorVersions.one` / `recipe.priorVersions.other` (`{count}`).
- The admin user detail avatar `alt` uses `a11y.userAvatar`.

#### Scenario: Taste picker under the tr locale

- **WHEN** the recipe form renders `TasteAutocomplete` with locale `tr`, one selected note at intensity 2, and the user searches for a term with no match
- **THEN** the hint, the flavour-wheel link, the empty message and the intensity button's `title` show the tr values, and no English text from the picker remains

#### Scenario: Session banner under the tr locale

- **WHEN** session restore fails with a network error and the locale is `tr`
- **THEN** the banner shows the tr network message and tr Retry and Dismiss buttons
```

### 6. Docs / ledger impact

None. No doc describes these strings, and no D99 entry exists. (D99.7 is the history the
requirement's Reason cites; it stays as is.)

### 7. Draft tasks

- [ ] R7.1 Failing first (after R6.8/R6.9): rewrite `apps/web/src/i18n-literals.test.ts` as the
  whole-file scanner from audit/r7 E9 §3 (both quote styles, `{'…'}`, templates with `${…}`
  removed, `\p{L}{2,}`, no `t(` exemption, a `describe('scanSource')` with fixtures); add the tr
  cases to `components/taste/TasteAutocomplete.test.tsx`, `components/recipe/TasteNotesFilter.test.tsx`
  and `components/recipe/MetadataBadges.test.tsx`, and a new `components/SessionRestoreBanner.test.tsx`;
  run `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/i18n-literals.test.ts src/components/taste src/components/recipe/TasteNotesFilter.test.tsx src/components/recipe/MetadataBadges.test.tsx src/components/SessionRestoreBanner.test.tsx`
  and see the guard fail on `TasteAutocomplete.tsx:261` and `AdminUserDetailPage.tsx:110`, and
  the tr cases fail.
- [ ] R7.2 Add the ten keys from audit/r7 E9 §3 to `packages/shared/src/i18n/en.json` and
  `tr.json`; convert `TasteAutocomplete.tsx` (title, loading, empty, hint, link), `TasteNotesFilter.tsx:319`,
  `AdminUserDetailPage.tsx:110` (`a11y.userAvatar`), `SessionRestoreBanner.tsx` (`useTranslation`)
  and `MetadataBadges.tsx` (`useSafeT`, singular/plural keys); re-run R7.1 until green; run
  `make check-web` and `make test-shared`.

### 8. Risks / migration notes

Web only, no data change. The stronger guard may flag literals added by other tracks in the same
change; that is the point. Fix them with keys, not allowlist entries.

---

## Extra E10: the replies query of `findByRecipe` has no limit

### 1. Verification

- `apps/api/src/modules/comment/model.ts:83-104`: the top-level page is bounded
  (`.limit(perPage).offset(…)`, `:74-75`; `perPage ≤ 100` by `PaginationSchema`,
  `packages/shared/src/schemas/common.ts:6`), but the replies query has no limit:

  ```ts
  .where(and(inArray(comments.parentCommentId, parentIds), isNull(comments.deletedAt)))
  .orderBy(asc(comments.createdAt));
  ```

  It loads every live reply of every parent on the page into the API process and groups them in a
  `Map` (`:106-118`). This breaks AGENTS.md "Bounded reads".
- Write path: replies are allowed only for the recipe author or an admin
  (`service.ts:72-74`); `CommentCreateSchema.content` is up to 5,000 characters
  (`packages/shared/src/schemas/comment.ts:8`); the only rate limits are `comment-ip`/`comment-user`
  (5 per minute). So one author can add about 7,200 replies a day to one comment, each up to 5 KB,
  and every anonymous list request then reads all of them.
- Index: `comment_parent_created_idx (parent_comment_id, created_at)` (`schema.ts:740-745`) serves
  a per-parent ordered limit.
- Response: `CommentWithRepliesOutputSchema` (`packages/shared/src/schemas/responses/comment.ts:39-41`)
  has no truncation flag. Web: `CommentSection.tsx:420-470` renders every reply. Its optimistic
  inserts build `CommentWithRepliesOutput` objects (`:207-236`).
- Specs: `comment-pagination` is about the web loader and "Load More" for top-level comments; no
  rule bounds replies. `docs/comments.md:205` says replies come "oldest first".
- Interplay: r1 R1.6 adds `eq(comments.recipeId, recipeId)` to this replies query, and r6 E1 adds
  `softDeleteReplies` (a write, unaffected).
- Tests: `comment/model.test.ts:104-190` (`findByRecipe`) has no reply-count case.

**Verdict: confirmed.**

**The decision's default does not work.** "Replies oldest-first with a hard cap per page request
(derived from the page's parent count × a per-parent cap)" as one `LIMIT parentCount × CAP`
query: if parent P1 has 1,000 replies, they use up the whole limit, and P2 to P20 on the same
page come back with no replies. Trimming in the service cannot bring back rows SQL already
dropped. Ordering by `(parentCommentId, createdAt)` only changes which threads lose their
replies. A per-parent cap at write time would make the global limit safe, but it adds a new
409/400 error path, a web error state and i18n, and it still lets older rows (from before the cap)
or concurrent inserts go over the cap.

### 2. Root cause

The replies query was written as "all replies of these parents" with no bound for each parent,
and the response has no way to say that a thread was cut.

### 3. Fix design

**Limit for each parent in one query, through Drizzle's relational `with`.** Drizzle 0.45 builds
each nested `many` relation as a `left join lateral` subquery with its own `limit` (installed
`pg-core/dialect.js:1029-1047`), which is exactly a per-parent `LIMIT` with no raw SQL and no
window function.

1. `packages/shared/src/constants/comments.ts` (new, re-exported from `constants/index.ts`):

   ```ts
   /** Most replies `GET /api/v1/comments/recipe/:recipeId` returns per top-level comment (oldest first). */
   export const MAX_REPLIES_PER_COMMENT = 20;
   ```

   20 keeps the worst case at `perPage (100) × 21` rows per request (420 at the default
   `perPage` 20). The web imports it for the hint text through the existing
   `@brewform/shared/constants` alias.
2. `packages/db/src/schema.ts:1517-1521`: name the self-relation so `replies` resolves:

   ```ts
   parentComment: one(comments, {
     fields: [comments.parentCommentId],
     references: [comments.id],
     relationName: 'commentReplies',
   }),
   replies: many(comments, { relationName: 'commentReplies' }),
   ```

   Relations are not part of the drizzle-kit snapshot: `make db-generate` must print "No schema
   changes, nothing to migrate". Nothing uses `parentComment`/`replies` today (grep), so nothing
   else changes.
3. `comment/model.ts#findByRecipe` becomes one relational query plus the count. This deletes the
   second query and the `Map` grouping:

   ```ts
   const where = and(eq(comments.recipeId, recipeId), isNull(comments.deletedAt), isNull(comments.parentCommentId));
   const [rows, totalResult] = await Promise.all([
     db.query.comments.findMany({
       where,
       orderBy: [desc(comments.createdAt), desc(comments.id)],
       limit: perPage,
       offset: (page - 1) * perPage,
       with: {
         author: { columns: AUTHOR_COLUMNS },
         replies: {
           // r1 #5: replies only from this recipe; r6 E1 cascade keeps this consistent.
           where: (r, { and, eq, isNull }) => and(eq(r.recipeId, recipeId), isNull(r.deletedAt)),
           orderBy: (r, { asc }) => [asc(r.createdAt), asc(r.id)],
           limit: MAX_REPLIES_PER_COMMENT + 1,
           with: { author: { columns: AUTHOR_COLUMNS } },
         },
       },
     }),
     db.select({ count: count() }).from(comments).where(where),
   ]);
   return {
     comments: rows.map(({ replies, ...comment }) => ({
       ...comment,
       replies: replies.slice(0, MAX_REPLIES_PER_COMMENT),
       hasMoreReplies: replies.length > MAX_REPLIES_PER_COMMENT,
     })),
     total: totalResult[0].count,
   };
   ```

   - `AUTHOR_COLUMNS = { id: true, username: true, displayName: true, avatarUrl: true }` (E11 adds
     `deletedAt: true` and the masking, see E11 §3).
   - Use the callback form for the nested `where`/`orderBy`, so the columns refer to the nested
     alias (`comments_replies`) and not to the outer `comments`.
   - Every row keeps today's fields (all `comments` columns plus `author`), plus `hasMoreReplies`.
     Timestamps in nested relations come back as `Date` (`createdAt` is `withTimezone: true`; the
     recipe detail's nested versions already rely on this). The DB test asserts it.
   - `desc(comments.id)` / `asc(r.id)` are tie-breaks, so offset pages and the 20-reply cut are
     the same on every request when timestamps are equal.
   - Bound: `perPage` parents and `≤ MAX + 1` replies each, all in SQL. The `+ 1` row only
     detects truncation.
   - Docblock: add the per-parent cap, the order, `hasMoreReplies`, the same-recipe rule and "one
     relational query; nested `limit` is applied per parent (left join lateral)".
4. `CommentWithRepliesOutputSchema` gains `hasMoreReplies: z.boolean()` (required, because the API
   always sets it). Its docblock names `MAX_REPLIES_PER_COMMENT`.
5. Route `GET /recipe/:recipeId` description (`comment/index.ts:128`): "Paginated list of top-level
   comments (newest first) with at most 20 replies each (oldest first); `hasMoreReplies` is true
   when a comment has more." Regenerate `docs/api-reference.md`.
6. Web `CommentSection.tsx`: under a thread with `comment.hasMoreReplies`, render
   `<p className="text-xs text-[color:var(--text-secondary)]">{t('comment.repliesTruncated').replace('{count}', String(MAX_REPLIES_PER_COMMENT))}</p>`.
   Both optimistic objects (`:207`, `:225`) get `hasMoreReplies: false`. New key
   `comment.repliesTruncated`: en `Showing the first {count} replies.`, tr
   `İlk {count} yanıt gösteriliyor.` (Use `--text-secondary`, not `--text-tertiary`: r6 E6 is
   fixing that token's contrast.)

Rejected: (a) `LIMIT parents × cap` (wrong, see §1); (b) a write-time cap (new error path, does
not cover older rows); (c) one query per parent in `Promise.all` (up to 100 queries per request
against a pool of 10); (d) explicit `crossJoinLateral`/`leftJoinLateral` (raw `sql\`true\`` or a
self-alias with flat aliases, more code for the same SQL); (e) `row_number()` (a window function,
excluded by the decision); (f) newest-N replies (hides how the conversation started; a later
"load more" can page forward from the oldest with a keyset cursor).

Edge cases: a 21st reply is stored and notifies normally, but stays hidden until the "load more"
UI exists (D99 entry below). A deleted parent's replies are not loaded (parents are live
top-level rows only). Cross-recipe replies stay excluded (r1 #5).

### 4. Tests (failing first)

- `apps/api/src/modules/comment/model.test.ts`, `describe('findByRecipe')` (DB-backed). Insert with
  `model.create` and explicit `createdAt: new Date(base + i * 1000)`:
  - P1 with 25 live replies plus 1 soft-deleted, and P2 with 2 replies, on the same recipe;
    `findByRecipe(recipeId, 1, 20)`: P1 has 20 replies, which are the 20 oldest live ones in
    ascending `createdAt`, and `hasMoreReplies === true`; P2 has 2 replies and `false` (no
    parent loses its replies); `replies[0].createdAt instanceof Date`.
  - A parent with exactly 20 replies → 20 and `hasMoreReplies === false`.
  - Two replies with the same `createdAt` come back in `id` order.
  - The existing shape tests keep passing (`{ comments, total }`, author joined). r1's
    cross-recipe test (R1.5) keeps passing.
  These fail today (25 replies, no flag).
- `packages/shared/src/schemas/responses/comment.test.ts`: add `hasMoreReplies: false` to the
  `CommentWithRepliesOutputSchema` payloads (`:60,:67`) and a case where a payload without
  `hasMoreReplies` is rejected.
- `apps/web/src/components/recipe/CommentSection.test.tsx`: a comment with `hasMoreReplies: true`
  shows the hint with `20`; with `false` the hint is absent. Add `comment.repliesTruncated` to the
  en/tr test translation maps (`:143,:169`) and `hasMoreReplies: false` to the fixtures (`:113`,
  `:229-256`).

### 5. Spec impact

`openspec/specs/comment-pagination/spec.md`, ADDED (no other track touches this capability):

```markdown
### Requirement: Replies per top-level comment are bounded

`GET /api/v1/comments/recipe/:recipeId` SHALL return at most `MAX_REPLIES_PER_COMMENT` (20, exported from `@brewform/shared/constants`) live replies per top-level comment, oldest first, and SHALL set `hasMoreReplies: true` on every top-level comment that has more live replies on that recipe.

`comment/model.ts#findByRecipe` loads the page of top-level comments and their replies in one
Drizzle relational query: the `replies` relation (`relationName: 'commentReplies'`) carries
`limit: MAX_REPLIES_PER_COMMENT + 1`, which Drizzle applies per parent (a `left join lateral`
subquery), ordered by `createdAt` then `id`. One request therefore reads at most
`perPage × (MAX_REPLIES_PER_COMMENT + 1)` reply rows, with no raw SQL and no window function. The
web comment section shows "Showing the first {count} replies." (`comment.repliesTruncated`) under
a thread with `hasMoreReplies`. Reading replies past the cap is a later "load more replies" UI.

#### Scenario: A long thread is cut at the cap

- **WHEN** a top-level comment has 25 live replies
- **THEN** the list returns its 20 oldest replies in ascending `createdAt` order and `hasMoreReplies: true`

#### Scenario: One long thread does not hide other threads' replies

- **WHEN** the same page holds comment P1 with 25 replies and comment P2 with 2 replies
- **THEN** P1 carries 20 replies and P2 carries both of its replies with `hasMoreReplies: false`

#### Scenario: A thread at the cap is not flagged

- **WHEN** a top-level comment has exactly 20 live replies
- **THEN** all 20 are returned and `hasMoreReplies` is false
```

### 6. Docs / ledger impact

- `docs/comments.md:205` (routes table): "… each with at most 20 replies (oldest first) under
  `replies`; `hasMoreReplies` marks a cut thread."
- OpenAPI description (§3.5) and regenerated `docs/api-reference.md`.
- New D99 entry (next free id after D99.62; the assembler numbers it), with a P4 row in
  `plans/ROADMAP.md`:

  ```markdown
  ## D99.6x — "Load more replies" for long comment threads — Open

  **Deferred:** wave-6-review-remediation E10 (bounded replies). **Priority:** P4 · **Effort:** Low–Medium.

  **Evidence:** `GET /api/v1/comments/recipe/:recipeId` returns at most `MAX_REPLIES_PER_COMMENT` (20) replies per top-level comment, oldest first, with `hasMoreReplies`; `CommentSection` shows only "Showing the first 20 replies.", so the 21st and later replies cannot be read (they are stored, counted and notified).

  **Fix:** a bounded keyset endpoint `GET /api/v1/comments/:id/replies?after=<createdAt>,<id>&perPage=` behind the same visibility gate as `listComments` (and the same author masking), plus a "Load more replies" button in `CommentSection` driven by `useFetcher().load()` against a `resources/` route, replacing the hint.
  ```

### 7. Draft tasks

- [ ] R7.3 Failing first (after R1.5/R1.6 and R6.1/R6.2): add the `findByRecipe` cap cases from
  audit/r7 E10 §4 to `apps/api/src/modules/comment/model.test.ts`, the `hasMoreReplies` cases to
  `packages/shared/src/schemas/responses/comment.test.ts` and the hint cases to
  `apps/web/src/components/recipe/CommentSection.test.tsx`; run
  `make test-specific filter=src/modules/comment/model.test.ts`, `make test-shared` and the web
  vitest for `src/components/recipe/CommentSection.test.tsx`, and see them fail.
- [ ] R7.4 Add `MAX_REPLIES_PER_COMMENT` (docblock) in `packages/shared/src/constants/comments.ts`
  and re-export it; add `relationName: 'commentReplies'` to `parentComment` and `replies` in
  `packages/db/src/schema.ts` and confirm `make db-generate` prints "No schema changes, nothing to
  migrate"; rewrite `comment/model.ts#findByRecipe` as the single relational query from audit/r7
  E10 §3 (keep r1's `recipeId` filter, add the `id` tie-breaks and `hasMoreReplies`, update the
  docblock); add `hasMoreReplies` to `CommentWithRepliesOutputSchema`; extend the GET route
  description in `comment/index.ts`; re-run R7.3's API and shared tests until green;
  `make check`; regenerate `docs/api-reference.md`.
- [ ] R7.5 Web: add `comment.repliesTruncated` (en, tr), render the hint in `CommentSection.tsx`,
  set `hasMoreReplies: false` on both optimistic objects; re-run the web test until green; update
  `docs/comments.md:205`; add the "Load more replies" D99 entry and its ROADMAP P4 row.

### 8. Risks / migration notes

- Behaviour change: threads with more than 20 replies show only the first 20 plus the hint. No
  data change, no migration (relations are not in the snapshot).
- Query shape: one lateral query instead of two plain ones. It is served by
  `comment_parent_created_idx`. If a plan regression shows up, the per-parent `Promise.all`
  alternative is a local change in the model.
- Rollback: revert the model, schema relation names and output field together (the web needs
  `hasMoreReplies` only for the hint).

---

## Extra E11: a deleted account's name stays on its comments (and its recipes and collections)

### 1. Verification

**Account deletion today.** `user/service.ts:98-113` `deleteAccount` scrubs private notes
(`recipeNoteService.deleteAllNotesForUser`) and then calls `model.deleteUser` (`user/model.ts:86-93`),
which sets only `users.deletedAt`. Admin `softDeleteUser` (`admin/model.ts:247-254`) does the
same. **Recipes, collections and comments are not touched.** So the premise in
`decisions.md` ("recipes by deleted users are already soft-deleted by account deletion") is
false. The docblock says "Further account anonymisation is out of scope", and D99.26 (P1, Open,
`plans/D99-debts.md:742-748`) records "the user's public content stays public". The product
promise is in the privacy page: `legal.privacy.s4.body` (`en.json:602`) says "When you delete your
account, your personal data is removed. Public recipes and comments may be anonymized rather than
deleted." The `account-deletion` spec Purpose says the action removes "their personal data".

**Every surface that joins `users` for display** (grep `Join(users`, `author:`/`user:` relation
columns, `username` in `model.ts` files):

| Surface | Code | Deleted account visible? | Concrete case |
|---|---|---|---|
| Comment list, top-level and replies | `comment/model.ts:71,102` `leftJoin(users, eq(…))` | **yes** | U comments, deletes the account → `GET /comments/recipe/:id` returns U's `username`/`displayName`/`avatarUrl`; the web links to `/u/<username>`, which answers 404 |
| Comment `findById` (mention prefix) | `comment/model.ts:32` | **yes** | the recipe author replies to U's reply → stored content starts with `@<U's username>` (`service.ts:94-96`) |
| Recipe detail (`/recipes/:slugOrId`) and crawler/OG meta | `recipe/model.ts:451,488` `author: { columns }`; `service.ts:973`; `middleware/crawler.ts:80` | **yes** | U's public recipe still shows "by U", and the crawler description says "recipe by U" |
| Recipe list, starred, offset feed | `recipe/model.ts:544-547,584` `innerJoin(users)` | **yes** | `/recipes` lists U's recipe with U's name |
| Cursor list and feed | `recipe/model.ts:1814` | **yes** | same, cursor mode |
| `?author=` filter | `recipe/model.ts:302-314` subquery on `users` without `deletedAt` | **yes** | `?author=<U's username>` still finds U's recipes (it confirms U wrote them) |
| Collection detail (owner and items' recipe authors) | `collection/model.ts:56,62`; service `:73-79,110-116` | **yes** | U's public collection page shows U as owner and links `/u/<username>` |
| Public collections browse | `collection/model.ts:204`; service `:228-234` | **yes** | `/collections` lists U's collection "by U" |
| Collection items (`getItems`) | `collection/model.ts:367` | **yes** | other users' collections holding U's recipe show U as its author |
| Equipment recipe list | `equipment/model.ts:148` | **yes** | the equipment page lists U's recipe with U's name |
| Coffee-variety recipe list | `coffee-variety/model.ts:101` | **yes** | same on the variety page |
| Notifications actor | `notification/model.ts:74,158` join with `isNull(users.deletedAt)` | no | already returns `actor: null` |
| Followers / following | `follow/model.ts:61-69,101-109` `innerJoin` with `isNull(users.deletedAt)` | no | deleted accounts drop out |
| Public profile and its recipe list | `user/service.ts:52` `findByUsername` filters `deletedAt` | no | 404 before any list loads |
| Mention notifications | `notification/model.ts:197`, `utils/notify/index.ts:115,242` | no | deleted users are filtered |
| Brew logs, setups, private notes, preferences | owner-only data | no | only the account itself reads them, and it can no longer sign in |
| Version history and diff | no user join (versions have no author) | no | — |
| Equipment, vendor and coffee-variety `createdBy` | used only for authorization, never displayed | no | — |
| Sitemap profiles | r6 E8 already excludes deleted accounts | no (after E8) | — |
| Admin (`getTopUsers` filters deleted; users list, recipes list, moderation `requestedBy`/`reviewedBy`) | `admin/model.ts:35-46,641-655,769-770` | shows identity on purpose | moderators need to see who a record belongs to; admin is exempt as in the visibility rules |

Web consumers of these fields: `CommentSection.tsx:79-107` (`'Unknown'` fallback; renders a
`<span>` when `author` is null), `RecipeCard.tsx:79` (`'unknown'`), `CollectionCard.tsx:47,69-72`
(hides the author when it is missing), `CollectionDetailPage.tsx:70-71` (no null guard),
`MetadataBadges.tsx:46-55` (hides the badge when `author` is null),
`RecipeDetailPage.tsx:91-96` (SEO description `` `… recipe by ${name}` `` → "by undefined"),
`:110-111` (JSON-LD `authorName: ''`), `RecipeFocusModePage.tsx:91` ("By " plus an empty name).

Response schemas: `AuthorRefSchema` (comments) is already `.nullable()`
(`responses/_shared.ts:22-29`). The recipe and collection authors are not nullable:
`RecipeWithAuthorOutputSchema` (`recipe.ts:43`), `RecipeWithVersionsOutputSchema` (`:108`),
`FeedRecipeOutputSchema` = `RecipeListItemOutputSchema` (`:121`, inherited by
`CollectionItemRecipeOutputSchema`), `RecipeDetailOutputSchema` (`:270`),
`CollectionDetailOutputSchema` (`collection.ts:72`), `PublicCollectionListItemOutputSchema` (`:85`).
The collection service already replaces a missing owner with `{ username: '', … }`
(`collection/service.ts:79,116,234`), which would produce a `/u/` link.

Cache: collection detail is cached for 10 minutes and public lists for 5 minutes
(`collection/service.ts:15,18`). Recipe and comment reads are not cached.

Tests: no test anywhere covers a soft-deleted author on a display surface
(`comment/model.test.ts:179` checks only a live author join).

**Verdict: bigger.** Comments, and every recipe and collection display surface, show a deleted
account's name. The only surfaces that hide it already are notifications and follows.

### 2. Root cause

Account deletion is a soft delete of the user row only (D99.26). The read paths join `users`
without `deletedAt`, except notifications and follows.

### 3. Fix design

**Rule: a deleted account keeps its content (comments, recipes and collections stay listed,
visible and counted, as the privacy page says), but no non-admin response carries its identity.
The author/owner projection is `null`.** This is read-side only: no data change, no backfill, and
it covers accounts deleted before this change. It does not depend on D99.26's later choice:
whether D99.26 unlists or soft-deletes content, kept rows still need masking.

**API.**

1. New pure helper `apps/api/src/utils/public-identity/index.ts` (models import utils, as
   `recipe/model.ts:57-58` already do):

   ```ts
   /**
    * Identity of a user shown next to content (capability `account-deletion`, "A deleted account
    * has no public identity"): `null` when the joined projection is missing or the account is
    * soft-deleted, otherwise the projection without `deletedAt`.
    */
   export function visibleIdentity<T extends { deletedAt: Date | null }>(
     user: T | null | undefined,
   ): Omit<T, 'deletedAt'> | null {
     if (!user || user.deletedAt !== null) return null;
     const { deletedAt: _deletedAt, ...identity } = user;
     return identity;
   }
   ```

2. **SQL-builder joins:** put the filter in the join, following the notification precedent:
   `leftJoin(users, and(eq(X.authorId, users.id), isNull(users.deletedAt)))`. The nested `author`
   object becomes `null`.
   - `comment/model.ts#findById` (`:32`). As a result, `createComment` no longer prepends a
     deleted account's `@username` (`service.ts:94` already skips a null author). Update the
     docblock.
   - `recipe/model.ts#buildListPageQuery` (`:584`): `innerJoin(users, eq(…))` →
     `leftJoin(users, and(eq(recipes.authorId, users.id), isNull(users.deletedAt)))`. The recipe
     is still listed and `author` is `null`. `listItemSelection` and the docblocks (`:543,:552`)
     say "nullable author (`null` for a deleted account)". The count query (`buildListCountQuery`)
     does not join `users`, so totals do not change.
3. **Relational loads** (a `one` relation takes no `where`): add `deletedAt: true` to the author or
   owner `columns` and map the rows with `visibleIdentity` in the model before returning them:
   - `comment/model.ts#findByRecipe`: `AUTHOR_COLUMNS` gets `deletedAt: true`; the mapping in
     E10 §3.3 becomes `author: visibleIdentity(comment.author)` on top-level rows and on each
     reply. (If E10 were dropped, use the join condition on `:71,:102` instead.)
   - `recipe/model.ts#findById`/`#findBySlug` (`:451,:488`): make them `async`,
     `const row = await db.query.recipes.findFirst(…); return row && { ...row, author: visibleIdentity(row.author) };`
     (the `undefined`-when-missing contract stays). The crawler then falls back to
     "BrewForm user" (`crawler.ts:80`) with no change there.
   - `recipe/model.ts#findCursor` (`:1814`): map `rows` before `maskUnlistableForkSources`.
   - `collection/model.ts#findById` (`:56` owner `user`, `:62` item recipe `author`),
     `#findAllPublic` (`:204`), `#getItems` (`:367`); widen `PublicCollectionRow.user` (`:176`).
     In `collection/service.ts` (`:73-79,:110-116,:228-234`), replace the `{ username: '', … }`
     fallbacks with `null`.
   - `equipment/model.ts#getRecipesUsingEquipment` (`:148`) and
     `coffee-variety/model.ts#getRecipesUsingVariety` (`:101`).
4. **`?author=` filter** (`recipe/model.ts:309-312`): the subquery's `where` becomes
   `and(isNull(users.deletedAt), or(ilike(users.username, pattern), ilike(users.displayName, pattern)))`.
5. **Schemas** (additive widening; each gets an "accepts a null author" unit test):
   `author: RecipeAuthorMiniSchema.nullable()` at `recipe.ts:43,108` and `collection.ts:72,85`;
   `FeedRecipeOutputSchema.author` → `.nullable()` (`recipe.ts:121`; `RecipeListItemOutputSchema`
   and `CollectionItemRecipeOutputSchema` inherit it); `author: RecipeDetailAuthorOutputSchema.nullable()`
   (`:270`). Leave the base `RecipeAuthorMiniSchema` non-null (it doubles as the
   `AuthorButtonAuthor` shape). Update each docblock: "`null` when the account was deleted".
6. **OpenAPI:** append "An author (or owner) whose account was deleted is returned as `null`." to
   the descriptions of the comment list, recipe list, recipe detail, feed, collection detail,
   public collections, equipment recipes and variety recipes routes. Regenerate
   `docs/api-reference.md`.
7. `user/service.ts#deleteAccount` docblock: replace "Further account anonymisation is out of
   scope" with "Display surfaces stop showing the account's identity (`visibleIdentity`);
   releasing its identifiers and clearing the row's profile data stay in D99.26."
8. Admin models are not changed: moderation keeps the identity.

**Web.** New key `common.deletedUser`: en `Deleted user`, tr `Silinmiş kullanıcı`. Render it as
plain text with no link everywhere an author is `null`:
- `CommentSection.tsx`: `getAuthorName(comment, deletedLabel)` returns the label instead of
  `'Unknown'`; `AuthorLink` gets `deletedLabel` and already renders a `<span>` when there is no
  username; the `aria-label`s (`:342,:430`) use the same name. Reply prefill for a deleted author
  stays empty (`getAuthorUsername` returns null).
- `RecipeCard.tsx:79`: `'unknown'` → `<span>{t('common.deletedUser')}</span>`.
- `CollectionCard.tsx`: allow `author` to be `null`; when `showAuthor` and `author` is null,
  render `{t('common.by')} {t('common.deletedUser')}`.
- `CollectionDetailPage.tsx:70-71`: a `<Link>` only when `collection.author` is set, otherwise a
  `<span>` with the label.
- `MetadataBadges.tsx:46-55`: when `author` is null, render the same pill as a `<span>` with the
  label (keep the separator dot) instead of hiding it.
- `RecipeFocusModePage.tsx:91`: name falls back to the label.
- `RecipeDetailPage.tsx:91-96`: build the SEO description with new key `recipe.seo.byAuthor`
  (en `{subject} recipe by {name}`, tr `{name} tarafından {subject} tarifi`; `subject` =
  `` `${v?.brewMethod ?? ''} ${v?.drinkType ?? ''}`.trim() ``, `name` = author name or the label).
  This also removes the English scaffolding. `:110-111`: pass `authorName` only when `author` is
  set. In `components/seo/JsonLd.tsx`, `RecipeJsonLd` omits `author` when `authorName` is empty
  (today it emits `{ name: '' }`).
- `AdminRecipesPage.tsx:104` is unchanged (admin model, not masked).

Alternatives considered:
- **Comments only, and leave recipes and collections to D99.26:** smaller (S-M), but recipes and
  collections would keep showing the name that the comment fix hides, against the privacy text.
  Offered as the user's veto option (see the summary).
- **Cascade soft-delete of the account's recipes and collections at deletion:** a small write,
  but it is D99.26's content decision, it removes content other users collected or forked, it
  needs a backfill for accounts already deleted, and comments still need masking (a cascade there
  would also delete the recipe author's replies through E1).
- **Read-side filter of deleted authors' recipes inside `listableRecipeCondition`/`viewableRecipeCondition`:**
  adds a join or subquery to every listing and changes the central visibility rule. Rejected.
- **A `deleted: true` marker instead of `null`:** a new field on 8 schemas. `null` already exists
  in the comment schema and in the web code paths. Rejected.

Edge cases: (a) the cached collection detail and public lists can show the old identity until
their TTL (≤ 10 min / 5 min) runs out; correctness never depends on the cache (AGENTS.md), and
this goes into the spec. (b) `authorId` stays in the payloads; it is an opaque id, still needed for
own-comment and OP checks, and a deleted account cannot sign in. (c) A banned (not deleted) user
is unaffected. (d) Comment text that mentions `@<old username>` is user content and is not
rewritten.

### 4. Tests (failing first)

- New `apps/api/src/utils/public-identity/index.test.ts`: `null`/`undefined` → `null`; `deletedAt`
  set → `null`; live → the same fields without a `deletedAt` key.
- `apps/api/src/modules/comment/model.test.ts` (DB-backed): user U writes top-level C and a reply
  R; soft-delete U (`db.update(users).set({ deletedAt: new Date() })`); `findByRecipe` returns C and
  R with `author: null`, `authorId === U.id` and their content; `findById(R.id).author === null`. A
  live author is still joined (existing `:179`).
- `apps/api/src/modules/comment/service.test.ts` (deps-stubbed, after R1.8): replying to a reply
  whose `findById` result has `author: null` stores the content with no `@` prefix (add it if the
  converted suite has no such case).
- `apps/api/src/modules/recipe/model.test.ts`: a public recipe by a soft-deleted user is returned
  by `findById` and `findBySlug` with `author: null`, and listed by `findListPage` with
  `author: null` and an unchanged `total`; `?author` filtering (`filters.author` set to the
  deleted username) excludes it. `model.cursor.test.ts`: `findCursor` returns it with
  `author: null`.
- `apps/api/src/modules/collection/model.test.ts`: `findById` (owner `user` null, item recipe
  `author` null), `findAllPublic` (owner null), `getItems` (item author null).
  `collection/service.test.ts`: the detail and public-list shapes carry `author: null` (no
  `username: ''`).
- `apps/api/src/modules/equipment/model.test.ts`, `apps/api/src/modules/coffee-variety/model.test.ts`:
  the recipe of a soft-deleted author is listed with `author: null`.
- `apps/api/src/middleware/crawler.test.ts`: `getRecipeMeta` stub with `author: null` →
  description contains "BrewForm user" (add it if missing).
- `packages/shared/src/schemas/responses/recipe.test.ts` and `collection.test.ts`: each widened
  schema accepts `author: null`.
- Web: `components/recipe/CommentSection.test.tsx` (add `common.deletedUser` to both test maps; a
  comment and a reply with `author: null` render "Deleted user", no link to `/u/`, and the
  article `aria-label` names "Deleted user"); `components/recipe-list/RecipeCard.test.tsx:119-137`
  (`'unknown'` → `Deleted user`); new `components/collections/CollectionCard.test.tsx` (null author
  with `showAuthor` renders the label, no button); `pages/collections/CollectionDetailPage.test.tsx`
  (null author renders the label, no link); `components/recipe/MetadataBadges.test.tsx` (null
  author renders the label pill); `components/seo/JsonLd.test.tsx` (`authorName: ''` → no `author`
  key).

All API and shared cases fail today (identity returned, schemas reject `null`). The web cases fail
on the label text.

### 5. Spec impact

`openspec/specs/account-deletion/spec.md`, ADDED (no other track touches this capability):

```markdown
### Requirement: A deleted account has no public identity

Every non-admin API response that shows a user as the author or owner of a comment, recipe or collection SHALL carry `null` in place of that user's projection (`id`, `username`, `displayName`, `avatarUrl`) when the account is soft-deleted, and the web SHALL render such an author as "Deleted user" (`common.deletedUser`) without a profile link.

The content itself stays: the account's comments stay listed and counted, and its recipes and
collections keep their visibility (the privacy page: "Public recipes and comments may be
anonymized rather than deleted"). The models derive this from `users.deletedAt`: SQL-builder
joins put `isNull(users.deletedAt)` into the join condition (the comment `findById`, the recipe
list page), and relational loads select `deletedAt` and map the projection with
`utils/public-identity#visibleIdentity` (comment list and replies, recipe detail and cursor list,
collection detail, items and public browse, equipment and coffee-variety recipe lists). The
`author` recipe filter matches only live accounts. `createComment` never prepends a deleted
account's `@username`. Notifications and follow lists already exclude deleted accounts. Admin
endpoints keep the identity for moderation. A cached collection response can still show the
identity until its cache TTL expires (at most 10 minutes). Releasing the account's email and
username and clearing its stored profile data are not part of this requirement (D99.26).

#### Scenario: Comment by a deleted account

- **WHEN** user U commented on a public recipe and then deleted the account
- **THEN** `GET /api/v1/comments/recipe/:recipeId` returns U's comment with its content and `author: null`, and the recipe page shows "Deleted user" without a link to `/u/<username>`

#### Scenario: Reply to a deleted account's reply

- **WHEN** the recipe author replies to a reply written by a deleted account
- **THEN** the stored reply carries no `@username` prefix

#### Scenario: Recipe of a deleted account

- **WHEN** U published a public recipe and then deleted the account
- **THEN** the recipe stays in `GET /api/v1/recipes` and opens at its slug, both with `author: null`; the cards and the detail page show "Deleted user"; and the crawler description names "BrewForm user"

#### Scenario: Collection of a deleted account

- **WHEN** U owned a public collection and then deleted the account
- **THEN** the public collections list and the collection detail return `author: null` and show "Deleted user" without a link

#### Scenario: Author filter ignores deleted accounts

- **WHEN** a visitor filters recipes by the deleted account's username
- **THEN** none of that account's recipes are returned

#### Scenario: Admin still sees the owner

- **WHEN** an admin lists recipes in the admin panel
- **THEN** a recipe of a deleted account still shows that account's username
```

### 6. Docs / ledger impact

- `docs/comments.md:90`: "If the directly targeted comment's author has no username, or the
  account was deleted, the prefix is skipped." Routes table `:205`: "an author whose account was
  deleted is `null`."
- `docs/auth.md:279` ("Soft-deleted users" row): add "Their comments, recipes and collections
  stay, shown as "Deleted user" (no name, no profile link)."
- `docs/api.md`: one line in the conventions section on responses: "Author and owner projections
  are `null` for a deleted account (non-admin routes)."
- OpenAPI descriptions (§3.6) and regenerated `docs/api-reference.md`.
- `plans/D99-debts.md:746` (D99.26, stays **Open**): reword Evidence to "Display surfaces hide a
  deleted account's identity (wave-6-review-remediation E11), but `deleteUser` only sets
  `deletedAt`: the row keeps email, username and profile fields, content stays public, and
  identifiers are never released …"; the Fix keeps the tombstone, PII clearing, content decision
  and session revocation. Adjust the `plans/ROADMAP.md:51` row text the same way.
- No AGENTS.md change.

### 7. Draft tasks

- [ ] R7.6 Failing first (after R7.4): add `apps/api/src/utils/public-identity/index.test.ts` and
  the deleted-author cases from audit/r7 E11 §4 to `comment/model.test.ts`, `comment/service.test.ts`,
  `recipe/model.test.ts`, `recipe/model.cursor.test.ts`, `collection/model.test.ts`,
  `collection/service.test.ts`, `equipment/model.test.ts`, `coffee-variety/model.test.ts`,
  `middleware/crawler.test.ts`, and the null-author cases to
  `packages/shared/src/schemas/responses/recipe.test.ts` and `collection.test.ts`; run
  `make test-specific filter=src/modules/comment`, `… filter=src/modules/recipe/model`,
  `… filter=src/modules/collection`, `… filter=src/modules/equipment/model.test.ts`,
  `… filter=src/modules/coffee-variety/model.test.ts`, `… filter=src/utils/public-identity`,
  `make test-shared`, and see them fail.
- [ ] R7.7 Add `visibleIdentity` (docblock) in `apps/api/src/utils/public-identity/index.ts`; put
  `isNull(users.deletedAt)` into the joins of `comment/model.ts#findById` and
  `recipe/model.ts#buildListPageQuery` (`innerJoin` → `leftJoin`); select `deletedAt` and map with
  `visibleIdentity` in `comment/model.ts#findByRecipe`, `recipe/model.ts#findById`/`#findBySlug`/`#findCursor`,
  `collection/model.ts#findById`/`#findAllPublic`/`#getItems`, `equipment/model.ts#getRecipesUsingEquipment`
  and `coffee-variety/model.ts#getRecipesUsingVariety`; add `isNull(users.deletedAt)` to the
  `?author` subquery; replace the `username: ''` fallbacks in `collection/service.ts` with `null`;
  widen the six response schemas; update every touched docblock (including
  `user/service.ts#deleteAccount`) and the eight route descriptions; re-run R7.6 until green; run
  `make check`, `make test-specific filter=src/modules/recipe/model.search.explain.test.ts`, and
  regenerate `docs/api-reference.md`.
- [ ] R7.8 Web, failing first: add the null-author cases to `CommentSection.test.tsx`,
  `RecipeCard.test.tsx`, a new `components/collections/CollectionCard.test.tsx`,
  `CollectionDetailPage.test.tsx`, `MetadataBadges.test.tsx` and `JsonLd.test.tsx`; see them fail;
  add `common.deletedUser` and `recipe.seo.byAuthor` (en, tr); update `CommentSection.tsx`,
  `RecipeCard.tsx`, `CollectionCard.tsx`, `CollectionDetailPage.tsx`, `MetadataBadges.tsx`,
  `RecipeFocusModePage.tsx`, `RecipeDetailPage.tsx` and `components/seo/JsonLd.tsx` as in audit/r7
  E11 §3; re-run the web vitest for those files until green; `make check-web`.
- [ ] R7.9 Update `docs/comments.md` (`:90`, `:205`), `docs/auth.md:279`, `docs/api.md`, the D99.26
  Evidence line and its `plans/ROADMAP.md` row; run `make docs-check`, `make lint` and `make fmt`.

### 8. Risks / migration notes

- Behaviour change for API clients: author/owner fields can now be `null` on recipe and
  collection payloads (comments already allowed it). The web is updated in the same change; the
  OpenAPI spec documents it.
- Upgrade: no migration, nothing to backfill. Accounts deleted before the upgrade are masked from
  the first request (collection caches catch up within their TTL).
- Rollback: reverting restores the old display; no stored data changed.
- The recipe list switches from `innerJoin` to `leftJoin`. Every recipe has a non-null
  `author_id` FK, so no row appears or disappears; re-run the EXPLAIN test
  (`model.search.explain.test.ts`).

---

## Cross-track notes

1. **For the assembler, ordering:** R7.1–R7.2 after R6.8/R6.9 (same component and test file).
   R7.3–R7.5 after R1.5/R1.6 (the replies `recipeId` filter is carried into the rewrite) and
   R6.1/R6.2. R7.6–R7.9 after R7.4 (E11 masks inside the rewritten `findByRecipe`).
2. **r6 E1's ADDED `comment-authz` block** ends with "Account deletion soft-deletes only the user
   row, so that user's comments stay listed and counted." That is still true. Append "; they show
   no author identity (account-deletion, "A deleted account has no public identity")" so the two
   blocks agree.
3. **r6 E6 (`--text-tertiary` contrast):** the new E10 hint uses `--text-secondary`. E9 keeps the
   existing tertiary colour on the picker hint and only changes its text, so E6 owns the colour.
4. **decisions.md premise:** "recipes by deleted users are already soft-deleted by account
   deletion" is false (`user/service.ts:108-113`, `user/model.ts:86-93`). E11 includes recipes
   and collections because of that. If the user wants comments only, drop the recipe, collection,
   equipment and variety parts of R7.6–R7.8 and update D99.26 instead; the comment parts stand
   alone.
5. **NEW (i18n, concrete, folded into E9):** `SessionRestoreBanner.tsx` is entirely English. Failing
   case: locale `tr`, stop the API, reload → "Couldn't reach the server…", "Retry", "Dismiss".
   `MetadataBadges.tsx:94,98` "N prior versions" on every tr recipe page.
6. **Existing D99.59** (the web shows Reply to the top-level comment's author, and the API answers
   403; `CommentSection.tsx:262-269`) is untouched by E10 and E11 and stays open.
7. No E9–E11 fix needs an ADR or a data migration. E10's relation name is a `schema.ts` relations
   edit that `make db-generate` must report as "No schema changes".
