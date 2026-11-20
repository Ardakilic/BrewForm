### Personal notes and recipe write integrity (t1)

**Context**

*Notes.* Validation confirmed the IDOR. `RecipeDetailPage.tsx:330-332` shows `RecipeNotesSection` to
every signed-in viewer, pre-filled with the author's `currentVersion.personalNotes`. Save calls
`POST /api/v1/recipes/:id/notes` (`recipe/index.ts:846-873`), which never reads `userId` and calls
`service.saveNotes(recipeId, notes)` (`service.ts:711-718`). That function checks neither author
nor visibility, does not sanitize, and runs `model.updateVersionNotes` (`model.ts:1029-1035`), an
in-place `UPDATE recipe_version SET personal_notes`. Any account can overwrite the author's text on
any recipe, including private and draft recipes reachable by UUID.

The column being overwritten is the author's **public** brewer note. It appears in the tasting-notes
card (`TastingNotesSection.tsx:157-163`), the SEO and JSON-LD descriptions
(`RecipeDetailPage.tsx:139-154`), search filtering and ranking (`model.ts:128-147`,
`service.ts:444-465`), diff, merge and fork. The UI copy ("Add your personal notes about this
recipe...") promises a per-viewer private note that was never built. Users who typed "private"
notes on someone else's recipe published them as that author's note.

*Recipe write.* All five data-loss claims hold:
- Non-bump edits write only title and visibility (`service.ts:352-358`).
- A bump copies only scalars and photos, so taste notes, intensities, equipment and preparations
  are lost (`service.ts:271-351`).
- `tds` is never written, and the current `recipe-write` spec codifies that omission.
- `coffeeVarietyId` is absent from the create schema and from every writer except the seed.
- The edit page sends `undefined` for cleared fields, so nothing can be cleared.

Validation also found these new problems:
- **Zod 4 `.partial()` keeps `.default('draft')`.** A PATCH without `visibility` unpublishes the
  recipe, and a bump resets `isFavourite`. This was reproduced on zod 4.6.7 and is confirmed by the
  Zod source.
- **The bump is non-transactional.** It commits the version before title validation, which leaves
  orphan versions, and it races on `versionNumber`.
- **Service `VALIDATION_ERROR` and FK violations return 500.**
- **`brewRatio`/`flowRate`, `setupId` (on update) and bump `brewDate` are accepted but ignored.**
- **PATCH skips the email-verified gate.** An unverified account can fork into a draft and then
  publish it.
- **The create page drops `?beanId`.**

`docs/recipes.md:26` already documents that a non-bump update "modifies the current version in
place". Full evidence is in `audit/t1-notes-recipe-write.md`.

**Decisions**

1. **Private notes get their own table, and the author's version notes stay public.**
   - Choice: new `user_recipe_note` table with a unique `(user_id, recipe_id)` constraint, soft delete
     and a CHECK capping length at 10000. It follows the existing `user_recipe_rating`/`favourite`
     naming and FK patterns.
   - Alternatives: (a) author-only `POST /notes`, as the audit first suggested; (b) make version
     notes author-private.
   - Rationale: matches the user's intent (each user keeps notes only they can see). Public brewer
     notes keep their SEO and search role. The new endpoints carry no user id, so nobody can address
     another user's row.

2. **Caller-scoped endpoints in a new `recipe-note` module.**
   - Choice: `apps/api/src/modules/recipe-note/{model.ts,service.ts,index.ts}`, with the router
     mounted at `/api/v1/recipes` next to the recipe router. Precedent: `user` and `userCollections`
     both mount at `/api/v1/users` (`routes/index.ts:48-49`). Routes are `GET|PUT|DELETE /:id/notes`
     plus the deprecated `POST /:id/notes`.
   - Behaviour: the service loads a minimal recipe projection
     (`id, authorId, visibility, deletedAt`) through its own model and calls the pure
     `canViewRecipe` exported by `recipe/service.ts`.
   - Model: the upsert uses
     `onConflictDoUpdate({ target: [userRecipeNotes.userId, userRecipeNotes.recipeId], set: { notes, updatedAt: new Date(), deletedAt: null } })`.
     `DELETE` sets `deletedAt = now` and `notes = ''`.
   - Alternative: more functions in `recipe/model.ts` and `recipe/service.ts`. Rejected: those files
     are already about 1300 and 1000 lines, and a separate module keeps the privacy boundary easy to
     audit.

3. **Soft delete that also scrubs the text.**
   - Choice: `deleted_at` plus `notes = ''`.
   - Alternatives: hard delete (as favourites do), or soft delete that keeps the text.
   - Rationale: follows the AGENTS.md soft-delete rule and keeps one row per pair for the upsert.
     Unlike comments, private notes need no moderation, so keeping deleted private text has no
     purpose and is a privacy liability.

4. **No email-verification gate on private notes.**
   - Choice: authentication only.
   - Alternative: `isEmailVerified` as on create/merge/comment.
   - Rationale: the existing rule gates content other people see. Personal state (ratings,
     favourites, collections) is not gated, and private notes are personal state. Rate limiting and
     the body limit still apply.

5. **Keep `POST /:id/notes` for one release as a caller-scoped deprecated alias.**
   - Choice: same handler as `PUT`, plus `Deprecation: true` and a `Link` successor header. Delete
     `saveNotes` and `updateVersionNotes`, and add a removal entry to `plans/TECHNICAL_DEBT.md`.
   - Alternative: remove it (an open SPA tab silently loses typed text) or return 410.
   - Rationale: follows the D28 deprecation precedent and protects in-flight users. The alias is
     caller-scoped, so it carries no security risk.

6. **Private notes are not embedded in the recipe detail payload.**
   - Choice: a separate request with `Cache-Control: private, no-store`. On the web,
     `RecipeNotesSection` loads through `useFetcher().load('/resources/recipes/:id/notes')` only when
     signed in, and writes through that resource route's action (intents `save`/`delete`, returning
     `{ ok }`), per the web-data-loading capability.
   - Alternative: add `userNote` to `GET /recipes/:slugOrId`, as `userRating` already is.
   - Rationale: keeps the detail payload free of private text that crawler, OG or caching paths
     could leak, and anonymous visitors make no extra request.

