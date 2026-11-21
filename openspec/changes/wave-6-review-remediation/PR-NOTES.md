# PR notes (collected per group for task 22.4)

## Group 13 (web action results)

- Deleted `apps/web/src/components/user/FollowButton.exploration.test.ts` and `FollowButton.preservation.test.ts`: they tested a hand-written copy of an old follow state machine (the D99.13 mirror-test pattern), and their premise that a 409 is an error contradicts the now idempotent follow. The real `FollowButton.test.tsx` covers the component.
- A dead session during a background action (resource routes) now shows the `error.unauthorized` toast instead of redirecting to `/login?next=/resources/...`.

## Group 4 (identifiers and search)

- `lower()` (`packages/db/src/schema.ts`) now takes `AnyPgColumn | SQLWrapper | string` and returns `SQL<string>`; every identifier lookup lowers both sides in SQL (`eq(lower(col), lower(value))`), guarded by `apps/api/src/modules/auth/identifier.enforcement.test.ts`. PostgreSQL resolves `lower($1)` with the untyped postgres-js parameter, so no `::text` cast was needed.
- Equipment, vendor and taste-note `search` model functions became `async` and return `[]` for a whitespace-only term without querying.

## Group 5 (recipe writes, version diff and QR)

- `POST`/`PATCH /api/v1/coffee-varieties` now pass `zodValidationHook` to `zValidator`, so a schema failure answers the standard `400 VALIDATION_ERROR` envelope with field details (it returned the raw Zod result before), as the E3 route test and the `coffee-variety-write` spec require. The admin variety routes already used the hook.
- `docs/api-reference.md` lists parameters and statuses only, so the new `maxItems`/`maxLength` request-body bounds do not appear there; the only diff is the QR row (`200, 404`).

## Group 6 (millisecond cursors and the date-only filter)

- Migration `packages/db/drizzle/0020_yummy_spyke.sql` narrows `recipe.created_at` to `timestamp(3) with time zone`. drizzle-kit 0.31.10 emits the type change as `SET DATA TYPE timestamp (3) with time zone` followed by `SET DEFAULT now()` (its convertor always re-sets the default after a type change on a defaulted column; the default is unchanged). The first start after the upgrade rewrites the `recipe` table and its indexes under an exclusive lock (well under a second for a self-hosted site).
- BREAKING: `dateFrom`/`dateTo` accept only `YYYY-MM-DD` (inclusive UTC days); a timestamp now answers `400`. The web app always sent days; `extractListParams` drops a hand-edited non-day value instead of failing the loader.
- `docs/api-reference.md` has no diff: it lists parameter names and types, not the reworded descriptions.

## Group 8 (comments and deleted accounts)

- API behaviour change: author and owner fields of recipe and collection payloads can now be `null` (a deleted account), on the comment list, recipe list/detail/feed/cursor, collection detail and public browse, equipment and variety recipe lists. Six response schemas became nullable; admin routes keep the identity. Read side only: no data change, accounts deleted before the upgrade are masked from the first request.
- `GET /api/v1/comments/recipe/:recipeId` returns at most 20 replies per comment (oldest first) and a new required `hasMoreReplies` field. Deleting a top-level comment now also soft-deletes its replies and lowers `commentCount` by the number removed; a second concurrent delete of one comment answers 404 instead of decrementing twice.
- The comment delete buttons used `var(--danger)`, which no theme defined. The top-level delete (on `--bg-secondary`) now uses `--error`; the reply delete (on `--bg-tertiary`, where dark `--error` measures 3.71:1) uses a new `--error-on-raised` token (light `#b91c1c`, dark `#fca5a5`, coffee `#fca5a5`; 5.15 / 5.41 / 5.13 on `--bg-tertiary`), locked by a `contrast.test.ts` row. `theme-usage.test.ts` now fails on any `var(--…)` that is not defined in the light, dark and coffee blocks (Tailwind `@theme` tokens and Base UI's `--anchor-width`/`--transform-origin` are exempt); the `web-shared-components` delta names `--error-on-raised`.
- `docs/api-reference.md` has no diff: it lists summaries, parameters and statuses, not response shapes or descriptions (`hasMoreReplies`, the nullable authors and the reworded descriptions are in `/api/v1/openapi.json`).
