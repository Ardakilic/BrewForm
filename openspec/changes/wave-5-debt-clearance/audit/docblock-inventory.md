# BrewForm docblock (JSDoc) coverage inventory — 2026-07-19

Audit scope: `apps/api/src`, `apps/web/src`, `packages/shared/src`, `packages/db/src` on branch
`chore/debt-fix` (HEAD `fe9aad2`). Excluded: `*.test.*`, `*_test.*`, `*.spec.*`, `__tests__/`,
`generated/` (email templates), `*.d.ts` ambient declaration files, migrations (none live under the
scanned `src` roots).

## Method

Line-based scanner (Deno script, see `docblock-scan.ts` in this directory) over 329 production
`.ts`/`.tsx` files:

1. Match column-0 export declarations:
   `export [default] [abstract] [async] (function|class|interface|type|enum|const|let|var) <name>`.
2. For each, walk upward past blank lines/decorators; classify the preceding comment as `jsdoc`
   (block opens with `/**`), `block-comment` (`/*`), `line-comment` (`//`), or `none`. Anything but
   `jsdoc` counts as missing.
3. Separate manual passes (verified per-file) for the two forms the regex skips: bare
   `export default X;` re-export statements (doc checked at the local declaration of `X`) and local
   `export { X };` statements (doc checked at the declaration of `X`).

Known blind spots of the method:

- Function overload signatures would each be counted (none observed in the missing set).
- Multi-declarator exports (`export const a = 1, b = 2`) count once (none observed).
- Exports indented inside `namespace`/`declare module` blocks are missed — these only occur in
  excluded `.d.ts` files (`apps/api/src/types/pino-pretty.d.ts`, `mjml.d.ts`).
- Anonymous default exports (`export default {`, `export default (`) — swept separately, zero found.
- A JSDoc separated from its export by intervening code is treated as missing (by design).
- Kind classification (function vs const vs component) is heuristic; corrected by hand where
  spot-checks found mislabels (pgTable consts, DI objects). Location/name columns are exact.

Validation: 10+ entries spot-checked against source (both positives and negatives); one scanner bug
found and fixed during validation (comment bodies containing the literal text `/*`, e.g.
`equipment/*` in `packages/shared/src/schemas/responses/equipment.ts:21`, misclassified the
enclosing `/**` block — fixed before this inventory was produced).

## Counts

| Area                | Exported symbols (main scan) | Missing (main scan) | + default-export decls | + `export { X }` locals | Total missing |
| ------------------- | ---------------------------- | ------------------- | ---------------------- | ----------------------- | ------------- |
| apps/api/src        | 446                          | 26                  | 22                     | 2                       | 50            |
| apps/web/src        | 216                          | 13                  | 0                      | 0                       | 13            |
| packages/shared/src | 301                          | 71                  | 0                      | 2 (`en`, `tr`)          | 73            |
| packages/db/src     | 96                           | 59                  | 0                      | 1 (`client`)            | 60            |
| **Total**           | **1059**                     | **169**             | **22**                 | **5**                   | **196**       |

Coverage of the main scan is 890/1059 = 84% overall, but **function-like coverage is near-total**:
of 847 function/hook/class/component-kind exports, only 1 true function is undocumented
(`packages/db/src/seed.ts:927 main`). The remaining debt is concentrated in:

1. `packages/db/src/schema.ts` — 43 symbols (all 12 pgEnum consts, all 28 pgTable consts, 1 type) —
   worst single file.
2. `packages/shared/src/schemas/**` — 49 symbols, almost all
   `export type X = z.infer<typeof XSchema>` aliases sitting directly under already-documented
   schemas.
3. `packages/shared/src/constants/**` — 21 symbols (constant tables + their derived value/option
   types).
4. apps/api Hono router aggregates — 22 `const x = new Hono()...` module routers exported via
   `export default x;`.
5. apps/api module-level singletons — 10 `const log = createLogger(...)` + 4 `const deps = {...}` DI
   objects.
