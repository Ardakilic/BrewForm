# r1-api-recipe-comments — recipe writes, comments, cursors, filters, QR, sitemap, dead code

Research notes for review findings #1, #5, #14, #15, #16, #17, #20, #33 and part of #34
(`audit/review.md`). Every claim was re-checked against the working tree on 2026-11-21
(branch `wave-6-audit-remediation` @ `e18f2bd`). Line numbers are as of that commit.

| # | Verdict | Capability touched | Effort |
|---|---|---|---|
| 1 | **bigger**: also merge (taste notes, equipment), vendor; plus a web UX gap (cross-track) | `recipe-write` (2 MODIFIED), `recipe-comparison` (MODIFIED) | M |
| 5 | **confirmed** (+ read path still shows stored cross-recipe replies) | `comment-authz` (ADDED) | S |
| 14 | **confirmed**; no other stored counter has the bug | `comment-authz` (ADDED) | S |
| 15 | **confirmed**; `tasteNoteIds`/`equipmentIds` also unbounded (no 500, but cap them) | `recipe-write` (ADDED) | S |
| 16 | **bigger**: also `GET /api/v1/follow/feed` (same `findCursor`) | `cursor-pagination` (ADDED) | M |
| 17 | **confirmed** (+ `docs/api.md` promises timestamps; user decision) | `advanced-search` (MODIFIED) | M |
| 20 | **confirmed** | `recipe-visibility` (ADDED) | S |
| 33 | **confirmed** (user query also unordered) | `recipe-visibility` (ADDED) | S |
| 34 (part) | **confirmed**: zero production callers; `getItems` is a reader in 7 tests | `recipe-collections`, `recipe-visibility` (MODIFIED) | S |

Comment-test rework shared by #5 and #14 (replacing the inline service copies in
`comment/service.test.ts`) is M on its own; it is listed under #14.

---

## Finding 1: recipe edits fail after a linked record is soft-deleted

### 1. Verification

- `updateRecipe` (`apps/api/src/modules/recipe/service.ts:494-614`) validates the payload's ids
  as if every one were new (`:540-546`):

  ```ts
  const references = await validateReferences(authorId, {
    tasteNoteIds: data.tasteNoteIds,
    equipmentIds: data.equipmentIds,
    vendorId: data.vendorId,
    coffeeVarietyId: data.coffeeVarietyId,
    newBeanId: data.beanId !== undefined && data.beanId !== current.beanId ? data.beanId : null,
  });
  ```

  Only the bean is compared with the current version. `validateReferences` (`:130-172`) looks the
  ids up with `isNull(deletedAt)` (`recipe/model.ts:1427-1499`: `findExistingTasteNoteIds`,
  `findExistingEquipmentIds`, `findVendor`, `findCoffeeVariety`), so any soft-deleted row that is
  already linked yields a 400 `VALIDATION_ERROR`.
- The web edit form always sends the current ids back:
  `apps/web/src/pages/recipes/recipe-edit-payload.ts:94-96` sends `tasteNoteIds`, `equipmentIds`
  and `coffeeVarietyId` on every save; they are seeded from the detail payload
  (`RecipeEditPage.tsx:156-172`), which comes from `findById` (`recipe/model.ts:447-475`), whose
  relation loads (`tasteNotes: { with: { tasteNote: true } }`, `equipment: …`) do not filter
  deleted catalog rows. `vendorId` is not sent by the web form (`recipe-edit-payload.ts:64`), but an
  API client that echoes it hits the same check.
- Who soft-deletes these rows: users delete their own custom coffee varieties
  (`coffee-variety/model.ts:77`) and equipment (`equipment/model.ts:76`), admins delete taste notes
  (`taste/model.ts:103`, admin-gated route), vendors (`vendor/model.ts:67`), equipment
  (`admin/model.ts:373`, `approveEquipmentDeleteRequest` `:783-799`) and varieties
  (`admin/model.ts:734`). So user A deleting a custom variety blocks user B's edits.
- **Merge** fails the same way: `mergeRecipes` (`service.ts:1187-1240`) builds `tasteNoteIds` and
  `equipmentIds` from the source versions with `getMergedIds` and calls `createRecipe`, which runs
  `validateReferences` on all of them (`:376-382`). `fetchRecipeVersionWithRelations`
  (`model.ts:1966-1976`) loads `tasteNotes.tasteNote` / `equipment.equipment` unfiltered, so a
  deleted note or item in either source version makes every merge that selects it fail with 400.
  Merge does not carry `vendorId`, `coffeeVarietyId` or `beanId` at all (D99.20), so only taste
  notes and equipment matter there.
- **Fork** is not affected: `model.forkRecipe` (`model.ts:1026-1150`) copies the version columns
  (`copyVersionColumns`, vendor/variety/bean included) and the relation rows raw, with no
  validation. The spec already says a carried-forward bean is not re-checked.
- On `main`, `updateRecipe` had no reference validation at all, so these saves worked; the
  regression is from wave 6 (task group 8).
- Tests: `service.update.test.ts:278-297` covers unknown ids and a newly set soft-deleted variety;
  nothing covers an *already linked* deleted row. `merge.test.ts` has no deleted-reference case.
  Fixtures support deleted reference rows (`recipe/test-helpers.ts:244-311`, `deleted: true`).

**Verdict: bigger** than reported (merge and vendor too).

### 2. Root cause

The update path treats "the payload contains id X" as "the write newly sets X". The edit form
re-sends every relation, so carried-forward references are re-validated against `deletedAt`.

### 3. Fix design

**Update: validate only references that differ from the current version** (the rule the bean
already follows). In `updateRecipe`, replace the `validateReferences` call and the
`coffeeVarietyName` computation (`service.ts:540-556`):

```ts
const linkedTasteNotes = new Set(current.tasteNotes.map((t) => t.tasteNoteId));
const linkedEquipment = new Set(current.equipment.map((e) => e.equipmentId));
const varietyChanged = isNewReference(data.coffeeVarietyId, current.coffeeVarietyId);
const references = await validateReferences(authorId, {
  tasteNoteIds: data.tasteNoteIds?.filter((id) => !linkedTasteNotes.has(id)),
  equipmentIds: data.equipmentIds?.filter((id) => !linkedEquipment.has(id)),
  vendorId: isNewReference(data.vendorId, current.vendorId) ? data.vendorId : null,
  coffeeVarietyId: varietyChanged ? data.coffeeVarietyId : null,
  newBeanId: isNewReference(data.beanId, current.beanId) ? data.beanId : null,
});
…
const coffeeVarietyName = varietyChanged ? references.coffeeVarietyName : current.coffeeVarietyName;
```

with a small private helper (not exported, but give it a docblock like the file's other helpers):

```ts
/** True when an update value sets a reference other than the stored one (`undefined` keeps it). */
function isNewReference(value: string | null | undefined, stored: string | null): value is string {
  return value !== undefined && value !== null && value !== stored;
}
```

- `null` clears and needs no check (unchanged behaviour: `validateReferences` skips falsy ids).
- `current.tasteNotes` rows carry `tasteNoteId` and `current.equipment` rows `equipmentId` (relation
  rows of `findById`; `equipmentId` is already used at `service.ts:549`).
- A newly added deleted id is still rejected, and the detail names only the new ids.
- Bump copies the kept links into the new version; that is the same as the existing carry-forward
  when the key is absent (`readVersionRelations`, `model.ts:943-980`, never validated).
- Equipment compatibility (`:547-552`) is unchanged; `getEquipmentByIds` (`model.ts:1929`) does not
  filter `deletedAt`, so kept deleted equipment is still checked against the brew method.
- Update the `updateRecipe` docblock step 3 ("the referenced records (a bean only when newly set)")
  to "the references the payload newly sets (ids not on the current version)".

**Coffee variety name, decided:** an unchanged `coffeeVarietyId` keeps the stored
`coffeeVarietyName` with no lookup (same as an absent key). Today re-sending the same id refreshes
the name from the live row; after the fix a renamed variety's new name reaches a recipe only when
its author re-picks the variety. Variety renames never propagated to recipes anyway (no code
updates `recipe_version.coffee_variety_name` outside the recipe module), so this only removes an
accidental refresh. Rejected alternative: look the variety up including deleted rows to refresh the
name (a new model function for a cosmetic effect).

**Merge: drop soft-deleted taste notes and equipment** before `createRecipe`, using the relation
rows already loaded (no extra query):

```ts
const liveTasteNotes = (v: typeof v1) => v.tasteNotes.filter((t) => t.tasteNote.deletedAt === null);
const liveEquipment = (v: typeof v1) => v.equipment.filter((e) => e.equipment.deletedAt === null);
…
tasteNoteIds: getMergedIds(liveTasteNotes(v1), liveTasteNotes(v2), sel.tasteNotes, 'tasteNoteId'),
equipmentIds: getMergedIds(liveEquipment(v1), liveEquipment(v2), sel.equipment, 'equipmentId'),
```

plus `logger.debug({ authorId, droppedTasteNotes, droppedEquipment }, 'mergeRecipes dropped deleted references')`
when either count is non-zero (counts only). Why drop rather than carry: a merge creates a NEW
recipe, and the create rule ("no new links to deleted rows") should hold; the caller cannot fix
someone else's source version, and there is no per-item selection to deselect it, so failing (today)
is a dead end. Rejected: a "skip validation" flag on `createRecipe` (widens the create path for one
caller). The relation typing is non-null (`diffVersions` already reads `tn.tasteNote.name`,
`service.ts:1307`).

**Web:** no change needed for the save to work. See Cross-track note 1 for a pre-existing gap
(deleted taste notes are invisible in the edit picker).

### 4. Tests

Failing first, DB-backed (`brewform_test`):

- `apps/api/src/modules/recipe/service.update.test.ts`, new `it.each([false, true])`
  "keeps a soft-deleted linked taste note, equipment item, vendor and variety (bumpVersion %s)":
  `createRich({ vendorId: await fixtures.vendor() })`, soft-delete `t1`, `e1`, the vendor and the
  variety (`db.update(<table>).set({ deletedAt: new Date() }).where(eq(<table>.id, id))`; import
  `tasteNotes, equipment, vendors, coffeeVarieties` from `@brewform/db/schema`), then `update()`
  with the edit form's body: `{ title: 'Renamed', tasteNoteIds: [t1, t2], tasteNoteIntensities:
  { [t1]: 3, [t2]: 2 }, equipmentIds: [e1], coffeeVarietyId: variety.id, vendorId, bumpVersion }`.
  Assert it resolves, the current version still links t1, t2, e1, the vendor and the variety, and
  `coffeeVarietyName === variety.name`. Fails today with `ValidationError` (`tasteNoteIds`,
  `equipmentIds`, `vendorId`, `coffeeVarietyId`).
- Same file: "still rejects a newly added soft-deleted taste note": add a deleted `t3` next to the
  kept ids; expect `ValidationError` whose `tasteNoteIds` detail message contains `t3` and not `t1`,
  and an unchanged snapshot.
- Same file: keep `rejects a soft-deleted coffee variety` (`:289-297`) as is: it sets a *different*
  deleted variety, so it must still fail.
- `apps/api/src/modules/recipe/merge.test.ts`, new cases in `describe('mergeRecipes')`: v1 links
  live note A and deleted note D, v2 links B; `selections.tasteNotes: 'both'` → resolves and the
  merged version links exactly A and B. Same for equipment (`selections.equipment: 'v1'` with one
  deleted item). Both fail today with `ValidationError`.
- Optional route lock: none needed; the PATCH route only forwards to the service.

### 5. Spec impact

`openspec/specs/recipe-write/spec.md` — MODIFIED (full blocks with edits applied):

```markdown
### Requirement: Referenced records are validated before writing
Recipe create, amend and bump SHALL reject unknown or inaccessible referenced ids that the write newly sets with 400 `VALIDATION_ERROR` and per-field details before any write, instead of failing on a foreign-key violation.

