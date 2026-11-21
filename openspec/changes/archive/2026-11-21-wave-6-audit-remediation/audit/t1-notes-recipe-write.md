# t1-notes-recipe-write: Personal notes and recipe write integrity

Track notes for `wave-6-audit-remediation`. Audit findings covered:
`api-architecture/recipe-notes-idor`, `security/recipe-notes-idor`,
`api-architecture/recipe-write-drops-fields`, `data-layer/recipe-writes-drop-fields`,
`web-architecture/recipe-edit-silently-drops-changes` (AUDIT-2026-11-18 §1 items 1 and 8, §3.1, §4).

Capabilities owned: `recipe-personal-notes` (new), `recipe-write` (modified).

User decisions (verbatim):

- Notes IDOR: "Notes are personal, and users can update 'their own notes'. Can users overwrite
  other people's notes? Validate. This should be fixed."
- Recipe write data loss: "Fix these all".

---

## 1. Validation: can user B overwrite user A's notes? Yes, confirmed.

Exact path, verified against the code on 2026-11-18:

1. `apps/web/src/pages/recipes/RecipeDetailPage.tsx:330-332` renders
   `<RecipeNotesSection recipeId={recipe.id} initialNotes={v?.personalNotes ?? ''} />` for **every**
   `isAuthenticated` viewer. `isOwner` is computed at `:130` but not used here. The editor is
   pre-filled with the **author's** `currentVersion.personalNotes`.
2. `apps/web/src/components/recipe/RecipeNotesSection.tsx:21-32`: Save calls
   `recipeApi.saveNotes(recipeId, notes)`. Errors are swallowed (`catch { // silently fail }`).
3. `apps/web/src/api/index.ts:112-113`: `POST /api/v1/recipes/:id/notes` with `{ notes }`.
4. `apps/api/src/modules/recipe/index.ts:846-873`: `authGuard`, then
   `zValidator('json', RecipeNotesSchema)`, then `service.saveNotes(recipeId, notes)`. The handler
   never reads `c.get('userId')`. There is no `isEmailVerified` check and no visibility check.
5. `apps/api/src/modules/recipe/service.ts:711-718`: `saveNotes(recipeId, notes)` checks only that the
   recipe and `currentVersionId` exist. There is no `authorId` comparison (compare `toggleFeature`
   at `:700-707`), no `canViewRecipe`, and no `sanitizeText` (compare `createRecipe` `:218`).
6. `apps/api/src/modules/recipe/model.ts:1029-1035`: `updateVersionNotes` runs
   `UPDATE recipe_version SET personal_notes = $notes WHERE id = $currentVersionId` in place. No new
   version is created, and no timestamp or actor is recorded (`recipe_version` has only `created_at`,
   `packages/db/src/schema.ts:209-249`).

So user B, signed in with any account (even unverified), can replace user A's text on any public
recipe, and on A's **private or draft** recipes too if B knows the UUID. The old text is gone for
good. The route test `apps/api/src/modules/recipe/index.test.ts:906-927` and the service test
`service.test.ts:848-864` only cover the author or a missing recipe, so nothing catches the bug.

Severity: high, as the verifier adjusted it. The blast radius is wider than "integrity of one
field", because the overwritten field is public (see §2): B's supposedly private text is
**published** as A's note.

## 2. Real product semantics: two concepts in one column

`recipe_version.personal_notes` is the **author's public brewer note**, not a per-viewer note:

| Where | Evidence | Audience |
|-------|----------|----------|
| Create/Edit form "Personal Notes" section | `RecipeCreatePage.tsx:516-522`, `RecipeEditPage.tsx:446-450` (placeholder "Tips, observations, things to try next time...") | author writes |
| Tasting notes card blockquote "— Personal Note" | `TastingNotesSection.tsx:157-163` | every viewer |
| SEO `<meta description>` | `RecipeDetailPage.tsx:139-145` | crawlers, share cards |
| JSON-LD `description` | `RecipeDetailPage.tsx:151-154` | crawlers |
| Focus mode | `RecipeFocusModePage.tsx:106,201` | every viewer |
| Search filter (`ilike`, any version) | `recipe/model.ts:128-147` | public search |
| Search ranking (weight 1) | `recipe/service.ts:444-465`, loaded by `model.ts:389,425` | public search |
| Version diff field | `recipe/service.ts:903-924`, `VersionDiffPage.tsx:37` | every viewer |
| Merge pick | `recipe/service.ts:880`, `RecipeMergeSchema` `recipe.ts:242` | merger |
| Fork copy | `recipe/model.ts:516` | forker |