7. **The API keeps the name `personalNotes`; the UI relabels it.**
   - Choice: keep the API field, relabel the UI as "Brewer's notes" (public hint), and label the
     private editor "My private notes".
   - Alternative: rename the column and field to `brewerNotes`.
   - Rationale: a rename is a breaking API change touching schema, migration, shared schemas, merge
     selections, diff fields and the web, for no behavioural gain. Revisit with the next API version.

8. **Non-bump edits amend the current version.**
   - Choice: `bumpVersion: false` writes every provided field to the current version in one
     transaction and replaces only the relations that were provided. Earlier versions stay
     immutable.
   - Alternatives: reject version fields without a bump (400), or auto-bump on any change.
   - Rationale: this is documented behaviour (`docs/recipes.md:26`) and the brief's preference. Auto
     bumping needs fragile value diffing (float4, numeric strings, timestamptz dates, relation sets)
     and spams versions for typo fixes. The schema comment "Immutable recipe versions"
     (`schema.ts:208`) becomes "the current version may be amended by its author; earlier versions
     are immutable".

9. **One transactional model writer for amend and bump.**
   - Choice: `model.updateRecipeWithVersion(input)`, with `mode: 'amend' | 'bump'`, owns a single
     `db.transaction`:
     1. Lock the recipe row with `tx.select(...).from(recipes).where(...).for('update')`.
     2. Read the current version and its relations inside the transaction.
     3. **amend**: update the current version's columns, then delete and re-insert each provided
        relation.
     4. **bump**: compute `max(versionNumber) + 1`, insert the version, then copy or replace taste
        notes (with intensities), equipment, preparations (`sortOrder`) and photos.
     5. Update `recipes` (title, visibility, `currentVersionId` for a bump, `updatedAt`).
     6. Return `findById` after commit.
   - The service validates everything first: sanitized title, merged cross-field rules, references,
     equipment compatibility on merged values, and variety-name resolution. The service still never
     imports drizzle.
   - Alternative: extend `createVersion` and keep calling it from the service. Rejected: that is the
     current non-atomic design.
   - Rationale: no partial writes and no orphan versions. The row lock serializes concurrent edits,
     so neither request gets a 23505.

10. **One version-column mapping shared by create, amend, bump and fork, with a drift guard.**
    - Choice: a `versionColumnsFrom(resolved)` helper (plus a copy variant for fork and bump) in
      `model.ts`. A `model.test.ts` test compares its keys with `getTableColumns(recipeVersions)`.
    - Rationale: the original bugs were per-path column lists drifting apart (`tds` missing in three
      places).

11. **Update schema without injected defaults; explicit absent/null/[] semantics.**
    - Choice: a new `RecipeUpdateObjectSchema` built field by field (`.nullish()` on clearable fields,
      `.optional()` on required ones, no `.default()` except `bumpVersion`), following
      `UserPreferencesPatchSchema`.
    - Cross-field rules move into an exported pure `recipeCrossFieldIssues(data)`, used by both
      schemas through `.superRefine` and by the service on merged values.
    - `brewRatio`/`flowRate` are dropped from the input schemas (Zod strips unknown keys, so this is
      non-breaking).
    - `coffeeVarietyId` is added, as `.optional()` on create and `.nullish()` on update.
    - Alternative: keep `.partial()` and strip defaults in the handler, which would be fragile and
      invisible in OpenAPI.

