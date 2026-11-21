## ADDED Requirements

### Requirement: Cursor timestamps round-trip exactly
`recipe.created_at` SHALL be stored with millisecond precision (`timestamp(3) with time zone`, declared as `timestamp('created_at', { withTimezone: true, precision: 3 })` in `packages/db/src/schema.ts`), so the `createdAt` a cursor carries (a JavaScript `Date`, millisecond resolution) equals the stored value and keyset pages never repeat or skip a row.

With an unconstrained `timestamptz`, `now()` defaults stored microseconds: an ascending page
restarted at the previous page's last row (with `perPage=1`, the same row forever with
`hasMore: true`) and a descending page skipped rows that shared the bookmark's millisecond. This
applies to every `findCursor` caller (`GET /api/v1/recipes` and `GET /api/v1/follow/feed`). The
precision change is a generated migration that rounds existing values to the millisecond; rounding
is monotonic, so existing order is kept, and rows inside one millisecond become ties broken by `id`.

#### Scenario: Ascending pages with sub-millisecond input
- **WHEN** three recipes are written with `created_at` `…00.123400`, `…00.123600` and `…00.125200` and `findCursor` pages them with `perPage=1` and `sortOrder=asc`
- **THEN** the pages return the three recipes once each in that order and the last page has `hasMore: false`

#### Scenario: Descending pages keep rows inside one millisecond
- **WHEN** two recipes are written with `created_at` `…00.125100` and `…00.125200` and `findCursor` pages them with `perPage=1` and `sortOrder=desc`
- **THEN** both recipes are returned, once each
