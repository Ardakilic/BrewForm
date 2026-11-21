### t1: Private notes, failing regression tests first

- [ ] Add a failing route test to `apps/api/src/modules/recipe/index.test.ts`: user B `POST /api/v1/recipes/:id/notes` on user A's public recipe must leave every `recipe_version.personal_notes` of A's recipe unchanged (it currently overwrites them).
- [ ] Add a failing route test: user B `POST /:id/notes` on A's `private` recipe must be 404 and write nothing.
- [ ] Rewrite the obsolete `describe('saveNotes')` block in `apps/api/src/modules/recipe/service.test.ts:848-864` and the `POST /:id/notes` block in `index.test.ts:906-927`. Delete them here; they are replaced by the `recipe-note` module tests below.

### t1: Private notes, shared schemas

- [ ] Update `RecipeNotesSchema`'s docblock in `packages/shared/src/schemas/recipe.ts` (now for `PUT /api/v1/recipes/:id/notes`, caller-scoped private notes). Keep `{ notes: string().trim().min(1).max(10000) }`.
- [ ] Add `RecipeUserNoteOutputSchema` (`{ recipeId: string, notes: string | null, updatedAt: string | null }`) and its inferred type in `packages/shared/src/schemas/responses/recipe-note.ts`. Export it from `packages/shared/src/schemas/responses/index.ts`, add a round-trip test in `responses/recipe-note.test.ts`, and register it in the `cases` array of `responses/output-schema-acceptance.pbt.test.ts`.

### t1: Private notes, database

- [ ] Add `userRecipeNotes` (`user_recipe_note`) to `packages/db/src/schema.ts` with columns `id`, `userId`, `recipeId`, `notes` (text not null), `createdAt`, `updatedAt` and `deletedAt`; unique `user_recipe_note_user_id_recipe_id_unique`; index `user_recipe_note_recipe_id_idx`; check `user_recipe_note_notes_length_check` (`char_length(notes) <= 10000`); and a docblock. Add `userRecipeNotesRelations`, and add `many(userRecipeNotes)` to `usersRelations` and `recipesRelations`.
- [ ] Run `make db-generate`, then `make db-migrate`. Rerun `make db-generate` and assert "No schema changes, nothing to migrate". Commit the generated SQL, snapshot and journal unedited. On a numbering collision with another track, delete the local files and regenerate.
- [ ] Run `make test-db-provision` to apply the migration to `brewform_test`.
- [ ] Extend `packages/db/src/schema-columns.test.ts`, `schema-constraints.test.ts` and `schema-indexes.test.ts` to assert the new table's columns, its unique and check constraints, and the `recipe_id` index. Add an assertion (or a note in the migration test) that the migration does not touch `recipe_version.personal_notes`.

### t1: Private notes, API module

- [ ] Create `apps/api/src/modules/recipe-note/model.ts`:
  - `findRecipeForNotes(recipeId)`: `id`, `authorId`, `visibility`, `isNull(deletedAt)`.
  - `findNote(userId, recipeId)`: `isNull(userRecipeNotes.deletedAt)`.
  - `upsertNote(userId, recipeId, notes)`: `onConflictDoUpdate` on `[userId, recipeId]` setting `notes`, `updatedAt` and `deletedAt: null`.
  - `softDeleteNote(userId, recipeId)`: sets `deletedAt` and `notes: ''`.
  - `softDeleteAllNotesForUser(userId)`.
  - Add JSDoc throughout.
- [ ] Add `apps/api/src/modules/recipe-note/model.test.ts`: upsert creates, then replaces the same row; soft delete scrubs; revive reuses the row id; `findNote` ignores deleted rows; per-user isolation.
- [ ] Create `apps/api/src/modules/recipe-note/service.ts`:
  - `getMyNote`, `saveMyNote` and `deleteMyNote(userId, recipeId, isAdmin)`. Each throws `RECIPE_NOT_FOUND` unless the recipe exists, is not deleted and passes `canViewRecipe` imported from `../recipe/service.ts`.
  - `saveMyNote` applies `sanitizeText` and throws `VALIDATION_ERROR: notes` when the result is empty.
  - `deleteAllNotesForUser(userId)`.
  - Entry/exit `log.debug({ userId, recipeId })` and `log.error({ err, userId, recipeId })` with no note text.
  - No `drizzle-orm` imports.
