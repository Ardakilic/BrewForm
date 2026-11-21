## MODIFIED Requirements

### Requirement: Diff endpoint

The system SHALL expose `GET /api/v1/recipes/:slug/versions/diff?v1=<uuid>&v2=<uuid>`.

- Auth: optional (public and unlisted recipes viewable by anyone; private/draft only by the author, with no admin bypass, as for the recipe detail)
- The endpoint SHALL return a JSON envelope with the diff payload
- Query params `v1` and `v2` MUST be required UUIDs identifying two `recipe_version` rows
- Both versions MUST belong to the recipe identified by `:slug`
- The endpoint SHALL reject `v1 === v2` with 400 VALIDATION_ERROR
- Response SHALL be `VersionDiffOutputSchema` wrapped in `successEnvelope`
- The route MUST be registered BEFORE the catch-all `/:slugOrId` route (same ordering as `/:slug/versions`)

#### Scenario: Public recipe diff by anonymous user
- **WHEN** an anonymous user requests the diff between v1 and v3 of a public recipe with 3 versions
- **THEN** the response is 200 with the full diff payload

#### Scenario: Private recipe diff by non-author
- **WHEN** user B requests a version diff of a private recipe owned by user A
- **THEN** the response is 404 NOT_FOUND (existence-hiding)

#### Scenario: Missing query params
- **WHEN** a request for a public recipe omits `v2`
- **THEN** the response is 400 VALIDATION_ERROR

#### Scenario: Same version requested twice
- **WHEN** a request for a public recipe sets both `v1` and `v2` to the same UUID
- **THEN** the response is 400 VALIDATION_ERROR

### Requirement: Authorization

The system SHALL authorize the diff with `canViewRecipe(recipe, userId)` and no admin flag, exactly like the sibling `GET /:slug/versions` and `GET /:slugOrId` routes, so `draft` and `private` recipes are diffable only by their author.
Non-visible recipes SHALL return 404 (existence-hiding), not 403.

#### Scenario: Admin cannot diff another user's private recipe
- **WHEN** an admin who is not the author requests a version diff of a private recipe
- **THEN** the response is 404 `NOT_FOUND` "Recipe not found", the same answer the recipe detail and version list give that admin

#### Scenario: Author diffs their own private recipe
- **WHEN** the author requests a version diff of their private recipe
- **THEN** the response is 200 with the diff payload
