# BrewForm — Post-Review TODO (Fix Plan)

This document is a self-contained brief for resolving the issues surfaced in
`validation-report.md`. It is written so that a fresh Claude Code context can
pick it up and execute it end-to-end without prior conversation history.

---

## How to Use This Document

You are continuing work on the **BrewForm** project at
`/Users/arda/projects/BrewForm`. Read in this order before starting:

1. **This file** (`post-review-todo.md`) — the fix plan.
2. **`validation-report.md`** in the same folder — the original audit findings.
3. **`.opencode/plans/state.md`** — historical context on what was implemented.
4. **`.opencode/plans/gap-analysis.md`** — original gap classifications (C-/H-/M-).
5. **`.opencode/plans/implementation-master-prompt.md`** — operational rules
   (Docker-only commands, no import maps, etc.).
6. The relevant phase plan file(s) for whichever fix you are working on
   (e.g. `.opencode/plans/phase4-backend-core.md`).

### Operational Rules (do not violate)

- **All commands run through Docker.** Use the Makefile wrappers or
  `docker compose run --rm app <cmd>` / `docker compose exec app <cmd>`. The
  user has no local Deno/Node.
- **No import maps.** `deno.json` must NOT contain an `"imports"` field.
- **Use Context7 MCP** for library docs (`hono`, `prisma`, `@base-ui-components/react`,
  `zod`). Library IDs are in `implementation-master-prompt.md`.
- **Barrel files** under `packages/shared/src/**/index.ts` re-export without
  `.ts` extensions (tsc compatibility); other code (non-barrel) keeps `.ts`.
- **Services import from `./model.ts`, not from `@prisma/client`** (model files
  are the only Prisma boundary).
- **No Postgres-specific operators** (`mode: 'insensitive'`, `@db.Uuid`,
  `@db.JsonB`, raw SQL) unless behind a `// POSTGRES-SPECIFIC` comment.
- **Module pattern**: `model.ts` (Prisma) → `service.ts` (logic) → `index.ts`
  (Hono routes with Zod validation). Each sub-router uses `new Hono<AppEnv>()`.
- **Run verification after every fix**: `make fmt`, `make lint`,
  `make check`, `make test`. They currently all pass — keep them passing.

### Progress Tracking

Maintain a `state-fixes.md` file in the project root
(`/Users/arda/projects/BrewForm/state-fixes.md`). Create it on first run and
update it as you complete each task.

Suggested format:

```markdown
# BrewForm — Post-Review Fix State

| Task | Status | Notes |
|------|--------|-------|
| 1. EmojiTag DB/shared alignment    | pending | |
| 2. OpenAPI spec real generation    | pending | |
| 3. Photo thumbnail generation      | pending | |
| 4. QR "not available" route        | pending | |
| 5. RecipeCreateObjectSchema export | pending | |
| 6. AdditionalPreparationType enum  | pending | |
| 7. i18n key expansion              | pending | |

## Decisions
- (record any non-obvious choices here)

## Verification log
- (paste tail of make check / make test after each change)
```

Mark each as `in_progress` while working, `completed` when done. Add notes
about decisions and any deviations from this plan.

---

## CRITICAL Tasks (block production)

### Task 1 — Align EmojiTag values between DB and shared package

**Severity**: Critical (silent data corruption / 500 errors on save)

**Problem**:

- `packages/db/prisma/schema.prisma:63-70` defines:
  ```prisma
  enum EmojiTag {
    fire
    rocket
    thumbsup
    neutral
    thumbsdown
    nauseated     // ← DB value
  }
  ```
- `packages/shared/src/constants/emoji-tags.ts:7`,
  `packages/shared/src/types/recipe.ts:28`, and
  `packages/shared/src/schemas/recipe.ts:32` all use `'sick'` instead of
  `'nauseated'`. Any `emojiTag: 'sick'` POST will pass Zod validation but fail
  Prisma's enum check at write time, surfacing as a 500.

**Recommended fix** (rename DB enum to match shared — minimal blast radius):

1. Edit `packages/db/prisma/schema.prisma`: rename `nauseated` to `sick` inside
   the `EmojiTag` enum.