6. `packages/db/src/seed-*.ts` — 14 seed-data consts + 1 `main()`.

## House style — 5 representative good docblocks

**1. API service function — `@param name - desc` (aligned) + `@returns`, imperative first sentence**
(`apps/api/src/modules/collection/service.ts:91-96`):

```ts
/**
 * Create a collection for the authenticated user.
 * @param userId - The authenticated user's UUID.
 * @param data   - Collection creation payload (name, description, visibility).
 * @returns The created collection with author, items, and recipeCount.
 */
export async function createCollection(userId: string, data: CollectionCreate) {
```

**2. Small shared util — single-line `/** ... */`, "Verb-first: mechanics" summary, no tags**
(`packages/shared/src/utils/slug.ts:1`):

```ts
/** Builds a URL slug from a title: lowercases, strips non-word chars, hyphenates whitespace, collapses/trims hyphens, caps at 100 chars. */
export function generateSlug(title: string): string {
```

**3. Complex const/client object — multi-line prose, backtick code refs, `{@link Symbol}`
cross-refs, em-dashes** (`apps/web/src/api/client.ts:101-109`):

```ts
/**
 * Fetch-wrapper client for the BrewForm API. Prefixes `API_BASE`
 * (runtime config → `VITE_API_URL` → same-origin `/api/v1`), sends
 * cookie credentials plus an `X-Request-ID` header, and on a 401 from
 * non-auth endpoints attempts one `POST /auth/refresh` before retrying.
 * Non-OK responses throw {@link ApiError}. Verb helpers unwrap the
 * response envelope's `data`; `getWithMeta` returns the full envelope
 * and `upload` posts `FormData` without a JSON content type.
 */
export const api = {
```

**4. React hook — short prose, states what is returned in words, no `@param`/`@returns` tags**
(`apps/web/src/hooks/useDebounce.ts:6-10`):

```ts
/**
 * Debounce a value by the specified delay.
 * Returns the debounced value, which updates only after
 * `delay` ms of inactivity.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
```

**5. Zod response schema — "Validates X; response envelope for METHOD /route" one-liner**
(`packages/shared/src/schemas/responses/user.ts:63-64`; same idiom at `responses/equipment.ts:39`):

```ts
/** Validates the bare `users` row (minus passwordHash); response envelope for PATCH /api/v1/users/me. */
export const UserRowOutputSchema = UserBaseSchema;
```

Other conventions observed: React components get behavioral prose docblocks (interaction notes,
cross-file references, known limitations — see
`apps/web/src/components/recipe-list/RecipeCard.tsx:5-20`); interfaces get one-liners with `{@link}`
to related types (`apps/web/src/api/index.ts:304`); API `@param` descriptions are hyphen-separated
and vertically aligned; tone is declarative present tense.

---

# Full inventory of missing docblocks

## Section A — TRUE function-like exports missing docblocks (6)

| Location                                   | Symbol                    | Actual kind                    | Note                                                                       |
| ------------------------------------------ | ------------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `packages/db/src/seed.ts:927`              | `main`                    | async function                 | seed entrypoint — the only undocumented true exported function in the repo |
| `apps/api/src/routes/sitemap.ts:42`        | `deps`                    | const DI object of async fns   | injectable data-access for sitemap route                                   |
| `packages/shared/src/constants/units.ts:8` | `UNIT_CONVERSIONS`        | const object of conversion fns | 6 unit-conversion lambdas                                                  |
| `packages/db/src/schema.ts:92`             | `userPreferences`         | const (pgTable)                | misclassified arrow-fn by scanner; listed again in Section D               |
| `packages/db/src/schema.ts:422`            | `coffeeVarieties`         | const (pgTable)                | ditto                                                                      |
| `packages/db/src/schema.ts:738`            | `equipmentDeleteRequests` | const (pgTable)                | ditto                                                                      |

## Section B — `export default X;` whose local declaration lacks a docblock (22, all apps/api)

