# Taste Notes (SCAA Flavor Wheel)

BrewForm uses the SCAA 2016 Flavor Wheel as the foundation for its tasting note system. The wheel
data is parsed from `files/scaa-2.json` during database seeding and stored as a hierarchical
structure.

## Hierarchy

Taste notes follow a 3-level hierarchy:

| Level          | Examples                          | Description          |
| -------------- | --------------------------------- | -------------------- |
| Level 0 (Root) | Fruity, Sweet, Spices, Roasted    | Top-level categories |
| Level 1 (Mid)  | Berry, Citrus Fruit, Brown Sugar  | Sub-categories       |
| Level 2 (Leaf) | Raspberry, Blackberry, Grapefruit | Specific notes       |

Each note has a `parentId` pointing to its parent in the tree. Root-level notes have
`parentId = null`.

## Autocomplete

The taste note autocomplete in the recipe form uses a client-side filter over the full SCAA hierarchy:

1. Loads the complete flat list once via `GET /taste-notes/flat`
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

Taste notes rarely change, so the hierarchy is **cached in Deno KV** with a 24-hour TTL:

- `GET /taste-notes/hierarchy` → cached at `["taste-notes", "hierarchy"]`
- `GET /taste-notes/flat` → cached at `["taste-notes", "flat"]`
- Search queries are cached at `["taste-notes", "search", "<query>"]`

Cache is **flushed** automatically when an admin creates, updates, or deletes a taste note (via the
admin endpoints). The flush uses `deleteByPrefix(["taste-notes"])` to remove all taste-note-related
keys.

## Emoji Tags

Each `RecipeTasteNote` can have an emoji tag to express the taster's sentiment:

| Key          | Emoji | Label       |
| ------------ | ----- | ----------- |
| `fire`       | 🔥    | Fire        |
| `rocket`     | 🚀    | Rocket      |
| `thumbsup`   | 👍    | Thumbs Up   |
| `neutral`    | 😐    | Neutral     |
| `thumbsdown` | 👎    | Thumbs Down |
| `nauseated`  | 🤢    | Nauseated   |

Emoji tags are stored as stable keys (not emoji characters) to maintain DB portability per §6.2. The
mapping from key → emoji → label lives in `@brewform/shared/constants/emoji-tags.ts`.

## API Endpoints

| Method | Endpoint                      | Auth  | Description                         |
| ------ | ----------------------------- | ----- | ----------------------------------- |
| GET    | `/taste-notes/hierarchy`      | none  | Full tree structure                 |
| GET    | `/taste-notes/flat`           | none  | Flat list of all notes              |
| GET    | `/taste-notes/search?search=` | none  | Search with autocomplete rules      |
| POST   | `/taste-notes`                | admin | Create a taste note (flushes cache) |
| PATCH  | `/taste-notes/:id`            | admin | Update a taste note (flushes cache) |
| DELETE | `/taste-notes/:id`            | admin | Delete a taste note (flushes cache) |

## In Recipes

Taste notes are attached to recipes via the `RecipeTasteNote` join table. Each entry links a
`TasteNote` to a `RecipeVersion` with an optional intensity (1–3):

```json
{
  "tasteNoteIds": ["uuid-of-raspberry", "uuid-of-chocolate"],
  "tasteNoteIntensities": {
    "uuid-of-raspberry": 2,
    "uuid-of-chocolate": 3
  }
}
```
