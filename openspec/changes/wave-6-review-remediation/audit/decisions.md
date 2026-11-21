# User decisions (2026-11-21)

Recorded from the user's answers before the artifacts were written. design.md → "Open Questions →
Resolved by the user (2026-11-21)" repeats them; do not reopen them.

1. **Branch:** the change lands on `wave-6-audit-remediation` and ships in PR #172 (not merged yet).
   No separate PR. Nothing is published to GHCR until the fixes are in.
2. **Production seed (#12, reverses D99.52):** when `APP_ENV=production` the seed creates only the
   admin account and reference data: taste notes, equipment, coffee varieties and the 7
   real-roaster vendors. No demo users and none of their content (recipes, setups, brew logs,
   collections, comments, follows, likes). No `SEED_DEMO_DATA` override. D99.52 is closed by this
   change.
3. **Date filter (#17):** `dateFrom`/`dateTo` accept dates only (`YYYY-MM-DD`, `z.iso.date()`),
   interpreted as UTC days; the range is inclusive of both days (`createdAt >= dateFrom` and
   `createdAt < dateTo + 1 day`). The timestamp support promised in `docs/api.md` is removed.
4. **Extras found during research (not in the review): fix ALL of them in this change.**
   - E1 replies of a deleted top-level comment stay counted but hidden (r1 cross-track)
   - E2 "Clear filters" within 300 ms of typing keeps the pending search (r4 cross-track)
   - E3 coffee-variety string array fields are unbounded (r1 cross-track)
   - E4 a soft-deleted taste note is invisible in the recipe edit picker and cannot be removed (r1)
   - E5 the version-diff route passes the admin flag, contradicting the comment-authz spec (r1)
   - E6 app-wide `--text-tertiary` text below 4.5:1 outside charts (r4)
   - E7 logout is not synced across tabs (r4)
   - E8 sitemap past 50,000 URLs needs a sitemap index (r1/r5)
   - plus the catalog `like` searches (folded into #4 by r2) and r3's pre-wave-6 rollback floor
     (docs + spec).

Defaults taken without asking (from the research tracks; recorded so they are not reopened):
- #34: delete the unused admin `isEmailTaken`/`isUsernameTaken` (and the other dead helpers);
  reword the unique-identifiers spec so admin writes rely on the unique index + 409 mapping.
- #26: lower both sides in SQL (`lower(col) = lower($param)`), no migration, no `COLLATE "C"`.
- #13: docs-only fix; `TRUSTED_PROXIES` default stays `private_ranges`.
- #16: `precision: 3` on `recipes.createdAt` via a generated migration (also fixes the follow feed).
- #1: updates re-check only references not already on the current version; merge drops
  soft-deleted taste notes and equipment.
- #9: element-less resource routes never redirect; they return `{ ok: false, code: 'UNAUTHORIZED' }`.
- #22: sign-out always lands on `/`.
- #23: follow/unfollow become idempotent (409 on follow / 404 on unfollow count as success).
- r1 D2: add the visibility enforcement rule for relational `recipe: true` / `recipe: {` loads.
- No fix needs an ADR; ADR-022 stays the next free number.

## Added after r6 (2026-11-21), under the user's "fix everything" decision

r6 found three more concrete problems. They are in scope under decision 4, with these defaults
(the user can veto before apply):
- E9 `TasteAutocomplete` hard-codes English (loading/empty/hint/flavour-wheel texts and the
  intensity `title` template literal). Fix: en+tr keys, `t()` + `.replace`, a `tr` render test,
  and extend the i18n literal guard so template-literal attributes are caught.
- E10 the replies query in `comment/model.ts` `findByRecipe` has no `limit` (AGENTS.md "Bounded
  reads"). Fix: bound it without raw SQL: replies oldest-first with a hard cap per page request
  (derived from the page's parent count × a per-parent cap, documented in the spec), plus a D99
  entry for a later "load more replies" UI. No window functions.
- E11 comments of a soft-deleted account still show that account's name and link to a 404
  profile, contradicting the account-deletion spec ("permanently remove … their personal data").
  Fix: the comment list returns no author identity for deleted accounts (author `null` or a
  `deleted: true` marker, derived in the model from `users.deletedAt`); the web renders an i18n
  "Deleted user" label without a profile link. Check every other surface that joins `users` for
  display (recipes by deleted users are already soft-deleted by account deletion — verify).

r6 product calls taken as defaults: E1 deleting a top-level comment also removes its replies
(the UI already hides them); E8 the sitemap moves to the root `/sitemap.xml` (sitemap index), the
old `/api/v1/sitemap.xml` answers 301, and the guides tell operators to resubmit it.

## r7 corrections to the E10/E11 defaults (2026-11-21, supersede the defaults above)

- E10: the "LIMIT parents × cap" default is replaced by r7's design: one Drizzle relational query
  caps each parent at 20 replies (oldest first), responses gain `hasMoreReplies`, plus a D99
  "load more replies" entry. Needs `relationName: 'commentReplies'` on the self-relation
  (no migration; `make db-generate` must stay clean).
- E11: the premise that account deletion soft-deletes recipes was false. Scope widened under the
  "fix everything" decision: every public surface (comments, recipe list/detail/feed/cursor,
  crawler description, collections, equipment/variety recipe lists, the `?author=` filter)
  returns no author identity for a deleted account (read-side only, no data change); the web
  shows an i18n "Deleted user" label without a profile link; admin pages keep the name. Six
  response schemas make the author nullable (API contract change shipped with the web update).
  D99.26 stays open with its Evidence reworded.

## Debt items pulled into scope (2026-11-21, user answer "Fix all three")

The design/tasks assembler had parked three items as new debt; the user chose to fix them here:
- D99.65 → fix: `apps/api/src/modules/notification/service.ts` logs raw database errors; pass
  them through `toLoggableError(err)` (AGENTS.md logging rule), with logger-spy tests.
- D99.66 → fix: `apps/api/src/modules/recipe/model.test.ts` tests an inline copy of
  `buildRecipeFilters`; replace with tests of the real function (DB-backed where needed).
- D99.67 → fix: repair `recipe.comment_count` values that drifted before this change, once per
  deploy, automatically. Default design: a Drizzle-only, idempotent recount in `packages/db`
  (no hand-written SQL migration, no raw SQL outside the registry) run by the entrypoint's
  `migrate` mode after migrations succeed, plus a make target for dev/test; it only updates rows
  whose stored count differs and logs the number of repaired recipes (ids only).
These three are no longer ledger entries; D99.63 and D99.64 stay as the only new debt.