The docblock belongs at the `const X = new Hono<AppEnv>()...` declaration line given below (verified
individually). Three peers already documented and therefore NOT listed:
`modules/notification/index.ts:28`, `modules/collection/index.ts:41`,
`apps/web/src/utils/logger.ts:135`.

| Declaration site                                  | Symbol       |
| ------------------------------------------------- | ------------ |
| `apps/api/src/routes/index.ts:39`                 | `routes`     |
| `apps/api/src/routes/health.ts:6`                 | `health`     |
| `apps/api/src/routes/sitemap.ts:10`               | `sitemap`    |
| `apps/api/src/routes/share.ts:8`                  | `share`      |
| `apps/api/src/modules/admin/index.ts:36`          | `admin`      |
| `apps/api/src/modules/auth/index.ts:23`           | `auth`       |
| `apps/api/src/modules/badge/index.ts:16`          | `badge`      |
| `apps/api/src/modules/bean/index.ts:18`           | `bean`       |
| `apps/api/src/modules/coffee-variety/index.ts:37` | `router`     |
| `apps/api/src/modules/comment/index.ts:20`        | `comment`    |
| `apps/api/src/modules/contact/index.ts:18`        | `contact`    |
| `apps/api/src/modules/equipment/index.ts:36`      | `equipment`  |
| `apps/api/src/modules/follow/index.ts:29`         | `follow`     |
| `apps/api/src/modules/photo/index.ts:15`          | `photo`      |
| `apps/api/src/modules/preference/index.ts:17`     | `preference` |
| `apps/api/src/modules/qrcode/index.ts:11`         | `qrcode`     |
| `apps/api/src/modules/recipe/index.ts:44`         | `recipe`     |
| `apps/api/src/modules/report/index.ts:18`         | `report`     |
| `apps/api/src/modules/setup/index.ts:18`          | `setup`      |
| `apps/api/src/modules/taste/index.ts:24`          | `taste`      |
| `apps/api/src/modules/user/index.ts:19`           | `user`       |
| `apps/api/src/modules/vendor/index.ts:24`         | `vendor`     |

## Section C — local `export { X };` whose declaration lacks a docblock (5 symbols / 4 files)

| Declaration site                        | Symbol     | Exported at          | Note                                                                   |
| --------------------------------------- | ---------- | -------------------- | ---------------------------------------------------------------------- |
| `apps/api/src/main.ts:39`               | `app`      | `main.ts:183`        | root Hono app                                                          |
| `apps/api/src/utils/logger/index.ts:5`  | `logger`   | `logger/index.ts:24` | root pino instance (`createLogger` beside it IS documented)            |
| `packages/db/src/index.ts:6`            | `client`   | `index.ts:8`         | raw postgres-js client                                                 |
| `packages/shared/src/i18n/index.ts:1-2` | `en`, `tr` | `i18n/index.ts:19`   | JSON locale bundles re-exported; doc fits best on the export statement |

NOT missing (verified documented at origin, listed to save the implementer a re-check):
`apps/web/src/api/index.ts:39 export { api, ApiError }` — both documented in
`apps/web/src/api/client.ts:79-83` and `client.ts:101-110`. Barrel re-exports with `from` clauses
(`packages/shared/src/{schemas,utils,constants,schemas/responses}/index.ts`) carry docs at origin
and are out of scope.

## Section D — main-scan missing docblocks, by area and file (169)

Kinds: `type`/`interface` = type-level export; `const` = value export; `arrow-fn` = const bound to a
function; "has `//` comment" rows need the existing comment upgraded/merged into a `/** */` block.

### apps/api/src — 26 symbols from the main scan

#### apps/api/src/routes/share.ts (3)

| Line | Symbol                  | Kind  | Current state |
| ---- | ----------------------- | ----- | ------------- |
| 10   | `deps`                  | const | no comment    |
| 12   | `RECIPE_NOT_FOUND_HTML` | const | no comment    |
| 15   | `OG_TEMPLATE`           | const | no comment    |

