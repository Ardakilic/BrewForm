## MODIFIED Requirements

### Requirement: Cursor-based query with DESC order

When `sortBy=createdAt` and `sortOrder=desc` (the default "newest first" feed), the system SHALL
execute a query via `db.query.recipes.findMany()` with a row-value keyset predicate for composite
index sargability:

```typescript
db.query.recipes.findMany({
  where: and(
    existingWhere,
    // D03 raw-SQL exception: row-value comparison, Drizzle has no native operator.
    sql`(${recipes.createdAt}, ${recipes.id}) < (${cursor.createdAt}, ${cursor.id})`,
  ),
  orderBy: [desc(recipes.createdAt), desc(recipes.id)],
  limit: perPage + 1,
  with: { author: { columns: { id: true, username: true, displayName: true } } },
});
```

The row-value comparison `(created_at, id) < ($1, $2)` is a D03 raw-SQL exception — Drizzle has
no first-class row-value operator. The `sql` template tag renders column references as identifiers
and JS values as bind parameters. This replaces the previous emulated OR form
(`OR(lt(createdAt, val), AND(eq(createdAt, val), lt(id, id)))`) which was only single-column
sargable. See the lint-style raw-SQL registry.

Existing WHERE conditions (`deletedAt IS NULL`, visibility, authorId, etc.) SHALL be combined
with the cursor condition via `and()`. The `with` relation SHALL match the existing `findMany()`
behavior.

**Reason:** The OR emulation is single-column sargable — Postgres can range-scan the leading
`created_at` column of `recipe_created_at_id_idx` but must evaluate the OR branch for the
tie-breaking `id` comparison. The row-value form lets the planner do a single composite range
seek, which matters at higher cardinality. Behaviour is unchanged — the same rows are returned
in the same order.

#### Scenario: Second page using cursor from first page

- **WHEN** `GET /api/v1/recipes?cursor=<nextCursor from first page>&perPage=5` is called
- **THEN** the response returns the next 5 recipes (older than the cursor)
- **AND** no recipe from the first page appears in the result

#### Scenario: Row-value predicate produces identical results to OR emulation

- **WHEN** a cursor query runs with the row-value predicate
- **THEN** the result set is identical to what the previous OR-emulated predicate would return
  for the same cursor and filters

---

### Requirement: Cursor-based query with ASC order

When `sortBy=createdAt` and `sortOrder=asc` (oldest first), the system SHALL
execute the cursor query using a row-value comparison with `>` instead of `<`, with
`orderBy: [asc(recipes.createdAt), asc(recipes.id)]`:

```typescript
db.query.recipes.findMany({
  where: and(
    existingWhere,
    // D03 raw-SQL exception: row-value comparison, Drizzle has no native operator.
    sql`(${recipes.createdAt}, ${recipes.id}) > (${cursor.createdAt}, ${cursor.id})`,
  ),
  orderBy: [asc(recipes.createdAt), asc(recipes.id)],
  limit: perPage + 1,
  with: { author: { columns: { id: true, username: true, displayName: true } } },
});
```

The row-value comparison is a D03 raw-SQL exception — see the lint-style raw-SQL registry.

**Reason:** Mirrors the DESC requirement's row-value rewrite for the ASC direction.

#### Scenario: Second page ASC using cursor

- **WHEN** `GET /api/v1/recipes?cursor=<nextCursor>&sortOrder=asc&perPage=5` is called
- **THEN** the response returns the next 5 recipes (newer than the cursor)
- **AND** no overlap with page 1 results