Checks (all excluding soft-deleted rows) on create: every `tasteNoteIds` entry exists; every
`equipmentIds` entry exists; `vendorId` exists; `coffeeVarietyId` exists; `beanId` exists and
belongs to the recipe author. On amend and bump the same checks apply only to the references the
payload newly sets: a `tasteNoteIds` or `equipmentIds` entry already linked to the current version,
and a `vendorId`, `coffeeVarietyId` or `beanId` equal to the current version's value, are carried
forward unchanged and are not re-checked, so a record soft-deleted after it was linked (a custom
coffee variety or equipment item its creator deleted, a taste note or vendor an admin deleted)
never blocks an edit. A fork copies the source's references unchanged and checks none of them; a
merge drops soft-deleted taste notes and equipment (capability `recipe-comparison`). The lookups
SHALL live in `recipe/model.ts`.

#### Scenario: Unknown taste note
- **WHEN** `POST /api/v1/recipes` carries a random UUID in `tasteNoteIds`
- **THEN** the response is 400 with a `tasteNoteIds` detail and no recipe row is created

#### Scenario: Another user's bean
- **WHEN** an author sets `beanId` to a bean owned by a different user
- **THEN** the response is 400 with a `beanId` detail

#### Scenario: A linked record deleted later does not block an edit
- **WHEN** a recipe's current version links taste note T, equipment E, vendor V and coffee variety C, all four are then soft-deleted, and the author sends `PATCH /api/v1/recipes/:id` with a new title and the same `tasteNoteIds`, `equipmentIds`, `vendorId` and `coffeeVarietyId` (once with `bumpVersion: false`, once with `bumpVersion: true`)
- **THEN** both responses are 200 and the current version still links T, E, V and C

#### Scenario: A newly added deleted record is still rejected
- **WHEN** the same PATCH also adds a soft-deleted taste note T2 that the current version does not link
- **THEN** the response is 400 with a `tasteNoteIds` detail naming only T2, and nothing is written
```

```markdown
### Requirement: Coffee variety is linkable and persisted
The create and update payloads SHALL accept an optional `coffeeVarietyId`, and the system SHALL persist it together with a server-resolved `coffeeVarietyName` on create, amend, bump and fork.

A newly set id (on create, or on update when it differs from the current version's id) SHALL
reference an existing, non-soft-deleted `coffee_variety` row, otherwise the request SHALL fail with
400 `VALIDATION_ERROR` (field `coffeeVarietyId`) before any write. An update that sends the current
version's id keeps the stored id and `coffeeVarietyName` without a lookup, even when the variety has
been soft-deleted since. `coffeeVarietyName` SHALL always be copied from the variety row when the id
is newly set and SHALL NOT be accepted from clients. `null` on update SHALL clear both columns.

#### Scenario: Linked recipe appears on the variety page
- **WHEN** a public recipe is created with `coffeeVarietyId: V`
- **THEN** it appears in `GET /api/v1/coffee-varieties/V/recipes` and in `GET /api/v1/recipes?coffeeVarietyId=V`
- **AND** its current version has `coffeeVarietyName` equal to variety V's name

#### Scenario: Unknown variety is rejected
- **WHEN** a create payload, or an update payload that changes the variety, carries a `coffeeVarietyId` that does not exist or is soft-deleted
- **THEN** the response is 400 `VALIDATION_ERROR` with a `coffeeVarietyId` detail and nothing is written

#### Scenario: Unchanged deleted variety is kept
- **WHEN** variety V linked to the current version is soft-deleted and the author sends `{ "title": "New", "coffeeVarietyId": "<V>" }`
- **THEN** the response is 200 and the version keeps `coffeeVarietyId` V and its stored `coffeeVarietyName`

#### Scenario: Variety can be cleared
- **WHEN** the author sends `{ "coffeeVarietyId": null }`
- **THEN** the affected version has `coffeeVarietyId` and `coffeeVarietyName` both `NULL`
```

`openspec/specs/recipe-comparison/spec.md` — MODIFIED:

```markdown
### Requirement: Service merges two accessible versions into a new draft
`mergeRecipes(authorId, data)` in `apps/api/src/modules/recipe/service.ts` SHALL load both versions through the model, throw `RECIPE_NOT_FOUND` when either version is missing or its recipe is soft-deleted, throw `FORBIDDEN` when the caller may not view either source recipe under the shared visibility predicate (`canViewRecipe`: public and unlisted recipes are viewable by anyone, draft and private recipes only by their author), and otherwise create a new recipe through `createRecipe` with `visibility: 'draft'`, `isFavourite: false`, the requested `title` and the selected field values.

Unselected scalar fields SHALL be empty except `brewMethod` and `drinkType`, which fall back to version 1's values, and `preparationNotes`, which falls back to `'Merged recipe'`. List fields SHALL follow their selection (`v1`, `v2`, `both` = de-duplicated union, `none` or unset = empty), computed by the exported helpers `getMergedIds` and `getMergedPreparations`. Taste notes and equipment whose catalog row is soft-deleted SHALL be dropped from the merged lists before `createRecipe` runs (the relation rows loaded by `fetchRecipeVersionWithRelations` carry the row's `deletedAt`), so a merge never fails on a record deleted after it was linked. Taste-note intensities are not carried over (they default to 1 in `createRecipe`). The service SHALL NOT import `drizzle-orm` or `@brewform/db`.

#### Scenario: Selected fields come from the chosen version
- **WHEN** `mergeRecipes(authorId, { …, selections: { brewMethod: 'v1', temperatureCelsius: 'v2' } })` is called on two viewable versions
- **THEN** the returned recipe is a draft titled as requested whose version uses version 1's `brewMethod` and version 2's `temperatureCelsius`

#### Scenario: Taste notes are unioned with 'both'
- **WHEN** version 1 has taste notes [A, B], version 2 has [B, C] and `selections.tasteNotes` is `'both'`
- **THEN** the merged recipe has taste notes A, B and C exactly once each

#### Scenario: Soft-deleted taste notes and equipment are dropped
- **WHEN** version 1 links taste note A and soft-deleted taste note D, version 2 links B, and `selections.tasteNotes` is `'both'`
- **THEN** the merge succeeds and the merged recipe has taste notes A and B only

#### Scenario: Missing or deleted source returns not found
- **WHEN** `recipeVersionId1` does not exist, or belongs to a recipe whose `deletedAt` is set
- **THEN** the function throws `RECIPE_NOT_FOUND`

#### Scenario: Another user's private source is forbidden
- **WHEN** `recipeVersionId2` belongs to another user's `private` or `draft` recipe
- **THEN** the function throws `FORBIDDEN` and no recipe is created
```

### 6. Docs / ledger impact

- `docs/recipes.md:193-195` ("References" bullet): say the checks apply to references a write newly
  sets; ids already linked to the current version are kept even if the record was deleted since.
  `docs/recipes.md:269-274` (merge paragraph): add "taste notes and equipment deleted from the
  catalog are left out of the merged recipe".
- `docs/api.md` "Partial updates" (`:386-412`): add a bullet "Referenced records are checked only
  when the body sets them newly; an id already linked to the current version is accepted even if
  the record was deleted since, and re-sending the current `coffeeVarietyId` keeps the stored name."
- No OpenAPI change (status codes unchanged). No D99 entry closes (D99.20, merge field parity,
  stays open).

### 7. Draft tasks

- [ ] R1.1 Failing first: in `apps/api/src/modules/recipe/service.update.test.ts` add the
  `it.each([false, true])` "keeps a soft-deleted linked taste note, equipment item, vendor and
  variety" test and the "still rejects a newly added soft-deleted taste note" test described in
  audit/r1 §1.4; run `make test-specific filter=src/modules/recipe/service.update.test.ts` and see
  both fail with `ValidationError` on the kept ids.
- [ ] R1.2 In `apps/api/src/modules/recipe/service.ts#updateRecipe`, pass `validateReferences` only
  the ids that differ from the current version (taste notes and equipment not in
  `current.tasteNotes`/`current.equipment`, `vendorId`/`coffeeVarietyId`/`beanId` through a private
  `isNewReference(value, stored)` helper) and take `coffeeVarietyName` from the lookup only when the
  variety changed, else `current.coffeeVarietyName`; update the `updateRecipe` docblock (step 3) and
  the `RecipeReferences` field docs. Re-run R1.1 until green.
- [ ] R1.3 Failing first: in `apps/api/src/modules/recipe/merge.test.ts` add the two merge cases
  (deleted taste note with `both`, deleted equipment with `v1`) from audit/r1 §1.4; see them fail;
  then in `mergeRecipes` filter `v1/v2.tasteNotes` by `tasteNote.deletedAt === null` and
  `v1/v2.equipment` by `equipment.deletedAt === null` before `getMergedIds`, log
  `{ authorId, droppedTasteNotes, droppedEquipment }` at debug when anything was dropped, update the
  `mergeRecipes` docblock, and re-run until green.
- [ ] R1.4 Update `docs/recipes.md` (References bullet, merge paragraph) and `docs/api.md`
  (Partial updates bullet) as listed in audit/r1 §1.6.

### 8. Risks / migration notes

No data migration. Behaviour change: re-sending the current `coffeeVarietyId` no longer refreshes a
renamed variety's name. Recipes keep links to deleted catalog rows (already true for forks and for
absent keys), and the detail page keeps showing them (relation loads are unfiltered).

---

## Finding 5: replies can be posted into another recipe's thread

### 1. Verification

- `createComment` (`apps/api/src/modules/comment/service.ts:49-119`) gates on the URL recipe
  (`:60-63`), then for a reply loads the parent (`:69-70`) and checks only that the caller authored
  the URL recipe (`:72-74`). Nothing compares `targetComment.recipeId` with `recipeId`. The row is
  written with the caller's `recipeId` and the foreign `parentCommentId` (`:100-105`), and
  `incrementComments` bumps the caller's recipe (`:107`).
- `findByRecipe` (`comment/model.ts:46-122`) loads replies with
  `and(inArray(comments.parentCommentId, parentIds), isNull(comments.deletedAt))` (`:103`), with no
  `recipeId` condition, so the foreign reply shows in the victim recipe's thread.
- A legacy reply chain makes the direct-target check alone insufficient: once such a row exists
  (recipeId R1, parent on R2), a reply posted to R1 targeting it passes a direct-target check
  (`recipeId` R1) and the flattening walk (`:77-91`) resolves the top-level comment on R2.
- The route maps `COMMENT_NOT_FOUND` to 404 "Parent comment not found" (`comment/index.ts:109-110`)
  and documents that 404 already.
- Tests: the authorization/flattening/mention properties in `comment/service.test.ts:81-520` run
  against an inline COPY of the service (`:77-151`, "faithful copy"), which still uses the removed
  `getRecipeAuthorId` flow and has no visibility gate, so it no longer matches the real code. No
  test covers a cross-recipe parent. Ledger: `plans/D99-debts.md:870-876` (D99.42).

**Verdict: confirmed** (plus the read path, which the review did not mention).

### 2. Root cause

Missing same-recipe invariant on the parent comment, on write and on read.

### 3. Fix design

- `createComment`: change `:70` to
  `if (!targetComment || targetComment.recipeId !== recipeId) throw new Error('COMMENT_NOT_FOUND');`
  (a foreign parent is answered exactly like a missing one, before the 403 rule), and after the
  flattening loop add `if (current.recipeId !== recipeId) throw new Error('COMMENT_NOT_FOUND');`.
  Log the rejection at debug: `{ userId, recipeId, parentCommentId }`. Update the docblock.
- `findByRecipe`: add `eq(comments.recipeId, recipeId)` to the replies `where` (`:103`), so rows
  stored before the fix never show in another thread. Update its docblock.