#### apps/api/src/routes/sitemap.ts (3)

| Line | Symbol              | Kind                           | Current state |
| ---- | ------------------- | ------------------------------ | ------------- |
| 12   | `SITEMAP_CACHE_KEY` | const                          | no comment    |
| 13   | `SITEMAP_CACHE_TTL` | const                          | no comment    |
| 42   | `deps`              | const (DI object of async fns) | no comment    |

#### apps/api/src/types/hono.ts (2)

| Line | Symbol         | Kind | Current state |
| ---- | -------------- | ---- | ------------- |
| 13   | `AppVariables` | type | no comment    |
| 20   | `AppEnv`       | type | no comment    |

#### apps/api/src/config/env.ts (2)

| Line | Symbol   | Kind                    | Current state |
| ---- | -------- | ----------------------- | ------------- |
| 90   | `Env`    | type                    | no comment    |
| 102  | `config` | let (mutable singleton) | no comment    |

#### apps/api/src/utils/upload/index.ts (2)

| Line | Symbol             | Kind      | Current state |
| ---- | ------------------ | --------- | ------------- |
| 9    | `UploadedFile`     | interface | no comment    |
| 17   | `ThumbnailOptions` | interface | no comment    |

#### apps/api/src/middleware/crawler.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 14   | `deps` | const | no comment    |

#### apps/api/src/middleware/auth.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 25   | `log`  | const | no comment    |

#### apps/api/src/utils/storage/types.ts (1)

| Line | Symbol          | Kind      | Current state |
| ---- | --------------- | --------- | ------------- |
| 1    | `StorageDriver` | interface | no comment    |

#### apps/api/src/modules/coffee-variety/index.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 25   | `deps` | const | no comment    |

#### apps/api/src/modules/bean/service.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 11   | `log`  | const | no comment    |

#### apps/api/src/modules/recipe/index.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 37   | `deps` | const | no comment    |

#### apps/api/src/modules/setup/service.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 11   | `log`  | const | no comment    |

#### apps/api/src/modules/user/service.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 13   | `log`  | const | no comment    |

#### apps/api/src/modules/qrcode/service.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 12   | `log`  | const | no comment    |

#### apps/api/src/modules/preference/service.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 11   | `log`  | const | no comment    |

#### apps/api/src/modules/report/service.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 10   | `log`  | const | no comment    |

#### apps/api/src/modules/taste/service.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 12   | `log`  | const | no comment    |

#### apps/api/src/modules/equipment/index.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 29   | `deps` | const | no comment    |

#### apps/api/src/modules/vendor/service.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 12   | `log`  | const | no comment    |

### apps/web/src — 13 symbols from the main scan

#### apps/web/src/utils/radar-chart-data.ts (2)

| Line | Symbol              | Kind      | Current state |
| ---- | ------------------- | --------- | ------------- |
| 18   | `ScaaCategory`      | type      | no comment    |
| 20   | `TasteNoteForChart` | interface | no comment    |

#### apps/web/src/utils/relative-date.ts (1)

| Line | Symbol               | Kind | Current state                          |
| ---- | -------------------- | ---- | -------------------------------------- |
| 31   | `RelativeDateResult` | type | has `//` comment — upgrade to `/** */` |

#### apps/web/src/utils/stat-cards.ts (1)

| Line | Symbol         | Kind      | Current state |
| ---- | -------------- | --------- | ------------- |
| 8    | `StatCardItem` | interface | no comment    |

#### apps/web/src/utils/recipe-filters.ts (1)

| Line | Symbol             | Kind      | Current state |
| ---- | ------------------ | --------- | ------------- |
| 3    | `ListFilterParams` | interface | no comment    |

#### apps/web/src/components/recipe/ScaaRadarChart.tsx (1)

| Line | Symbol                | Kind      | Current state |
| ---- | --------------------- | --------- | ------------- |
| 10   | `ScaaRadarChartProps` | interface | no comment    |

#### apps/web/src/components/recipe/TasteNotesFilter.tsx (1)

