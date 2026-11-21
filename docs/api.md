# BrewForm API Reference

Base URL: `/api/v1`

All authenticated endpoints require an `Authorization: Bearer <accessToken>` header.

## Response Envelope

Every response follows a consistent envelope format.

### Success

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "pagination": { "page": 1, "perPage": 20, "total": 142, "totalPages": 8 }
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Grind date cannot be earlier than roast date",
    "details": [{ "field": "grindDate", "message": "..." }],
    "requestId": "req_abc123"
  }
}
```

### Pagination

List endpoints return `meta.pagination` with:

| Field        | Type   | Description            |
| ------------ | ------ | ---------------------- |
| `page`       | number | Current page (1-based) |
| `perPage`    | number | Items per page         |
| `total`      | number | Total items            |
| `totalPages` | number | Total pages            |

---

## Error Codes

| Code                    | HTTP Status | Description                                                                   |
| ----------------------- | ----------- | ----------------------------------------------------------------------------- |
| `VALIDATION_ERROR`      | 400         | Request body/query validation failed, or a referenced record does not exist   |
| `BAD_REQUEST`           | 400         | Malformed request the framework rejects (for example invalid JSON)            |
| `UNAUTHORIZED`          | 401         | Authentication required or invalid token                                      |
| `FORBIDDEN`             | 403         | Insufficient permissions                                                      |
| `NOT_FOUND`             | 404         | Resource not found                                                            |
| `CONFLICT`              | 409         | Unique-constraint conflict (for example an email or username already in use)  |
| `SLUG_CONFLICT`         | 409         | No free recipe slug after every candidate was tried (see recipes.md)          |
| `PAYLOAD_TOO_LARGE`     | 413         | Request body is over the size limit                                           |
| `RATE_LIMITED`          | 429         | Too many requests; retry after the `Retry-After` header                       |
| `USER_BANNED`           | 403         | User account is banned                                                        |
| `EMAIL_NOT_VERIFIED`    | 403         | The action needs a verified email (create, edit or merge a recipe; comment)   |
| `INVALID_CREDENTIALS`   | 401         | Wrong email or password                                                       |
| `INVALID_REFRESH_TOKEN` | 401         | Invalid or expired refresh token                                              |
| `INVALID_RESET_TOKEN`   | 400         | Invalid password reset token                                                  |
| `TOKEN_EXPIRED`         | 400         | Reset token has expired                                                       |
| `TOKEN_USED`            | 400         | Reset token already used                                                      |
| `QUERY_TOO_SHORT`       | 400         | Search query needs 3+ characters                                              |
| `INTERNAL_ERROR`        | 500         | Unexpected server error                                                       |

---

## Authentication

See [docs/auth.md](auth.md) for the full authentication flow.

| Method | Endpoint                | Auth | Description                           |
| ------ | ----------------------- | ---- | ------------------------------------- |
| POST   | `/auth/register`        | none | Create a new account                  |
| POST   | `/auth/login`           | none | Authenticate and receive tokens       |
| POST   | `/auth/refresh`         | none | Exchange refresh token for new tokens |
| POST   | `/auth/forgot-password` | none | Request a password reset email        |
| POST   | `/auth/reset-password`  | none | Confirm password reset with token     |

### Account identifiers

- Emails are trimmed and lower-cased before they are validated, stored or looked up, so
  `  Mixed.Case@Example.COM ` registers and signs in as `mixed.case@example.com`.
- Emails and usernames are unique case-insensitively (`Arda` and `arda` cannot both exist).
  Usernames keep the display case the user chose; profile URLs and `@mentions` resolve any case.
- The email and username of a deleted account stay reserved: registering with them answers
  `409` (`Email already registered` / `Username already taken`).
- Reserved usernames (for example `admin`, `support` or `brewform`, and anything starting with
  `deleted-`) are refused at self-registration as `409 Username already taken`. Admin-created
  accounts are exempt.

### POST /auth/register

```json
{
  "email": "user@example.com",
  "username": "brewmaster",
  "password": "securepassword",
  "displayName": "Brew Master"
}
```

Response `201`:

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "username": "..." },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### POST /auth/login

Request body:

```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "rememberMe": false
}
```

| Field          | Type    | Required | Default | Description                                              |
| -------------- | ------- | -------- | ------- | -------------------------------------------------------- |
| `email`        | string  | yes      | —       | User's email address                                     |
| `password`     | string  | yes      | —       | User's password                                          |
| `rememberMe`   | boolean | no       | `false` | Request long-lived refresh token (180d by default)       |

Response `200`:

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "username": "..." },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### POST /auth/refresh

Request body:

```json
{
  "refreshToken": "...",
  "rememberMe": false
}
```

| Field          | Type    | Required | Default | Description                                              |
| -------------- | ------- | -------- | ------- | -------------------------------------------------------- |
| `refreshToken` | string  | yes      | —       | Current refresh token                                    |
| `rememberMe`   | boolean | no       | `false` | Maintain long-lived session if previously set            |

Response `200`:

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "username": "..." },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

Response `401` (invalid or expired refresh token):

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "Invalid or expired refresh token",
    "requestId": "req_abc123"
  }
}
```