- Rejected: a typed 400 (D99.42 suggested "400/404"): 404 matches the existing missing-parent
  answer and reveals nothing about other recipes. Rejected: a data migration deleting existing
  cross-recipe rows: the read filter hides them, and they are rare (only through direct API use).

### 4. Tests

- `apps/api/src/modules/comment/service.test.ts` (deps-stubbed, real `createComment`, in the D99.9
  `stubGateDeps` style): parent `{ id: 'p', recipeId: 'other-recipe', parentCommentId: null }` on a
  public recipe owned by the caller → rejects `COMMENT_NOT_FOUND`, `createCalls`, `incrementCalls`
  and `mentionCalls` stay empty. Second case: direct target on the same recipe whose top-level
  parent is on another recipe → `COMMENT_NOT_FOUND`. Both fail today (the comment is created).
- `apps/api/src/modules/comment/model.test.ts` (`describe('findByRecipe')`): insert top-level `P`
  on recipe A and, via `model.create`, a reply with `recipeId` B and `parentCommentId` P;
  `findByRecipe(A, 1, 20)` returns P with `replies: []`. Fails today.
- `apps/api/src/modules/comment/index.test.ts` (DB-backed block near `:394`): the caller POSTs to
  their own recipe with `parentCommentId` of a comment on another recipe → 404,
  `error.code === 'NOT_FOUND'`, message `Parent comment not found`.

### 5. Spec impact

`openspec/specs/comment-authz/spec.md` — ADDED:

```markdown
### Requirement: Replies stay inside their recipe's thread
`createComment` SHALL reject a `parentCommentId` whose comment belongs to a different recipe than the request's `recipeId` with `COMMENT_NOT_FOUND` (404 `NOT_FOUND`, "Parent comment not found"), before any write or side effect.

The check runs right after the parent is loaded, so a parent on another recipe is answered exactly
like a missing parent, and again on the top-level comment that thread flattening resolves.
`comment/model.ts#findByRecipe` SHALL load replies only from the listed recipe
(`eq(comments.recipeId, recipeId)` next to the `parentCommentId` filter), so a cross-recipe reply
stored before this rule never appears in another recipe's thread.

#### Scenario: Reply to another recipe's comment is rejected
- **WHEN** user U, author of recipe R1, posts to R1 with `parentCommentId` set to a comment on recipe R2
- **THEN** the response is 404 `NOT_FOUND` "Parent comment not found", no comment row is created, and `incrementComments` and the notification side effects are not invoked

#### Scenario: A stored cross-recipe reply stays out of the other thread
- **WHEN** a reply row with `recipeId` R1 and a parent comment on R2 exists
- **THEN** `GET /api/v1/comments/recipe/R2` lists the parent comment without that reply
```

### 6. Docs / ledger impact

- `plans/D99-debts.md:870`: retitle `## D99.42 — Cross-recipe comment replies — ✅ Resolved
  (<date>, wave-6-review-remediation)` and add one "Resolved:" line; drop its row from the Remaining
  Debt table in `plans/ROADMAP.md:60` and adjust the open-range sentence (`D99-debts.md:5`,
  `ROADMAP.md:45`) if the assembler keeps a count.
- No OpenAPI change (404 "Parent comment not found" is documented).

### 7. Draft tasks

- [ ] R1.5 Failing first: add the two deps-stubbed `createComment` cases (foreign direct parent,
  foreign resolved top-level) to `apps/api/src/modules/comment/service.test.ts`, the cross-recipe
  reply case to `comment/model.test.ts` (`findByRecipe`) and the POST 404 case to
  `comment/index.test.ts`; run `make test-specific filter=src/modules/comment` and see them fail.
- [ ] R1.6 In `apps/api/src/modules/comment/service.ts#createComment`, throw `COMMENT_NOT_FOUND`
  when `targetComment.recipeId !== recipeId` (same line as the null check) and when the resolved
  top-level comment's `recipeId` differs; log the rejection at debug with
  `{ userId, recipeId, parentCommentId }`; in `comment/model.ts#findByRecipe` add
  `eq(comments.recipeId, recipeId)` to the replies query; update both docblocks; re-run R1.5 green.
- [ ] R1.7 Mark D99.42 resolved in `plans/D99-debts.md` and remove its row from `plans/ROADMAP.md`.

### 8. Risks / migration notes

Existing cross-recipe rows stay in the table but disappear from the victim's thread (they were
never visible on the poster's recipe either, so they become invisible; the poster's `commentCount`
still counts them). No migration.

---

## Finding 14: a concurrent double delete decrements `commentCount` twice

### 1. Verification

- `deleteComment` (`comment/service.ts:231-237`):

  ```ts
  const comment = await deps.model.findById(id);           // filters deletedAt
  if (!comment) throw new Error('COMMENT_NOT_FOUND');
  if (!isAdmin && comment.authorId !== userId) throw new Error('FORBIDDEN');
  await deps.model.softDelete(id);
  await deps.recipeModel.decrementComments(comment.recipeId);
  ```

  `softDelete` (`comment/model.ts:131-138`) already updates only `isNull(deletedAt)` and returns
  `null` when nothing changed, but its result is ignored. Two requests that both pass `findById`
  both decrement (`recipe/model.ts:1532-1539`, unguarded `comment_count - 1`). A sequential second
  request gets 404 from `findById`, so only true concurrency (double-click) hits it.
