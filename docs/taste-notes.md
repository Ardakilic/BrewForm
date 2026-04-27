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

The taste note autocomplete in the recipe form:

1. Activates after the user types **3+ characters**
2. Debounces requests by **2 seconds** (cancels previous on each keypress)
3. Performs case-insensitive search across the full breadcrumb path
4. If a search matches a parent node, all its children are expanded
5. Results are sorted by depth then name
6. Selected notes appear as removable chips above the input

### Search Flow

```
User types "fruit" → GET /api/v1/taste-notes/search?search=fruit
```

Results include the matching parent and all its descendants:

```
Fruity
 ├── Fruity > Berry
 │    ├── Fruity > Berry > Raspberry
 │    ├── Fruity > Berry > Blackberry
 │    └── Fruity > Berry > Strawberry
 └── Fruity > Citrus Fruit
      ├── Fruity > Citrus Fruit > Grapefruit
      └── Fruity > Citrus Fruit > Lemon
```

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
`TasteNote` to a `RecipeVersion` with an optional `emojiTag`:

```json
{
  "tasteNoteIds": ["uuid-of-raspberry", "uuid-of-chocolate"],
  "emojiTags": {
    "uuid-of-raspberry": "fire",
    "uuid-of-chocolate": "thumbsup"
  }
}
```