| Line | Symbol          | Kind      | Current state |
| ---- | --------------- | --------- | ------------- |
| 4    | `TasteNoteFlat` | interface | no comment    |

#### apps/web/src/components/recipe/RecipeCard.styles.ts (1)

| Line | Symbol                | Kind  | Current state |
| ---- | --------------------- | ----- | ------------- |
| 1    | `AUTHOR_BUTTON_STYLE` | const | no comment    |

#### apps/web/src/router.tsx (1)

| Line | Symbol   | Kind  | Current state |
| ---- | -------- | ----- | ------------- |
| 62   | `router` | const | no comment    |

#### apps/web/src/api/static-cache.ts (1)

| Line | Symbol           | Kind  | Current state |
| ---- | ---------------- | ----- | ------------- |
| 4    | `CACHE_BUST_KEY` | const | no comment    |

#### apps/web/src/pages/recipes/RecipeDetailPage.tsx (1)

| Line | Symbol             | Kind      | Current state |
| ---- | ------------------ | --------- | ------------- |
| 45   | `DetailLoaderData` | interface | no comment    |

#### apps/web/src/pages/users/UserProfilePage.tsx (1)

| Line | Symbol              | Kind      | Current state |
| ---- | ------------------- | --------- | ------------- |
| 23   | `ProfileLoaderData` | interface | no comment    |

#### apps/web/src/pages/HomePage.tsx (1)

| Line | Symbol           | Kind      | Current state |
| ---- | ---------------- | --------- | ------------- |
| 13   | `HomeLoaderData` | interface | no comment    |

### packages/shared/src — 71 symbols from the main scan

#### packages/shared/src/schemas/responses/recipe.ts (7)

| Line | Symbol                     | Kind | Current state |
| ---- | -------------------------- | ---- | ------------- |
| 34   | `RecipeRow`                | type | no comment    |
| 45   | `RecipeWithAuthorOutput`   | type | no comment    |
| 98   | `RecipeVersionRow`         | type | no comment    |
| 109  | `RecipeWithVersionsOutput` | type | no comment    |
| 124  | `FeedRecipeOutput`         | type | no comment    |
| 136  | `RecipeListItemOutput`     | type | no comment    |
| 278  | `RecipeDetailOutput`       | type | no comment    |

#### packages/shared/src/schemas/responses/collection.ts (6)

| Line | Symbol                           | Kind | Current state |
| ---- | -------------------------------- | ---- | ------------- |
| 26   | `CollectionOutput`               | type | no comment    |
| 40   | `CollectionListItemOutput`       | type | no comment    |
| 53   | `CollectionItemRecipeOutput`     | type | no comment    |
| 64   | `CollectionItemOutput`           | type | no comment    |
| 72   | `CollectionDetailOutput`         | type | no comment    |
| 82   | `PublicCollectionListItemOutput` | type | no comment    |

#### packages/shared/src/schemas/recipe.ts (5)

| Line | Symbol         | Kind | Current state |
| ---- | -------------- | ---- | ------------- |
| 202  | `RecipeCreate` | type | no comment    |
| 203  | `RecipeUpdate` | type | no comment    |
| 204  | `RecipeFork`   | type | no comment    |
| 205  | `RecipeRate`   | type | no comment    |
| 206  | `RecipeNotes`  | type | no comment    |

#### packages/shared/src/constants/visibility.ts (4)

| Line | Symbol                   | Kind  | Current state |
| ---- | ------------------------ | ----- | ------------- |
| 1    | `VISIBILITY_STATES`      | const | no comment    |
| 8    | `VisibilityValue`        | type  | no comment    |
| 10   | `VisibilityOption`       | type  | no comment    |
| 16   | `VISIBILITY_STATES_LIST` | const | no comment    |

#### packages/shared/src/constants/drink-types.ts (4)