2. Generate a new migration:
   ```bash
   make db-dev-migrate     # interactive — name it `rename_emoji_nauseated_to_sick`
   # or, if Prisma needs explicit rename SQL because it sees a drop+add:
   # write a manual migration with: ALTER TYPE "EmojiTag" RENAME VALUE 'nauseated' TO 'sick';
   ```
3. Verify the generated SQL is a `RENAME VALUE` (not a drop+add that loses
   data). Postgres supports this safely. If Prisma generates a destructive
   migration, hand-edit the SQL before applying.
4. `make db-generate` to refresh the Prisma client.
5. `make check` and `make test` must still pass.

**Alternative fix** (rename shared key from `sick` → `nauseated`):

- Update `packages/shared/src/constants/emoji-tags.ts:7` (the `key`),
  `packages/shared/src/types/recipe.ts:28`, and
  `packages/shared/src/schemas/recipe.ts:32`.
- Update any frontend usage (search `apps/web/src/` for the literal `'sick'` —
  unlikely to exist outside the constants file but verify).
- No Prisma migration needed.

Either is fine; the shared-side rename is lower risk. Document the choice in
`state-fixes.md`.

**Verification**:

- `grep -rn "nauseated\|'sick'" packages/ apps/` should show consistent usage.
- `make check && make test` still pass.
- Manually round-trip a recipe POST with each EmojiTag value via curl or the
  frontend create page to confirm Prisma accepts all six.

---

### Task 2 — Real OpenAPI spec generation (gap C3)

