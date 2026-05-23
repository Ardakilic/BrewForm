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

| Code                    | HTTP Status | Description                              |
| ----------------------- | ----------- | ---------------------------------------- |
| `VALIDATION_ERROR`      | 400         | Request body/query validation failed     |
| `UNAUTHORIZED`          | 401         | Authentication required or invalid token |
| `FORBIDDEN`             | 403         | Insufficient permissions                 |
| `NOT_FOUND`             | 404         | Resource not found                       |
| `CONFLICT`              | 409         | Duplicate resource (email/username)      |
| `USER_BANNED`           | 403         | User account is banned                   |
| `INVALID_CREDENTIALS`   | 401         | Wrong email or password                  |
| `INVALID_REFRESH_TOKEN` | 401         | Invalid or expired refresh token         |
| `INVALID_RESET_TOKEN`   | 400         | Invalid password reset token             |
| `TOKEN_EXPIRED`         | 400         | Reset token has expired                  |
| `TOKEN_USED`            | 400         | Reset token already used                 |
| `QUERY_TOO_SHORT`       | 400         | Search query needs 3+ characters         |
| `INTERNAL_ERROR`        | 500         | Unexpected server error                  |

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
| `tasteNoteId`  | —             | Single taste note UUID (deprecated, use tasteNoteIds)  |
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

See [docs/recipes.md](recipes.md) for versioning, forking, and validation rules.

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

### Equipment Types

`portafilter`, `basket`, `puck_screen`, `paper_filter`, `tamper`, `gooseneck_kettle`, `mesh_filter`,
`cezve`, `scale`, `thermometer`, `other`

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

Upload constraints:

- Max size: 10 MB (configurable via `UPLOAD_MAX_SIZE_BYTES`)
- Allowed types: `image/jpeg`, `image/png`, `image/webp`

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
| POST   | `/admin/cache/flush` | Flush Deno KV cache (optionally by key prefix)    |

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