- [ ] Add `apps/api/src/modules/recipe-note/service.test.ts`: cross-user isolation; 404 rules for private, draft, deleted and unknown recipes; sanitization; empty-after-sanitize rejection; admin cannot read another user's note; a log spy proves no note text is logged.
- [ ] Create `apps/api/src/modules/recipe-note/index.ts` (Hono `<AppEnv>` router) with `GET`, `PUT` and `DELETE /:id/notes` and the deprecated `POST /:id/notes` alias:
  - `authGuard` via a `deps` proxy, as in `recipe/index.ts`.
  - `zValidator('param', z.object({ id: z.uuid() }))`, and `zValidator('json', RecipeNotesSchema, zodValidationHook)` on PUT and POST.
  - `Cache-Control: private, no-store` on every response.
  - `Deprecation: true` and a `Link` successor header on POST.
  - Map `RECIPE_NOT_FOUND`→404 and `VALIDATION_ERROR`→400.
- [ ] Add full `describeRoute()` metadata to each notes route: tag `Recipes`, summary, description, `security`, the `id` parameter, `jsonRequestBody(RecipeNotesSchema)` on PUT and POST, 200 as `resolver(successEnvelope(RecipeUserNoteOutputSchema))`, and 400/401/404 as `resolver(ErrorEnvelopeSchema)`. Set `deprecated: true` on POST.
- [ ] Mount the router in `apps/api/src/routes/index.ts` with `routes.route('/api/v1/recipes', recipeNote)`. Remove the old `POST /:id/notes` route and the `RecipeNotesSchema` import from `apps/api/src/modules/recipe/index.ts`. Delete `saveNotes` from `recipe/service.ts` and `updateVersionNotes` from `recipe/model.ts`.
- [ ] Add `apps/api/src/modules/recipe-note/index.test.ts`:
  - The IDOR regression: B cannot change A's brewer note or A's private note via PUT or POST.
  - Status codes: 401 anonymous, 404 on non-viewable recipes, 400 on a malformed id, empty or over-long text.
  - Idempotent DELETE, the `Cache-Control` header, and the `Deprecation` header on POST.
  - An unverified email can still save.
  - Search with `?search=<token from B's private note>` returns nothing, and `GET /api/v1/recipes/:slug` does not contain the note text.
- [ ] Call `recipeNoteService.deleteAllNotesForUser(userId)` from `deleteAccount` in `apps/api/src/modules/user/service.ts`, or from the account-deletion track's transactional `deleteAccount` if it has landed. Add a test in `user/service.test.ts` that the notes end up soft-deleted and scrubbed.
- [ ] Run `make test-api`, including `openapi.coverage.test.ts`, and confirm the notes routes are documented and tagged.

### t1: Private notes, web

- [ ] Add i18n keys to both `packages/shared/src/i18n/en.json` and `tr.json`: `recipe.brewerNotes`, `recipe.brewerNotes.hint`, `recipe.tastingNotes.brewerNote`, `recipe.myNotes`, `recipe.myNotes.hint`, `recipe.notes.delete`, `recipe.notes.deleted`, `recipe.notes.saveError` and `recipe.notes.loadError`. Remove `recipe.personalNotes` and `recipe.tastingNotes.personalNote` once nothing references them. Run `make test-shared` (key-parity test).
- [ ] Add `recipeApi.getMyNote(id, { signal })`, `saveMyNote(id, notes)` (PUT) and `deleteMyNote(id)` to `apps/web/src/api/index.ts`, typed with `RecipeUserNoteOutput`. Remove `saveNotes` and update `apps/web/src/api/index.test.ts`.
- [ ] Add the resource route `resources/recipes/:id/notes` in `apps/web/src/routes/` (registered in `apps/web/src/router.tsx`), following the web-data-loading capability. The loader calls `getMyNote` with `request.signal`. The action handles intents `save` and `delete` and returns `{ ok: true, note }` or `{ ok: false, error }`. It logs entry, exit and failure with no note text.
- [ ] Rewrite `apps/web/src/components/recipe/RecipeNotesSection.tsx`:
  - Takes a single `recipeId` prop.
  - Loads with `useFetcher().load('/resources/recipes/:id/notes')`; saves and deletes with `fetcher.submit`.
  - Shows a Delete button when a note exists, plus the `recipe.myNotes` label and hint.
  - Shows an error toast or inline error on `{ ok: false }` and keeps the typed text.
  - No silent `catch`.
  - Its print-only paragraph prints the viewer's own note.