---

## Users

| Method | Endpoint           | Auth     | Description                        |
| ------ | ------------------ | -------- | ---------------------------------- |
| GET    | `/users/me`        | required | Get current user's profile         |
| PATCH  | `/users/me`        | required | Update current user's profile      |
| DELETE | `/users/me`        | required | Soft-delete current user's account |
| GET    | `/users/:username` | none     | Get a user's public profile        |

### PATCH /users/me

```json
{
  "displayName": "New Name",
  "bio": "Updated bio",
  "avatarUrl": "https://..."
}
```

---

## Recipes

| Method | Endpoint                 | Auth     | Description                                           |
| ------ | ------------------------ | -------- | ----------------------------------------------------- |
| GET    | `/recipes`               | none     | List public recipes with filters                      |
| GET    | `/recipes/meta/:slug`    | none     | Get recipe metadata for social crawlers               |
| GET    | `/recipes/:slugOrId`     | optional | Get a single recipe (private requires auth+ownership) |
| POST   | `/recipes`               | required | Create a new recipe                                   |
| PATCH  | `/recipes/:id`           | required | Update a recipe (author only)                         |
| DELETE | `/recipes/:id`           | required | Soft-delete a recipe (author only)                    |
| POST   | `/recipes/:id/fork`      | required | Fork a public/unlisted recipe                         |
| POST   | `/recipes/:id/like`      | required | Toggle like on a recipe                               |
| POST   | `/recipes/:id/favourite` | required | Toggle favourite on a recipe                          |
| POST   | `/recipes/:id/feature`   | required | Toggle featured status (author only)                  |
| POST   | `/recipes/:id/rate`     | required | Rate a recipe (1–10)                                  |
| GET    | `/recipes/:id/notes`    | required | Get the caller's own private note on a recipe         |
| PUT    | `/recipes/:id/notes`    | required | Create or replace the caller's own private note       |
| DELETE | `/recipes/:id/notes`    | required | Delete the caller's own private note                  |
| GET    | `/recipes/:slug/versions` | optional | List all versions for a recipe |

### Query Parameters (GET /recipes)

| Parameter      | Default       | Description                                            |
| -------------- | ------------- | ------------------------------------------------------ |
| `page`         | 1             | Page number                                            |
| `perPage`      | 20            | Items per page (max 100)                               |
| `brewMethod`   | —             | Filter by brew method                                  |
| `drinkType`    | —             | Filter by drink type                                   |
| `visibility`   | —             | Filter by visibility (own drafts require auth)         |
| `authorId`     | —             | Filter by author                                       |
| `search`       | —             | Search by title                                        |
| `equipmentId`  | —             | Filter by linked equipment UUID                        |
| `tasteNoteIds` | —             | Comma-separated taste note UUIDs (AND logic, max 10)   |
| `tasteNoteId`  | —             | Single taste note UUID (**deprecated**, use `tasteNoteIds`). Responses include a `Deprecation: true` header (RFC 8594). Will be removed in a future release — see [`openspec/changes/d28-remove-deprecated-taste-note-id/`](../openspec/changes/d28-remove-deprecated-taste-note-id/proposal.md). |
| `grinder`      | —             | Filter by grinder name                                 |
| `mainBrewer`   | —             | Filter by main brewer name (partial, case-insensitive) |
| `sortBy`       | `createdAt`   | Sort field: `createdAt`, `likeCount`, `rating`         |
| `sortOrder`    | `desc`        | Sort direction: `asc`, `desc`                          |

### POST /recipes

```json
{
  "title": "My Espresso Recipe",
  "brewMethod": "espresso_machine",
  "drinkType": "espresso",
  "visibility": "public",
  "brewerDetails": "Lelit Mara X",
  "grinder": "Eureka Mignon",
  "grindSize": "12",
  "groundWeightGrams": 18,
  "extractionVolumeMl": 36,
  "temperatureCelsius": 93,
  "extractionTimeSeconds": 28,
  "preparationNotes": "1. Dose 18g...",
  "roastDate": "2026-01-15",
  "tasteNoteIds": ["uuid1", "uuid2"],
  "tasteNoteIntensities": { "uuid1": 2, "uuid2": 3 },
  "equipmentIds": ["uuid3"],
  "additionalPreparations": [
    { "name": "Oat milk", "type": "milk", "inputAmount": "30ml", "preparationType": "steamed" }
  ]
}
```

