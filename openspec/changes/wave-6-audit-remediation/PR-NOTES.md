# wave-6-audit-remediation: PR notes (draft)

Release-note and PR-description text collected while the change is applied. Each group appends
its own section below; group 29 (task 29.13) builds the single pull request description from
this file.

---

## Release notes: private recipe notes and recipe edits (t1, task 17.17)

### Your notes on other people's recipes were not private

Until this release, the "Personal Notes" box on a recipe page was not a private note. On another
user's recipe it was pre-filled with the recipe author's own notes, and saving it **replaced the
author's public notes**: the text everyone who can view the recipe sees, which also feeds the
recipe description and search. Any signed-in account could do this, through the box or the API,
on any recipe it could address, private and draft recipes included.

What changes:

- **"My private notes"** is a new, separate note per user and recipe that only you can see (the
  recipe author included, admins excluded). It **starts empty for everyone**: nothing typed into
  the old box was moved, because it cannot be told apart from the author's own text.
- The author's notes are now labelled **"Brewer's notes"**, with a hint that everyone who can view
  the recipe sees them. Only the author edits them, from the create and edit pages.
- **Authors: please review your brewer notes.** If other users typed into the old box on one of
  your recipes, their text replaced yours. There is no record of who wrote what, so nothing was
  rolled back automatically. Open the recipe's edit page and correct "Brewer's notes" if needed.

### Recipe edits now save what you changed

- Saving an edit without ticking **"Save as a new version"** now saves every field to the current
  version. Before, only the title and visibility were saved and every other change was silently
  dropped. The hint under the checkbox says which version changes ("Updates the current version
  (v3) in place" or "Creates version v4; v3 stays unchanged").
- A title-only edit no longer turns a public recipe back into a draft, and saving a new version
  keeps the taste notes and their intensities, equipment, additional preparations, photos, TDS,
  coffee variety and the favourite flag.
- Clearing a field (for example the grinder) or removing every taste note or equipment item now
  really clears it.
- The edit page can change the equipment and the coffee variety. Recipes created from a bean stay
  linked to it, and the recipe page links the coffee variety to its variety page.
- Editing a recipe now needs a verified email, like creating one.

### For API clients

- **Removed: `POST /api/v1/recipes/:id/notes`** now returns `404`. Save the caller's own private
  note with `PUT /api/v1/recipes/:id/notes` and `{ "notes": "…" }`; `GET` and `DELETE` on the
  same path read and delete it. These responses carry `Cache-Control: private, no-store`, and a
  recipe the caller cannot view returns `404`. A browser tab opened before the upgrade gets an
  error when saving a note in the old box; reloading the page fixes it.
- `PATCH /api/v1/recipes/:id`: an absent key keeps the stored value, `null` clears it, and `[]`
  removes every taste note, equipment item or preparation. `bumpVersion: false` amends the
  current version in place; `bumpVersion: true` creates a new version that carries forward
  everything the body does not provide. An omitted `visibility` or `isFavourite` is kept (it used
  to reset to `draft`/`false`). Unverified authors get `403 EMAIL_NOT_VERIFIED`.
- `tds` and `coffeeVarietyId` are now stored on create, edit, new version and fork (the variety
  name is filled in by the server). `brewRatio` and `flowRate` in request bodies are ignored;
  the server computes them.
- Details: `docs/api.md` (Recipes → `PATCH /recipes/:id` and "Private notes") and
  `docs/recipes.md` (Versioning, Brewer notes and private notes).

### For operators: S3 photo storage

If your install stored photos in S3-compatible storage (`STORAGE_DRIVER=s3`) before this release,
run the **"Photo storage security check (installs that ran before wave 6)"** in
`docs/deployment_coolify.md` §10: bucket policy, ACL and CORS audit, unexpected object keys, and
credential scoping.

<!-- Task 22.10 adds the same section to docs/deployment_compose.md and links it here. Task 29.13
turns both paths into links in the PR description. -->

---

## Web data loading migration (t5, task 17.19)

Data-loading migration: 41 useEffect fetch blocks in 38 files, 13 inline loaders moved to
`*.data.ts`, 12 mutation-only modules moved to actions, 2 raw-fetch QR downloads moved to a
resource route (65 modules); AuthContext is the only API-client exception.

- Pages read through route loaders (`<Page>.data.ts`), write through route actions that return
  `{ ok: true, … } | { ok: false, error }`, and components read and write through `useFetcher()`
  against `resources/*` routes (ADR-018). The last module migrated was the add-to-collection modal
  (`resources/collections/mine`).
- The guards are now final: `apps/web/src/architecture.test.ts` (no API call inside a
  `useEffect`) and `apps/web/src/data-loading.enforcement.test.ts` (no API-client import, raw
  `fetch(`, misplaced loader/action or data-module import outside the data layer) carry no pending
  list, and the Biome `style/noRestrictedImports` override on `apps/web/src/**` is at `error`, so
  `make lint` fails on a page or component that imports `api/client.ts`, `api/index.ts` or
  `api/static-cache.ts`.
- `make test-web` passes with both pending lists deleted (188 files, 2254 tests).