12. **Variety name is denormalized server-side; `tds` stays a string.**
    - `coffeeVarietyName` is copied from the variety row on every write and is not accepted from
      clients.
    - `tds` is written as `String(n)` (Postgres rounds to scale 2) and stays in Drizzle's default
      string mode, so `RecipeVersionRowSchema.tds` remains `string | null`.

13. **Reference validation in the service.**
    - Choice: model lookups (non-deleted taste notes, equipment, vendor, variety, and author-owned
      bean when newly set) run before writes and return field-level 400 details.
    - Rationale: clearer than relying on FK violations. The error-handling track's 23503→400 mapping
      remains the backstop.

14. **PATCH gets the email-verified gate, full OpenAPI metadata and error mapping.**
    - The handler maps `VALIDATION_ERROR*` to 400 with details, `FORBIDDEN` to 403 and
      `RECIPE_NOT_FOUND` to 404, and leaves 422 and 409 to `errorHandler`.
    - Fork stays ungated: drafts are visible only to their owner, and a gated PATCH blocks publishing.

15. **Existing data is left untouched.** See Migration below.

**Risks / Trade-offs**

- [Amending the current version changes what other users' brew logs point at (`brew_log.recipe_version_id`)] → Earlier versions stay immutable. The edit page hint says plainly that the current version is updated in place and offers "Save as a new version". An `amendedAt` column on `recipe_version` is listed as an open question.
- [Users' earlier "private" notes on other people's recipes are public and cannot be identified] → The change announcement explains what the old box did and tells authors to review their brewer notes through the edit page. No automated wipe, because that would destroy legitimate author text.
- [Removing `RecipeNotesSection`'s pre-fill changes what authors see: their own private editor now starts empty] → Authors keep editing brewer notes in the edit form. The private editor is a separate personal scratchpad, and both labels say so.
- [Concurrent edits block on the recipe row lock] → Lock scope is one row for one short transaction, and edits of the same recipe are rare.
- [The cross-track merge conflicts in `recipe/service.ts` (slug track), `RecipeEditPage.tsx`/`RecipeCreatePage.tsx` (web-data-loading), `errorHandler.ts` (error-handling) and migration numbering] → Land in this order: error-handling, then slug, then t1 API, then t5 web paradigm, then t1 web. Generate migrations one at a time at apply time. On a numbering collision, delete the local migration, snapshot and journal entry, then rerun `make db-generate`. Never hand-edit the SQL.
- [Clients that relied on `brewRatio`/`flowRate` input see no change, because those values were already ignored] → None needed. OpenAPI no longer advertises them.
- [Unverified authors can no longer edit their own recipes] → Same rule as create. The `EmailVerificationBanner` already prompts verification.
- [The deprecated POST alias lingers] → A ledger entry carries a removal target of the following release.

**Migration / Rollout**

- **Schema**:
  - Add `userRecipeNotes` and its relations (`users` many, `recipes` many) to
    `packages/db/src/schema.ts`.
  - Update the `recipeVersions` docblock.
  - Run `make db-generate`. This is a new table, so no rename prompt and no TTY workaround is needed.
  - Run `make db-migrate`.
  - Rerun `make db-generate` and assert "No schema changes, nothing to migrate".
  - Rerun `make test-db-provision` so `brewform_test` gets the table.
  - There is no change to `recipe_version`: `tds`, `coffee_variety_id` and `coffee_variety_name`
    already exist.
- **Data**:
  - No backfill.
  - `recipe_version.personal_notes` is left exactly as it is.
  - `tds` and variety history cannot be recovered, since they were never stored.
  - The seed needs no change. A seed helper for notes, if added, uses
    `onConflictDoNothing({ target: [userId, recipeId] })`.
- **Env vars**: none.
- **Deploy order**: the API and SPA ship together. Old SPA tabs keep working against the POST alias,
  which now writes private notes.
- **Rollback**: revert the code. The `user_recipe_note` table can stay (unused) because Drizzle does
  not generate down migrations. Private notes written in the meantime survive a later re-deploy.
- **Docs**:
  - `docs/api.md`: notes endpoints and PATCH semantics.
  - `docs/recipes.md`: versioning, amend versus bump, private notes, and the `tds`/variety fields.
  - `plans/TECHNICAL_DEBT.md`: POST alias removal, merge field parity follow-up.
  - Change announcement or release note: notes privacy.
