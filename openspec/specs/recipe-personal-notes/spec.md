# recipe-personal-notes Specification

## Purpose
TBD - created by archiving change wave-6-audit-remediation. Update Purpose after archive.
## Requirements
### Requirement: Private recipe notes are stored per user and recipe
The system SHALL store each user's private notes on a recipe in a dedicated `user_recipe_note` table keyed by `(user_id, recipe_id)`, separate from the author's public `recipe_version.personal_notes` column.

The table SHALL be declared only in `packages/db/src/schema.ts` (Drizzle export `userRecipeNotes`)
and its migration SHALL be produced by `make db-generate` and applied by `make db-migrate`; the
generated SQL SHALL NOT be hand-edited. Columns: `id` (varchar 36, UUID default), `user_id`
(varchar 36, FK `user.id`, not null), `recipe_id` (varchar 36, FK `recipe.id`, not null), `notes`
(text, not null), `created_at`, `updated_at` (timestamptz, not null, default now) and `deleted_at`
(timestamptz, nullable). It SHALL have the unique constraint
`user_recipe_note_user_id_recipe_id_unique` on `(user_id, recipe_id)`, an index on `recipe_id`, and
the CHECK constraint `user_recipe_note_notes_length_check` limiting `char_length(notes)` to 10000.
Drizzle relations SHALL link the table to `users` and `recipes`. A user SHALL have at most one row
per recipe, and the row SHALL be reused (revived) when a deleted note is written again. Notes
belong to the recipe, not to a version, so they survive version bumps. No JSONB or UUID column
types and no raw SQL SHALL be used.

#### Scenario: One row per user and recipe
- **WHEN** user B saves a private note on recipe R twice
- **THEN** `user_recipe_note` contains exactly one row for `(B, R)` holding the second text

#### Scenario: Notes survive a version bump
- **WHEN** user B has a private note on recipe R and the author bumps R to a new version
- **THEN** `GET /api/v1/recipes/R/notes` as B still returns B's note

#### Scenario: Migration is generated and fresh
- **WHEN** `make db-generate` is run after the migration for this table is committed
- **THEN** it prints "No schema changes, nothing to migrate" and creates no new migration file

### Requirement: Callers read only their own private note
`GET /api/v1/recipes/:id/notes` SHALL return the authenticated caller's private note for the recipe and SHALL NOT return, reveal or accept an identifier for any other user's note.

The route SHALL require authentication, SHALL validate `:id` as a UUID (`zValidator('param', ...)`),
SHALL resolve the note only from `c.get('userId')`, and SHALL respond with
`successEnvelope(RecipeUserNoteOutputSchema)` where the payload is
`{ recipeId, notes: string | null, updatedAt: string | null }`. When the caller has no live note
the payload SHALL be `{ recipeId, notes: null, updatedAt: null }` with status 200. The recipe
SHALL be visible to the caller per `canViewRecipe(recipe, userId, isAdmin)` and not soft-deleted,
otherwise the route SHALL return 404 `NOT_FOUND` (existence-hiding). The response SHALL carry
`Cache-Control: private, no-store`. Admin status SHALL NOT grant access to other users' notes.

#### Scenario: Each user sees only their own note
- **WHEN** user A and user B each have a private note on public recipe R and B requests `GET /api/v1/recipes/R/notes`
- **THEN** the response is 200 with B's text
- **AND** A's text appears nowhere in the response

#### Scenario: No note yet
- **WHEN** user B has never written a note on public recipe R and requests it
- **THEN** the response is 200 with `notes: null` and `updatedAt: null`

#### Scenario: Anonymous caller
- **WHEN** an unauthenticated client requests `GET /api/v1/recipes/R/notes`
- **THEN** the response is 401 `UNAUTHORIZED`

#### Scenario: Recipe the caller cannot view
- **WHEN** user B requests notes on user A's `private` or `draft` recipe, on a soft-deleted recipe, or on an unknown UUID
- **THEN** the response is 404 `NOT_FOUND`