- [ ] Update `apps/web/src/pages/recipes/RecipeDetailPage.tsx`: render `<RecipeNotesSection recipeId={recipe.id} />` only when `isAuthenticated`, with no `initialNotes`.
- [ ] Relabel the author's notes:
  - `TastingNotesSection.tsx` uses `recipe.tastingNotes.brewerNote`.
  - The create and edit pages use `recipe.brewerNotes` plus the hint.
  - `VersionDiffPage.tsx:37` uses `recipe.brewerNotes`.
- [ ] Rewrite `apps/web/src/components/recipe/RecipeNotesSection.test.tsx` and update `RecipeDetailPage.test.tsx`:
  - The editor is empty for a non-author, never pre-filled from `currentVersion.personalNotes`.
  - It is hidden for anonymous viewers, and no notes request is sent.
  - A save failure shows an error.
  - Delete clears the editor.
  - Labels come from the new keys.

### t1: Recipe write, shared schemas

- [ ] Add failing tests to `packages/shared/src/schemas/recipe.test.ts`:
  - `RecipeUpdateSchema.parse({ title: 'x' })` must not contain `visibility` or `isFavourite`.
  - `null` is accepted for the clearable fields and rejected for `title`, `brewMethod`, `drinkType`, `preparationNotes`, `visibility`, `isFavourite` and `brewDate`.
  - `tasteNoteIntensities` without `tasteNoteIds` is rejected.
  - The cross-field refinements apply to updates.
- [ ] Extract the five cross-field rules into an exported pure `recipeCrossFieldIssues(data)` in `packages/shared/src/schemas/recipe.ts`. Use it from `RecipeCreateSchema` via `.superRefine`, keeping the same messages and paths, and unit-test it directly.
- [ ] Build `RecipeUpdateObjectSchema` field by field: `.nullish()` for clearable fields, `.optional()` for required fields, no `.default()`. Then set `RecipeUpdateSchema = RecipeUpdateObjectSchema.extend({ bumpVersion: z.boolean().default(false) }).superRefine(recipeCrossFieldIssues + intensities-require-ids)`. Update the docblocks to describe absent/null/[] semantics.
- [ ] Add `coffeeVarietyId: z.uuid().optional()` to `RecipeCreateObjectSchema` (nullish on update). Remove `brewRatio` and `flowRate` from the input schemas. Update the affected shared tests and `RecipeUpdate`/`RecipeCreate` consumers.

### t1: Recipe write, model

- [ ] Add a version-column mapping helper to `apps/api/src/modules/recipe/model.ts` (`versionColumnsFrom(resolved)` and `copyVersionColumns(source)`) covering every `recipeVersions` column except `id`, `recipeId`, `versionNumber` and `createdAt`. Add the drift-guard test to `model.test.ts` using `getTableColumns(recipeVersions)`.
- [ ] Extend `CreateRecipeWithRelationsInput` with `tds: string | null`, `coffeeVarietyId: string | null` and `coffeeVarietyName: string | null`. Insert them through the mapping in `createRecipeWithRelations`, and update its docblock.
- [ ] Extend `forkRecipe` to copy `tds`, `coffeeVarietyId` and `coffeeVarietyName` through the copy mapping, while keeping the reset of `rating` and `isFavourite`.
- [ ] Add the reference lookups to `model.ts`: `findExistingTasteNoteIds`, `findExistingEquipmentIds` (non-deleted), `findVendor`, `findOwnedBean(beanId, userId)` and `findCoffeeVariety(id)` (non-deleted, returns `{ id, name }`).
- [ ] Add `updateRecipeWithVersion(input: UpdateRecipeWithVersionInput)` to `model.ts`, with `mode: 'amend' | 'bump'`, resolved version columns, optional relation arrays and recipe-level fields. It runs one `db.transaction`:
  1. Lock the recipe row with `.for('update')`.
  2. Read the current version and its relations.
  3. **amend**: update the current version and replace each provided relation.
  4. **bump**: compute `max(versionNumber) + 1`, insert the version, and copy or replace taste notes (with intensities), equipment, preparations (`sortOrder`) and photos.
  5. Update `recipes` (title, visibility, `currentVersionId` on bump, `updatedAt`).
  6. Return `findById` after commit.
  Include entry/exit/error logs with `{ recipeId, mode, versionNumber }` and a JSDoc. Remove `createVersion`, `insertVersionPhotos` and `getVersionPhotos` if they become unused.