**Severity**: Critical (the spec is currently a stub — clients can't be generated)

**Problem**:

`apps/api/src/routes/openapi.ts` returns a hard-coded skeleton:

```ts
return c.json({
  openapi: '3.0.0',
  info: { title: 'BrewForm API', version: '1.0.0', ... },
  servers: [...],
  paths: {},        // ← empty
  components: { securitySchemes: { bearerAuth: ... } },
});
```

`hono-openapi` is already installed (`apps/api/package.json` declares
`"hono-openapi": "^1.0.0"`) but is not wired into any route.

**Fix**:

1. Use Context7 MCP to fetch current `hono-openapi` docs
   (`mcp__claude_ai_Context7_mcp__resolve-library-id` with query `hono-openapi`,
   then `query-docs`). Confirm the v1 API for Zod resolver integration.
2. Replace each route file's plain `zValidator(...)` calls with the
   `hono-openapi` `describeRoute()` / `validator()` helpers (or whatever the v1
   API surface is — the package was 0.x in early 2025, may differ).
3. Update `apps/api/src/routes/openapi.ts` to call the spec generator (e.g.
   `generateSpecs(app)` or `openAPISpecs(app, { ... })` per current docs)
   instead of returning a literal.
4. Mount Swagger UI / Scalar at `/docs` if you want a viewer (optional but
   matches §6.9 of the original spec).
5. Keep the `OPENAPI_ENABLED` env gate.

**Scope guidance**:

- You don't need to enrich every route in one pass. Minimum acceptable is:
  the spec returns a non-empty `paths` object that includes at least the auth,
  recipe, and admin route groups, derived from existing Zod schemas.
- Add JSDoc-style descriptions only if `hono-openapi` requires them.

**Verification**:

- `curl http://localhost:8000/openapi.json | jq '.paths | keys | length'`
  returns > 10.
- `make check` + `make test` pass.

---

### Task 3 — Implement photo thumbnail generation (gap C7)

**Severity**: Critical for the photo feature (DB column `Photo.thumbnailUrl`
is never populated)

**Problem**:

`apps/api/src/utils/upload/index.ts:generateThumbnail()` is a stub that throws
`Error('Thumbnail generation not yet implemented…')`. There is no working
image-resize path on the server, so every uploaded photo only has the original
URL (large) and `thumbnailUrl` is null.

**Fix options** (pick one and document the choice):

**Option A — Server-side with `@imagemagick/magick-wasm`** (Deno-friendly):

1. Add the dependency: `deno add jsr:@imagemagick/magick-wasm` (no, that's npm
   only — install via `npm install @imagemagick/magick-wasm` in `apps/api/`
   if it's an npm package, then import via npm specifier).
2. Implement `generateThumbnail()` to read the source bytes, resize to the
   requested dimensions while preserving aspect, write to `destPath`, return
   void.
3. Wire it into `apps/api/src/modules/photo/service.ts` `uploadPhoto()` to
   produce `small` / `medium` / `large` variants, store the medium URL in
   `Photo.thumbnailUrl`.

**Option B — Client-side resize (defer server)**:

1. Add a browser-side resize step in `apps/web/src/components/photos/PhotoUpload.tsx`
   using `<canvas>` to produce a JPEG ~600×600 thumbnail.
2. The client sends both files (`file` + `thumbnail`) in the multipart upload.
3. The server's `photo` module accepts both, stores both, and populates
   `Photo.thumbnailUrl` with the thumbnail's URL.
4. Remove the server-side `generateThumbnail()` stub (or leave it as a no-op
   with a comment that thumbnailing is client-side).

Server-side (Option A) is the spec-aligned choice; client-side (Option B) is
faster to ship. Document the call in `state-fixes.md`.

**Verification**:

- Upload a photo via the frontend. Confirm `Photo.thumbnailUrl` is non-null
  and the file at that path exists and is smaller than the original.
- `make check` + `make test` pass.

---

### Task 4 — QR "not available" route on the frontend (gap M3)

**Severity**: High UX (today: scanning a QR for a non-public recipe shows
generic 404 with no explanation).

**Problem**:

The plan calls for a dedicated page that explains "this recipe is no longer
public" when the public-only QR endpoint resolves a private/draft/deleted
recipe. The router has no such route, no page component exists.

**Fix**:

1. Create `apps/web/src/pages/recipes/RecipeNotAvailablePage.tsx`. It should:
   - Use the existing `ErrorPage` composable from
     `apps/web/src/pages/ErrorPage.tsx` (passes `statusCode={410}` or similar
     plus a custom message).
   - Explain that the recipe was either deleted, set to private, or made
     draft, and point users back to `/recipes` for browsing.
2. Add a route in `apps/web/src/router.tsx` under the `/` (Layout) parent:
   ```tsx
   { path: 'recipes/unavailable', element: <RecipeNotAvailablePage /> },
   ```
3. Update the recipe detail flow so that when `getRecipe()` throws
   `RECIPE_NOT_FOUND` **and** the request came from a QR scan (heuristic: a
   `?from=qr` query param appended to the QR URL), redirect to
   `/recipes/unavailable` instead of falling through to `NotFoundPage`. The
   QR generation lives in `apps/api/src/modules/qrcode/service.ts` — add the
   `?from=qr` query param to the URL it encodes.
4. Alternatively (simpler), have the `qrcode` API module redirect server-side
   to `/recipes/unavailable` when the recipe isn't public.

**Verification**:

- Generate a QR for a public recipe, change visibility to private, scan/visit
  the encoded URL. Confirm you land on the new page with the explanatory
  message.
- `make check` + `make test` pass.

---

## LOWER-PRIORITY Tasks

### Task 5 — Export `RecipeCreateObjectSchema` from shared

**Problem**:

`packages/shared/src/schemas/recipe.ts` defines a const
`RecipeCreateObjectSchema` (the unrefined `z.object({...})`) so that
`RecipeUpdateSchema = RecipeCreateObjectSchema.partial().extend({...})` works.
The unrefined object is not exported, so frontend code can't use
`.partial()`/`.pick()`/`.omit()` on it directly.

**Fix**:

1. In `packages/shared/src/schemas/recipe.ts`, change
   `const RecipeCreateObjectSchema = z.object({...})` to
   `export const RecipeCreateObjectSchema = z.object({...})`.
2. Add `RecipeCreateObjectSchema` to the export list in
   `packages/shared/src/schemas/index.ts`.

**Verification**:

- `make check` passes (no breakage to importers).
- Confirm the symbol is reachable: a quick test file or grep that
  `RecipeCreateObjectSchema` is in the resolved exports of
  `@brewform/shared/schemas`.

---

### Task 6 — Use `AdditionalPreparationType` enum (or remove it)

**Problem**:

`schema.prisma` defines an enum:

```prisma
enum AdditionalPreparationType {
  milk
  water
  syrup
  spice
  other
}
```

But `RecipeAdditionalPreparation.type` and `.preparationType` are stored as
plain `String`. The enum is dead code.

**Fix** (pick one):

**Option A — Use the enum**:

1. In `schema.prisma`, change
   `type String` and `preparationType String` on `RecipeAdditionalPreparation`
   to `type AdditionalPreparationType` (and decide what `preparationType` means
   relative to `type` — possibly drop one of them; check the original spec).
2. Generate migration; existing rows must already match the enum values.
3. Update Zod schemas (`packages/shared/src/schemas/recipe.ts`) to use
   `z.enum([...])` matching the enum values.
4. Update soft-validation logic in
   `packages/shared/src/utils/validation.ts` (it inspects `p.type === 'milk'`
   already — should still work).
5. Update the seed and any test fixtures.

**Option B — Drop the enum**:

1. Delete the `AdditionalPreparationType` enum from `schema.prisma`.
2. Generate migration to drop the type from the database.
3. Document the decision (free-form strings preferred for UX flexibility).

Option A is the spec-correct path; Option B is acceptable if you want to keep
the schema flexible for non-enum entries (e.g. "oat milk", "almond milk" as
free-form names with a coarser `type`). Document the call.

**Verification**: `make check && make test`.

---

### Task 7 — Expand i18n key coverage

**Problem**:

`packages/shared/src/i18n/en.json` and `tr.json` each have **142** keys; the
plan target was ~170+. Spot-checking the file shows missing keys for several
admin pages, settings sub-sections, and error messages.

**Fix**:

1. Search `apps/web/src/` for hard-coded English strings that should be
   translatable (`grep -rn "<h1>\|<h2>\|<button" apps/web/src/pages/ | grep -v "{t("`
   is a starting point).
2. Add missing keys to both `en.json` and `tr.json`. Keep parallel structure
   so missing-translation issues are easy to spot.
3. Recommended categories to extend:
   - `admin.*` (sidebar items, table headers, action labels)
   - `settings.*` (section titles, helper text, danger-zone copy)
   - `recipe.*` (form labels, validation messages)
   - `error.*` (the new RecipeNotAvailablePage from Task 4 needs a key)
4. Aim for at least 170 keys per locale.

**Verification**:

- `wc -l packages/shared/src/i18n/en.json packages/shared/src/i18n/tr.json` ≥ 170.
- `make check && make test`.

---

## Cleanup & Sanity Checks (do these last)

After every task above is `completed`:

1. **Update `.opencode/plans/state.md`** to reflect what was actually fixed
   (correct the inflated counts, e.g. "13 enums" → actual count;
   "44 test files" → actual; gap C3/C7/M3 status).
2. **Run the full verification suite**:
   ```bash
   make fmt-check
   make lint
   make check
   make test
   ```
   All four must pass.
3. **Commit per task** with a clear message
   (`fix(emoji): align EmojiTag enum with DB`,
   `feat(openapi): wire hono-openapi with Zod resolver`, etc.). Do not
   commit unless the user asks — leave the changes staged or just on disk
   and report back.
4. **Update `state-fixes.md`** with the final status table and any
   decisions taken. This file is the handoff for the next reviewer.

---

## Quick Reference — Key Files Touched per Task

| Task | Primary files |
|------|---------------|
| 1 | `packages/db/prisma/schema.prisma`, new migration; OR shared `recipe.ts`, `emoji-tags.ts` |
| 2 | `apps/api/src/routes/openapi.ts`, every `apps/api/src/modules/*/index.ts` (light touch), `apps/api/package.json` |
| 3 | `apps/api/src/utils/upload/index.ts`, `apps/api/src/modules/photo/service.ts`, possibly `apps/web/src/components/photos/PhotoUpload.tsx` |
| 4 | New `apps/web/src/pages/recipes/RecipeNotAvailablePage.tsx`, `apps/web/src/router.tsx`, `apps/api/src/modules/qrcode/service.ts` |
| 5 | `packages/shared/src/schemas/recipe.ts`, `packages/shared/src/schemas/index.ts` |
| 6 | `packages/db/prisma/schema.prisma`, new migration, `packages/shared/src/schemas/recipe.ts` |
| 7 | `packages/shared/src/i18n/en.json`, `packages/shared/src/i18n/tr.json`, frontend pages |

---

## What "done" looks like

- All 7 tasks marked `completed` in `state-fixes.md`.
- `make fmt-check && make lint && make check && make test` all pass.
- `validation-report.md` issues are either fixed or deliberately deferred
  with rationale documented in `state-fixes.md`.
- A short summary at the bottom of `state-fixes.md` describing what was
  changed and why, ready for the user to review.