- PostgreSQL READ COMMITTED: the second `UPDATE … WHERE id = $1 AND deleted_at IS NULL` waits for
  the first, then re-evaluates the WHERE on the updated row and matches nothing (Context7
  `/websites/postgresql`, "13.2.1 Read Committed Isolation Level": "The search condition of the
  command (the WHERE clause) is re-evaluated to see if the updated version of the row still matches
  the search condition"). So the returned row is a reliable "I deleted it" signal.
- **Other counters (requested audit):** only three stored counters exist
  (`packages/db/src/schema.ts:175-177`):
  - `likeCount`: `toggleLike` (`recipe/model.ts:1636-1665`) runs in one transaction and changes the
    count only when its `insert … onConflictDoNothing … returning` or `delete … returning` returned
    a row. Correct. The unguarded `incrementLikes`/`decrementLikes` (`:1501-1519`) have no caller
    and are deleted under #34.
  - `forkCount`: incremented only inside the fork transaction after a slug was claimed
    (`model.ts:1135-1138`); never decremented. Correct for "times forked".
  - `commentCount`: increment after create (`comment/service.ts:107`) is 1:1 with inserted rows;
    the decrement is the bug.
  - Favourites, collection `recipeCount`, brew-log counts and stats, follower counts and rating
    averages are computed with `count()`/`avg()` at read time (`recipe/model.ts:1596-1603`,
    `collection/model.ts:17-40`, `brew-log/model.ts:162-210`); no read-then-write.
- Tests: `deleteComment — edge cases` (`service.test.ts:614-650`) exercises the inline copy
  (`:137-151`), which does not even call `decrementComments`.

**Verdict: confirmed**; no other counter path has the pattern (the dead like helpers aside).

### 2. Root cause

The decrement does not depend on whether this request's soft delete changed the row.

### 3. Fix design

```ts
const deleted = await deps.model.softDelete(id);
if (!deleted) throw new Error('COMMENT_NOT_FOUND'); // lost a concurrent delete
await deps.recipeModel.decrementComments(comment.recipeId);
```

- The losing request answers 404 "Comment not found" (`comment/index.ts:215`), the same answer a
  sequential second delete already gets, so exactly one DELETE succeeds. (The review's variant,
  silently succeeding, also fixes the count; 404 keeps one rule for both orders.)
- Add entry/exit debug logs to `deleteComment` (`{ userId, commentId: id }`, and `{ recipeId }` on
  exit) since the function is touched (AGENTS.md: entry/exit logs on public service functions).
- Rejected: `GREATEST(comment_count - 1, 0)` (hides future bugs); a CHECK `comment_count >= 0`
  (turns a cosmetic drift into 500s); one transaction around soft delete + decrement in the model
  (fixes a crash window that also exists on create; not this bug).

### 4. Tests

- `apps/api/src/modules/comment/service.test.ts`, deps-stubbed real `deleteComment`: `findById`
  returns the comment, `softDelete` returns `null` → rejects `COMMENT_NOT_FOUND` and the
  `decrementComments` recorder stays empty. Fails today (resolves and decrements).
- Same file (DB-backed, using the file's existing `NoteFixtures` setup): create a recipe and a
  comment through the real `createComment`, read `commentCount`, run
  `Promise.allSettled([deleteComment(author, id, false), deleteComment(author, id, false)])`; expect
  exactly one fulfilled, one rejected with `COMMENT_NOT_FOUND`, and `commentCount` lowered by
  exactly 1. Holds for any interleaving after the fix.
- **Rework the inline copies (shared with #5 and #34):** delete the copied `createComment` and
  `deleteComment` (`service.test.ts:77-151`) and run Properties 1-3, `createComment — edge cases`
  and `deleteComment — edge cases` against the real functions through `deps`: a helper
  `withDeps(model, recipeModel)` assigns `deps.model = { ...originalModel, ...model }` and
  `deps.recipeModel`, stubs `deps.evaluateBadges`/`deps.createMentionNotifications` with resolved
  promises, and `afterEach` restores them. `MockModel` replaces `getRecipeAuthorId` with
  `getRecipeForAccessCheck: () => Promise.resolve({ authorId: <owner>, visibility: 'public' })` and
  adds `getRecipeForNotification: () => Promise.resolve(null)`; `MockRecipeModel` adds
  `decrementComments`. Property 3 compares with `` `@${username} ${sanitizeText(content)}` ``
  (the real service sanitizes; import `sanitizeText` from `../../utils/sanitize.ts`). Mock parents
  must carry the request's `recipeId` (after #5 a foreign parent is rejected).

### 5. Spec impact

`openspec/specs/comment-authz/spec.md` — ADDED (the comment write-path capability; no counter
capability exists):

```markdown
### Requirement: Deleting a comment decrements the comment count once
`deleteComment` SHALL decrement the recipe's `commentCount` only after its own soft delete changed the comment row, so concurrent deletes of the same comment lower the count by exactly one.

`comment/model.ts#softDelete` updates only a row whose `deletedAt` is null and returns `null`
otherwise; under READ COMMITTED a concurrent second update waits for the first and then matches no
row. When `softDelete` returns `null`, `deleteComment` SHALL throw `COMMENT_NOT_FOUND` (404), the
same answer a sequential second delete gets from the `findById` check, and SHALL NOT call
`decrementComments`.

#### Scenario: Double-click delete
- **WHEN** the author sends two `DELETE /api/v1/comments/:id` requests for the same comment at the same time
- **THEN** exactly one succeeds, the other answers 404 `NOT_FOUND`, and the recipe's `commentCount` drops by exactly 1

#### Scenario: Lost race does not touch the counter
- **WHEN** `findById` returns the comment but `softDelete` returns `null`
- **THEN** `deleteComment` throws `COMMENT_NOT_FOUND` and `decrementComments` is not called
```

### 6. Docs / ledger impact

None (no route shape change; no ledger entry exists for this).

### 7. Draft tasks

- [ ] R1.8 In `apps/api/src/modules/comment/service.test.ts`, replace the inline `createComment` /
  `deleteComment` copies with real-service runs through `deps` as described in audit/r1 §14.4
  (`withDeps` helper, `getRecipeForAccessCheck` instead of `getRecipeAuthorId`,
  `decrementComments` recorder, Property 3 compared with `sanitizeText(content)`); run
  `make test-specific filter=src/modules/comment/service.test.ts` and confirm the converted
  properties pass against the current code before the next task.
- [ ] R1.9 Failing first: add the deps-stubbed "lost race" `deleteComment` test and the DB-backed
  `Promise.allSettled` double-delete test to `comment/service.test.ts`; see them fail; then in
  `comment/service.ts#deleteComment` throw `COMMENT_NOT_FOUND` when `softDelete` returns `null`,
  call `decrementComments` only after a non-null result, add entry/exit debug logs with ids only,
  update the docblock, and re-run until green.

### 8. Risks / migration notes

Existing negative or drifted `comment_count` values are not repaired (no recount job). If wanted, a
one-off recount is a separate operational task, not part of this change.

---

## Finding 15: `additionalPreparations` has no size limit

### 1. Verification

- `packages/shared/src/schemas/recipe.ts:66`: `additionalPreparations: z.array(AdditionalPreparationSchema)`
  (item schema `:16-21`), used by create (`:111`) and update (`:259`). No `.max()`.
- Write: `insertVersionRelations` (`apps/api/src/modules/recipe/model.ts:843-884`) inserts every
  item in ONE multi-row INSERT. `recipe_additional_preparation` (`packages/db/src/schema.ts:388-409`)
  binds 7 parameters per row (`id` from `$defaultFn`, `recipe_version_id`, `name`, `type`,
  `input_amount`, `preparation_type`, `sort_order`).
- postgres-js 4.1.0 (`pnpm-lock.yaml:2827`) throws `MAX_PARAMETERS_EXCEEDED` client-side when a
  query has `>= 65534` parameters (Context7 `/porsager/postgres`, README "MAX_PARAMETERS_EXCEEDED":
  "The postgres protocol doesn't allow more than 65534 (16bit) parameters"; `src/connection.js:187`).
  That error has no SQLSTATE, so the global handler answers 500. 65534 / 7 ≈ 9,362 items; a minimal
  item (`{"name":"a","type":"milk","inputAmount":"1","preparationType":"a"},`, ~66 bytes) fits
  ~15,800 times in the 1 MB body limit. Below that, items are stored, loaded on every detail view
  (`findById`), and copied by every bump (`readVersionRelations`) and fork.
- Other recipe arrays:
  - `tasteNoteIds`, `equipmentIds` (`RelationIdsSchema`, `:28-30`): unbounded, but every id must
    exist (validated before the insert), the catalogs are small (110 taste notes in
    `files/scaa-2.json`; 379 seeded equipment items), and duplicates are rejected, so the insert
    cannot reach the limit. A 1 MB body can still carry ~26,000 random UUIDs into one
    `inArray` lookup (26k bound parameters, under the limit) — wasteful, not a 500.
  - `tasteNoteIntensities` (`:69`, `z.record`): only the keys in `tasteNoteIds` are read
    (`model.ts:1235`, `:1364`); never inserted per key.
  - The merge path builds arrays outside Zod (`service.ts:1226-1233`); `both` can yield at most
    twice the source counts (bounded by the caps below).
- Product data: neither web form renders preparations (`recipe-edit-payload.ts:64`; no field in
  `RecipeCreatePage.tsx`); seed recipes have at most 1 preparation, 4 taste notes and 7 equipment
  items (`packages/db/src/seed-users-recipes.ts`); the web pickers have no selection cap
  (`TasteAutocomplete.tsx`, `EquipmentPicker.tsx`).

**Verdict: confirmed.**

### 2. Root cause

No upper bound on relation arrays in the shared payload schemas.

### 3. Fix design

- `additionalPreparations: z.array(AdditionalPreparationSchema).max(20)` — 20 matches the review and
  is 20× the seed maximum (a drink with more than a handful of milk/syrup/spice steps is not a real
  recipe); 20 × 7 = 140 parameters.
- `RelationIdsSchema = z.array(z.uuid()).max(50).refine(…)` — caps `tasteNoteIds` and
  `equipmentIds` at 50 (12× / 7× the seed maxima, under half the taste-note catalog). Cheap
  defense in depth; makes the contract explicit in the OpenAPI body (Zod emits `maxItems`).
- Export the limits as named constants with docblocks in `recipe.ts`
  (`MAX_ADDITIONAL_PREPARATIONS = 20`, `MAX_RELATION_IDS = 50`) so tests and docs cite them.
- `tasteNoteIntensities`: no cap (keys outside `tasteNoteIds` are ignored; the body limit bounds
  parse cost). Merge: no cap (bounded at 2× and never re-parsed).
- Zod 4.6.7 `.max(n)` on arrays (Context7 `/colinhacks/zod/v4.6.7`, "Apply array-specific length
  validations": `z.array(z.string()).max(5); // must contain 5 or fewer items`).

### 4. Tests

- `packages/shared/src/schemas/recipe.test.ts`: `RecipeCreateSchema` and `RecipeUpdateSchema`
  accept 20 preparations and reject 21 with an issue on path `['additionalPreparations']`; accept
  50 distinct `tasteNoteIds` and reject 51 (same for `equipmentIds`). Fail today (accepted).
- No API test needed beyond the schema (the route uses the same schema through `zValidator`).

### 5. Spec impact

`openspec/specs/recipe-write/spec.md` — ADDED:

```markdown
### Requirement: Recipe relation arrays are bounded
The shared recipe create and update schemas SHALL accept at most 20 `additionalPreparations` and at most 50 ids each in `tasteNoteIds` and `equipmentIds`, rejecting a longer array with 400 `VALIDATION_ERROR` and a field detail before any write.

The limits are exported constants of `packages/shared/src/schemas/recipe.ts`. Without them a request
under the 1 MB body limit could carry about 15,000 preparations, each one row of a single
multi-row INSERT with 7 bound parameters; postgres-js refuses a statement with 65,534 or more
parameters, which answered 500. `tasteNoteIntensities` stays uncapped because only the keys listed
in `tasteNoteIds` are read, and a merge (`both`) may produce up to twice a limit, which stays bounded.

#### Scenario: 21 preparations are rejected
- **WHEN** `POST /api/v1/recipes` or `PATCH /api/v1/recipes/:id` sends 21 `additionalPreparations`
- **THEN** the response is 400 `VALIDATION_ERROR` with an `additionalPreparations` detail and nothing is written

#### Scenario: 51 taste note ids are rejected
- **WHEN** a create or update payload sends 51 distinct `tasteNoteIds`
- **THEN** the response is 400 `VALIDATION_ERROR` with a `tasteNoteIds` detail
```

### 6. Docs / ledger impact

- `docs/recipes.md:185-188` (Ranges bullet): add "at most 20 additional preparations and 50 taste
  notes or equipment items per version".
- `docs/api.md` Partial updates: one bullet with the same limits.
- Regenerate `docs/api-reference.md` (`docker compose run --rm --no-deps app pnpm --filter
  @brewform/api run docs:api`); the request-body JSON schema gains `maxItems`.

### 7. Draft tasks

- [ ] R1.10 Failing first: add the 20/21 preparation and 50/51 id cases for create and update to
  `packages/shared/src/schemas/recipe.test.ts`; run `make test-shared` and see them fail; then add
  `MAX_ADDITIONAL_PREPARATIONS = 20` and `MAX_RELATION_IDS = 50` (with docblocks) to
  `packages/shared/src/schemas/recipe.ts`, apply `.max(MAX_ADDITIONAL_PREPARATIONS)` to
  `recipeFields.additionalPreparations` and `.max(MAX_RELATION_IDS)` to `RelationIdsSchema`, and
  re-run until green.
- [ ] R1.11 Update `docs/recipes.md` (Ranges) and `docs/api.md` (Partial updates) with the limits,
  and regenerate `docs/api-reference.md` with
  `docker compose run --rm --no-deps app pnpm --filter @brewform/api run docs:api`.

### 8. Risks / migration notes

Stored versions above the caps (only possible through direct API abuse) keep working: bump and fork
copy rows without re-parsing. Only a PATCH that re-sends more than the cap is rejected.

---

## Finding 16: cursor pages repeat or skip rows (microsecond `created_at`)

### 1. Verification

- `recipes.createdAt` is `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`
  (`packages/db/src/schema.ts:182`) → `timestamptz` with microseconds; inserts take `now()`
  (`createRecipeWithRelations`/`claimRecipeSlug` never set it).
- `findCursor` (`apps/api/src/modules/recipe/model.ts:1790-1841`) encodes
  `(createdAt as Date).toISOString()` (`:1827-1832`); a JavaScript `Date` holds milliseconds only
  (ECMAScript time values are integral milliseconds). `buildCursorWhere` (`:1754-1772`) compares
  `(created_at, id) > / < ($iso, $id)`.
  - ASC: stored `…123456` > cursor `…123000`, so the previous page's last row passes `>` again; with
    `perPage=1` the same row returns forever with `hasMore: true`.
  - DESC: rows in `(…123000, …123456)` are older than the bookmark but fail `<` → skipped.
- **Other cursor users:** `getFeed` (`model.ts:1859-1869`) calls `findCursor` (DESC) for
  `GET /api/v1/follow/feed` (`follow/index.ts:244-275`) → skips rows. `user/model.ts:194` batches by
  `id` only (badge evaluation) → unaffected. Comments, notifications, collections and brew logs use
  offset pagination. No other keyset on a timestamp exists.
- Tests: `model.cursor.test.ts` inserts explicit JS `Date`s (`:40-55`), which are millisecond
  values, so the bug is masked.

**Verdict: bigger** (feed too).

### 2. Root cause

The keyset compares a millisecond-truncated bookmark with a microsecond column.

### 3. Fix design

**Chosen: store `recipe.created_at` with millisecond precision.**
`createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow()`,
then `make db-generate` (expected SQL:
`ALTER TABLE "recipe" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3) with time zone;`, next
free number `0020` unless another track lands a migration first) and `make db-migrate`. No cursor
code changes; `Date` ↔ column round-trips exactly.

- Drizzle 0.45.4 supports the option (Context7 `/drizzle-team/drizzle-orm-docs`,
  "PostgreSQL timestamp column type": `timestamp({ precision: 6, withTimezone: true })` →
  `"timestamp2" timestamp(6) with time zone`). Changing a type (not a rename) does not trigger
  drizzle-kit's interactive rename prompt, so `make db-generate` works without a TTY.
- PostgreSQL behaviour (Context7 `/websites/postgresql`): precision `p` is "the number of fractional
  digits retained in the seconds field" and values are rounded to it (8.5 Date/Time Types; the
  `LOCALTIMESTAMP(precision)` entry: "rounded to the specified number of fractional digits").
  `ALTER … SET DATA TYPE` "will normally cause the entire table and its indexes to be rewritten",
  except when the old type is binary coercible to the new one; narrowing a timestamp's precision
  changes values, so the `recipe` table and its indexes (`recipe_created_at_idx`,
  `recipe_visibility_created_idx`, …) ARE rewritten under an `ACCESS EXCLUSIVE` lock
  (sql-altertable "Notes"; explicit-locking "Table-Level Lock Modes"). For a self-hosted site
  (thousands of rows) this takes well under a second, and it runs in the `migrate` service before
  the API starts. Column statistics are dropped ("running ANALYZE … is recommended"); autovacuum
  re-analyzes, no action needed.
- Existing order: rounding is monotonic, so the relative order of existing rows is kept; rows
  inside one millisecond become equal and fall back to the `id` tiebreak the queries already use.
- New rows: `defaultNow()` inserts `now()`, which the column typmod rounds on store.

**Rejected alternatives:**
- Full-precision text in the cursor: needs the column read as text, either `mode: 'string'` (turns
  `createdAt` into a string for every consumer of the recipes table: output schemas, sorting, the
  sitemap, admin) or a new `sql\`${recipes.createdAt}::text\`` fragment outside the raw-SQL registry
  (the registry's row-value keyset entry covers the comparison only).
- `date_trunc('milliseconds', created_at)` inside the row value: makes the keyset non-sargable on
  `(created_at, id)` indexes.
- Precision 3 on every timestamp column: no other column is used as a keyset; out of scope.

### 4. Tests

- `apps/api/src/modules/recipe/model.cursor.test.ts`, new `describe('findCursor — sub-millisecond created_at')`:
  insert recipes for a fresh author, then set `created_at` with sub-millisecond input in the test
  (`db.update(recipes).set({ createdAt: sql\`${'2026-01-01T00:00:00.123400Z'}::timestamptz\` })`;
  raw `sql` is allowed in tests).
  - ASC: values `.123400`, `.123600`, `.125200`; start cursor
    `{ createdAt: '2000-01-01T00:00:00.000Z', id: '00000000-0000-0000-0000-000000000000' }`; follow
    `nextCursor` (`decodeCursor`) with `perPage=1` and `where = eq(recipes.authorId, author)` for at
    most 10 pages; expect the three ids once each, in order, and `hasMore: false` at the end.
    Today page 2 repeats the first row (loop guard trips).
  - DESC: values `.125100`, `.125200`; start cursor `{ createdAt: '2099-01-01T00:00:00.000Z',
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }`; expect both ids exactly once (set equality: after
    rounding both are `.125` and tie on `id`). Today the second row is skipped.
- CI's `quality` job (`pnpm run db:generate` + `git diff --exit-code`) guards the migration/snapshot.

### 5. Spec impact

`openspec/specs/cursor-pagination/spec.md` — ADDED (the existing DESC/ASC requirements stay valid):

```markdown
### Requirement: Cursor timestamps round-trip exactly
`recipe.created_at` SHALL be stored with millisecond precision (`timestamp(3) with time zone`, declared as `timestamp('created_at', { withTimezone: true, precision: 3 })` in `packages/db/src/schema.ts`), so the `createdAt` a cursor carries (a JavaScript `Date`, millisecond resolution) equals the stored value and keyset pages never repeat or skip a row.

With an unconstrained `timestamptz`, `now()` defaults stored microseconds: an ascending page
restarted at the previous page's last row (with `perPage=1`, the same row forever with
`hasMore: true`) and a descending page skipped rows that shared the bookmark's millisecond. This
applies to every `findCursor` caller (`GET /api/v1/recipes` and `GET /api/v1/follow/feed`). The
precision change is a generated migration that rounds existing values to the millisecond; rounding
is monotonic, so existing order is kept, and rows inside one millisecond become ties broken by `id`.

#### Scenario: Ascending pages with sub-millisecond input
- **WHEN** three recipes are written with `created_at` `…00.123400`, `…00.123600` and `…00.125200` and `findCursor` pages them with `perPage=1` and `sortOrder=asc`
- **THEN** the pages return the three recipes once each in that order and the last page has `hasMore: false`

#### Scenario: Descending pages keep rows inside one millisecond
- **WHEN** two recipes are written with `created_at` `…00.125100` and `…00.125200` and `findCursor` pages them with `perPage=1` and `sortOrder=desc`
- **THEN** both recipes are returned, once each
```

### 6. Docs / ledger impact

- `docs/api.md:157-158` ("pages never repeat or skip a recipe while the data is unchanged"): true
  after the fix; no edit needed. Optionally add to the cursor list: "`createdAt` has millisecond
  precision".
- Deployment guides: no new step (the migrate service applies it); mention in the PR/release notes
  that the first start after upgrade rewrites the `recipe` table.

### 7. Draft tasks

- [ ] R1.12 Failing first: add the ASC and DESC sub-millisecond `findCursor` tests from audit/r1
  §16.4 to `apps/api/src/modules/recipe/model.cursor.test.ts`; run
  `make test-specific filter=src/modules/recipe/model.cursor.test.ts` and see ASC repeat and DESC
  skip.
- [ ] R1.13 In `packages/db/src/schema.ts` declare `recipes.createdAt` with
  `{ withTimezone: true, precision: 3 }` (update the table docblock to say why), run
  `make db-generate` (expect one new migration altering `recipe.created_at` to
  `timestamp(3) with time zone`, never hand-edit it), `make db-migrate`, run `make db-generate`
  again and confirm "No schema changes, nothing to migrate", then `make test-db-provision` and
  re-run R1.12 until green; run `make test-api` (cursor, feed and search suites).

### 8. Risks / migration notes

- Upgrade: the migration rewrites `recipe` and its indexes under an exclusive lock; seconds at most
  for small sites. It is not reversible by a down migration (none exist), but an older image works
  against the narrowed column (it reads and writes `Date`s, which are already milliseconds).
- `make db-reset` (push) creates the column with precision 3 directly; nothing to do.
- Restores of pre-upgrade dumps (finding #2, another track) bring back the old type until the next
  migrate run re-applies it.

---

## Finding 17: `dateTo` excludes the chosen day

### 1. Verification

- `packages/shared/src/schemas/recipe.ts:351,356`: `dateFrom`/`dateTo` are `z.coerce.date()`;
  `dateTo=2026-11-21` becomes `2026-11-21T00:00:00.000Z`.
- `buildRecipeFilters` (`apps/api/src/modules/recipe/model.ts:317-323`):
  `lte(recipes.createdAt, filters.dateTo)` → "from today to today" returns only rows created at
  exactly midnight UTC. Also used by `findStarred` (`model.ts:1915`).
- Contract: OpenAPI documents both as `format: 'date'` with "(inclusive)" (`recipe/index.ts:164-178`);
  the spec (`openspec/specs/advanced-search/spec.md:43-71`) promises an inclusive range;
  `docs/api.md:197-198` additionally promises "ISO 8601 dates **or timestamps** … A bare date means
  midnight UTC at the start of that day".
- Web: `<input type="date">` (`RecipeListView.tsx:377,385`) always yields `YYYY-MM-DD`, but
  `extractListParams` (`apps/web/src/utils/recipe-filters.ts:46-47`) forwards any URL value, so a
  hand-edited `?dateTo=garbage` already 400s the list loader today.
- Tests: `model.test.ts:150-263,503-528` tests an inline COPY of `buildRecipeFilters` (file header
  `:8-21` admits it) and asserts the buggy `lte`; `packages/shared/src/schemas/recipe.test.ts:660-666`
  asserts coercion to `Date`; `recipe/index.test.ts:271-283` only checks 200 for date-only values.
  No DB-backed test of the real filter exists.

**Verdict: confirmed.**

### 2. Root cause

A calendar day is parsed as an instant (its start) and compared with `<=`.

### 3. Fix design

**Recommended (user decision D1 below): date-only days in UTC.**

- Schema: `dateFrom: z.iso.date().optional()`, `dateTo: z.iso.date().optional()` (strings). Zod
  4.6.7 `z.iso.date()` "validates date strings formatted strictly as `YYYY-MM-DD`" and rejects
  impossible days such as `2020-01-32` (Context7 `/colinhacks/zod/v4.6.7`, "Validate ISO Dates with
  z.iso.date()"). Same validator the recipe payload dates already use (`recipe.ts:44-47`). Update
  the field docblocks ("UTC calendar day, inclusive").
- Model: `RecipeFilterCriteria.dateFrom/dateTo` become `string` (`model.ts:184-187`), and
  `buildRecipeFilters` builds half-open UTC day bounds:

  ```ts
  if (filters.dateFrom) {
    conditions.push(gte(recipes.createdAt, new Date(`${filters.dateFrom}T00:00:00.000Z`)));
  }
  if (filters.dateTo) {
    const end = new Date(`${filters.dateTo}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    conditions.push(lt(recipes.createdAt, end)); // exclusive start of the next UTC day
  }
  ```

  (`lt` from `drizzle-orm`, already a model import style.) UTC is consistent with how the API
  stores and compares payload dates (`toIsoDay` in `recipe/service.ts:194-196`).
- OpenAPI: change both descriptions to "Recipes created on or after / on or before this UTC day
  (inclusive, `YYYY-MM-DD`)"; `format: 'date'` already matches.
- Web: in `extractListParams` drop `dateFrom`/`dateTo` values that do not match
  `/^\d{4}-\d{2}-\d{2}$/` (same pattern as the UUID guard at `recipe-filters.ts:54`), so a
  hand-edited URL cannot fail the loader (AGENTS.md "URL state": the parser normalises invalid
  values to their defaults).
- Timezones: a UTC day, not the viewer's local day. A visitor in UTC+3 choosing "today" just after
  local midnight misses the first three local hours; adding a timezone parameter is out of scope.

**Alternative (if D1 = keep timestamps):** `z.union([z.iso.date(), z.coerce.date()])` keeps every
value accepted today; the model applies the whole-day bound only to the string (bare date) branch
and keeps `lte(createdAt, Date)` for timestamps. More code and a `string | Date` type; documented
behaviour preserved.

### 4. Tests

- DB-backed, real code: `apps/api/src/modules/recipe/model.search.test.ts`, new describe
  "date range filter (advanced-search)": with its `createRecipe(authorId, { createdAt })` fixture,
  public recipes at `2026-11-20T23:59:59.999Z`, `2026-11-21T00:00:00.000Z`,
  `2026-11-21T12:00:00.000Z`, `2026-11-21T23:59:59.999Z`, `2026-11-22T00:00:00.000Z`; call
  `service.listRecipes(RecipeFilterSchema.parse({ authorId, dateFrom: '2026-11-21', dateTo:
  '2026-11-21' }), 1, 20)` and expect exactly the three 2026-11-21 recipes; `dateTo` alone →
  the first four; `dateFrom` alone → the last four. Fails today (only the midnight row matches the
  combined range).
- `packages/shared/src/schemas/recipe.test.ts`: replace "coerces to Date" (`:660-666`) with
  "keeps a YYYY-MM-DD dateFrom as a string"; add rejects `2026-11-21T10:00:00Z`, `not-a-date`,
  `2026-02-30` for both fields.
- `apps/api/src/modules/recipe/model.test.ts`: delete the three local-copy date tests (`:503-528`)
  and the `dateFrom`/`dateTo` branches and fields of the inline copy (`:161-162`, `:258-263`); the
  DB-backed test covers the real function.
- `apps/web/src/utils/recipe-filters.test.ts`: `extractListParams` keeps `dateTo=2026-11-21` and
  drops `dateTo=2026-11-21T10:00` and `dateTo=garbage`.

### 5. Spec impact

`openspec/specs/advanced-search/spec.md` — MODIFIED:

```markdown
### Requirement: Date range filter

The `RecipeFilterSchema` SHALL include optional `dateFrom` and `dateTo` fields, each a calendar day in `YYYY-MM-DD` form (`z.iso.date().optional()`, kept as a string) interpreted as a UTC day: for `dateFrom`, `buildRecipeFilters` SHALL generate `gte(recipes.createdAt, <dateFrom at 00:00:00.000Z>)`, and for `dateTo` it SHALL generate `lt(recipes.createdAt, <the day after dateTo at 00:00:00.000Z>)`.

- `dateFrom` and `dateTo` SHALL be usable independently — either, both, or neither may be provided.
- Both ends are inclusive whole days: `dateFrom=D&dateTo=D` returns every recipe created on UTC day D.
- A timestamp, a non-ISO date or an impossible date (for example `2025-02-30`) is a 400 validation error.
- The filter operates on `recipes.createdAt` (the recipe creation timestamp), NOT on recipe-version creation timestamps, for `GET /api/v1/recipes` and `GET /api/v1/recipes/starred`.
- The web's `extractListParams` (`apps/web/src/utils/recipe-filters.ts`) forwards `dateFrom` and `dateTo` only when they match `YYYY-MM-DD`, so a hand-edited URL value is dropped instead of failing the list loader.

#### Scenario: dateFrom filters to recent recipes only
- **WHEN** recipes exist with createdAt values spanning 2025-01-01 to 2025-12-01 and the client sends `GET /api/v1/recipes?dateFrom=2025-06-01`
- **THEN** only recipes created on or after 2025-06-01T00:00:00Z are returned

#### Scenario: dateTo includes the whole chosen day
- **WHEN** recipes were created at 2026-11-20T23:59:59.999Z, 2026-11-21T00:00:00.000Z, 2026-11-21T12:00:00Z, 2026-11-21T23:59:59.999Z and 2026-11-22T00:00:00.000Z, and the client sends `GET /api/v1/recipes?dateFrom=2026-11-21&dateTo=2026-11-21`
- **THEN** exactly the three recipes created on 2026-11-21 are returned

#### Scenario: Both dateFrom and dateTo define an inclusive range
- **WHEN** the client sends `GET /api/v1/recipes?dateFrom=2025-03-01&dateTo=2025-09-01`
- **THEN** only recipes created from 2025-03-01T00:00:00Z up to the end of 2025-09-01 (UTC) are returned

#### Scenario: Invalid date string is rejected by Zod
- **WHEN** the client sends `GET /api/v1/recipes?dateFrom=not-a-date` or `GET /api/v1/recipes?dateTo=2026-11-21T10:00:00Z`
- **THEN** the response is a 400 validation error
```

(If D1 = keep timestamps, the first paragraph and the third bullet change accordingly.)

### 6. Docs / ledger impact

- `docs/api.md:197-198`: "**`dateFrom` / `dateTo`**: UTC calendar days (`YYYY-MM-DD`) on the
  recipe's creation time, inclusive on both ends (a `dateTo` day includes everything up to its
  last millisecond) and usable on their own. Timestamps are rejected with `400`."
- OpenAPI descriptions in `recipe/index.ts:164-178`; regenerate `docs/api-reference.md`.

### 7. Draft tasks

- [ ] R1.14 Failing first: add the DB-backed date-range describe to
  `apps/api/src/modules/recipe/model.search.test.ts` (five boundary recipes, combined/`dateTo`/
  `dateFrom` cases through `service.listRecipes(RecipeFilterSchema.parse(...))`), the new
  `RecipeFilterSchema` date cases to `packages/shared/src/schemas/recipe.test.ts` and the
  `extractListParams` cases to `apps/web/src/utils/recipe-filters.test.ts`; run
  `make test-specific filter=src/modules/recipe/model.search.test.ts`, `make test-shared` and
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/utils/recipe-filters.test.ts`
  and see them fail.
- [ ] R1.15 Change `dateFrom`/`dateTo` in `packages/shared/src/schemas/recipe.ts` to
  `z.iso.date().optional()` (docblocks: UTC day, inclusive); change `RecipeFilterCriteria` in
  `apps/api/src/modules/recipe/model.ts` to `string` and build `gte(start of dateFrom UTC)` /
  `lt(start of the day after dateTo UTC)` in `buildRecipeFilters`; update the two OpenAPI
  parameter descriptions in `recipe/index.ts`; in `apps/web/src/utils/recipe-filters.ts` forward
  the dates only when they match `/^\d{4}-\d{2}-\d{2}$/`; delete the local-copy date tests and
  branches in `recipe/model.test.ts`; re-run R1.14 until green, then `make check`.
- [ ] R1.16 Rewrite the `dateFrom`/`dateTo` bullet in `docs/api.md` and regenerate
  `docs/api-reference.md`.

### 8. Risks / migration notes

API narrowing: clients that send timestamps (documented in `docs/api.md`, not in OpenAPI) get 400.
The web app is unaffected. No data change.

---

## Finding 20: the QR route reveals that a draft or private recipe exists

### 1. Verification

- `getRecipeQRCode` (`apps/api/src/modules/qrcode/service.ts:32-64`): missing slug →
  `RECIPE_NOT_FOUND` (`:35-39`); draft/private → `RECIPE_NOT_AVAILABLE` (`:40-46`). Route
  (`qrcode/index.ts:69-75`) maps them to 404 and 403 `FORBIDDEN` "Recipe is not publicly
  available"; OpenAPI documents the 403 (`:47-50`); `docs/api-reference.md:265` lists
  `200, 403, 404`. The route is anonymous (no auth middleware), so the 403/404 split is a
  title-guessing oracle (slugs derive from titles).
- `share.ts` and the recipe GET routes already answer 404 for both (the existence-hiding
  convention of comment-authz "Invisible recipes return 404, not 403").
- `qrcode/model.ts:12-19` selects `{ id, visibility }` only.
- Web: `apps/web/src/routes/resources/qrcode.ts` treats every failure alike
  (`toActionFailure`), and the QR card is hidden for draft/private (`ShareSection.tsx`); nothing
  depends on 403.
- Tests: `qrcode/service.test.ts:128-171` asserts `RECIPE_NOT_AVAILABLE` for draft and private;
  `qrcode/model.test.ts:78-82` asserts the key set `['id', 'visibility']`; `qrcode/index.test.ts`
  has no draft/private route case.

**Verdict: confirmed.**

### 2. Root cause

A distinct error for "exists but hidden".

### 3. Fix design

- Model: select `authorId` too (`{ id, visibility, authorId }`), docblock updated.
- Service: replace the inline visibility check with the shared predicate for an anonymous viewer
  (`canViewRecipe(recipe, null)` from `../recipe/service.ts`, as the comment, brew-log and
  recipe-note services do): public and unlisted pass, draft and private throw `RECIPE_NOT_FOUND`.
  Keep the existing warn log line (`{ slug, visibility }`, message "recipe not viewable"); the
  client sees the same 404 either way. Update the module and function docblocks (drop
  `RECIPE_NOT_AVAILABLE`).
- Route: delete the `RECIPE_NOT_AVAILABLE` branch and the 403 OpenAPI response; describe the 404 as
  "Recipe not found (unknown, deleted, draft or private)".
- `visibility.enforcement.test.ts` exemption text for `qrcode/model.ts#findBySlug` becomes
  "point lookup; the QR service applies canViewRecipe for an anonymous viewer".
- Rejected: only changing the thrown code inline (works, but leaves a third copy of the visibility
  rule outside `canViewRecipe`).

### 4. Tests

- `qrcode/service.test.ts:128-171`: both cases now expect `RECIPE_NOT_FOUND` (and the warn log);
  add an `unlisted` case that returns a PNG. Fail first against current code.
- `qrcode/index.test.ts`: new DB-backed case: `GET /api/v1/qrcode/recipe/<draft-slug>.png` and
  `GET …/<unknown-slug>.png` return identical status 404, `error.code` `NOT_FOUND` and message.
- `qrcode/model.test.ts:78-82`: key set `['authorId', 'id', 'visibility']`.

### 5. Spec impact

`openspec/specs/recipe-visibility/spec.md` — ADDED (the "Unlisted recipes stay usable…" bullet
"the QR service refuses only `draft`/`private`" stays true and needs no edit):

```markdown
### Requirement: The QR route answers 404 for recipes it does not encode
`GET /api/v1/qrcode/recipe/:filename` SHALL encode only recipes that pass `canViewRecipe` for an anonymous viewer (`public` and `unlisted`) and SHALL answer every other slug — unknown, soft-deleted, `draft` or `private` — with the same 404 `NOT_FOUND` "Recipe not found" envelope, never 403.

The route is anonymous and slugs derive from titles, so a distinct answer for hidden recipes would
confirm that a guessed title exists. `qrcode/model.ts#findBySlug` returns `id`, `visibility` and
`authorId` for the predicate, and the route documents no 403 response.

#### Scenario: Draft and unknown slugs are indistinguishable
- **WHEN** an anonymous client requests `/api/v1/qrcode/recipe/<a draft recipe's slug>.png` and `/api/v1/qrcode/recipe/<an unused slug>.png`
- **THEN** both responses are 404 with envelope code `NOT_FOUND` and message "Recipe not found"

#### Scenario: Unlisted recipe still gets a QR code
- **WHEN** an anonymous client requests the QR code of an `unlisted` recipe
- **THEN** the response is 200 with the image
```

### 6. Docs / ledger impact

- `docs/decisions.md` ADR-010 (`:216-233`): extend the amendment note / decision sentence:
  "`draft` and `private` recipes answer 404 like an unknown slug (wave-6 review)" instead of
  "rejected with `RECIPE_NOT_AVAILABLE`".
- Regenerate `docs/api-reference.md` (QR row becomes `200, 404`).

### 7. Draft tasks

- [ ] R1.17 Failing first: change the draft/private expectations in
  `apps/api/src/modules/qrcode/service.test.ts` to `RECIPE_NOT_FOUND`, add the unlisted PNG case,
  add the draft-vs-unknown 404 parity case to `qrcode/index.test.ts`, and update the key-set
  assertion in `qrcode/model.test.ts`; run `make test-specific filter=src/modules/qrcode` and see
  them fail.
- [ ] R1.18 Select `authorId` in `qrcode/model.ts#findBySlug`; in `qrcode/service.ts` gate with
  `canViewRecipe(recipe, null)` and throw `RECIPE_NOT_FOUND`; remove the `RECIPE_NOT_AVAILABLE`
  branch and the 403 response from `qrcode/index.ts` and reword the 404 description; update the
  docblocks and the `qrcode/model.ts#findBySlug` reason in
  `apps/api/src/modules/recipe/visibility.enforcement.test.ts`; re-run R1.17 until green.
- [ ] R1.19 Amend ADR-010 in `docs/decisions.md` and regenerate `docs/api-reference.md`.

### 8. Risks / migration notes

API clients that relied on 403 for drafts now see 404. No data change.

---

## Finding 33: the sitemap queries have no limit

### 1. Verification

- `deps.getPublicRecipes` (`apps/api/src/routes/sitemap.ts:54-64`) selects every listable recipe
  (ordered by `updatedAt desc`, no `limit`); `deps.getActiveUsers` (`:65-75`) selects every
  distinct author of a listable recipe, unordered, no `limit`. Both feed one XML document
  (`buildXml`, `:83-142`) that also holds 5 static pages.
- AGENTS.md "Bounded reads" requires a `limit` on list queries (it names `model.ts`; the sitemap
  is the one route-level query file in scope of the visibility scan).
- Sitemap protocol (sitemaps.org): at most 50,000 URLs and 50 MB uncompressed per sitemap file;
  larger sites must split into a sitemap index. (Not a Context7 library; protocol constant.)
- At 50,000 URLs × ~150 bytes the XML is ~7.5 MB, well under 50 MB, and one cache entry
  (`InMemoryCacheProvider` bounds entries, not bytes: `utils/cache/index.ts:57`).
- Tests: `routes/sitemap.test.ts` stubs `deps` for XML shape and runs the real deps DB-backed for
  visibility (`:171-200`); nothing about limits.

**Verdict: confirmed** (the user query is also unordered, so a cap would cut arbitrary users).

### 2. Root cause

Unbounded discovery queries; no URL budget.

### 3. Fix design

- Module constants with docblocks: `SITEMAP_MAX_URLS = 50_000`, `STATIC_PAGES` (moved out of
  `buildXml`, 5 entries), `SITEMAP_USER_LIMIT = 5_000`,
  `SITEMAP_RECIPE_LIMIT = SITEMAP_MAX_URLS - STATIC_PAGES.length - SITEMAP_USER_LIMIT` (44,995), so
  the total can never exceed the protocol limit by construction.
- `deps.getPublicRecipes(limit = SITEMAP_RECIPE_LIMIT)`: keep `orderBy(desc(recipes.updatedAt))`,
  add `.limit(limit)` (most recently updated first: what crawlers most need to recrawl).
  `deps.getActiveUsers(limit = SITEMAP_USER_LIMIT)`: add `.orderBy(desc(users.updatedAt))` and
  `.limit(limit)` (valid with `SELECT DISTINCT` because `updated_at` is in the select list).
- Logging (new code path): `export const log = createLogger('sitemap')`; when a list returns
  exactly its limit, `log.warn({ recipeCount, userCount, maxUrls: SITEMAP_MAX_URLS }, 'sitemap truncated at the URL limit')`
  (counts only).
- OpenAPI description: append "At most 50,000 URLs; the most recently updated recipes and profiles
  are listed first." Regenerate `docs/api-reference.md`.
- Rejected: a sitemap index with paged child sitemaps (correct for very large sites, overkill for
  the self-hosted target; can follow if a site ever hits the warn log).

### 4. Tests

- `apps/api/src/routes/sitemap.test.ts`:
  - unit: `STATIC_PAGES.length + SITEMAP_RECIPE_LIMIT + SITEMAP_USER_LIMIT === SITEMAP_MAX_URLS`;
  - unit: the route calls `deps.getPublicRecipes` with `SITEMAP_RECIPE_LIMIT` and
    `deps.getActiveUsers` with `SITEMAP_USER_LIMIT` (`vi.fn` stubs);
  - unit: a stub returning `limit` rows triggers `log.warn` with the counts (spy on the exported
    `log`, restore in `afterEach`);
  - DB-backed (existing `VisibilityFixtures` block): give one public fixture recipe
    `updatedAt = 2099-01-01` and its author `updatedAt = 2099-01-01`; `deps.getPublicRecipes(1)`
    returns exactly that recipe and `deps.getActiveUsers(1)` exactly that user. Fails today (the
    functions take no limit and return everything).

### 5. Spec impact

`openspec/specs/recipe-visibility/spec.md` — ADDED (the sitemap is a discovery surface of this
capability):

```markdown
### Requirement: The sitemap stays within the sitemap protocol limit
`GET /api/v1/sitemap.xml` SHALL list at most 50,000 URLs: the 5 static pages, at most 5,000 user profiles and at most 44,995 recipes, each list read with a SQL `limit` and ordered by `updatedAt` descending.

The limits are module constants of `apps/api/src/routes/sitemap.ts` whose sum is the protocol
maximum (`SITEMAP_MAX_URLS = 50_000`). When a list reaches its limit the route logs a `warn` with
the counts only, so an operator knows the sitemap is truncated. Visibility rules are unchanged:
both lists still filter with `listableRecipeCondition(null)`.

#### Scenario: Large sites are truncated to the newest entries
- **WHEN** more than 44,995 public recipes exist
- **THEN** the sitemap lists the 44,995 most recently updated ones, the response has at most 50,000 `<url>` entries, and a `warn` log reports the truncation

#### Scenario: The queries are bounded
- **WHEN** `deps.getPublicRecipes(1)` and `deps.getActiveUsers(1)` run against a database with many listable recipes
- **THEN** each returns one row: the most recently updated recipe and profile
```

### 6. Docs / ledger impact

- OpenAPI description + regenerated `docs/api-reference.md`.
- AGENTS.md "Bounded reads" bullet: optional wording "every list or search query in `model.ts`
  (and the sitemap's `deps` in `routes/sitemap.ts`) applies `limit`".

### 7. Draft tasks

- [ ] R1.20 Failing first: add the constant-sum, call-argument, truncation-warn and DB-backed
  `limit 1` cases to `apps/api/src/routes/sitemap.test.ts`; run
  `make test-specific filter=src/routes/sitemap.test.ts` and see them fail.
- [ ] R1.21 In `apps/api/src/routes/sitemap.ts` add `SITEMAP_MAX_URLS`, `STATIC_PAGES`,
  `SITEMAP_USER_LIMIT`, `SITEMAP_RECIPE_LIMIT` (docblocks), give `deps.getPublicRecipes`/
  `deps.getActiveUsers` a `limit` parameter with those defaults (`.limit()`; users also
  `.orderBy(desc(users.updatedAt))`), log the truncation warn through an exported
  `log = createLogger('sitemap')`, extend the route description, update the `deps` docblock;
  re-run R1.20 until green; regenerate `docs/api-reference.md`.

### 8. Risks / migration notes

Sites above the cap lose their oldest entries from the sitemap (logged). No data change.

---

## Finding 34 (part): dead code in the recipe, comment and collection models

### 1. Verification (re-grepped `apps/`, `packages/`, `docs/`, `openspec/specs/`)

| Symbol | Location | Production callers | Test references |
|---|---|---|---|
| `create` | `apps/api/src/modules/recipe/model.ts:433-437` | none (writes go through `createRecipeWithRelations`; every `model.create(` hit is another module's model) | none |
| `update` | `recipe/model.ts:716-720` (D99.51) | none since wave-6 group 8 | none |
| `incrementLikes` | `recipe/model.ts:1501-1509` | none (`toggleLike` updates inline) | none |
| `decrementLikes` | `recipe/model.ts:1511-1519` | none | none |
| `getRecipeAuthorId` | `apps/api/src/modules/comment/model.ts:140-148` | none (`createComment` uses `getRecipeForAccessCheck`) | `comment/model.test.ts:297-336` (describe, 2 tests); `comment/service.test.ts` MockModel of the inline copy (`:63`, `:98`, `:211`, `:343`, `:454`, `:527`, `:561`, `:590`, `:618`, `:636`) |
| `getItems` | `apps/api/src/modules/collection/model.ts:356-379` | none (the service uses `findById` + `getRecipeVisibilityStates`) | `collection/model.test.ts:565-625` (describe, 3 tests); used as a **reader helper** in `collection/model.test.ts:498, 544, 556` and `collection/service.test.ts:290, 304, 390, 506` |
| exemption `'comment/model.ts#getRecipeAuthorId'` | `apps/api/src/modules/recipe/visibility.enforcement.test.ts:48` | — | its reason ("the comment service applies canViewRecipe") is false; the stale-exemption rule forces its removal together with the function |

`getRecipeAuthorId` also lacks `isNull(recipes.deletedAt)`. Spec references: `getItems` in
`openspec/specs/recipe-collections/spec.md:299, 319-320, 328-332`; `comment#getRecipeAuthorId` in
`openspec/specs/recipe-visibility/spec.md:348`. `comment-authz/spec.md:67,73` mention
`getRecipeAuthorId` only as the query that was replaced (history; no edit needed). The `sql` import
in `recipe/model.ts` stays (comment counters, fork counter, cursor).

**Verdict: confirmed.**

### 2. Root cause

Wave-6 refactors (transactional writes, visibility gate, collection re-check) left the old helpers.

### 3. Fix design

- Delete the six functions. Delete the two describe blocks that test only them.
- Replace the reader-helper calls with the collection's own read: `(await model.findById(id))!.items`
  (ordered by `sortOrder`, unfiltered; none of those tests involves a deleted recipe, and the shape
  — `id`, `recipeId`, `sortOrder` — is the same).
- Remove the `getRecipeAuthorId` exemption; the comment service test MockModel change is part of
  R1.8.
- **Rule B pattern for relational loads (recommended):** add `/\brecipe:\s*(?:true\b|\{)/` to
  `RECIPE_QUERY_PATTERNS` in `visibility.enforcement.test.ts`. The wave-6 collection leak came from
  exactly such a relational `items.recipe` load, which the current patterns cannot see. After
  `getItems` is gone, the pattern matches two units, both safe, which get exemptions:
  - `'collection/model.ts#findById'`: "relational point load; the collection service filters items
    with canListRecipe over fresh getRecipeVisibilityStates";
  - `'recipe/model.ts#fetchRecipeVersionWithRelations'`: "point lookup by version id; merge, diff
    and brew-log callers apply canViewRecipe to the parent recipe" (verified:
    `service.ts:1200-1202`, `recipe/index.ts:518-522`, `brew-log/service.ts:30-36`).
  `forkedFrom:` is deliberately not a pattern: it appears only in the single-row `findById`/
  `findBySlug`, whose fork source goes through `resolveForkAttribution`.
  Add a self-test fixture unit `listWithItems` containing
  `db.query.collectionItems.findMany({ with: { recipe: true } })` that Rule B must report.

### 4. Tests

- Deletions only, plus: `collection/model.test.ts` and `collection/service.test.ts` reader swaps
  (behaviour unchanged); the enforcement test passes with the new pattern and exemptions; the new
  self-test case fails if the pattern is missing.

### 5. Spec impact

`openspec/specs/recipe-collections/spec.md` — MODIFIED (full block, `getItems` removed):

````markdown
### Requirement: API model layer — pure Drizzle data-access

The system SHALL create `apps/api/src/modules/collection/model.ts` with these functions, all using
`isNull(collections.deletedAt)` for soft-delete filtering:

```ts
/** Fetch a single collection by UUID, excluding soft-deleted rows. */
export async function findById(id: string);

/** Fetch a paginated list of a user's collections (all visibilities), with recipeCount counted for the owner as viewer. */
export async function findByUserId(userId: string, page: number, perPage: number, visibility?: Visibility, recipeId?: string);

/** Fetch a paginated list of a user's public collections only, with recipeCount counted for an anonymous viewer. */
export async function findPublicByUserId(userId: string, page: number, perPage: number);

/** Fetch all public collections across users, with recipeCount counted for an anonymous viewer. */
export async function findAllPublic(page: number, perPage: number);

/** Fetch the current visibility/author/deletion state of the given recipes (one query; used to filter collection items and mask their fork sources on every read). */
export async function getRecipeVisibilityStates(recipeIds: string[]): Promise<Array<{ id: string; visibility: Visibility; authorId: string; deletedAt: Date | null }>>;

/** Insert a new collection row and return it. */
export async function create(data: typeof collections.$inferInsert);

/** Patch a collection row with partial data. Returns the updated row or null. */
export async function update(id: string, data: Partial<typeof collections.$inferInsert>);

/** Soft-delete a collection by setting deletedAt. Returns the updated row or null. */
export async function softDelete(id: string);

/** Add a recipe to a collection with a sortOrder. Throws on unique-constraint violation. */
export async function addItem(collectionId: string, recipeId: string, sortOrder?: number);

/** Hard-delete a collection_item row. Returns true if a row was deleted. */
export async function removeItem(collectionId: string, recipeId: string);

/** Reorder all items in a collection by assigning sortOrder = index in a transaction. */
export async function reorderItems(collectionId: string, itemIds: string[]);

/** Fetch public collections that contain a given recipe (for RecipeDetailPage). */
export async function getCollectionsForRecipe(recipeId: string);
```

The `findByUserId`, `findPublicByUserId` and `findAllPublic` functions SHALL compute `recipeCount`
with one batched `db.select({ collectionId, count: count() }).from(collectionItems)` query that
`innerJoin`s `recipes` on `collectionItems.recipeId` and counts only items whose recipe the list
audience may list. The filter is the shared condition imported from `../recipe/model.ts` (capability
`recipe-visibility`): `listableRecipeCondition(userId)` for `findByUserId` (the owner's own list:
not deleted, and `public` or authored by the owner), and `listableRecipeCondition(null)` for
`findPublicByUserId` and `findAllPublic` (anonymous audience: not deleted and `public`; `unlisted`
recipes are not counted). An audience parameter on the shared count helper lets
`findPublicByUserId` count as anonymous, although it delegates to `findByUserId`. Counting raw
`collection_item` rows without the recipe join, or comparing `recipes.visibility` inline, is a
violation of this requirement. The
`getRecipeVisibilityStates` function SHALL select only `id`, `visibility`, `authorId` and `deletedAt`
from `recipes` with `inArray(recipes.id, recipeIds)` (returning `[]` without querying when the list
is empty) and SHALL deliberately NOT filter `deletedAt`, so callers can detect deletions. It is an
exempt unit in the `recipe-visibility` enforcement test. Collection items are read only through
`findById` (unfiltered) and filtered by the service with `getRecipeVisibilityStates`; the model has
no separate item-list function. The `create` function uses `db.insert(collections).values(data).returning()`.
The `softDelete` function applies `isNull(collections.deletedAt)` in the WHERE to prevent double-soft-delete.

#### Scenario: findById excludes soft-deleted collections

- **WHEN** `findById('some-id')` is called for a collection with `deletedAt` set
- **THEN** the function returns `undefined`

#### Scenario: removeItem hard-deletes the join row

- **WHEN** `removeItem(collectionId, recipeId)` is called
- **THEN** the `collection_item` row is deleted from the database (no `deletedAt` set — join tables are hard-deleted)

#### Scenario: List recipeCount excludes soft-deleted and hidden recipes

- **WHEN** a public collection holds 4 items whose recipes are public, soft-deleted, another author's private recipe and another author's unlisted recipe
- **AND** `findPublicByUserId` or `findAllPublic` returns that collection
- **THEN** its `recipeCount` is `1`

#### Scenario: Owner list counts the owner's own non-public recipes

- **WHEN** the owner's collection holds one public recipe, one draft recipe and one unlisted recipe authored by the owner, and one unlisted recipe by another author
- **AND** `findByUserId(ownerId, 1, 20)` returns that collection
- **THEN** its `recipeCount` is `3`

#### Scenario: getRecipeVisibilityStates reports deletions

- **WHEN** `getRecipeVisibilityStates([publicId, deletedId])` is called
- **THEN** it returns both rows, and the row for `deletedId` has a non-null `deletedAt`
````

(Note for the assembler: the requirement body contains a fenced `ts` block; keep it fenced inside
the delta exactly as in the main spec.)

`openspec/specs/recipe-visibility/spec.md` — MODIFIED (full block; exemption list synced with the
code, `getRecipeAuthorId` dropped, relational pattern added):

```markdown
### Requirement: An enforcement test keeps every recipe listing on the shared condition

The API test suite SHALL include `apps/api/src/modules/recipe/visibility.enforcement.test.ts`, a static source scan (no database) that fails when a recipe query bypasses the shared visibility condition.

- Scope: every non-test `apps/api/src/modules/*/model.ts` and `apps/api/src/routes/*.ts`, except
  `apps/api/src/modules/admin/**` (admin is exempt).
- Rule A, no inline comparisons: a line matching `(eq|ne|inArray|notInArray)\(\s*recipes\.visibility`
  is allowed only inside `listableRecipeCondition` or `viewableRecipeCondition`, or on a line ending in a
  `// visibility-exempt: <reason>` comment. Each violation is reported as `file:line`.
- Rule B, listings use the helper: the scan splits each file into top-level units (`function` /
  `async function` / `export function` / `export async function` declarations and `export const`
  objects, each starting at column 0, so the non-exported `async function list` in
  `brew-log/model.ts` is its own unit). A unit that
  contains `.query.recipes.findMany(`, `.from(recipes)`, `.innerJoin(recipes`, `.leftJoin(recipes`
  or a relational recipe load (`recipe: true` or `recipe: {`)
  SHALL reference `listableRecipeCondition(` or `viewableRecipeCondition(`, unless it is a key of the
  test's `EXEMPT_UNITS` map (`'<module>/model.ts#<unit>' → reason`). Single-row
  `.query.recipes.findFirst(` lookups (`recipe#findById`, `recipe#findBySlug`) do not match. The
  exemptions are:
  - point lookups whose callers apply `canViewRecipe`: `comment#getRecipeForNotification`,
    `comment#getRecipeForAccessCheck`, `qrcode#findBySlug`, `recipe-note#findRecipeForNotes`,
    `recipe#fetchRecipeVersionWithRelations`, and `recipe#updateRecipeWithVersion` (the author's
    write locks its own recipe row);
  - executors and fragments that run or build part of a WHERE composed by a helper-using unit:
    `recipe#buildListPageQuery`, `recipe#buildListCountQuery`, `recipe#findCursor`,
    `recipe#buildRecipeFilters`. Any other unit that only executes a caller-supplied `where` is
    added with the reason `executor`;
  - the collection reads whose service re-checks every item: `collection#getRecipeVisibilityStates`
    (must see deleted rows) and `collection#findById` (relational item load filtered by the service
    with `canListRecipe`);
  - viewer-only records and aggregates: `brew-log#list`, `brew-log#findById`,
    `brew-log#getRecipeBrewStats`, `brew-log#getUserBrewStats`;
  - counts without recipe identifiers: `badge#evaluateBadges`.
- Rule C, required references: `recipe#buildListRecipesWhere`, `recipe#getFeed` and `recipe#findStarred`
  SHALL reference a helper.
- Every `EXEMPT_UNITS` key SHALL name a unit that exists and still matches a Rule B pattern. A stale
  exemption fails the test, so the map stays minimal.
- A self-test runs the scanner on an in-memory fixture with a hand-written
  `eq(recipes.visibility, 'public')` list function, which both Rule A and Rule B must report, and a
  relational `with: { recipe: true }` list function, which Rule B must report.

#### Scenario: A hand-rolled visibility filter fails the suite

- **WHEN** a developer adds `db.query.recipes.findMany({ where: eq(recipes.visibility, 'public') })` to any model function
- **THEN** `make test-api` fails and names the file, the line and the unit

#### Scenario: An unfiltered relational recipe load fails the suite

- **WHEN** a developer adds `db.query.collectionItems.findMany({ with: { recipe: true } })` to a model function without a helper or an exemption
- **THEN** `make test-api` fails under Rule B and names the unit

#### Scenario: Current code passes

- **WHEN** `make test-specific filter=src/modules/recipe/visibility.enforcement.test.ts` runs after the change
- **THEN** it passes, with no stale exemption
```

(If the relational pattern is not adopted, drop the `recipe: true`/`recipe: {` clause, the two new
exemptions, the second self-test fixture and the second scenario; the rest of the block still
applies.)

### 6. Docs / ledger impact

- `plans/D99-debts.md:942`: `## D99.51 — Unused recipe/model.ts#update — ✅ Resolved (<date>,
  wave-6-review-remediation)`; drop its row from `plans/ROADMAP.md:88`.
- No other docs mention these symbols (grep of `docs/`, `AGENTS.md`, `README.md`).

### 7. Draft tasks

- [ ] R1.22 Delete `create`, `update`, `incrementLikes` and `decrementLikes` from
  `apps/api/src/modules/recipe/model.ts` and `getRecipeAuthorId` from
  `apps/api/src/modules/comment/model.ts` with its `describe('getRecipeAuthorId')` block in
  `comment/model.test.ts`; remove the `'comment/model.ts#getRecipeAuthorId'` entry from
  `EXEMPT_UNITS` in `apps/api/src/modules/recipe/visibility.enforcement.test.ts`; confirm
  `grep -rn "getRecipeAuthorId\|incrementLikes\|decrementLikes" apps packages` finds only the
  wave-history spec text (R1.8 removed the test mocks).
- [ ] R1.23 Delete `getItems` from `apps/api/src/modules/collection/model.ts` and the
  `describe('collection model — getItems')` block in `collection/model.test.ts`; replace the other
  `model.getItems(id)` calls in `collection/model.test.ts` and `collection/service.test.ts` with
  `(await model.findById(id))!.items`; run `make test-specific filter=src/modules/collection`.
- [ ] R1.24 Add `/\brecipe:\s*(?:true\b|\{)/` to `RECIPE_QUERY_PATTERNS` in
  `visibility.enforcement.test.ts`, add the `collection/model.ts#findById` and
  `recipe/model.ts#fetchRecipeVersionWithRelations` exemptions with the reasons in audit/r1 §34.3,
  update the file docblock (Rule B list) and add a self-test fixture unit with
  `db.query.collectionItems.findMany({ with: { recipe: true } })` that Rule B must report; run
  `make test-specific filter=src/modules/recipe/visibility.enforcement.test.ts`.
- [ ] R1.25 Mark D99.51 resolved in `plans/D99-debts.md` and remove its row from
  `plans/ROADMAP.md`.

### 8. Risks / migration notes

None (no runtime caller). If the Rule B pattern produces a false positive in a future model file
(a non-query object literal with a `recipe: {` key), the fix is an exemption with a reason.

---

## Group check (all r1 work)

- [ ] R1.26 Run `make check`, `make lint` (read the warnings), `make fmt`, `make test-api`,
  `make test-shared`, `make test-web` (each exit code checked separately; `make test-db-provision`
  first because R1.13 adds a migration), `make docs-check`, and
  `openspec validate wave-6-review-remediation --strict`.

## User decisions needed

- **D1 (finding 17):** date-only `dateFrom`/`dateTo` (recommended; matches OpenAPI `format: date`,
  rejects timestamps that `docs/api.md` currently promises) vs keeping timestamps through
  `z.union([z.iso.date(), z.coerce.date()])` (no break, more code).
- **D2 (finding 34, optional):** adopt the relational `recipe:` Rule B pattern (recommended) or not.

## Cross-track notes

1. **Web, pre-existing (finding 1 neighbour): a soft-deleted taste note is invisible in the edit
   form and cannot be removed.** `TasteAutocomplete` renders chips only for notes present in the
   catalog it loads (`apps/web/src/components/taste/TasteAutocomplete.tsx:237`,
   `allNotes.filter((n) => selectedIds.includes(n.id))`), and the catalog excludes deleted notes. A
   linked deleted note stays in `selectedIds`, is re-sent on save (kept after the R1.2 fix) and still
   shows on the detail page, but the author has no chip to remove it. Equipment already handles
   this (`RecipeEditPage.tsx:93-103`, `equipmentOptions` adds linked items missing from the lookup).
   Small fix: a `linkedNotes` prop on `TasteAutocomplete` merged into `allNotes` (from
   `recipe.tasteNotes`, mapped to `{ id, name, depth }`), with a `RecipeEditPage.test.tsx` case.
   Belongs to the web track; not required for #1.
2. **New: deleting a top-level comment leaves its replies counted but hidden.** Create a top-level
   comment plus two replies (`commentCount` 3), delete the top-level comment: `commentCount` is 2,
   but `findByRecipe` loads replies only for visible top-level comments
   (`comment/model.ts:46-104`), so the thread shows nothing. Needs a product decision (cascade
   soft-delete of replies with a matching decrement, or render a "[deleted]" placeholder that keeps
   replies visible). Not in the review.
3. **New, low: coffee-variety array fields accept unbounded strings.**
   `packages/shared/src/schemas/coffee-variety.ts:22,27,35-37` (`processingCompatibility`,
   `subVarieties`, `notableFarms`, `notableRegions`, `regionalVariants`) are
   `z.array(z.string())` with no item or array cap, stored as `text[]`
   (`packages/db/src/schema.ts:558-571`). Any verified user can store ~1 MB per custom variety
   (`POST /api/v1/coffee-varieties` with `notableFarms: ['x'.repeat(900000)]`). No parameter blow-up
   (one array = one parameter), so storage bloat only. Suggest `.max(…)` on items and arrays.
4. **Spec/code drift, low:** the version-diff route passes `isAdmin` to `canViewRecipe`
   (`recipe/index.ts:518`), while `comment-authz` "Shared recipe-visibility predicate" says the
   recipe GET routes pass no admin flag. An admin can diff a private recipe's versions but gets 404
   on its detail. Decide which is intended.
5. **Assembler:** R1.13 adds a migration (expected `0020_*`). If another track also generates one
   (for example finding #26 or #31), generate them in task order and re-run `make db-generate`
   until clean; never renumber by hand.
6. **Assembler:** R1.8 (comment test rework) must land before R1.5/R1.9's new assertions and
   before R1.22 removes `getRecipeAuthorId` (the inline copy's mock uses it, although only as a
   local interface). Other tracks' #34 items (`admin/model.ts` helpers, `auth/model.ts`,
   `user/model.ts#searchUsers`, `fitViewBox.symmetricX`, setup log lines) are not covered here.
7. `apps/api/src/modules/recipe/model.test.ts` still tests an inline copy of the other
   `buildRecipeFilters` branches (header `:8-21`); only the date branch moves to a DB-backed test
   here. Converting the rest is a separate clean-up.