Optional version fields also include `tds` (number, 0–25; stored with two decimals and returned
as a string such as `"1.35"`), `coffeeVarietyId` (UUID of a coffee variety; the API copies the
variety's name into `coffeeVarietyName`, which clients never send), `beanId` (one of the caller's
own beans) and `vendorId`. `brewRatio` and `flowRate` are computed by the API from the
measurements and are ignored if sent.

See [docs/recipes.md](recipes.md) for versioning, forking, and validation rules.

### PATCH /recipes/:id

Updates a recipe the caller authored. Requires a verified email: an unverified author gets
`403 EMAIL_NOT_VERIFIED` and nothing is written; another user's recipe gets `403 FORBIDDEN`.

`bumpVersion` (default `false`) chooses how the change is saved:

- `bumpVersion: false` **amends the current version in place**. Every field in the body is
  written to the recipe and its current version in one transaction; no new version is created.
- `bumpVersion: true` **creates a new version** (`versionNumber` one above the highest existing
  one). It carries forward every value and relation of the current version that the body does
  not provide: all scalar fields (including `tds`, the coffee variety, `beanId`, `vendorId`,
  `rating`, `emojiTag` and `isFavourite`), taste notes with their intensities, equipment,
  additional preparations and version photos. `brewDate` is the body value or now.

Earlier versions are never modified. Either way the write is all-or-nothing: validation,
referenced records and equipment compatibility are checked (on the body and on the body merged
over the current version) before the first write.

Body semantics, decided by which keys are present:

| In the body              | Effect                                                                     |
| ------------------------ | -------------------------------------------------------------------------- |
| key absent               | The stored value is kept (an omitted `visibility` or `isFavourite` too)    |
| `null`                   | Clears a clearable field (see below)                                       |
| `[]` for a relation      | Removes every row of `tasteNoteIds`, `equipmentIds` or `additionalPreparations` |
| non-empty relation array | Replaces the rows                                                          |

- Clearable with `null`: `productName`, `coffeeBrand`, `coffeeProcessing`, `vendorId`,
  `roastDate`, `packageOpenDate`, `grindDate`, `brewerDetails`, `grinder`, `grindSize`,
  `groundWeightGrams`, `extractionTimeSeconds`, `extractionVolumeMl`, `temperatureCelsius`,
  `tds`, `preInfusionTimeSeconds`, `beanId`, `coffeeVarietyId` (clears the name too),
  `personalNotes`, `rating`, `emojiTag`.
- `null` is a `400 VALIDATION_ERROR` for `title`, `visibility`, `brewMethod`, `drinkType`,
  `preparationNotes`, `isFavourite`, `brewDate`, `setupId` and the relation arrays.
- `tasteNoteIntensities` is accepted only together with `tasteNoteIds`.
- A relation array with the same id twice is a `400 VALIDATION_ERROR`.

```json
{ "grindSize": "medium", "grinder": null, "tasteNoteIds": [], "bumpVersion": false }
```

Statuses: `200` (the updated recipe detail), `400 VALIDATION_ERROR` (with `details`; also an
empty title or an unknown referenced record), `401`, `403 EMAIL_NOT_VERIFIED` / `FORBIDDEN`,
`404`, `409 CONFLICT`, `422` (equipment incompatible with the brew method).

### POST /recipes/:id/rate

Rate a recipe on a 1–10 integer scale. Each user can rate a recipe once; subsequent requests update the previous rating.

```json
{ "rating": 8 }
```

| Field    | Type   | Required | Constraints |
| -------- | ------ | -------- | ----------- |
| `rating` | number | yes      | Integer, 1–10 |

Response `200`: returns the updated rating and aggregate stats (average rating, rating count).

### Private notes: GET, PUT and DELETE /recipes/:id/notes

Each signed-in user can keep one **private note** per recipe. These endpoints act only on the
caller's own note (the user comes from the access token; nothing in the request can name another
user, and admins cannot read other users' notes either). They never read or change the author's
public brewer notes (`personalNotes` on the version, edited through `PATCH /recipes/:id`).