| Line | Symbol             | Kind  | Current state |
| ---- | ------------------ | ----- | ------------- |
| 1    | `DRINK_TYPES`      | const | no comment    |
| 19   | `DrinkTypeValue`   | type  | no comment    |
| 21   | `DrinkTypeOption`  | type  | no comment    |
| 27   | `DRINK_TYPES_LIST` | const | no comment    |

#### packages/shared/src/schemas/responses/equipment.ts (4)

| Line | Symbol                           | Kind | Current state |
| ---- | -------------------------------- | ---- | ------------- |
| 37   | `EquipmentOutput`                | type | no comment    |
| 52   | `EquipmentDeleteRequestOutput`   | type | no comment    |
| 60   | `EquipmentDeleteRequestResponse` | type | no comment    |
| 69   | `EquipmentRecipesResponse`       | type | no comment    |

#### packages/shared/src/constants/emoji-tags.ts (3)

| Line | Symbol           | Kind  | Current state |
| ---- | ---------------- | ----- | ------------- |
| 1    | `EMOJI_TAGS`     | const | no comment    |
| 10   | `EmojiTagKey`    | type  | no comment    |
| 12   | `EmojiTagOption` | type  | no comment    |

#### packages/shared/src/constants/brew-methods.ts (3)

| Line | Symbol             | Kind  | Current state |
| ---- | ------------------ | ----- | ------------- |
| 1    | `BREW_METHODS`     | const | no comment    |
| 67   | `BrewMethodValue`  | type  | no comment    |
| 69   | `BrewMethodOption` | type  | no comment    |

#### packages/shared/src/schemas/responses/follow.ts (3)

| Line | Symbol                    | Kind | Current state |
| ---- | ------------------------- | ---- | ------------- |
| 22   | `FollowOutput`            | type | no comment    |
| 42   | `FollowerListItemOutput`  | type | no comment    |
| 53   | `FollowingListItemOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/comment.ts (3)

| Line | Symbol                     | Kind | Current state |
| ---- | -------------------------- | ---- | ------------- |
| 27   | `CommentOutput`            | type | no comment    |
| 34   | `CommentWithAuthorOutput`  | type | no comment    |
| 41   | `CommentWithRepliesOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/user.ts (3)

| Line | Symbol             | Kind | Current state |
| ---- | ------------------ | ---- | ------------- |
| 66   | `UserRowOutput`    | type | no comment    |
| 74   | `SelfUserOutput`   | type | no comment    |
| 100  | `PublicUserOutput` | type | no comment    |

#### packages/shared/src/constants/brew-method-rules.ts (2)

| Line | Symbol                        | Kind      | Current state |
| ---- | ----------------------------- | --------- | ------------- |
| 11   | `BrewMethodEquipmentRuleDef`  | interface | no comment    |
| 17   | `BREW_METHOD_EQUIPMENT_RULES` | const     | no comment    |

#### packages/shared/src/constants/user-preferences.ts (2)

| Line | Symbol                    | Kind  | Current state |
| ---- | ------------------------- | ----- | ------------- |
| 15   | `TEMPERATURE_UNIT_VALUES` | const | no comment    |
| 25   | `THEME_VALUES`            | const | no comment    |

#### packages/shared/src/constants/units.ts (2)

| Line | Symbol             | Kind                             | Current state |
| ---- | ------------------ | -------------------------------- | ------------- |
| 1    | `CANONICAL_UNITS`  | const                            | no comment    |
| 8    | `UNIT_CONVERSIONS` | const (object of conversion fns) | no comment    |

#### packages/shared/src/schemas/taste.ts (2)

| Line | Symbol            | Kind | Current state |
| ---- | ----------------- | ---- | ------------- |
| 35   | `TasteNoteCreate` | type | no comment    |
| 36   | `TasteNoteUpdate` | type | no comment    |

#### packages/shared/src/schemas/responses/badge.ts (2)

