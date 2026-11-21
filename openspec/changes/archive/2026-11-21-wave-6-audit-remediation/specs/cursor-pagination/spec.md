## MODIFIED Requirements

### Requirement: Fallback to offset pagination

When `cursor` is provided but `sortBy` is `likeCount` or `rating`, the system SHALL
fall back to offset-based pagination using `page` and `perPage` (defaults: `page=1`, `perPage=20`).

**F11 extension:** When `cursor` is provided but `search` is active (non-empty after sanitization), the system SHALL fall back to offset-based pagination. This is because relevance ranking (applied when `search` is active) orders results by a relevance score that the database computes per request (wave 6, `advanced-search` "Database-side relevance ranking"), so a `(createdAt, id)` keyset cursor does not follow the result order — a keyset page boundary would skip high-rank items. The fallback behaviour is unchanged by wave 6; only the ranking moved from application code into SQL. Keyset paging on the score is a deferred follow-up.

The system SHALL log a debug-level message with non-sensitive metadata only when the search-active fallback occurs: `log.debug({ requestId, hasSearch: true, searchLength: <number> }, 'Search active, falling back to offset pagination for ranking')`. The raw search string SHALL NOT be logged.

The system SHALL log a warning when the `sortBy`-incompatible fallback occurs: `log.warn({ sortBy }, 'Cursor pagination incompatible with sortBy, falling back to offset')`.

When BOTH `search` is active AND `sortBy` is incompatible (not `createdAt`), the search-active debug message SHALL take precedence (the search fallback is evaluated first). Only one message SHALL be emitted.

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