- [ ] Extend `model.create.test.ts` (tds and variety round-trip) and add `model.update.test.ts`:
  - Amend replaces provided relations and keeps the rest.
  - Bump copies every relation with intensities and sortOrder.
  - Bump replaces relations when provided.
  - The earlier version is untouched.
  - A thrown error mid-transaction leaves no rows.
  - Two concurrent bumps get consecutive numbers.
  - Add fork copies `tds`/variety to `model.test.ts`.

### t1: Recipe write, service

- [ ] Add failing service regression tests in `apps/api/src/modules/recipe/service.update.test.ts`:
  - A non-bump `grindSize` edit persists.
  - A bump keeps taste notes with intensities, equipment, preparations, photos, `tds` and variety.
  - A title-only update keeps a public recipe public.
  - A bump keeps `isFavourite`.
  - `null` and `[]` clear.
  - An empty sanitized title on a bump leaves no orphan version.
  - A merged cross-field violation is rejected.
  - An unknown `coffeeVarietyId`, `tasteNoteId` or a foreign `beanId` is rejected before any write.
  - `setupId` on update fills grinder and brewerDetails only when they are absent.
- [ ] Refactor `updateRecipe` in `apps/api/src/modules/recipe/service.ts`:
  1. Load the recipe and check the author.
  2. Build merged values (absent keeps, null clears) and recompute `brewRatio`/`flowRate`.
  3. Run `recipeCrossFieldIssues` on the merged values, check references, check equipment compatibility on the merged brew method and equipment set, sanitize the title and brewer notes (empty becomes `NULL`), normalize `tds` with `String(n)`, and resolve `coffeeVarietyName`.
  4. Only then call `model.updateRecipeWithVersion({ mode: bumpVersion ? 'bump' : 'amend', ... })`.
  Throw `VALIDATION_ERROR` errors carrying `details`. Bump `brewDate` is the payload value or now. Update the docblock and keep the entry/exit logs.
- [ ] Update `createRecipe`: run reference validation and variety-name resolution before the helper, pass `tds` (as a string), `coffeeVarietyId` and `coffeeVarietyName`, store empty brewer notes as `NULL`, and update the docblock.
- [ ] Extend `service.create.test.ts` (tds and variety persisted; an invalid reference writes nothing) and update the old `describe('updateRecipe')` expectations in `service.test.ts:938-975` to the amend semantics.

### t1: Recipe write, route

- [ ] Update `PATCH /:id` in `apps/api/src/modules/recipe/index.ts`:
  - Add the `isEmailVerified` gate, returning 403 `EMAIL_NOT_VERIFIED`.
  - Map `VALIDATION_ERROR*` to 400 with details (via `validationError`/`error`), `FORBIDDEN` to 403 and `RECIPE_NOT_FOUND` to 404. Leave 422 and 409 to `errorHandler`.
  - Add full `describeRoute` metadata: description of amend versus bump and absent/null/[], `jsonRequestBody(RecipeUpdateSchema)`, 200 as `resolver(successEnvelope(RecipeDetailOutputSchema))`, and 400/401/403/404/409/422 as `resolver(ErrorEnvelopeSchema)`.
- [ ] Map the `VALIDATION_ERROR*` service errors to 400 in the `POST /` handler, which covers the empty title and invalid references.
- [ ] Extend `apps/api/src/modules/recipe/index.test.ts`:
  - A PATCH from an unverified author returns 403.
  - An empty title returns 400 (not 500).
  - A title-only PATCH keeps visibility.
  - A bump round-trip through `GET /:slug` keeps taste notes, equipment, `tds` and variety.
  - `POST /` with an unknown `tasteNoteId` returns 400.
  - `POST /` with `tds` and `coffeeVarietyId` returns them in the response.
  - The recipe is listed under `?coffeeVarietyId=` and `/coffee-varieties/:id/recipes` after a bump.
- [ ] Update the `recipeVersions` docblock in `packages/db/src/schema.ts:208` ("current version may be amended by its author; earlier versions are immutable"). This is comment-only; confirm `make db-generate` still reports no changes.

### t1: Recipe write, web