| Line | Symbol            | Kind | Current state |
| ---- | ----------------- | ---- | ------------- |
| 25   | `BadgeOutput`     | type | no comment    |
| 48   | `UserBadgeOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/notification.ts (2)

| Line | Symbol               | Kind | Current state |
| ---- | -------------------- | ---- | ------------- |
| 25   | `NotificationOutput` | type | no comment    |
| 32   | `UnreadCountOutput`  | type | no comment    |

#### packages/shared/src/schemas/user.ts (2)

| Line | Symbol              | Kind | Current state |
| ---- | ------------------- | ---- | ------------- |
| 45   | `UserProfileUpdate` | type | no comment    |
| 46   | `UserPreferences`   | type | no comment    |

#### packages/shared/src/types/coffee-variety.ts (1)

| Line | Symbol                  | Kind | Current state |
| ---- | ----------------------- | ---- | ------------- |
| 10   | `CoffeeVarietyCategory` | type | no comment    |

#### packages/shared/src/constants/badges.ts (1)

| Line | Symbol        | Kind  | Current state |
| ---- | ------------- | ----- | ------------- |
| 1    | `BADGE_RULES` | const | no comment    |

#### packages/shared/src/schemas/responses/report.ts (1)

| Line | Symbol         | Kind | Current state |
| ---- | -------------- | ---- | ------------- |
| 23   | `ReportOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/taste.ts (1)

| Line | Symbol            | Kind | Current state |
| ---- | ----------------- | ---- | ------------- |
| 26   | `TasteNoteOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/photo.ts (1)

| Line | Symbol        | Kind | Current state |
| ---- | ------------- | ---- | ------------- |
| 22   | `PhotoOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/setup.ts (1)

| Line | Symbol        | Kind | Current state |
| ---- | ------------- | ---- | ------------- |
| 27   | `SetupOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/coffee-variety.ts (1)

| Line | Symbol                | Kind | Current state |
| ---- | --------------------- | ---- | ------------- |
| 47   | `CoffeeVarietyOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/bean.ts (1)

| Line | Symbol       | Kind | Current state |
| ---- | ------------ | ---- | ------------- |
| 27   | `BeanOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/vendor.ts (1)

| Line | Symbol         | Kind | Current state |
| ---- | -------------- | ---- | ------------- |
| 21   | `VendorOutput` | type | no comment    |

#### packages/shared/src/schemas/responses/preference.ts (1)

| Line | Symbol                  | Kind | Current state |
| ---- | ----------------------- | ---- | ------------- |
| 32   | `UserPreferencesOutput` | type | no comment    |

#### packages/shared/src/schemas/follow.ts (1)

| Line | Symbol   | Kind | Current state |
| ---- | -------- | ---- | ------------- |
| 9    | `Follow` | type | no comment    |

#### packages/shared/src/schemas/comment.ts (1)

| Line | Symbol          | Kind | Current state |
| ---- | --------------- | ---- | ------------- |
| 12   | `CommentCreate` | type | no comment    |

### packages/db/src — 59 symbols from the main scan

#### packages/db/src/schema.ts (43)

| Line | Symbol                             | Kind            | Current state                          |
| ---- | ---------------------------------- | --------------- | -------------------------------------- |
| 43   | `visibilityEnum`                   | const           | has `//` comment — upgrade to `/** */` |
| 45   | `RecipeVisibility`                 | type            | no comment                             |
| 47   | `brewMethodEnum`                   | const           | no comment                             |
| 48   | `drinkTypeEnum`                    | const           | no comment                             |
| 49   | `equipmentTypeEnum`                | const           | no comment                             |
| 50   | `emojiTagEnum`                     | const           | no comment                             |
| 51   | `badgeRuleEnum`                    | const           | no comment                             |
| 52   | `unitSystemEnum`                   | const           | no comment                             |
| 53   | `temperatureUnitEnum`              | const           | no comment                             |
| 54   | `themeEnum`                        | const           | no comment                             |
| 55   | `dateFormatEnum`                   | const           | no comment                             |
| 56   | `additionalPreparationTypeEnum`    | const           | no comment                             |
| 60   | `reportStatusEnum`                 | const           | no comment                             |
| 66   | `users`                            | const           | has `//` comment — upgrade to `/** */` |
| 92   | `userPreferences`                  | const (pgTable) | no comment                             |
| 112  | `recipes`                          | const           | no comment                             |
| 177  | `recipeVersions`                   | const           | no comment                             |
| 242  | `recipeTasteNotes`                 | const           | no comment                             |
| 266  | `recipeEquipment`                  | const           | no comment                             |
| 288  | `recipeAdditionalPreparations`     | const           | no comment                             |
| 309  | `photos`                           | const           | no comment                             |
| 335  | `recipeVersionPhotos`              | const           | no comment                             |
| 358  | `equipment`                        | const           | no comment                             |
| 387  | `beans`                            | const           | no comment                             |
| 417  | `coffeeVarietyCategoryEnum`        | const           | no comment                             |
| 422  | `coffeeVarieties`                  | const (pgTable) | no comment                             |
| 470  | `vendors`                          | const           | no comment                             |
| 488  | `tasteNotes`                       | const           | no comment                             |
| 527  | `setups`                           | const           | no comment                             |
| 559  | `comments`                         | const           | no comment                             |
| 601  | `userFollows`                      | const           | no comment                             |
| 631  | `userRecipeFavourites`             | const           | no comment                             |
| 647  | `userRecipeLikes`                  | const           | no comment                             |
| 663  | `userRecipeRatings`                | const           | no comment                             |
| 681  | `badges`                           | const           | no comment                             |
| 699  | `userBadges`                       | const           | no comment                             |
| 714  | `brewMethodEquipmentRules`         | const           | no comment                             |
| 733  | `equipmentDeleteRequestStatusEnum` | const           | no comment                             |
| 738  | `equipmentDeleteRequests`          | const (pgTable) | no comment                             |
| 756  | `auditLogs`                        | const           | no comment                             |
| 774  | `passwordResets`                   | const           | no comment                             |
| 791  | `emailVerificationTokens`          | const           | no comment                             |
| 809  | `reports`                          | const           | no comment                             |

