## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Recipe edit page saves honestly
The recipe edit page SHALL describe the version choice truthfully, SHALL send `null` or `[]` for values the user cleared, and SHALL let the author edit every persisted field it pre-fills, including equipment, coffee variety and taste notes, even when a linked catalog record was soft-deleted since.

The checkbox label SHALL read "Save as a new version" (`recipe.editPage.bumpVersion`) with a hint
that changes with its state: off, "Updates the current version (v{current}) in place"
(`recipe.editPage.bumpHint.off`); on, "Creates version v{next}; v{current} stays unchanged"
(`recipe.editPage.bumpHint.on`). Keys SHALL exist in `en.json` and `tr.json`. Cleared text, number,
date, rating and emoji inputs SHALL be sent as `null`; removing all taste notes or equipment SHALL
send `[]`; fields the page does not render (additional preparations, pre-infusion, vendor, bean,
photos) SHALL be omitted so they are kept. The page SHALL pre-populate and allow changing equipment
(reusing the create page's picker) and coffee variety (a typeahead over
`GET /api/v1/coffee-varieties/search`). A taste note or equipment item linked to the current
version but missing from the picker's lookup (soft-deleted since) SHALL still render as a selected,
removable entry (the taste picker's `linkedNotes`, the equipment picker's options), and SHALL NOT
be offered for re-selection once removed. API validation errors SHALL be shown inline, and the page
SHALL navigate away only on success. The page SHALL follow the web-data-loading capability (route
loader and action).

#### Scenario: Cleared grinder is saved without bumping (regression)
- **WHEN** the author clears the grinder input and saves with the checkbox off
- **THEN** the request carries `"grinder": null` and the recipe page shows no grinder

#### Scenario: Hint reflects the choice
- **WHEN** the current version is 3 and the author ticks the checkbox
- **THEN** the hint reads that version 4 will be created and version 3 stays unchanged

#### Scenario: Removing all taste notes clears them
- **WHEN** the author removes every taste note and saves
- **THEN** the request carries `"tasteNoteIds": []` and the recipe page shows no taste notes

#### Scenario: Author changes the coffee variety
- **WHEN** the author picks variety "Gesha" in the edit form and saves
- **THEN** the recipe detail page shows "Gesha" linked to `/coffee-varieties/<id>`

#### Scenario: A deleted linked taste note can be removed
- **WHEN** the current version links taste note T, an admin soft-deletes T, and the author opens the edit form
- **THEN** T shows as a selected chip with a remove button, T is not offered in the dropdown, and after removing it and saving the request's `tasteNoteIds` no longer contains T