Meanwhile `RecipeNotesSection` is presented as the **viewer's own** notes: aria/label
`recipe.personalNotes` ("Personal Notes"), placeholder `recipe.notes.placeholder` ("Add your personal
notes about this recipe...") at `packages/shared/src/i18n/en.json:104-106`, shown to every signed-in
viewer. The user confirmed the intent: **each user keeps private notes on a recipe that only they
can see and edit.** That feature was never built. The editor was wired to the author's public
column instead.

There is no recipe export endpoint today. `grep` finds no export route or utility in `apps/api` or
`apps/web`; the closest thing is the print stylesheet, which prints `RecipeNotesSection`'s
print-only paragraph. The spec's no-leak requirement therefore covers export pre-emptively.

## 3. Validation: recipe write data loss (all confirmed, plus extra paths)

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| W1 | Non-bump edits drop every version field | confirmed | `service.ts:352-358` writes only `title`/`visibility` and returns 200; `RecipeEditPage.tsx:34` defaults `bumpVersion=false` and sends every field (`:128-154`). `docs/recipes.md:26` documents the **intended** behaviour, "Updating with `bumpVersion: false` modifies the current version in place (only for minor corrections)", which was never implemented. |
| W2 | Bump drops taste notes (+intensities), equipment, additional preparations | confirmed | `service.ts:299-330` passes scalar columns only to `model.createVersion` (`model.ts:450-454`). `tasteNoteIds`/`equipmentIds` are used only for validation (`:276-282`). Only photos are carried (`:335-345`). |
| W3 | `tds` never stored | confirmed | Not in the `createRecipeWithRelations` insert (`model.ts:705-737`), not in the bump `createVersion` call, not in `forkRecipe` (`model.ts:490-520`). Only `seed.ts:536` writes it. The existing `openspec/specs/recipe-write/spec.md:60-63` **codified** the omission ("`tds`, `coffeeVarietyId`, and `coffeeVarietyName` SHALL remain absent"), so that requirement must be MODIFIED. |
| W4 | `coffeeVarietyId` never persisted | confirmed | Not in `RecipeCreateObjectSchema` (`recipe.ts:24-58`), so `zValidator` strips it. Only `seed.ts:536-540` sets `coffee_variety_id`/`coffee_variety_name`. No web form offers a variety picker. `coffee-variety/model.ts:~101-107` matches `recipes.currentVersionId`, so even a seeded recipe leaves `/coffee-varieties/:id` after a bump. (`recipe/model.ts:56-64` matches any version, as the verifier noted.) |
| W5 | Cleared fields cannot be saved | confirmed | Edit page sends `undefined` for cleared inputs (`RecipeEditPage.tsx:134-153`; only `tds` uses `null` at `:144`). The service merges with `data.x ?? latest.x` (`service.ts:302-329`). Removing every taste note sends `tasteNoteIds: undefined` (`:149`). |
| W6 | `RecipeUpdateSchema` lacks create's refinements | confirmed | `recipe.ts:121-123` is `.partial()` with none of the 5 refinements at `:65-115`. |
| **W7 (new)** | **PATCH without `visibility` silently unpublishes the recipe; a bump resets `isFavourite`** | **confirmed (new)** | `RecipeUpdateSchema = RecipeCreateObjectSchema.partial()`. In Zod 4, `.default()` survives `.optional()`/`.partial()` (Zod source `$ZodOptional` "optin ladder": "z.string().default('x').optional() still substitutes the default on absence"). Reproduced with zod 4.6.7: `RecipeUpdateSchema`-shaped `.parse({ title: 'x' })` → `{ title:'x', visibility:'draft', isFavourite:false, bumpVersion:false }`. `service.ts:349,357` then writes `data.visibility ?? recipe.visibility` = `'draft'`. Any API client that PATCHes only a title turns a public recipe into a draft. The web edit page always sends `visibility`, so the UI is unaffected. The project already fixed this exact trap for preferences: `UserPreferencesPatchSchema` (`packages/shared/src/schemas/user.ts:50-70`). |
| **W8 (new)** | **Bump is non-transactional and leaves orphan versions** | **confirmed (new)** | `model.createVersion` commits (`service.ts:299`) **before** the title check (`:332-333`) and before `currentVersionId` moves (`:347`). An empty sanitized title leaves a committed, non-current version that shows up in history. Photos are inserted in separate statements. Two concurrent bumps compute the same `versionNumber` (`:274`) and one fails on `recipe_version_recipe_id_version_number_unique` with a 500 today. |
| **W9 (new)** | **Service validation errors surface as 500** | **confirmed (new)** | `throw new Error('VALIDATION_ERROR: Title cannot be empty')` (`service.ts:172,333,354`) is not mapped by the PATCH handler (`index.ts:716-727`) or by `errorHandler.ts`. Unknown `tasteNoteIds`/`equipmentIds`/`vendorId`/`beanId` hit FK violations (23503), which also return 500 (the error-handling track fixes the generic 23503 mapping). |
| **W10 (new)** | **Accepted-but-ignored inputs** | **confirmed (new)** | `brewRatio`/`flowRate` are accepted (`recipe.ts:56-57`) but always recomputed (`service.ts:185-192,284-297`). `setupId` is accepted on PATCH but ignored. The bump ignores payload `brewDate` (`service.ts:311` forces `new Date()`). `RecipeNotesSchema` (`recipe.ts:212-214`, `min(1)`) makes notes impossible to clear. |
| **W11 (new)** | **PATCH skips the email-verified gate** | **confirmed (new)** | `POST /` (`index.ts:630`) and `/merge` (`:684`) require `isEmailVerified`. `PATCH /:id` (`:701-728`) and fork (`:759-788`) do not, so an unverified account can fork into a draft and then PATCH `visibility: 'public'`, publishing content without verification. |
| **W12 (new)** | **Create-from-bean drops the bean link** | **confirmed (new)** | `RecipeCreatePage.tsx:99-116` pre-fills name/brand/processing from `?beanId` but never sends `beanId` in the payload (`:159-186`). |
| W13 (adjacent, out of scope) | Merge drops intensities, tds, variety | noted | `mergeRecipes` builds `tasteNoteIds` only (`service.ts:882`), so intensities reset to 1. `RecipeMergeSchema.selections` has no `tds`/variety. This is left for a follow-up because it needs a merge-selection schema change; it is listed in Open questions. |
| W14 (adjacent, out of scope) | Same `.partial()` default trap elsewhere | noted | `SetupUpdateSchema = SetupCreateSchema.partial()` with `isDefault: z.boolean().default(false)` (`packages/shared/src/schemas/setup.ts:17,24`): a PATCH without `isDefault` clears the default flag. This is outside this track and is flagged for the orchestrator. |

## 4. Options considered

### 4.1 Notes

| Option | Summary | Verdict |
|--------|---------|---------|
| A. Author-only `POST /notes` (the audit's first recommendation) | Keep the single public column, add owner check, show editor to author only | Rejected. It fixes the IDOR but contradicts the user's stated intent (notes are personal per user) and leaves two editors for one field. |
| **B. New per-user private notes table + caller-scoped endpoints; author's version notes stay public, edited only through recipe edit** | `user_recipe_note (user_id, recipe_id)` unique, soft delete; `GET/PUT/DELETE /recipes/:id/notes` resolve the row from the session user only | **Chosen.** It matches the intent. The path has no user id, so nobody can address another user's notes. Public notes keep their SEO/search role. |
| C. Make version `personalNotes` author-private | Hide from public detail/SEO/search | Rejected. It removes useful public content, still does not give non-authors notes, and breaks search/SEO specs. |

### 4.2 Non-bump edit semantics

| Option | Verdict |
|--------|---------|
| **Amend the current version in place (all provided fields), one transaction** | **Chosen.** This is what `docs/recipes.md:26` documents and what the brief prefers. Earlier versions stay immutable. |
| Reject version fields with 400 unless `bumpVersion` | Rejected. It forces a checkbox before any edit, and the web form sends every field even when unchanged. |
| Auto-bump whenever a version field differs | Rejected. It needs fragile value diffing (float4, numeric strings, timezone dates, relation sets) and creates version spam for typo fixes. |

## 5. Research notes

- **Zod 4 defaults through `.partial()`**: Context7 `/colinhacks/zod` (`packages/zod/src/v4/core/schemas.ts`,
  optin ladder; test `optin-ladder.test.ts`): a `.default()` inside `.optional()` still substitutes on
  absence. Fix pattern: build the update object schema without defaults (precedent
  `UserPreferencesPatchSchema`).
- **Drizzle 0.45.4 upsert**: `insert(...).values(...).onConflictDoUpdate({ target: [t.userId, t.recipeId], set: {...} })`
  (Context7 `/drizzle-team/drizzle-orm-docs`, pg/insert). No raw SQL needed.
- **Drizzle row lock**: the pg select builder supports `.for('update')` (Context7
  `/drizzle-team/drizzle-orm/0.45.4`, changelog 0.20.3), so bumps can serialize on the recipe row
  without raw SQL.
- **Drizzle numeric**: `decimal('tds', { precision: 4, scale: 2 })` defaults to string mode, and
  `RecipeVersionRowSchema.tds` is `z.string().nullable()` (`packages/shared/src/schemas/responses/recipe.ts:84`).
  Keep string mode (switching to `mode: 'number'` would change the wire type). Write `String(value)`
  and let Postgres round to scale 2.
- **Drizzle transactions**: everything inside `db.transaction(async (tx) => ...)` commits or rolls back
  together; a thrown error rolls back.

## 6. Existing data decision (notes)

`recipe_version.personal_notes` values written by non-authors **cannot be told apart** from the
author's own text. The overwrite was in place, `recipe_version` has no `updated_at` or actor
column, and API logs record neither user id nor path for this route (no access logging in
`apps/api/src/middleware`; `saveNotes` logs only `{ recipeId }`). Decision: leave existing values
untouched (no wipe, no move, no backfill into the new table). Authors can review and correct their
brewer notes through the edit page. The change announcement tells users that the old "Personal
Notes" box on other people's recipes edited the author's public note and that private notes now
start empty. This is spelled out in the design fragment's Migration section.

## 7. Cross-track coordination

- **web-data-loading (t5)**: owns the paradigm. The private-notes read becomes a
  `useFetcher().load('/resources/recipes/:id/notes')` resource loader; save/delete become a resource
  action returning `{ ok }`; the edit/create pages become loader + action (t5 inventory rows
  `RecipeEditPage.tsx:68`, `RecipeCreatePage.tsx:74/~94`). This track defines **what** the payloads
  and UI semantics are; t5 defines the plumbing.
- **error-handling**: generic `DrizzleQueryError` unwrapping with 23505→409 and 23503→400. This track
  pre-validates referenced ids so callers get field-level 400s, and relies on that work as the backstop.
- **recipe-slug**: also edits `createRecipe`/`forkRecipe` slug generation in `recipe/service.ts`.
  Expect a merge conflict; land one first and rebase.
- **search/advanced-search**: owns how author `personalNotes` are searched and ranked. This track
  only requires that private notes are never searched.
- **updatedAt maintenance** (if a track adds `$onUpdate`): this track sets `recipes.updatedAt` on every
  successful PATCH either way.
- **Migrations**: several tracks add migrations. Generate them one at a time at apply time; if
  numbering collides, delete the local migration and its snapshot/journal entry and regenerate.
  Never hand-edit the SQL.
