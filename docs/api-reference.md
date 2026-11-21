# BrewForm API reference

> **Generated — do not edit.** Rendered from the OpenAPI document served at
> `/api/v1/openapi.json` by `apps/api/scripts/generate-api-reference.ts`. After changing a
> route's `describeRoute()` metadata, regenerate it with
> `pnpm --filter @brewform/api run docs:api`; CI fails when this file is stale.
> Cross-cutting conventions (base URL, envelopes, error codes, authentication, pagination,
> rate limits, deprecations) live in [api.md](api.md). The interactive reference is the
> Scalar UI at `/api/v1/docs` (when `OPENAPI_ENABLED=true`).

BrewForm API 1.0.0: 124 operations in 24 sections. Auth `Bearer` means the route requires `Authorization: Bearer <access token>`; `—` means it is public. Path parameters are always required.

## Contents

- [Auth](#auth) (9)
- [Recipes](#recipes) (19)
- [Users](#users) (4)
- [Admin](#admin) (7)
- [Health](#health) (2)
- [Beans](#beans) (5)
- [Badges](#badges) (3)
- [Brew Logs](#brew-logs) (8)
- [Coffee Varieties](#coffee-varieties) (7)
- [Collections](#collections) (10)
- [Comments](#comments) (3)
- [Contact](#contact) (1)
- [Equipment](#equipment) (8)
- [Follow](#follow) (5)
- [Notifications](#notifications) (4)
- [Photos](#photos) (3)
- [Preferences](#preferences) (2)
- [QR Codes](#qr-codes) (1)
- [Reports](#reports) (3)
- [Setups](#setups) (6)
- [Taste Notes](#taste-notes) (6)
- [Vendors](#vendors) (6)
- [Share](#share) (1)
- [Sitemap](#sitemap) (1)

## Auth

Registration, login, password reset, token refresh

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/forgot-password` | Request a password reset email | — | — | 200, 429 |
| `POST` | `/api/v1/auth/login` | Log in with email and password | — | — | 200, 401, 403, 429 |
| `POST` | `/api/v1/auth/logout` | Log out and clear auth cookies | — | — | 200 |
| `POST` | `/api/v1/auth/refresh` | Exchange a refresh token for a new access token | — | — | 200, 401 |
| `POST` | `/api/v1/auth/register` | Register a new account | — | — | 201, 403, 409, 429 |
| `GET` | `/api/v1/auth/registration-status` | Check if new user registration is enabled | — | — | 200 |
| `POST` | `/api/v1/auth/reset-password` | Confirm a password reset | — | — | 200, 400, 429 |
| `POST` | `/api/v1/auth/send-verification` | Resend email verification link | Bearer | — | 200, 401, 429 |
| `POST` | `/api/v1/auth/verify-email` | Verify email address with token | — | — | 200, 400, 429 |

## Recipes

Recipe CRUD, fork, like/favourite/feature toggles

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/recipes` | List recipes | — | `page` (query, integer)<br>`perPage` (query, integer)<br>`sortBy` (query, createdAt \| likeCount \| rating)<br>`sortOrder` (query, asc \| desc)<br>`cursor` (query, string)<br>`includeTotal` (query, boolean)<br>`search` (query, string)<br>`brewMethod` (query, string)<br>`drinkType` (query, string)<br>`visibility` (query, string)<br>`authorId` (query, uuid)<br>`equipmentId` (query, uuid)<br>`mainBrewer` (query, string)<br>`coffeeVarietyId` (query, uuid)<br>`author` (query, string)<br>`dateFrom` (query, date)<br>`dateTo` (query, date)<br>`minRating` (query, integer)<br>`maxRating` (query, integer)<br>`tasteNoteId` (query, uuid)<br>`tasteNoteIds` (query, string) | 200, 400, 503 |
| `POST` | `/api/v1/recipes` | Create a recipe | Bearer | — | 201, 400, 401, 403, 409 |
| `POST` | `/api/v1/recipes/merge` | Merge two recipe versions | Bearer | — | 201, 400, 401, 403, 404, 409 |
| `GET` | `/api/v1/recipes/meta/{slug}` | Get recipe metadata for share previews | — | `slug` (path, string) | 200, 404 |
| `GET` | `/api/v1/recipes/starred` | List starred (favourited) recipes | Bearer | `page` (query, integer)<br>`perPage` (query, integer)<br>`sortBy` (query, createdAt \| likeCount \| rating)<br>`sortOrder` (query, asc \| desc)<br>`search` (query, string)<br>`tasteNoteId` (query, uuid)<br>`tasteNoteIds` (query, string) | 200, 400, 401, 503 |
| `PATCH` | `/api/v1/recipes/{id}` | Update a recipe | Bearer | `id` (path, uuid) | 200, 400, 401, 403, 404, 409, 422 |
| `DELETE` | `/api/v1/recipes/{id}` | Soft-delete a recipe | Bearer | `id` (path, string) | 200, 403, 404 |
| `POST` | `/api/v1/recipes/{id}/favourite` | Toggle the favourite flag on a recipe | Bearer | `id` (path, string) | 200, 404 |
| `POST` | `/api/v1/recipes/{id}/feature` | Toggle the featured flag on a recipe | Bearer | `id` (path, string) | 200, 403, 404 |
| `POST` | `/api/v1/recipes/{id}/fork` | Fork a recipe | Bearer | `id` (path, string) | 201, 400, 403, 404, 409 |
| `POST` | `/api/v1/recipes/{id}/like` | Toggle the like on a recipe | Bearer | `id` (path, string) | 200, 404 |
| `GET` | `/api/v1/recipes/{id}/notes` | Get my private note on a recipe | Bearer | `id` (path, uuid) | 200, 400, 401, 404 |
| `PUT` | `/api/v1/recipes/{id}/notes` | Create or replace my private note on a recipe | Bearer | `id` (path, uuid) | 200, 400, 401, 404 |
| `DELETE` | `/api/v1/recipes/{id}/notes` | Delete my private note on a recipe | Bearer | `id` (path, uuid) | 200, 400, 401, 404 |
| `POST` | `/api/v1/recipes/{id}/rate` | Rate a recipe (1–10) | Bearer | `id` (path, string) | 200, 400, 404 |
| `GET` | `/api/v1/recipes/{slugOrId}` | Get a recipe by slug or id | — | `slugOrId` (path, string) | 200, 404 |
| `GET` | `/api/v1/recipes/{slugOrId}/collections` | List collections containing a recipe | — | `slugOrId` (path, string) | 200, 404 |
| `GET` | `/api/v1/recipes/{slug}/versions` | List recipe version history | — | `slug` (path, string) | 200, 404 |
| `GET` | `/api/v1/recipes/{slug}/versions/diff` | Diff two versions of a recipe | — | `slug` (path, string)<br>`v1` (query, required, uuid)<br>`v2` (query, required, uuid) | 200, 400, 401, 404 |

## Users

Public user profiles and the authenticated user

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/users/me` | Get the authenticated user profile | Bearer | — | 200, 401, 404 |
| `PATCH` | `/api/v1/users/me` | Update the authenticated user profile | Bearer | — | 200, 401 |
| `DELETE` | `/api/v1/users/me` | Delete the authenticated user account | Bearer | — | 200, 401 |
| `GET` | `/api/v1/users/{username}` | Get a public user profile | — | `username` (path, string) | 200, 404 |

## Admin

Privileged admin operations (requires admin role)

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/analytics/recipes` | Recipe creation growth over a window of days | Bearer | — | 200 |
| `GET` | `/api/v1/admin/analytics/top-recipes` | Top recipes leaderboard | Bearer | — | 200 |
| `GET` | `/api/v1/admin/analytics/top-users` | Top users leaderboard | Bearer | — | 200 |
| `GET` | `/api/v1/admin/analytics/users` | User signup growth over a window of days | Bearer | — | 200 |
| `GET` | `/api/v1/admin/stats` | Dashboard summary stats | Bearer | — | 200 |
| `PATCH` | `/api/v1/admin/users/{id}/admin` | Set or clear admin role on a user | Bearer | `id` (path, string) | 200, 401, 404 |
| `POST` | `/api/v1/admin/users/{id}/ban` | Ban or unban a user | Bearer | `id` (path, string) | 200, 401, 404 |

## Health

Liveness and readiness probes

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/health` | Liveness probe | — | — | 200 |
| `GET` | `/ready` | Readiness probe | — | — | 200, 503 |

## Beans

Coffee bean inventory owned by users

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/beans` | List beans | Bearer | `page` (query, integer)<br>`perPage` (query, integer) | 200, 401 |
| `POST` | `/api/v1/beans` | Create a bean | Bearer | — | 201, 401 |
| `GET` | `/api/v1/beans/{id}` | Get a bean by id | — | `id` (path, string) | 200, 404 |
| `PATCH` | `/api/v1/beans/{id}` | Update a bean | Bearer | `id` (path, string) | 200, 401, 403, 404 |
| `DELETE` | `/api/v1/beans/{id}` | Delete a bean | Bearer | `id` (path, string) | 200, 401, 403, 404 |

## Badges

Achievement badges and per-user awards

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/badges` | List badges | — | — | 200 |
| `POST` | `/api/v1/badges/evaluate/{userId}` | Evaluate a user's badges | Bearer | `userId` (path, string) | 200, 401, 403 |
| `GET` | `/api/v1/badges/user/{userId}` | List a user's badges | — | `userId` (path, string) | 200 |

## Brew Logs

Personal brew journal entries and brew stats

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/brew-logs` | List my brew logs | Bearer | `page` (query, integer)<br>`perPage` (query, integer) | 200, 400, 401 |
| `POST` | `/api/v1/brew-logs` | Create a brew log | Bearer | — | 201, 400, 401, 404 |
| `GET` | `/api/v1/brew-logs/recipe/{recipeId}` | List my brew logs for a recipe | Bearer | `recipeId` (path, uuid)<br>`page` (query, integer)<br>`perPage` (query, integer) | 200, 400, 401 |
| `GET` | `/api/v1/brew-logs/stats/recipe/{recipeId}` | Get recipe brew stats | — | `recipeId` (path, uuid) | 200, 400 |
| `GET` | `/api/v1/brew-logs/stats/user` | Get my brew stats | Bearer | — | 200, 401 |
| `GET` | `/api/v1/brew-logs/{id}` | Get one of my brew logs | Bearer | `id` (path, uuid) | 200, 400, 401, 404 |
| `PATCH` | `/api/v1/brew-logs/{id}` | Update a brew log | Bearer | `id` (path, uuid) | 200, 400, 401, 404 |
| `DELETE` | `/api/v1/brew-logs/{id}` | Delete a brew log | Bearer | `id` (path, uuid) | 200, 400, 401, 404 |

## Coffee Varieties

Coffee cultivar reference data and recipes using a variety

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/coffee-varieties` | List coffee varieties | — | — | 200 |
| `POST` | `/api/v1/coffee-varieties` | Create a coffee variety | Bearer | — | 201, 400, 401 |
| `GET` | `/api/v1/coffee-varieties/search` | Search coffee varieties | — | `q` (query, required, string) | 200 |
| `GET` | `/api/v1/coffee-varieties/{id}` | Get a coffee variety by id | — | `id` (path, string) | 200, 404 |
| `PATCH` | `/api/v1/coffee-varieties/{id}` | Update a coffee variety | Bearer | `id` (path, string) | 200, 400, 401, 403, 404 |
| `DELETE` | `/api/v1/coffee-varieties/{id}` | Delete a coffee variety | Bearer | `id` (path, string) | 200, 400, 401, 403, 404 |
| `GET` | `/api/v1/coffee-varieties/{id}/recipes` | List recipes using a coffee variety | — | `id` (path, string)<br>`page` (query, integer)<br>`perPage` (query, integer) | 200 |

## Collections

User-owned named collections of recipes

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/collections` | List my collections | Bearer | `page` (query, integer)<br>`perPage` (query, integer)<br>`visibility` (query, draft \| private \| unlisted \| public)<br>`recipeId` (query, string) | 200, 400, 401 |
| `POST` | `/api/v1/collections` | Create a collection | Bearer | — | 201, 400, 401 |
| `GET` | `/api/v1/collections/public` | Browse all public collections | — | `page` (query, integer)<br>`perPage` (query, integer) | 200, 400 |
| `GET` | `/api/v1/collections/{id}` | Get a collection | — | `id` (path, string) | 200, 403, 404 |
| `PATCH` | `/api/v1/collections/{id}` | Update a collection | Bearer | `id` (path, string) | 200, 400, 401, 403, 404 |
| `DELETE` | `/api/v1/collections/{id}` | Delete a collection | Bearer | `id` (path, string) | 200, 401, 403, 404 |
| `POST` | `/api/v1/collections/{id}/recipes` | Add a recipe to a collection | Bearer | `id` (path, string) | 201, 400, 401, 403, 404, 409 |
| `DELETE` | `/api/v1/collections/{id}/recipes/{recipeId}` | Remove a recipe from a collection | Bearer | `id` (path, string)<br>`recipeId` (path, string) | 200, 401, 403, 404 |
| `PATCH` | `/api/v1/collections/{id}/reorder` | Reorder recipes in a collection | Bearer | `id` (path, string) | 200, 400, 401, 403, 404 |
| `GET` | `/api/v1/users/{userId}/collections` | List a user's collections | — | `userId` (path, string)<br>`page` (query, integer)<br>`perPage` (query, integer) | 200, 400 |

## Comments

Recipe comment threads and replies

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/comments/recipe/{recipeId}` | List comments for a recipe | — | `recipeId` (path, string)<br>`page` (query, integer)<br>`perPage` (query, integer) | 200, 404 |
| `POST` | `/api/v1/comments/recipe/{recipeId}` | Create a comment on a recipe | Bearer | `recipeId` (path, string) | 201, 400, 401, 403, 404, 429 |
| `DELETE` | `/api/v1/comments/{id}` | Delete a comment | Bearer | `id` (path, string) | 200, 401, 403, 404 |

## Contact

Contact-form message submission

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/v1/contact` | Submit a contact message | — | — | 200, 429, 500 |

## Equipment

Brewing equipment catalogue and deletion requests

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/equipment` | List equipment | — | — | 200 |
| `POST` | `/api/v1/equipment` | Create equipment | Bearer | — | 201, 401 |
| `GET` | `/api/v1/equipment/search` | Search equipment | — | `q` (query, required, string) | 200 |
| `GET` | `/api/v1/equipment/{id}` | Get equipment by id | — | `id` (path, string) | 200, 404 |
| `PATCH` | `/api/v1/equipment/{id}` | Update equipment | Bearer | `id` (path, string) | 200, 401, 403, 404 |
| `DELETE` | `/api/v1/equipment/{id}` | Delete equipment | Bearer | `id` (path, string) | 200, 401, 403, 404 |
| `POST` | `/api/v1/equipment/{id}/delete-request` | Request equipment deletion | Bearer | `id` (path, string)<br>`reason` (query, string) | 201, 401, 404 |
| `GET` | `/api/v1/equipment/{id}/recipes` | List recipes using a piece of equipment | — | `id` (path, string)<br>`page` (query, integer)<br>`perPage` (query, integer) | 200 |

## Follow

Follow/unfollow, follower/following lists, and feed

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/follow/feed` | Get the followed-users feed | Bearer | `page` (query, integer)<br>`perPage` (query, integer)<br>`cursor` (query, string) | 200, 400, 401 |
| `POST` | `/api/v1/follow/{userId}` | Follow a user | Bearer | `userId` (path, string) | 201, 400, 401, 409 |
| `DELETE` | `/api/v1/follow/{userId}` | Unfollow a user | Bearer | `userId` (path, string) | 200, 401, 404 |
| `GET` | `/api/v1/follow/{userId}/followers` | List followers | — | `userId` (path, string)<br>`page` (query, integer)<br>`perPage` (query, integer) | 200 |
| `GET` | `/api/v1/follow/{userId}/following` | List following | — | `userId` (path, string)<br>`page` (query, integer)<br>`perPage` (query, integer) | 200 |

## Notifications

In-app notification feed and read-state management

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/notifications` | List my notifications | Bearer | `page` (query, integer)<br>`perPage` (query, integer)<br>`unreadOnly` (query, boolean) | 200, 400, 401 |
| `PATCH` | `/api/v1/notifications/read-all` | Mark all my notifications as read | Bearer | — | 200, 401 |
| `GET` | `/api/v1/notifications/unread-count` | Get my unread notification count | Bearer | — | 200, 401 |
| `PATCH` | `/api/v1/notifications/{id}/read` | Mark a notification as read | Bearer | `id` (path, string) | 200, 401, 403, 404 |

## Photos

Recipe photo upload and listing

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/v1/photos` | Upload a recipe photo | Bearer | — | 201, 400, 401, 403, 404, 413, 415 |
| `GET` | `/api/v1/photos/recipe/{recipeId}` | List photos for a recipe | — | `recipeId` (path, string) | 200 |
| `DELETE` | `/api/v1/photos/{id}` | Delete a photo | Bearer | `id` (path, string) | 200, 401, 403, 404 |

## Preferences

Per-user application and notification preferences

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/preferences` | Get preferences | Bearer | — | 200, 401, 404 |
| `PATCH` | `/api/v1/preferences` | Update preferences | Bearer | — | 200, 401 |

## QR Codes

Recipe QR-code image generation

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/qrcode/recipe/{filename}` | Get a recipe QR code image | — | `filename` (path, string) | 200, 404 |

## Reports

Content moderation reports

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/reports` | List reports | Bearer | `page` (query, integer)<br>`perPage` (query, integer)<br>`status` (query, string) | 200, 401, 403 |
| `POST` | `/api/v1/reports` | Create a report | Bearer | — | 201, 401, 429 |
| `PATCH` | `/api/v1/reports/{id}/resolve` | Resolve a report | Bearer | `id` (path, string) | 200, 401, 403, 404, 409 |

## Setups

Saved brewing-equipment setups

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/setups` | List setups | Bearer | `page` (query, integer)<br>`perPage` (query, integer) | 200, 401 |
| `POST` | `/api/v1/setups` | Create a setup | Bearer | — | 201, 401 |
| `GET` | `/api/v1/setups/{id}` | Get a setup by id | — | `id` (path, string) | 200, 404 |
| `PATCH` | `/api/v1/setups/{id}` | Update a setup | Bearer | `id` (path, string) | 200, 401, 403, 404 |
| `DELETE` | `/api/v1/setups/{id}` | Delete a setup | Bearer | `id` (path, string) | 200, 401, 403, 404 |
| `POST` | `/api/v1/setups/{id}/set-default` | Set a setup as default | Bearer | `id` (path, string) | 200, 401, 403, 404 |

## Taste Notes

Taste-note hierarchy, search, and admin management

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/v1/taste-notes` | Create a taste note | Bearer | — | 201, 401, 403 |
| `GET` | `/api/v1/taste-notes/flat` | Get the flat taste-note list | — | — | 200 |
| `GET` | `/api/v1/taste-notes/hierarchy` | Get the taste-note hierarchy | — | — | 200 |
| `GET` | `/api/v1/taste-notes/search` | Search taste notes | — | `search` (query, string) | 200, 400 |
| `PATCH` | `/api/v1/taste-notes/{id}` | Update a taste note | Bearer | `id` (path, string) | 200, 401, 403 |
| `DELETE` | `/api/v1/taste-notes/{id}` | Delete a taste note | Bearer | `id` (path, string) | 200, 401, 403 |

## Vendors

Coffee vendor/roaster directory

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/vendors` | List vendors | — | `page` (query, integer)<br>`perPage` (query, integer) | 200 |
| `POST` | `/api/v1/vendors` | Create a vendor | Bearer | — | 201, 401 |
| `GET` | `/api/v1/vendors/search` | Search vendors | — | `q` (query, required, string) | 200 |
| `GET` | `/api/v1/vendors/{id}` | Get a vendor by id | — | `id` (path, string) | 200, 404 |
| `PATCH` | `/api/v1/vendors/{id}` | Update a vendor | Bearer | `id` (path, string) | 200, 401, 403, 404 |
| `DELETE` | `/api/v1/vendors/{id}` | Delete a vendor | Bearer | `id` (path, string) | 200, 401, 403, 404 |

## Share

Server-rendered share/OG preview pages

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/share/{slug}` | Get a recipe share/OG preview page | — | `slug` (path, string) | 200, 404 |

## Sitemap

XML sitemap for crawlers

| Method | Path | Summary | Auth | Parameters | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/v1/sitemap.xml` | Get the XML sitemap | — | — | 200 |