#### packages/db/src/seed-users-recipes.ts (10)

| Line | Symbol                         | Kind  | Current state |
| ---- | ------------------------------ | ----- | ------------- |
| 8    | `defaultPassword`              | const | no comment    |
| 10   | `badgeSeedData`                | const | no comment    |
| 83   | `brewMethodCompatibilityRules` | const | no comment    |
| 154  | `userSeedData`                 | const | no comment    |
| 197  | `equipmentSeedData`            | const | no comment    |
| 264  | `vendorSeedData`               | const | no comment    |
| 302  | `beanSeedData`                 | const | no comment    |
| 455  | `recipeSeedData`               | const | no comment    |
| 1519 | `socialSeedData`               | const | no comment    |
| 1700 | `setupSeedData`                | const | no comment    |

#### packages/db/src/seed-equipment-catalog.ts (2)

| Line | Symbol                     | Kind      | Current state                          |
| ---- | -------------------------- | --------- | -------------------------------------- |
| 4    | `EquipmentCatalogEntry`    | interface | has `//` comment — upgrade to `/** */` |
| 14   | `equipmentCatalogSeedData` | const     | no comment                             |

#### packages/db/src/seed-coffee-varieties.ts (2)

| Line | Symbol                   | Kind      | Current state                          |
| ---- | ------------------------ | --------- | -------------------------------------- |
| 4    | `CoffeeVarietySeedEntry` | interface | has `//` comment — upgrade to `/** */` |
| 36   | `coffeeVarietySeedData`  | const     | no comment                             |

#### packages/db/src/seed.ts (1)

| Line | Symbol | Kind     | Current state |
| ---- | ------ | -------- | ------------- |
| 927  | `main` | function | no comment    |

#### packages/db/src/index.ts (1)

| Line | Symbol | Kind  | Current state |
| ---- | ------ | ----- | ------------- |
| 7    | `db`   | const | no comment    |
