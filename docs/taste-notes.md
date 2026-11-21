# Taste Notes (SCAA Flavor Wheel)

BrewForm uses the SCAA 2016 Flavor Wheel as the foundation for its tasting note system. The wheel
data is parsed from `files/scaa-2.json` during database seeding (`packages/db/src/seed.ts`) and
stored as a hierarchical structure in the `taste_note` table: 110 notes (9 root categories, 28
mid-level categories and 73 specific notes).

## Hierarchy

Taste notes follow a 3-level hierarchy:

| Level          | Examples                          | Description          |
| -------------- | --------------------------------- | -------------------- |
| Level 0 (Root) | Fruity, Sweet, Spices, Roasted    | Top-level categories |
| Level 1 (Mid)  | Berry, Citrus fruit, Brown sugar  | Sub-categories       |
| Level 2 (Leaf) | Raspberry, Blackberry, Grapefruit | Specific notes       |

Each note has a `parentId` pointing to its parent in the tree and a `depth` (0-2). Root-level
notes have `parentId = null`. Some mid-level categories have no children, so not every leaf is
at depth 2.

## Autocomplete

The taste note autocomplete in the recipe form uses a client-side filter over the full SCAA hierarchy:

1. Loads the complete flat list once on mount: `TasteAutocomplete` calls the
   `/resources/taste-notes` resource route through a fetcher, and its loader reads
   `GET /api/v1/taste-notes/flat` through the single-flight static cache
   (`apps/web/src/api/static-cache.ts`), so the list is fetched once per page load (until
   `clearStaticCache()` runs)
2. Filters client-side as the user types (case-insensitive match on note names)
3. Results are grouped by root category with sub-groups for mid-level categories
4. Selected notes appear as removable chips with intensity dots (1–3) above the input
5. Clicking intensity dots cycles through 1 → 2 → 3 → 1
6. The search query clears automatically after each selection/deselection
7. Checkmarks indicate already-selected notes in the dropdown
8. Keyboard navigation: ArrowUp/ArrowDown to highlight, Enter to toggle, Escape to close

### Client-Side Filter Flow

```
User types "fruit" → client filters loaded flat notes → shows matching leaves grouped by category
```

If no query is entered, all leaf notes are shown grouped by root category.

## Caching

Taste notes rarely change, so the API caches them in the configured `CacheProvider` (in-memory by
default, Redis-protocol when `CACHE_DRIVER=redis`) with a 30-day TTL:

- `GET /taste-notes/hierarchy` → cached at `["cache", "taste-notes"]`
- `GET /taste-notes/flat` → cached at `["cache", "taste-notes-flat"]`
- The root-category map used for the recipe radar chart → `["cache", "taste-notes-root-map"]`
- Search results are not cached

The cache is **flushed** automatically when an admin creates, updates, or deletes a taste note
(through `/taste-notes` or `/admin/taste-notes`): both keys are deleted and
`deleteByPrefix(["cache", "taste"])` removes every other taste-note key.

## Emoji Tags

Each recipe version can carry one emoji tag (`emojiTag`) to express the taster's overall
sentiment. It belongs to the version, not to individual taste notes:

| Key          | Emoji | Label      |
| ------------ | ----- | ---------- |
| `fire`       | 🔥    | Amazing    |
| `rocket`     | 🚀    | Super Good |
| `thumbsup`   | 👍    | Good       |
| `neutral`    | 😐    | Okay       |
| `thumbsdown` | 👎    | Bad        |
| `nauseated`  | 🤢    | Horrible   |

Emoji tags are stored as stable keys (the `emoji_tag` Postgres enum), not emoji characters. The
mapping from key → emoji → label lives in `packages/shared/src/constants/emoji-tags.ts`.

## API Endpoints

All paths are under `/api/v1`; shapes are in [api-reference.md](api-reference.md).

| Method | Endpoint                      | Auth  | Description                         |
| ------ | ----------------------------- | ----- | ----------------------------------- |
| GET    | `/taste-notes/hierarchy`      | none  | Full tree structure                 |
| GET    | `/taste-notes/flat`           | none  | Flat list of all notes              |
| GET    | `/taste-notes/search?search=` | none  | Notes whose name contains the term (case-sensitive `LIKE`) plus their siblings; at least 3 characters (`400 QUERY_TOO_SHORT`), no term returns the flat list |
| POST   | `/taste-notes`                | admin | Create a taste note (flushes cache) |
| PATCH  | `/taste-notes/:id`            | admin | Update a taste note (flushes cache) |
| DELETE | `/taste-notes/:id`            | admin | Soft-delete a taste note (flushes cache) |

The admin module offers the same operations under `/admin/taste-notes`.

## In Recipes

Taste notes are attached to recipes via the `recipe_taste_note` join table. Each entry links a
taste note to a recipe version with an intensity (1–3, default 1). The ids must exist and must
not repeat (`400 VALIDATION_ERROR`):

```json
{
  "tasteNoteIds": ["uuid-of-raspberry", "uuid-of-chocolate"],
  "tasteNoteIntensities": {
    "uuid-of-raspberry": 2,
    "uuid-of-chocolate": 3
  }
}
```
