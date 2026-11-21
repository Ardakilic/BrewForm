# BrewForm API Conventions

This page covers the rules every BrewForm API route follows. The per-route reference (method,
path, summary, auth, parameters and documented responses) is generated from the OpenAPI document:

- [api-reference.md](api-reference.md), regenerated with `pnpm --filter @brewform/api run docs:api`.
  CI fails when it is stale.
- The interactive Scalar UI at `/api/v1/docs` and the raw OpenAPI document at
  `/api/v1/openapi.json`, both served when `OPENAPI_ENABLED=true`.

The admin routes (`/api/v1/admin/*`) have no OpenAPI metadata yet, so the generated reference does
not list them. See [Admin routes](#admin-routes).

## Base URL and versioning

- Every JSON route lives under `/api/v1` (for example `GET /api/v1/recipes`). The machine-readable
  routes `/api/v1/sitemap.xml`, `/api/v1/openapi.json` and `/api/v1/docs` share the prefix.
- Outside the prefix: the probes `GET /health` (liveness) and `GET /ready` (readiness), the
  server-rendered share pages `GET /share/:slug`, and local upload reads `GET /uploads/*` (local
  storage driver only; streamed from disk and cacheable for a year:
  `Cache-Control: public, max-age=31536000, immutable`).
- `v1` is the only version. Changes so far have been additive (new routes, fields and optional
  parameters); a parameter that is going away is announced first (see
  [Deprecations](#deprecations)).
- Every response carries an `X-Request-ID` header. A client may send its own `X-Request-ID`; the
  API keeps a valid one and generates a UUID otherwise. The same id appears in the envelope and in
  the API logs.

## Response envelope

Every JSON response follows one envelope.

### Success

```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "req_abc123" }
}
```

List routes add pagination metadata to `meta` (see [Pagination](#pagination)).

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

`details` is present for field-level validation errors. Messages are fixed server strings; in
production a `500` never exposes internal error text.

Non-JSON routes are not wrapped: share pages return `text/html`, the sitemap `application/xml`,
QR codes `image/png` or `image/svg+xml`, and upload reads the stored image.

## Error codes

| Code                     | HTTP Status | Description                                                                    |
| ------------------------ | ----------- | ------------------------------------------------------------------------------ |
| `VALIDATION_ERROR`       | 400         | Request body/query validation failed, or a referenced record does not exist    |
| `BAD_REQUEST`            | 400         | Malformed request the framework rejects (for example invalid JSON)             |
| `INVALID_CURSOR`         | 400         | The `cursor` query parameter cannot be decoded                                 |
| `QUERY_TOO_SHORT`        | 400         | Search query needs 3+ characters                                               |
| `INVALID_RESET_TOKEN`    | 400         | Invalid password reset token                                                   |
| `TOKEN_EXPIRED`          | 400         | Reset token has expired                                                        |
| `TOKEN_USED`             | 400         | Reset token already used                                                       |
| `UNAUTHORIZED`           | 401         | Authentication required or invalid token                                       |
| `INVALID_CREDENTIALS`    | 401         | Wrong email or password                                                        |
| `INVALID_REFRESH_TOKEN`  | 401         | Invalid or expired refresh token                                               |
| `FORBIDDEN`              | 403         | Insufficient permissions                                                       |
| `USER_BANNED`            | 403         | User account is banned                                                         |
| `EMAIL_NOT_VERIFIED`     | 403         | The action needs a verified email (create, edit or merge a recipe; comment)    |
| `REGISTRATION_DISABLED`  | 403         | Self-registration is turned off                                                |
| `NOT_FOUND`              | 404         | Resource not found (some routes also use it for records the caller may not see) |
| `METHOD_NOT_ALLOWED`     | 405         | The route exists but not for this method                                       |
| `CONFLICT`               | 409         | Unique-constraint conflict (for example an email or username already in use)   |
| `SLUG_CONFLICT`          | 409         | No free recipe slug after every candidate was tried (see [recipes.md](recipes.md)) |
| `PAYLOAD_TOO_LARGE`      | 413         | Request body is over the size limit (see [Request limits](#request-limits))    |
| `UNSUPPORTED_MEDIA_TYPE` | 415         | Upload content type is unknown or not allowed                                  |
| `VALIDATION_ERROR`       | 422         | Equipment is not compatible with the recipe's brew method                     |
| `RATE_LIMITED`           | 429         | Too many requests; retry after the `Retry-After` header (see [Rate limits](#rate-limits)) |
| `INTERNAL_ERROR`         | 500         | Unexpected server error                                                        |
| `QUERY_TIMEOUT`          | 503         | A database statement ran past `DB_STATEMENT_TIMEOUT_MS`; try a narrower search |

Some routes return more specific codes (for example `RECIPE_NOT_FOUND`, `ALREADY_FOLLOWING`); each
route's documented responses are in the [reference](api-reference.md).

### Database errors

Database constraint errors map to client statuses instead of `500`
([request-lifecycle.md](request-lifecycle.md) has the full flow):

| Database error                                      | Status | `error.code`       | `error.message`                                        |
| --------------------------------------------------- | ------ | ------------------ | ------------------------------------------------------ |
| Unique violation                                    | 409    | `CONFLICT`         | `A record with this value already exists`              |
| Missing referenced row on insert or update          | 400    | `VALIDATION_ERROR` | `A referenced record does not exist`                   |
| Row still referenced on delete                      | 409    | `CONFLICT`         | `The record is still referenced by other records`      |
| Not-null, check or invalid value                    | 400    | `VALIDATION_ERROR` | `A value is invalid for this field`                    |
| Statement timeout                                   | 503    | `QUERY_TIMEOUT`    | `The query took too long. Try a more specific search.` |

Routes with a more specific message map their own constraints first: a taken email or username
answers `409` with `Email already registered` / `Username already taken`, and an exhausted recipe
slug answers `409 SLUG_CONFLICT`.

## Authentication

See [auth.md](auth.md) for the token strategy, refresh, remember-me and password reset flows.

- Authenticated routes accept the access token as an `Authorization: Bearer <accessToken>` header
  or the `brewform_access_token` cookie (the cookie is checked first). In the reference, the Auth
  column says `Bearer` for these routes.
- Some public routes read an optional token (for example a recipe detail, which shows the author
  their own `draft` or `private` recipe); they answer anonymous callers too.
- A missing or invalid token on an authenticated route answers `401 UNAUTHORIZED`; a banned user
  gets `403 USER_BANNED`. Creating, editing or merging a recipe and commenting also need a
  verified email (`403 EMAIL_NOT_VERIFIED`).
- Some routes answer `404 NOT_FOUND` for a record the caller may not see, so the response does not
  reveal that it exists (for example the private-note routes for another user's private recipe).

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

## Pagination

List routes use offset pagination by default. `GET /api/v1/recipes` and the follow feed
`GET /api/v1/follow/feed` also support cursor pagination.

### Offset pagination

| Parameter | Default | Description                    |
| --------- | ------- | ------------------------------ |
| `page`    | 1       | Page number (1-based)          |
| `perPage` | 20      | Items per page (at most 100)   |

The response carries `meta.pagination`:

```json
{ "page": 1, "perPage": 20, "total": 142, "totalPages": 8 }
```

Recipe listings break ties on `id`, so their pages never repeat or skip a recipe while the data
is unchanged.

### Cursor pagination

| Parameter      | Default | Description                                                                 |
| -------------- | ------- | --------------------------------------------------------------------------- |
| `cursor`       | —       | Opaque keyset cursor: base64url JSON `{ createdAt, id }` of the last item seen |
| `includeTotal` | `false` | Also count the matching rows and return `total` (costs an extra query)       |

- A request with `cursor` uses keyset pagination and returns `meta.cursor` instead of
  `meta.pagination`:

  ```json
  { "nextCursor": "eyJjcmVhdGVkQXQiOi...", "hasMore": true, "total": 142 }
  ```

  Pass `nextCursor` back as `cursor` for the next page; `nextCursor: null` with `hasMore: false`
  is the last page. `total` is present only with `includeTotal=true`.
- The first page is a normal request without `cursor`. To continue with keyset pagination, build
  the cursor from the last item with `encodeCursor({ createdAt, id })` from
  `@brewform/shared/utils`.
- `cursor` wins over `page` when both are sent.
- On `GET /api/v1/recipes`, cursor pagination needs `sortBy=createdAt` (the default) and no
  `search`. With another `sortBy` or an active search, the cursor is ignored and the response is
  offset page 1 (`meta.pagination`), because those orders do not follow `(createdAt, id)`.
- A malformed cursor answers `400 INVALID_CURSOR`.
- `createdAt` has millisecond precision, so the cursor's `createdAt` equals the stored value and
  keyset pages never repeat or skip a recipe.

## Recipe search and filters

`GET /api/v1/recipes` (browse) and `GET /api/v1/recipes/starred` (the caller's starred list) share
one filter set; the [reference](api-reference.md#recipes) lists every parameter. The rules:

- **`search`**: a case-insensitive substring match on the recipe title, any version's coffee name
  and personal notes. It is trimmed and limited to 200 characters (longer → `400`); a value that is
  empty after trimming means no search. `%`, `_` and `\` match literally. Results are ranked in the
  database by relevance (title 3, coffee name 2, notes 1, best single version), then by `sortBy`;
  the match is trigram-indexed (`pg_trgm`). A search uses offset pagination.
- **`author`**: case-insensitive substring of the author's username or display name (at most 100
  characters, matched literally). `authorId` is the exact-UUID alternative.
- **`dateFrom` / `dateTo`**: UTC calendar days (`YYYY-MM-DD`) on the recipe's creation time,
  inclusive on both ends and usable on their own. Timestamps are rejected with `400`.
- **`minRating` / `maxRating`**: integers 1–10 on the recipe's average rating, inclusive and usable
  on their own. Unrated recipes never match a rating filter.
- **`sortBy`**: `createdAt` (default), `likeCount` or `rating` (average rating, unrated recipes last
  in both directions); `sortOrder` is `asc` or `desc` (default). `id` breaks ties. With a search,
  `sortBy` orders recipes of equal relevance.
- **`tasteNoteIds`**: up to 10 comma-separated taste-note UUIDs, all of which must match.
- `visibility` is an admin-only filter; everyone else gets public recipes only (see
  [Visibility](#visibility)).
- List items are the recipe row plus the author projection `{ id, username, displayName }`. They
  carry no `versions` array, so version coffee names and notes never appear in list payloads; use
  `GET /api/v1/recipes/:slugOrId` for versions. A request reads at most `perPage` rows, and a query
  that runs past the database statement timeout fails with `503 QUERY_TIMEOUT`.

## Rate limits

Limits are named policies, each with its own counter. IP-keyed policies use the client address
derived from `TRUST_PROXY`; account-keyed policies use the normalised email; user-keyed policies
use the authenticated user id.

| Policy                        | Keyed on   | Limit                 | Applies to                                                  |
| ----------------------------- | ---------- | --------------------- | ----------------------------------------------------------- |
| `global`                      | IP         | `RATE_LIMIT_GLOBAL_MAX` per minute (default 100) | Every request except `/health`, `/ready` and `GET /uploads/*` |
| `uploads`                     | IP         | 600 per minute        | `GET /uploads/*`                                            |
| `auth-login-ip`               | IP         | 20 per 15 minutes     | `POST /auth/login`                                          |
| `auth-login-fail-ip`          | IP         | 100 failures per day  | Failed logins                                               |
| `auth-login-fail-account-ip`  | email + IP | 5 failures per 15 minutes | Failed logins for one account from one address          |
| `auth-login-fail-account`     | email      | 20 failures per hour  | Failed logins for one account                               |
| `auth-register-ip`            | IP         | 5 per hour            | `POST /auth/register`                                       |
| `auth-forgot-ip`              | IP         | 5 per 15 minutes      | `POST /auth/forgot-password`                                |
| `auth-forgot-account`         | email      | 3 per hour            | `POST /auth/forgot-password`                                |
| `auth-token-ip`               | IP         | 10 per 15 minutes     | `POST /auth/reset-password`, `POST /auth/verify-email`      |
| `auth-verify-send-ip`         | IP         | 10 per hour           | `POST /auth/send-verification`                              |
| `auth-verify-send-user-burst` | user       | 1 per minute          | `POST /auth/send-verification`                              |
| `auth-verify-send-user-daily` | user       | 5 per day             | `POST /auth/send-verification`                              |
| `contact-ip`                  | IP         | 3 per 15 minutes      | `POST /contact`                                             |
| `comment-ip`, `comment-user`  | IP, user   | 5 per minute each     | `POST /comments/recipe/:recipeId`                           |
| `report-ip`, `report-user`    | IP, user   | 3 per 15 minutes each | `POST /reports`                                             |

A successful password reset clears that account's login-failure counters, so a locked-out owner
can get back in.

Every limited response describes each policy it evaluated:

- `RateLimit-Policy: "<policy>";q=<limit>;w=<window seconds>` and
  `RateLimit: "<policy>";r=<remaining>;t=<seconds until reset>`
  (IETF `draft-ietf-httpapi-ratelimit-headers-11`, one list item per policy);
- the legacy `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (epoch seconds),
  describing the last policy evaluated.

Over a limit the API answers `429` with `Retry-After` (whole seconds, at least 1) and the error
envelope:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests, please try again later",
    "requestId": "req_abc123"
  }
}
```

## Request limits

- Every route accepts a request body of at most 1 MB; a larger body answers
  `413 PAYLOAD_TOO_LARGE` before it is parsed. The photo routes have their own cap (below).

### Photo uploads

`POST /api/v1/photos` takes `multipart/form-data` with a `file` part (the photo; `photo` is
accepted as an alias), an optional `thumbnail` part, `recipeId`, and the optional `alt` and
`sortOrder` fields. Only the recipe's author can upload.

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
  default).
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

Error messages never echo the declared type or the filename. The old `UPLOAD_ERROR` catch-all,
which returned internal error text, was removed.

## Visibility

Recipes and collections share four `visibility` values, each with one meaning:

| Value      | Meaning                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------- |
| `public`   | Listed on discovery surfaces and indexable                                                    |
| `unlisted` | Direct link only: opens for anyone with its URL or id; never listed, searched, counted on public lists or indexed |
| `private`  | Visible only to its author (collection: owner)                                                |
| `draft`    | Visible only to its author (collection: owner)                                                |

**unlisted = direct link only; never listed, searched, counted on public lists or indexed.**
Unlisted is "not listed", not "secret": a slug derived from the title can be guessed.

Every surface belongs to one class, and the class decides which recipes it shows:

| Class | Surfaces | Recipes shown |
| ----- | -------- | ------------- |
| Discovery (the same for every viewer) | `GET /recipes` browse, search, filters and sorts (non-admin); the home grids; the follow feed `GET /follow/feed`; `GET /equipment/:id/recipes` and `GET /coffee-varieties/:id/recipes`; the `recipes` array and `recipeCount` of `GET /users/:username` (for every viewer, the profile owner included); the sitemap; share and crawler Open Graph pages | Non-deleted `public` only, for every viewer including the recipe's author |
| Collection items (mixed authors) | Collection detail items and collection `recipeCount` | Non-deleted `public`, plus recipes authored by the viewer (see [Visibility of items](#visibility-of-items)) |
| Direct link | Recipe detail by slug or id, versions, version diff, compare and merge, focus mode, fork, comments, like, favourite, rating, brew-log create, QR code, collection detail by id | `public` and `unlisted` for anyone; `draft` and `private` for the author |
| Viewer-only records | The caller's own Starred list (`GET /recipes/starred`) and own brew journal (`GET /brew-logs`) | Entries the caller can open (see below) |
| Owner-only lists | `GET /collections`, and `GET /users/:userId/collections` when the caller is that user | Every visibility of the owner's own collections |
| Admin | `/admin/*`, and `GET /recipes` when an admin passes `visibility` | Exempt from these rules |

> **Known gap (D99.25).** Like, favourite and rating are listed under "Direct link" because that is
> the intended rule, but today `POST /recipes/:id/like`, `/favourite` and `/rate` (and
> `GET /photos/recipe/:recipeId`) do not check visibility: a caller who knows a `draft` or
> `private` recipe's id can use them. Tracked in [`plans/D99-debts.md`](../plans/D99-debts.md).

- Discovery lists are viewer-independent: an author does not see their own `unlisted`, `draft` or
  `private` recipes on them, their own profile included. There is no "my recipes" listing; an
  author reaches an unlisted recipe through its link.
- **Starred** includes the `unlisted` recipes the caller favourited, and the caller's own `draft`
  and `private` recipes. Another author's recipe that became `private` or `draft`, or was deleted,
  drops out. Only the caller can read the list.
- **Brew journal**: `POST /brew-logs` accepts any recipe the caller can open (an `unlisted` recipe
  included, for any signed-in link holder); the journal keeps every non-deleted recipe the caller
  logged, and the log is visible only to its owner.
- **Fork fields** are `null` unless the source is public: `forkedFromId` on every list row
  (`GET /recipes`, the feed, the equipment and coffee-variety pages, collection items), and
  `forkedFrom`, `forkedFromId` and `forkedFromSlug` on the recipe detail and the `PATCH /recipes/:id`
  response. A source that is `unlisted`, `private`, `draft` or deleted is masked, because an
  unlisted recipe's id works as its link. On the recipe detail, the source's own author still sees
  the attribution (`forkedFrom` is `{ id, slug, title }`, never the source's visibility). The stored
  fork link and `forkCount` are unchanged.
- **`X-Robots-Tag: noindex, nofollow`** is set on `GET /recipes/:slugOrId`,
  `GET /recipes/:slug/versions` and `GET /recipes/:slug/versions/diff` for a recipe that is not
  `public` (for the author too), on `GET /collections/:id` for a collection that is not `public`,
  on every `404` from `GET /share/:slug` (an unknown slug and a non-public recipe get the identical
  status, body and header), and on crawler fall-throughs for `/recipes/:slug` paths. Share,
  crawler and `GET /recipes/meta/:slug` serve previews for `public` recipes only.
- **Admin exemption**: the admin module, and an admin's `visibility` filter on `GET /recipes`,
  are exempt. An admin without the filter gets the public discovery list.

### Visibility of items

Collections hold recipes from several authors, so their items follow these rules:

- Collection items follow the recipe listing rule: a `public` recipe is shown to everyone, while
  `unlisted`, `private` and `draft` recipes are shown only to their own author. A soft-deleted
  recipe is shown to nobody.
- Owning the collection grants nothing: the owner does not see another author's recipe that is, or
  later becomes, non-public. A recipe that changes visibility or is deleted disappears on the next
  request, even while the collection detail is cached.
- Counts follow the audience: `recipeCount` on a detail equals the items returned; the owner's own
  list counts the owner's own non-public recipes; public lists (`/collections/public`, and
  `/users/:userId/collections` for anyone but that user) count public recipes only.
- Adding a recipe: the owner can add their own recipes of any visibility and other authors'
  `public` recipes. Removing works whether or not the recipe is still visible.
- Reorder sends the ids of the items the owner sees; hidden items keep their relative order after
  them.
- An `unlisted` collection opens for anyone with its direct link (`GET /collections/:id`, items
  filtered as above) and is never listed to anyone but its owner. `private` and `draft`
  collections return `403` to everyone else.

## Partial updates

`PATCH` bodies change only the keys they contain. `PATCH /api/v1/recipes/:id` defines the full
rule set (see [recipes.md](recipes.md) for versioning):

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
- A relation array with the same id twice is a `400 VALIDATION_ERROR`, and so is a longer list
  than a version holds: at most 20 `additionalPreparations` and at most 50 `tasteNoteIds` or
  `equipmentIds` (the same limits apply on create).
- `bumpVersion: false` (the default) amends the current version in place; `bumpVersion: true`
  creates a new version that carries forward every value and relation the body does not provide
  (scalar fields, taste notes with intensities, equipment, additional preparations and version
  photos). Earlier versions are never modified, and the write is all-or-nothing: validation,
  referenced records and equipment compatibility are checked before the first write.
- Referenced records are checked only when the body sets them newly: an id already linked to the
  current version is accepted even if the record was deleted since, and re-sending the current
  `coffeeVarietyId` keeps the stored `coffeeVarietyName`.
- Computed fields (`brewRatio`, `flowRate`) and copied names (`coffeeVarietyName`) are set by the
  API and ignored when sent; `tds` is returned as a two-decimal string such as `"1.35"`.

```json
{ "grindSize": "medium", "grinder": null, "tasteNoteIds": [], "bumpVersion": false }
```

## Private data

Some records belong to the caller alone, for example the per-recipe private note
(`GET`, `PUT` and `DELETE /api/v1/recipes/:id/notes`):

- The user comes from the access token; nothing in the request can name another user, and admins
  cannot read other users' private notes either.
- A recipe that does not exist, is deleted or is not viewable by the caller answers
  `404 NOT_FOUND`.
- Every response, success or error, carries `Cache-Control: private, no-store`. Private notes are
  never embedded in the recipe detail payload, search, feeds or crawler metadata, and a deleted
  note's text is scrubbed.
- Private notes are separate from the author's public brewer notes (`personalNotes` on a version,
  edited through `PATCH /recipes/:id`). The legacy `POST /recipes/:id/notes`, which overwrote the
  author's brewer notes, was removed in wave 6 and answers `404`.

## Deprecations

A deprecated parameter keeps working until it is removed, and every response that used it carries
an RFC 8594 `Deprecation: true` header (the API also logs a warning).

| Deprecated                        | Replacement                                  | Removal                                          |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `tasteNoteId` on `GET /recipes`   | `tasteNoteIds` (comma-separated, up to 10)   | D44 in the [roadmap](../plans/ROADMAP.md), once telemetry shows no significant callers |

## Admin routes

Every `/api/v1/admin/*` route requires an authenticated admin (`403 FORBIDDEN` otherwise), is
exempt from the [visibility](#visibility) rules, and writes an audit-log entry for every mutation.
These routes have no OpenAPI metadata yet, so the generated reference does not list them; the
route definitions are in `apps/api/src/modules/admin/index.ts`. Rules clients rely on:

- Creating or updating a user checks email and username uniqueness like registration and answers
  `409 CONFLICT` when the value is taken by another non-deleted user.
- An admin cannot edit or delete their own account through the admin user routes (`403`).
- Banning a user requires a `reason`; unbanning clears it.
