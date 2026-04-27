# Recipes

Recipes are the core entity of BrewForm. This document covers the versioning model, forking, validation rules, and visibility controls.

## Two-Layer Model

A recipe consists of two layers:

- **Recipe** — mutable metadata (title, visibility, fork reference, like/favourite counts)
- **RecipeVersion** — an immutable snapshot of all brewing parameters

When you create a recipe, version 1 is automatically created. When you update a recipe with `bumpVersion: true`, a new immutable version is created while preserving the previous version's data.

## Versioning

- Each version has a monotonically increasing `versionNumber`
- Versions are **immutable** — once created, they cannot be modified
- The recipe's `currentVersionId` always points to the latest version
- Full version history is browsable via the API
- Updating with `bumpVersion: false` modifies the current version in place (only for minor corrections)

## Forking

Any public or unlisted recipe can be forked:

```
POST /api/v1/recipes/:id/fork
```

- Creates a new recipe owned by the forker
- Links back to the original via `forkedFromId`
- Copies all parameters from the source recipe's latest version
- Starts as `draft` visibility
- Increments `forkCount` on the original recipe
- The forker can modify any parameters after forking

## Visibility

| State | Description | Who Can See |
|-------|-------------|-------------|
| `draft` | Work in progress | Author only |
| `private` | Saved but not shared | Author only |
| `unlisted` | Accessible via direct link, not in listings | Anyone with the link |
| `public` | Visible to everyone, searchable, indexable | Everyone |

Private and draft recipes are only visible to their author. The `optionalAuthMiddleware` enables this: anonymous requests see only public recipes, while authenticated requests can also see their own drafts/private recipes.

## Validation

BrewForm implements two levels of validation:

### Hard Validation (blocks save)

- Brew method and drink type must be compatible (per the brew method compatibility matrix)
- `grindDate` cannot be earlier than `roastDate`
- Required fields must be present (`title`, `brewMethod`, `drinkType`)
- Numeric values must be physically valid (positive where required)
- Taste note IDs must reference existing taste notes
- Equipment IDs must reference existing equipment

### Soft Validation (warnings only)

- Espresso ratio outside typical range (< 1:1.5 or > 1:3)
- Extraction time unusually short/long for the brew method
- Brew temperature outside common ranges
- Missing commonly expected optional fields

Soft warnings are returned in the response alongside the data:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "warnings": [
      { "field": "extractionTimeSeconds", "message": "Extraction time seems short for espresso" }
    ]
  }
}
```

## Canonical Units

All numeric values are stored in canonical (metric) units:

| Measurement | Storage Unit |
|------------|-------------|
| Coffee weight | grams |
| Water weight | grams |
| Brew temperature | Celsius |
| Extraction time | seconds |
| Grind size | micrometers (optional) |

The UI layer converts to user preferences (imperial, Fahrenheit, etc.) based on `UserPreferences.unitSystem` and `UserPreferences.temperatureUnit`.

## Comparison

Two public recipes can be compared side by side:

```
GET /api/v1/recipes/compare/:id1/:id2
```

Returns both recipes' latest versions with all parameters for side-by-side display. If either recipe becomes private/draft, the comparison becomes inaccessible.

## Like and Favourite

- **Like**: Toggle endpoint — `POST /api/v1/recipes/:id/like`. Returns `{ liked: boolean }`. If already liked, unlikes. If not liked, likes.
- **Favourite**: Toggle endpoint — `POST /api/v1/recipes/:id/favourite`. Returns `{ favourited: boolean }`. Same toggle pattern.

Both increment/decrement the `likeCount`/`favouriteCount` on the recipe.

## Featured Recipes

Users can feature one of their recipes on their profile:

```
POST /api/v1/recipes/:id/feature
```

Toggle pattern — if already featured, unfeatures. Only the author can feature their recipe.

## Recipe Meta (Social Crawlers)

```
GET /api/v1/recipes/meta/:slug
```

Returns minimal recipe metadata (title, description, image) for social media crawlers (Open Graph, Twitter Cards) without requiring authentication.