#### Scenario: Admin cannot read another user's note
- **WHEN** an admin requests `GET /api/v1/recipes/R/notes` and only user B has a note on R
- **THEN** the response contains `notes: null` (the admin's own, absent note), not B's text

#### Scenario: Responses are not cacheable by shared caches
- **WHEN** any `GET /api/v1/recipes/:id/notes` response is returned
- **THEN** it carries the header `Cache-Control: private, no-store`

### Requirement: Callers create or replace only their own private note
`PUT /api/v1/recipes/:id/notes` SHALL create or replace the authenticated caller's private note on a recipe the caller can view, and SHALL NOT modify any other user's note or any `recipe_version` row.

The body SHALL be validated with `RecipeNotesSchema` (`{ notes: string }`, trimmed, 1-10000
characters) through `zValidator`. The service SHALL apply `sanitizeText` before storing. Text that
is empty after sanitization SHALL be rejected with 400 `VALIDATION_ERROR` (field `notes`). The write
SHALL be a single Drizzle `onConflictDoUpdate` upsert on `(user_id, recipe_id)` that sets `notes`,
`updated_at = now()` and `deleted_at = null`. Any `userId` (or similar) in the body, query or headers
SHALL be ignored. Because private notes are personal state and never shown to other users (like
favourites and ratings), the route SHALL require authentication but SHALL NOT require a verified
email. The response SHALL be 200 with `successEnvelope(RecipeUserNoteOutputSchema)`.

#### Scenario: Non-author cannot change the author's notes (IDOR regression)
- **WHEN** user B sends `PUT /api/v1/recipes/R/notes` with `{ "notes": "B's take" }` on user A's public recipe R
- **THEN** the response is 200 and B's private note on R reads "B's take"
- **AND** `recipe_version.personal_notes` on every version of R is byte-identical to its value before the request
- **AND** A's private note on R, if any, is unchanged

#### Scenario: Cannot write notes on a recipe the caller cannot view
- **WHEN** user B sends `PUT` on user A's `private` or `draft` recipe, or on a soft-deleted recipe
- **THEN** the response is 404 `NOT_FOUND` and no `user_recipe_note` row is created

#### Scenario: Text is sanitized
- **WHEN** a caller saves `"<script>x</script>Bright​ acidity"`
- **THEN** the stored and returned note is `"xBright acidity"`

#### Scenario: Empty after sanitization is rejected
- **WHEN** a caller saves `"<b></b>"` or `"   "`
- **THEN** the response is 400 `VALIDATION_ERROR` and nothing is written

#### Scenario: Over-long text is rejected
- **WHEN** a caller saves 10001 characters
- **THEN** the response is 400 `VALIDATION_ERROR`

#### Scenario: Unverified accounts may keep private notes
- **WHEN** a signed-in user whose email is not verified saves a note on a public recipe
- **THEN** the response is 200

#### Scenario: Body cannot target another user
- **WHEN** user B sends `{ "notes": "x", "userId": "<A's id>" }`
- **THEN** only B's note is written and A's note is untouched

### Requirement: Callers delete only their own private note
`DELETE /api/v1/recipes/:id/notes` SHALL soft-delete the authenticated caller's private note on the recipe by setting `deleted_at` and clearing `notes` to an empty string, and SHALL NOT touch any other user's note.

The operation SHALL be idempotent: deleting when no live note exists SHALL return 200. The response
SHALL be 200 with `successEnvelope(RecipeUserNoteOutputSchema)` carrying `notes: null` and
`updatedAt: null`. Visibility rules SHALL be the same as for `GET`. Reads SHALL treat a row with
`deleted_at` set as absent (`isNull(userRecipeNotes.deletedAt)`). A later `PUT` SHALL revive the
same row.

#### Scenario: Delete clears only the caller's note
- **WHEN** users A and B both have notes on recipe R and B sends `DELETE /api/v1/recipes/R/notes`
- **THEN** B's row has `deleted_at` set and `notes = ''`
- **AND** A's note is unchanged and B's next `GET` returns `notes: null`

#### Scenario: Delete is idempotent
- **WHEN** a caller with no note on R sends `DELETE /api/v1/recipes/R/notes`
- **THEN** the response is 200

#### Scenario: Re-saving after delete revives the row
- **WHEN** B deletes their note on R and then saves "again"
- **THEN** the same row id holds "again" with `deleted_at` null

### Requirement: The legacy notes POST endpoint is removed
`POST /api/v1/recipes/:id/notes` SHALL NOT exist: the API SHALL register no handler for it, the OpenAPI document SHALL list no `post` operation for it, the web client SHALL have no method that calls it, and a request to it SHALL return HTTP 404 without reading the body or writing any row.

The endpoint was the IDOR (it wrote the author's `recipe_version.personal_notes` for any signed-in
caller). It is deleted outright, with no deprecated alias, no `Deprecation`/`Link` headers and no
technical-debt ledger entry. The following SHALL be deleted: the route handler and its
`describeRoute()` entry in `apps/api/src/modules/recipe/index.ts` (today `:846-873`), the service
function `saveNotes(recipeId, notes)` in `apps/api/src/modules/recipe/service.ts` (today
`:711-718`), the model function `updateVersionNotes` in `apps/api/src/modules/recipe/model.ts`
(today `:1029-1035`) and the web client method `recipeApi.saveNotes` in
`apps/web/src/api/index.ts` (today `:112-113`). The `recipe-note` router SHALL register only
`GET`, `PUT` and `DELETE` on `/:id/notes`. Hono answers a method that has no handler on a matched
path with its not-found response (status 404; it does not emit 405), so a `POST` falls through to
404 before any auth guard, validator or service runs. Because no handler matches, an anonymous
`POST` is also 404, not 401.

#### Scenario: POST changes nothing and returns 404 (IDOR regression)
- **WHEN** signed-in user B sends `POST /api/v1/recipes/R/notes` with `{ "notes": "x" }` on user A's public recipe R, through the composed `routes` app from `apps/api/src/routes/index.ts`
- **THEN** the response status is 404
- **AND** every `recipe_version.personal_notes` of R is byte-identical to its value before the request
- **AND** no `user_recipe_note` row exists for `(B, R)` and any existing private note of A or B on R is unchanged

#### Scenario: Anonymous POST is also 404
- **WHEN** an unauthenticated client sends `POST /api/v1/recipes/R/notes` with `{ "notes": "x" }`
- **THEN** the response status is 404 and nothing is written

#### Scenario: OpenAPI lists no POST operation
- **WHEN** `GET /api/v1/openapi.json` is fetched with `OPENAPI_ENABLED` on
- **THEN** `paths["/api/v1/recipes/{id}/notes"]` has `get`, `put` and `delete` operations and no `post` operation
- **AND** `apps/api/src/routes/openapi.coverage.test.ts` passes

#### Scenario: Removed symbols are gone
- **WHEN** `grep -rnwE "saveNotes|updateVersionNotes" apps/api/src apps/web/src` is run
- **THEN** it produces no matches

### Requirement: Author brewer notes are writable only through the recipe write flow
`recipe_version.personal_notes` (the author's public "brewer notes") of an existing recipe SHALL be changed only by its author through `POST /api/v1/recipes` (on create) or `PATCH /api/v1/recipes/:id`, and no other endpoint SHALL modify it.

Fork and merge create a NEW version (of the forker's new recipe, or a merge result owned by the
caller) and copy the source's public brewer notes into it; they never modify the source recipe's
versions. The private-notes endpoints (`GET`/`PUT`/`DELETE /api/v1/recipes/:id/notes`) never read
or write `recipe_version`. The field keeps its API name `personalNotes` for wire compatibility. It
is public: it remains shown on the recipe page, in SEO/JSON-LD descriptions and in search, as
before. A non-author `PATCH` SHALL return 403 `FORBIDDEN` without writing. The web UI SHALL offer no
editor for the brewer note outside the author-only edit page (`/recipes/:id/edit`); everywhere else
it is rendered read-only.

#### Scenario: Non-author PATCH is refused
- **WHEN** user B sends `PATCH /api/v1/recipes/R` with `{ "personalNotes": "x" }` on user A's recipe R
- **THEN** the response is 403 and R's versions are unchanged

#### Scenario: Author edits brewer notes through PATCH
- **WHEN** author A sends `PATCH /api/v1/recipes/R` with `{ "personalNotes": "<i>Sweet</i> finish" }`
- **THEN** the current version's `personalNotes` becomes `"Sweet finish"`

#### Scenario: Private-notes writes never touch brewer notes
- **WHEN** author A and user B each send `PUT /api/v1/recipes/R/notes` and then `DELETE /api/v1/recipes/R/notes`
- **THEN** every `recipe_version.personal_notes` of R is byte-identical to its value before the four requests

#### Scenario: Fork does not modify the source
- **WHEN** user B forks user A's public recipe R
- **THEN** the fork's first version carries R's brewer notes and every version of R is unchanged

### Requirement: Private notes never leak to other surfaces
Private note content SHALL be returned only by the caller-scoped `/api/v1/recipes/:id/notes` endpoints to the note's owner, and SHALL NOT appear in any other API response, query, cache entry, page, metadata or log line.

This covers: recipe detail (`GET /api/v1/recipes/:slugOrId`), lists, feed, starred, search
filtering and relevance ranking, versions list, version diff, compare, merge, fork, collections,
comments, notifications, the crawler/OG meta middleware, sitemap, JSON-LD and SEO tags, the
`CacheProvider`, and any future export. Log lines SHALL contain at most `userId`, `recipeId` and a
`noteLength`/`hasNote` indicator, never note text.

#### Scenario: Search does not match private notes
- **WHEN** user B saves a private note containing the token `zq7private` on public recipe R and anyone searches `GET /api/v1/recipes?search=zq7private`
- **THEN** the result set is empty

#### Scenario: Recipe detail does not carry private notes
- **WHEN** user B (who has a private note on R) and an anonymous client request `GET /api/v1/recipes/R`
- **THEN** neither response body contains B's note text

#### Scenario: Fork and merge do not copy private notes
- **WHEN** user B forks recipe R or merges two versions of R
- **THEN** no `user_recipe_note` row is created for the new recipe and the new recipe's `personalNotes` contains only the source's public brewer notes

#### Scenario: Logs carry no note text
- **WHEN** the notes service functions run at `debug` level
- **THEN** their log objects contain no `notes` property and no note text

### Requirement: Recipe detail page separates private notes from brewer notes
The recipe detail page SHALL show the private-notes editor only to signed-in viewers, SHALL load it from the viewer's own note, and SHALL NOT pre-fill it from the author's public brewer notes.

`RecipeNotesSection` SHALL take only `recipeId` (the `initialNotes` prop is deleted, and
`RecipeDetailPage` SHALL NOT pass `currentVersion.personalNotes` to it), SHALL read the caller's
note through the web-data-loading capability's component-read mechanism (a `useFetcher().load()`
against the `resources/recipes/:id/notes` loader that calls the notes `GET`), and SHALL save and
delete through that resource route's action (intents `save` and `delete`) that returns
`{ ok: true, note }` or `{ ok: false, error }`. Failures SHALL be shown through `useToast()` or an
inline error and SHALL NOT be swallowed (the current `catch { // silently fail }` is removed). The
editor SHALL show a Delete action when a note exists. The author's public text SHALL stay in
`TastingNotesSection`, now labelled as the brewer's note, read-only for every viewer including the
author. Printing SHALL print only the viewer's own note, and nothing when the viewer has none.
Anonymous viewers SHALL NOT see the editor. The author sees the same private editor as everyone
else (their private note is separate from their brewer note).

#### Scenario: Non-author sees an empty private editor
- **WHEN** user B, who has no note, opens user A's recipe whose brewer note is "Floral"
- **THEN** the "My private notes" editor is empty
- **AND** "Floral" is shown in the tasting-notes card under the brewer-note label

#### Scenario: Saving from the detail page never targets the brewer note
- **WHEN** user B types "Mine" into the private editor on user A's recipe and saves
- **THEN** exactly one request is sent, `PUT /api/v1/recipes/<id>/notes` with `{ "notes": "Mine" }`
- **AND** no `POST /api/v1/recipes/<id>/notes` and no `PATCH /api/v1/recipes/<id>` request is sent

#### Scenario: Save failure is visible
- **WHEN** saving a private note fails with an API error
- **THEN** an error message is shown and the typed text stays in the editor

#### Scenario: Delete clears the editor
- **WHEN** a viewer with a note clicks Delete and the action returns `{ ok: true }`
- **THEN** the editor is empty and the Delete action is hidden

#### Scenario: Anonymous viewers see no editor
- **WHEN** an anonymous visitor opens a public recipe
- **THEN** no private-notes editor is rendered and no notes request is sent

### Requirement: Notes labels are honest and localized
The UI SHALL label the author's public field as the brewer's notes with a "visible to everyone who can view this recipe" hint, and the per-user field as private notes with an "only you can see these" hint, in both English and Turkish.

New keys SHALL be added to both `packages/shared/src/i18n/en.json` and `tr.json`:
`recipe.brewerNotes`, `recipe.brewerNotes.hint`, `recipe.tastingNotes.brewerNote`,
`recipe.myNotes`, `recipe.myNotes.hint`, `recipe.myNotes.placeholder`, `recipe.notes.delete`,
`recipe.notes.deleted`, `recipe.notes.saveError`, `recipe.notes.loadError`. The create form, edit
form, version-diff field label and tasting-notes card SHALL use the brewer-note keys;
`RecipeNotesSection` SHALL use the `recipe.myNotes*` keys and keeps `recipe.notes.saved`. Keys left
unused (`recipe.personalNotes`, `recipe.tastingNotes.personalNote`, `recipe.notes.placeholder`)
SHALL be removed from both files. The en/tr key-parity test SHALL pass.

#### Scenario: Turkish locale shows translated labels
- **WHEN** the UI locale is `tr` and a signed-in user opens a recipe
- **THEN** the private-notes card and the brewer-note label render Turkish strings from `tr.json`

#### Scenario: Forms disclose that brewer notes are public
- **WHEN** an author opens the create or edit form
- **THEN** the brewer-notes field shows the `recipe.brewerNotes.hint` text

### Requirement: Existing brewer notes are preserved as-is
The migration that introduces private notes SHALL NOT modify, move or delete any existing `recipe_version.personal_notes` value and SHALL NOT create private notes from existing data.

Values that non-authors overwrote through the old endpoint cannot be told apart from the author's
own text (the overwrite was in place, with no actor or timestamp), so no automated correction is
attempted. Authors correct their brewer notes through the edit page.

#### Scenario: Existing values unchanged after migrating
- **WHEN** `make db-migrate` applies the private-notes migration on a database with existing recipes
- **THEN** every `recipe_version.personal_notes` value equals its pre-migration value
- **AND** `user_recipe_note` is empty

### Requirement: Private notes are removed with the account
When a user account is deleted, the system SHALL soft-delete and scrub every private note owned by that user in the same operation.

The user service SHALL call a `recipe-note` service function (for example
`deleteAllNotesForUser(userId)`) rather than touching the table directly, so the module layering
stays model to service to index.

#### Scenario: Account deletion scrubs notes
- **WHEN** user B with private notes on three recipes deletes their account
- **THEN** all three rows have `deleted_at` set and `notes = ''`

### Requirement: Notes endpoints are documented, logged and tested
Every notes route SHALL carry complete `describeRoute()` OpenAPI metadata, every notes service function SHALL emit structured entry and exit logs, and the behaviour above SHALL be covered by Vitest tests at the schema, model, service, route and component levels.

OpenAPI: tag `Recipes`, `summary`, `description`, `security: [{ bearerAuth: [] }]`, the `id` path
parameter, `requestBody: jsonRequestBody(RecipeNotesSchema)` on `PUT`, 200 responses as
`resolver(successEnvelope(RecipeUserNoteOutputSchema))`, and `401`/`404`/`400` as
`resolver(ErrorEnvelopeSchema)`. `zValidator` remains the request validator. The new
`RecipeUserNoteOutputSchema` SHALL live in `packages/shared/src/schemas/responses/`, be exported from
the responses barrel, have a co-located round-trip test, and be registered in the output-schema
acceptance property test. `openapi.coverage.test.ts` SHALL pass. Logging: `log.debug({ userId,
recipeId }, '<fn> started' | '<fn> completed')` and `log.error({ err, userId, recipeId }, '<fn>
failed')`, with no note text.

#### Scenario: OpenAPI coverage passes
- **WHEN** `make test-api` runs `apps/api/src/routes/openapi.coverage.test.ts`
- **THEN** `GET`, `PUT` and `DELETE /api/v1/recipes/{id}/notes` are documented and tagged, and no `post` operation exists on that path

#### Scenario: Cross-user regression tests exist
- **WHEN** `make test-specific filter=apps/api/src/modules/recipe-note/index.test.ts` and `make test-specific filter=apps/api/src/routes/recipe-notes-post-removed.test.ts` are run
- **THEN** they include passing tests for the IDOR regression (B cannot change A's brewer note or A's private note), 404 on non-viewable recipes, 401 anonymous, sanitization, idempotent delete and the removed `POST` returning 404 with no row changed

