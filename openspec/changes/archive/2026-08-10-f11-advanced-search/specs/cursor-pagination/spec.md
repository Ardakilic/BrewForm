# cursor-pagination Specification

## MODIFIED Requirements

### Requirement: Fallback to offset pagination

When `cursor` is provided but `sortBy` is `likeCount` or `rating`, the system SHALL
fall back to offset-based pagination using `page` and `perPage` (defaults: `page=1`, `perPage=20`).

**F11 extension:** When `cursor` is provided but `search` is active (non-empty after sanitization), the system SHALL fall back to offset-based pagination. This is because relevance ranking (applied when `search` is active) reorders results in application code, making a `(createdAt, id)` keyset cursor non-deterministic — a keyset page boundary would skip high-rank items.

The system SHALL log a debug-level message when the search-active fallback occurs: `log.debug({ search: filters.search }, 'Search active, falling back to offset pagination for ranking')`.

The system SHALL log a warning when the `sortBy`-incompatible fallback occurs: `log.warn({ sortBy }, 'Cursor pagination incompatible with sortBy, falling back to offset')`.

When `cursor` is provided, `search` is absent, and `sortBy` is `createdAt`, cursor-based query SHALL be used.

When no `cursor` is provided, offset-based pagination SHALL be used regardless of `sortBy` or `search`.

#### Scenario: Cursor with sortBy=likeCount falls back to offset

- When `GET /api/v1/recipes?cursor=eyJ...&sortBy=likeCount` is called
- Then the response uses offset pagination with `page=1`, `perPage=20`
- And the response meta contains `pagination` (not `cursor`)
- And a warning is logged

#### Scenario: Cursor with search falls back to offset (NEW)

- When `GET /api/v1/recipes?cursor=eyJ...&search=espresso` is called
- Then the response uses offset pagination with `page=1`, `perPage=20`
- And the response meta contains `pagination` (not `cursor`)
- And a debug log is emitted: `Search active, falling back to offset pagination for ranking`

#### Scenario: No cursor, any sortBy uses offset

- When `GET /api/v1/recipes?page=2&perPage=10&sortBy=likeCount` is called
- Then the response uses offset pagination with `page=2`, `perPage=10`

#### Scenario: No search + cursor + sortBy=createdAt uses cursor (unchanged)

- When `GET /api/v1/recipes?cursor=eyJ...&sortBy=createdAt` is called
- Then the response uses cursor pagination with `meta.cursor` (unchanged from D27)
