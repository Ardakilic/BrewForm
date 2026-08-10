# db-indexes Specification

## ADDED Requirements

### Requirement: Recipe visibility featured index

The `recipes` table SHALL define a composite index `recipe_visibility_featured_idx` on `(visibility, featured)` to cover "featured public recipes" queries (`WHERE visibility = 'public' AND featured = true`). The index SHALL be added to the third-argument extra configurator array in `packages/db/src/schema.ts`, after the existing `recipe_visibility_like_count_idx`.

- The index SHALL be generated via `make db-generate && make db-migrate` — the migration SQL SHALL NOT be hand-edited (AGENTS.md rule).
- No existing index SHALL be modified or removed.
- The index SHALL have a JSDoc comment above it explaining the query pattern it covers.

#### Scenario: Featured public recipes query uses the index

- When a query executes `WHERE visibility = 'public' AND featured = true`
- Then PostgreSQL SHALL be able to use `recipe_visibility_featured_idx` for an index seek on both columns

#### Scenario: Migration creates the index

- When `make db-generate && make db-migrate` runs
- Then the generated migration SQL contains `CREATE INDEX recipe_visibility_featured_idx ON recipes (visibility, featured)`