| Method   | Body                | Response `200` `data`                                     |
| -------- | ------------------- | --------------------------------------------------------- |
| `GET`    | —                   | `{ recipeId, notes, updatedAt }`; `notes` and `updatedAt` are `null` when the caller has no note |
| `PUT`    | `{ "notes": "…" }`  | The stored note. Creates or replaces it (1–10,000 characters after trimming; HTML tags and zero-width characters are stripped, and text that is empty afterwards is a `400`) |
| `DELETE` | —                   | `{ recipeId, notes: null, updatedAt: null }`. Idempotent; the text is scrubbed, and a later `PUT` revives the note |

```json
{ "notes": "Tried 19g dose — extracted faster, brighter acidity." }
```

- **`404 NOT_FOUND`** when the recipe does not exist, is deleted, or is not viewable by the
  caller (for example another user's private or draft recipe).
- `400 VALIDATION_ERROR` for a malformed recipe id or invalid note text; `401` without a valid
  token. No verified email is needed (the note is visible only to its owner).
- Every response, success or error, carries **`Cache-Control: private, no-store`**, so no shared
  cache stores a private note. Private notes are never embedded in the recipe detail payload,
  search, feeds or crawler metadata.

**Removed in wave 6:** `POST /recipes/:id/notes` no longer exists and returns `404`. It used to
overwrite the recipe author's public brewer notes for any signed-in caller. Clients save the
caller's private note with `PUT /recipes/:id/notes`.

---

## Equipment

| Method | Endpoint            | Auth     | Description                                    |
| ------ | ------------------- | -------- | ---------------------------------------------- |
| GET    | `/equipment`        | none     | List equipment (paginated, filterable by type) |
| GET    | `/equipment/search` | none     | Autocomplete search (min 2 chars)              |
| POST   | `/equipment`        | required | Create equipment                               |
| GET    | `/equipment/:id`    | none     | Get single equipment by ID                     |
| PATCH  | `/equipment/:id`    | required | Update equipment (owner only)                  |
| DELETE | `/equipment/:id`    | required | Delete equipment (owner only)                  |
| GET    | `/equipment/:id/recipes` | none | List public recipes using this equipment (paginated) |
| POST   | `/equipment/:id/delete-request` | required | Request deletion of equipment (provides reason) |

### Equipment Types

See [docs/coffee-equipments.md](coffee-equipments.md) for the full equipment catalog.

---

## Coffee Varieties

| Method | Endpoint                    | Auth     | Description                                          |
| ------ | --------------------------- | -------- | ---------------------------------------------------- |
| GET    | `/coffee-varieties`         | none     | List coffee varieties (paginated, filterable)        |
| GET    | `/coffee-varieties/search`  | none     | Autocomplete search (min 2 chars)                    |
| POST   | `/coffee-varieties`         | required | Create a coffee variety                              |
| GET    | `/coffee-varieties/:id`     | none     | Get a single coffee variety                          |
| PATCH  | `/coffee-varieties/:id`     | required | Update a coffee variety (creator or admin)           |
| DELETE | `/coffee-varieties/:id`     | required | Delete a coffee variety (creator or admin)           |
| GET    | `/coffee-varieties/:id/recipes` | none | List recipes using this variety (paginated)          |

### Query Parameters (GET /coffee-varieties)

| Parameter  | Default | Description                                    |
| ---------- | ------- | ---------------------------------------------- |
| `page`     | 1       | Page number                                    |
| `perPage`  | 20      | Items per page                                 |
| `category` | —       | Filter by category (`variety`, `processing`, `market_name`) |
| `search`   | —       | Search by name                                 |

### POST /coffee-varieties

```json
{
  "name": "Gesha",
  "category": "variety",
  "species": "Coffea arabica",
  "origin": "Ethiopia",
  "cupProfile": "Floral, jasmine, bergamot"
}
```

See [docs/coffee-data.md](coffee-data.md) for the full coffee variety structure and seed data.

---

## Beans

| Method | Endpoint     | Auth     | Description                |
| ------ | ------------ | -------- | -------------------------- |
| GET    | `/beans`     | required | List current user's beans  |
| GET    | `/beans/:id` | none     | Get a single bean          |
| POST   | `/beans`     | required | Create a bean              |
| PATCH  | `/beans/:id` | required | Update a bean (owner only) |
| DELETE | `/beans/:id` | required | Delete a bean (owner only) |

---

## Vendors

| Method | Endpoint          | Auth     | Description                       |
| ------ | ----------------- | -------- | --------------------------------- |
| GET    | `/vendors`        | none     | List vendors (paginated)          |
| GET    | `/vendors/search` | none     | Autocomplete search (min 2 chars) |
| POST   | `/vendors`        | required | Create a vendor                   |
| GET    | `/vendors/:id`    | none     | Get a single vendor               |
| PATCH  | `/vendors/:id`    | required | Update a vendor                   |
| DELETE | `/vendors/:id`    | admin    | Delete a vendor (admin only)      |

---

## Taste Notes

| Method | Endpoint                 | Auth  | Description                         |
| ------ | ------------------------ | ----- | ----------------------------------- |
| GET    | `/taste-notes/hierarchy` | none  | Full hierarchical tree              |
| GET    | `/taste-notes/flat`      | none  | Flat list of all notes              |
| GET    | `/taste-notes/search`    | none  | Search (min 3 chars, or list all)   |
| POST   | `/taste-notes`           | admin | Create a taste note (flushes cache) |
| PATCH  | `/taste-notes/:id`       | admin | Update a taste note (flushes cache) |
| DELETE | `/taste-notes/:id`       | admin | Delete a taste note (flushes cache) |

See [docs/taste-notes.md](taste-notes.md) for hierarchy and autocomplete details.

---

## Comments

| Method | Endpoint                     | Auth     | Description                                          |
| ------ | ---------------------------- | -------- | ---------------------------------------------------- |
| POST   | `/comments/recipe/:recipeId` | required | Add a comment or reply (replies: recipe author only) |
| GET    | `/comments/recipe/:recipeId` | none     | List comments for a recipe (paginated)               |
| DELETE | `/comments/:id`              | required | Delete a comment (owner only)                        |

Comment request:

```json
{ "content": "Great recipe!" }
```

Reply (include `parentId`):

```json
{ "content": "Thanks for the tip!", "parentId": "comment-uuid" }
```

Only the recipe author can reply to comments (OP-only reply rule).

---

## Follow

| Method | Endpoint                    | Auth     | Description                         |
| ------ | --------------------------- | -------- | ----------------------------------- |
| POST   | `/follow/:userId`           | required | Follow a user                       |
| DELETE | `/follow/:userId`           | required | Unfollow a user                     |
| GET    | `/follow/:userId/followers` | none     | List a user's followers (paginated) |
| GET    | `/follow/:userId/following` | none     | List who a user follows (paginated) |
| GET    | `/follow/feed`              | required | Feed of recipes from followed users |

---

## Collections

| Method | Endpoint                             | Auth     | Description                                                        |
| ------ | ------------------------------------ | -------- | ------------------------------------------------------------------ |
| GET    | `/collections`                       | required | The caller's own collections, every visibility (paginated)         |
| GET    | `/collections/public`                | none     | Browse public collections of every user (paginated)                |
| GET    | `/collections/:id`                   | optional | Collection detail with its items                                   |
| POST   | `/collections`                       | required | Create a collection                                                |
| PATCH  | `/collections/:id`                   | required | Update a collection (owner only)                                   |
| DELETE | `/collections/:id`                   | required | Soft-delete a collection (owner only)                              |
| POST   | `/collections/:id/recipes`           | required | Add a recipe (own recipes of any visibility, others' public only)  |
| DELETE | `/collections/:id/recipes/:recipeId` | required | Remove a recipe (works whether or not the recipe is still visible) |
| PATCH  | `/collections/:id/reorder`           | required | Reorder the items the owner sees (`itemIds`)                       |
| GET    | `/users/:userId/collections`         | optional | A user's public collections; every visibility for the user         |
| GET    | `/recipes/:slugOrId/collections`     | optional | Public collections containing a recipe, plus the caller's own      |

### Visibility of items

- Collection items follow the recipe listing rule: a `public` recipe is shown to everyone, while
  `unlisted`, `private` and `draft` recipes are shown only to their own author. A soft-deleted
  recipe is shown to nobody.
- Owning the collection grants nothing: the owner does not see another author's recipe that is, or
  later becomes, non-public. A recipe that changes visibility or is deleted disappears on the next
  request, even while the collection detail is cached.
- Counts follow the audience: `recipeCount` on a detail equals the items returned; the owner's own
  list counts the owner's own non-public recipes; public lists (`/collections/public`, and
  `/users/:userId/collections` for anyone but that user) count public recipes only.
- Reorder sends the ids of the items the owner sees; hidden items keep their relative order after
  them.
- An `unlisted` collection opens for anyone with its direct link (`GET /collections/:id`, items
  filtered as above) and is never listed to anyone but its owner. `private` and `draft`
  collections return `403` to everyone else.
- See [Visibility](#visibility) for the meaning of each visibility value on every surface.

---

## Badges

| Method | Endpoint                   | Auth  | Description                         |
| ------ | -------------------------- | ----- | ----------------------------------- |
| GET    | `/badges`                  | none  | List all badge definitions          |
| GET    | `/badges/user/:userId`     | none  | List a user's earned badges         |
| POST   | `/badges/evaluate/:userId` | admin | Trigger badge evaluation for a user |

---

## Setups

| Method | Endpoint                  | Auth     | Description                       |
| ------ | ------------------------- | -------- | --------------------------------- |
| GET    | `/setups`                 | required | List current user's brew setups   |
| POST   | `/setups`                 | required | Create a brew setup               |
| GET    | `/setups/:id`             | none     | Get a single setup                |
| PATCH  | `/setups/:id`             | required | Update a setup (owner only)       |
| DELETE | `/setups/:id`             | required | Delete a setup (owner only)       |
| POST   | `/setups/:id/set-default` | required | Set a setup as the user's default |

---

## Preferences

| Method | Endpoint       | Auth     | Description                    |
| ------ | -------------- | -------- | ------------------------------ |
| GET    | `/preferences` | required | Get current user's preferences |
| PATCH  | `/preferences` | required | Update preferences             |

```json
{
  "unitSystem": "metric",
  "temperatureUnit": "celsius",
  "theme": "coffee",
  "locale": "en",
  "emailRecipeComments": true,
  "emailRecipeLikes": true,
  "emailNewFollowers": true
}
```

---

## QR Code

| Method | Endpoint                   | Auth | Description                              |
| ------ | -------------------------- | ---- | ---------------------------------------- |
| GET    | `/qrcode/recipe/:slug.png` | none | Generate PNG QR code for a public recipe |
| GET    | `/qrcode/recipe/:slug.svg` | none | Generate SVG QR code for a public recipe |

Returns the image directly with the appropriate `Content-Type` header. The QR code encodes the
recipe's public URL.

---

## Photos

| Method | Endpoint                   | Auth     | Description                          |
| ------ | -------------------------- | -------- | ------------------------------------ |
| POST   | `/photos`                  | required | Upload a photo (multipart form-data) |
| GET    | `/photos/recipe/:recipeId` | none     | List photos for a recipe             |
| DELETE | `/photos/:id`              | required | Delete a photo (owner only)          |

`POST /photos` takes `multipart/form-data` with a `file` part (the photo; `photo` is accepted as
an alias), an optional `thumbnail` part, `recipeId`, and the optional `alt` and `sortOrder` fields.
Only the recipe's author can upload.

Upload constraints:

- **Type, by content.** The server detects the type from the file's leading bytes (JPEG, PNG or
  WebP). The allowed set is the intersection of those three with `UPLOAD_ALLOWED_TYPES` (default
  all three). The declared part Content-Type is only a hint: it is rejected when it is non-empty,
  not `application/octet-stream` and not allowed; otherwise the detected type wins.
- **Original size.** At most `UPLOAD_MAX_SIZE_BYTES` (default 10 MiB).
- **Original dimensions.** At most 16,384 px on either side and 50 megapixels in total (read from
  the image header; pixels are never decoded).
- **Thumbnail.** Optional (an absent or empty part means "no thumbnail", and `thumbnailUrl` then
  equals `url`). It is validated like the original: at most 1,200 px per side and
  `min(1 MiB, UPLOAD_MAX_SIZE_BYTES)`. An invalid thumbnail fails the whole upload and nothing is
  stored.
- **Request body cap.** Every `/photos` route accepts a body of at most
  `UPLOAD_MAX_SIZE_BYTES` + `min(1 MiB, UPLOAD_MAX_SIZE_BYTES)` + 64 KiB (about 11.06 MiB by
  default); every other route keeps the 1 MB limit.
- **Storage keys.** Keys are generated on the server: `<uuid>.<ext>` for the original and
  `<uuid>_medium.<ext>` for the thumbnail (same UUID), with `<ext>` `jpg`, `png` or `webp` taken
  from each part's detected type. The multipart filename is never read, so it cannot influence the
  key, the URL or any storage request. Stored objects get the detected type as their Content-Type.
  Photos uploaded before this change keep their old `<timestamp>-<hex>.<ext>` URLs.

Error codes (`error.details[0].field` is `file` or `thumbnail` for part errors):

| Status | Code                     | When                                                                    |
| ------ | ------------------------ | ----------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`       | Missing `file` part or invalid form fields (`recipeId`, `alt`, …)       |
| 400    | `FILE_TOO_LARGE`         | A part is over its size limit while the body is within the cap          |
| 400    | `INVALID_IMAGE`          | Malformed image header, zero dimensions, or dimensions over the limits  |
| 403    | `FORBIDDEN`              | The caller is not the recipe's author                                   |
| 404    | `NOT_FOUND`              | The recipe does not exist                                               |
| 413    | `PAYLOAD_TOO_LARGE`      | The request body is over the photo body cap (rejected before parsing)   |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | Unknown or disallowed content, or a disallowed declared type            |
| 500    | `INTERNAL_ERROR`         | Storage, filesystem or database failure (message hidden in production)  |

Error messages are fixed server strings; they never echo the declared type or the filename. The
old `UPLOAD_ERROR` catch-all, which returned internal error text, was removed.

---

## Reports

| Method | Endpoint               | Auth     | Description                                      |
| ------ | ---------------------- | -------- | ------------------------------------------------ |
| POST   | `/reports`             | required | Submit a report                                  |
| GET    | `/reports`             | admin    | List reports (filterable by status, entity type) |
| PATCH  | `/reports/:id/resolve` | admin    | Resolve a report                                 |

Report request:

```json
{
  "entityType": "recipe",
  "entityId": "uuid",
  "reason": "inappropriate_content",
  "description": "This recipe contains..."
}
```

---

## Contact

| Method | Endpoint   | Auth | Description                |
|--------|-----------|------|----------------------------|
| POST   | `/contact` | none | Submit a contact form message |

### POST /contact

Rate limited: **3 requests per 15 minutes per IP**.

Request body:

```json
{
  "name": "Jane Brewer",
  "email": "jane@example.com",
  "subject": "Feature request",
  "message": "It would be great if..."
}
```

| Field     | Type   | Required | Constraints            |
|-----------|--------|----------|------------------------|
| `name`    | string | yes      | max 100 chars          |
| `email`   | string | yes      | valid email, max 255   |
| `subject` | string | yes      | max 200 chars          |
| `message` | string | yes      | min 10 chars, max 5000 |

Response `200`:

```json
{ "success": true, "data": { "message": "Thank you for your message. We will get back to you soon." } }
```

Response `422` — validation failed (standard `VALIDATION_ERROR` envelope).
Response `429` — rate limit exceeded.

---

## Health & OpenAPI

| Method | Endpoint        | Auth | Description                             |
| ------ | --------------- | ---- | --------------------------------------- |
| GET    | `/health`       | none | Health check (`{ "status": "ok" }`)     |
| GET    | `/ready`        | none | Readiness check (tests DB connectivity) |
| GET    | `/openapi.json` | none | OpenAPI 3.0 specification JSON          |

---

## Admin

**All admin endpoints require authentication + admin role.**

### Analytics

| Method | Endpoint                       | Description                          |
| ------ | ------------------------------ | ------------------------------------ |
| GET    | `/admin/stats`                 | Dashboard statistics overview        |
| GET    | `/admin/analytics/users`       | User growth over N days (default 30) |
| GET    | `/admin/analytics/recipes`     | Recipe growth over N days            |
| GET    | `/admin/analytics/top-recipes` | Top recipes by popularity            |
| GET    | `/admin/analytics/top-users`   | Top users by activity                |

### Users Management

| Method | Endpoint                 | Description                        |
| ------ | ------------------------ | ---------------------------------- |
| GET    | `/admin/users`           | List users (searchable, paginated) |
| GET    | `/admin/users/:id`       | Get detailed user info             |
| POST   | `/admin/users`           | Create user as admin               |
| PATCH  | `/admin/users/:id`       | Partially update a user            |
| POST   | `/admin/users/:id/ban`   | Ban/unban a user                   |
| PATCH  | `/admin/users/:id/admin` | Set or remove admin role           |
| DELETE | `/admin/users/:id`       | Soft-delete a user                 |

### Recipes Management

| Method | Endpoint                        | Description                                            |
| ------ | ------------------------------- | ------------------------------------------------------ |
| GET    | `/admin/recipes`                | List all recipes (filterable by visibility, paginated) |
| PATCH  | `/admin/recipes/:id/visibility` | Change a recipe's visibility                           |
| DELETE | `/admin/recipes/:id`            | Soft-delete a recipe                                   |

### Equipment Management

| Method | Endpoint               | Description                |
| ------ | ---------------------- | -------------------------- |
| GET    | `/admin/equipment`     | List equipment (paginated) |
| POST   | `/admin/equipment`     | Create equipment           |
| PATCH  | `/admin/equipment/:id` | Update equipment           |
| DELETE | `/admin/equipment/:id` | Delete equipment           |

### Coffee Varieties Management

| Method | Endpoint                                | Description                                      |
| ------ | --------------------------------------- | ------------------------------------------------ |
| GET    | `/admin/coffee-varieties`               | List coffee varieties (paginated, filterable)    |
| POST   | `/admin/coffee-varieties`               | Create a coffee variety                          |
| PATCH  | `/admin/coffee-varieties/:id`           | Update a coffee variety                          |
| DELETE | `/admin/coffee-varieties/:id`           | Delete a coffee variety                          |
| GET    | `/admin/coffee-varieties/:id/recipe-count` | Get count of recipes using this variety       |

### Equipment Delete Requests

| Method | Endpoint                                      | Description                              |
| ------ | --------------------------------------------- | ---------------------------------------- |
| GET    | `/admin/equipment/delete-requests`            | List delete requests (filterable by status) |
| POST   | `/admin/equipment/delete-requests/:id/approve` | Approve and execute a delete request     |
| POST   | `/admin/equipment/delete-requests/:id/reject`  | Reject a delete request                  |

### Vendors Management

| Method | Endpoint             | Description              |
| ------ | -------------------- | ------------------------ |
| GET    | `/admin/vendors`     | List vendors (paginated) |
| POST   | `/admin/vendors`     | Create a vendor          |
| PATCH  | `/admin/vendors/:id` | Update a vendor          |
| DELETE | `/admin/vendors/:id` | Delete a vendor          |

### Taste Notes Management

| Method | Endpoint                 | Description                         |
| ------ | ------------------------ | ----------------------------------- |
| GET    | `/admin/taste-notes`     | List taste notes hierarchy          |
| POST   | `/admin/taste-notes`     | Create a taste note (flushes cache) |
| PATCH  | `/admin/taste-notes/:id` | Update a taste note (flushes cache) |
| DELETE | `/admin/taste-notes/:id` | Delete a taste note (flushes cache) |

### Reports Management

| Method | Endpoint                     | Description                                      |
| ------ | ---------------------------- | ------------------------------------------------ |
| GET    | `/admin/reports`             | List reports (filterable by status, entity type) |
| PATCH  | `/admin/reports/:id/resolve` | Resolve a report                                 |
| PATCH  | `/admin/reports/:id/dismiss` | Dismiss a report                                 |

### Brew Method Compatibility

| Method | Endpoint                   | Description                  |
| ------ | -------------------------- | ---------------------------- |
| GET    | `/admin/compatibility`     | List all compatibility rules |
| POST   | `/admin/compatibility`     | Create a compatibility rule  |
| PATCH  | `/admin/compatibility/:id` | Update a compatibility rule  |
| DELETE | `/admin/compatibility/:id` | Delete a compatibility rule  |

### Audit Log & Cache

| Method | Endpoint             | Description                                       |
| ------ | -------------------- | ------------------------------------------------- |
| GET    | `/admin/audit-log`   | List audit logs (filterable by entity, paginated) |
| POST   | `/admin/cache/flush` | Flush API cache (optionally by key prefix)    |

All admin mutations create an `AuditLog` entry tracking the admin user, action, entity, and details.

### Users Management (Enhanced)

#### POST /admin/users

Creates a new user with admin privileges. Uses `AdminCreateUserSchema` for validation.

```json
{
  "email": "user@example.com",
  "username": "newuser",
  "password": "securepassword",
  "displayName": "New User",
  "isAdmin": false,
  "isBanned": false
}
```

Response `201`:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "newuser",
    "displayName": "New User",
    "isAdmin": false,
    "isBanned": false,
    "createdAt": "..."
  }
}
```

Returns `409 CONFLICT` with a clear message when the email or username already exists:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Email is already registered.",
    "requestId": "req_abc123"
  }
}
```

#### PATCH /admin/users/:id

Partially updates a user. Only provided fields are modified. Returns `403 FORBIDDEN` if an admin attempts to edit their own profile via this endpoint.

```json
{
  "displayName": "Updated Name",
  "isAdmin": true
}
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "existinguser",
    "displayName": "Updated Name",
    "isAdmin": true,
    "isBanned": false,
    "updatedAt": "..."
  }
}
```

Uniqueness checks are applied when updating `email` or `username` — returns `409 CONFLICT` if the value is already taken by another non-deleted user.

#### POST /admin/users/:id/ban

Bans or unbans a user. The `reason` field is **required** when `banned` is `true`.

```json
{
  "userId": "uuid",
  "banned": true,
  "reason": "Violation of community guidelines"
}
```

```json
{
  "userId": "uuid",
  "banned": false
}
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "user",
    "displayName": null,
    "avatarUrl": null,
    "bio": null,
    "isAdmin": false,
    "isBanned": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

When `banned` is `false` the ban reason is cleared.