- [ ] Add i18n keys to both `en.json` and `tr.json`. Change the value of `recipe.editPage.bumpVersion` to "Save as a new version", and add `recipe.editPage.bumpHint.off` ("Updates the current version (v{current}) in place"), `recipe.editPage.bumpHint.on` ("Creates version v{next}; v{current} stays unchanged"), `recipe.form.coffeeVariety` and `recipe.form.coffeeVariety.placeholder`.
- [ ] Extract the equipment picker from `apps/web/src/pages/recipes/RecipeCreatePage.tsx:300-320` into `apps/web/src/components/recipe/EquipmentPicker.tsx`. If the equipment-pagination track ships a typeahead picker, reuse that instead. Add a `CoffeeVarietyPicker.tsx` typeahead over `coffeeVarietyApi.search` (via a fetcher resource route per web-data-loading). Write component tests for both.
- [ ] Update `apps/web/src/pages/recipes/RecipeEditPage.tsx` (on top of the web-data-loading loader/action migration):
  - Pre-populate equipment and coffee variety and render both pickers.
  - Show the checkbox with the new label and the state-dependent hint, including version numbers.
  - The payload builder sends `null` for cleared scalar, date, rating and emoji inputs, `[]` for cleared taste notes and equipment, and omits fields the page does not render.
  - Show validation errors inline and navigate only on success.
- [ ] Update `apps/web/src/pages/recipes/RecipeCreatePage.tsx`: send `beanId` when opened with `?beanId=`, add the coffee-variety picker, and send `coffeeVarietyId`.
- [ ] Show the coffee variety on `apps/web/src/pages/recipes/RecipeDetailPage.tsx`: when `currentVersion.coffeeVarietyName` is set, render it as a link to `/coffee-varieties/:coffeeVarietyId`.
- [ ] Extend `RecipeEditPage.test.tsx`:
  - Clearing the grinder sends `grinder: null`.
  - Removing all taste notes sends `tasteNoteIds: []`.
  - The hint text follows the checkbox and the version numbers.
  - A variety change is sent.
  - Pre-populated equipment is sent unchanged.
  Add create-page tests for `?beanId` → `beanId` in the payload and for the variety selection. Add a detail-page test for the variety link.

### t1: Docs

- [ ] Update `docs/api.md`:
  - Document `GET`, `PUT` and `DELETE /recipes/:id/notes` (caller-scoped private notes, `Cache-Control`, statuses).
  - Mark `POST /recipes/:id/notes` as deprecated.
  - Document the PATCH body semantics (amend versus bump, absent/null/[]), the `tds` and `coffeeVarietyId` fields, and the 403 `EMAIL_NOT_VERIFIED`.
- [ ] Update `docs/recipes.md`:
  - Versioning: the current version is amendable and earlier versions are immutable.
  - Bump carry-forward rules.
  - Private notes versus brewer notes.
  - Fork copies `tds` and variety.
- [ ] Update `plans/TECHNICAL_DEBT.md` (and `plans/ROADMAP.md` if it lists open items) with three entries: remove the deprecated `POST /recipes/:id/notes` alias next release; merge field parity (intensities, `tds`, variety); and the `SetupUpdateSchema` `.partial()` default trap (`setup.ts:17,24`) if no other track owns it.
- [ ] Draft the change-announcement and release-note text (in the PR description): the old "Personal Notes" box on others' recipes edited the author's public note; private notes now start empty; authors should review their brewer notes.

### t1: Verification

- [ ] Run `make fmt`, then `make check`, `make check-tests` and `make lint`, all clean.
- [ ] Run `make test-db-provision` once, then `make test-api`, `make test-shared` and `make test-web`, all green, including `openapi.coverage.test.ts`, the en/tr key-parity test and every regression test listed in the `recipe-write` and `recipe-personal-notes` specs.
- [ ] Run `make db-generate` and confirm it prints "No schema changes, nothing to migrate".
- [ ] Run `openspec validate wave-6-audit-remediation --strict` and confirm it passes.
- [ ] Manual smoke test with `make dev`:
  - As user B on user A's recipe: save, reload and delete a private note, and confirm A's brewer note is unchanged.
  - As A: edit `grindSize` without the checkbox and confirm it persists with no new version.
  - As A: tick the checkbox and confirm a new version keeps taste notes and equipment.
  - Clear the grinder and confirm it is gone.
  - Set a coffee variety and confirm the recipe appears on `/coffee-varieties/:id`.
