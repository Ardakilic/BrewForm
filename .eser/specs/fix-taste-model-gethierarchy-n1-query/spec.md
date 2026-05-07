# Spec: fix-taste-model-gethierarchy-n1-query

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

getHierarchy currently issues 1 query for root nodes + N queries for each root’s children + M queries for each child’s grandchildren. With a growing SCAA taste note tree (139+ notes), this creates unnecessary DB round-trips. The data is cached for 24h in service.ts, but cache misses and cache flushes after admin edits hit the DB hard.

_-- Arda Kilicdagi_

### ambition

1-star: Works but inefficient. 10-star: Single query, minimal memory overhead, identical API response shape, fully validated with existing tests and type-check.

_-- Arda Kilicdagi_

### reversibility

Fully reversible. This is a pure internal refactoring of getHierarchy. No DB schema changes, no API contract changes. Old code can be restored instantly.

_-- Arda Kilicdagi_

### user_impact

No user-facing behavior change. The returned shape stays identical: { ...root, children: [{ ...child, children: [...] }] }. API consumers and UI unaffected.

_-- Arda Kilicdagi_

### verification

1) deno check src/modules/taste/model.ts — type-check passes. 2) deno test src/modules/taste/ — existing tests still pass. 3) Manual shape comparison: old vs new output must match for roots, children, and grandchildren ordering.

_-- Arda Kilicdagi_

### scope_boundary

Do NOT change the API shape. Do NOT add new endpoints. Do NOT modify service.ts caching logic. Do NOT touch UI components. Do NOT change findAll, findChildren, searchByName, or other model functions. Focus solely on getHierarchy implementation.

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

_To be addressed during execution._

## Performance Considerations (well-engineered)

_To be addressed during execution._

## Observability Plan (well-engineered)

_To be addressed during execution._

## Error Handling (well-engineered)

_To be addressed during execution._

## Security & Threat Model (well-engineered)

_To be addressed during execution._

## Developer Ergonomics (well-engineered)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Out of Scope

- Do NOT change the API shape
- Do NOT add new endpoints
- Do NOT modify service.ts caching logic
- Do NOT touch UI components
- Do NOT change findAll, findChildren, searchByName, or other model functions
- Focus solely on getHierarchy implementation.

## Tasks

- [x] task-1: Refactor getHierarchy in apps/api/src/modules/taste/model.ts to use a single db.select().from(tasteNotes).orderBy(asc(tasteNotes.depth), asc(tasteNotes.name)) query instead of nested loops with multiple selects. Build the tree in memory using a Map keyed by id.
- [x] task-2: Ensure returned shape matches current structure: { ...root, children: [{ ...child, children: [...] }] }.
- [x] task-3: Run deno check and deno test to validate. Skip doc updates since this is an internal refactor with no public API changes.

## Verification

- 1) deno check src/modules/taste/model.ts — type-check passes. 2) deno test src/modules/taste/ — existing tests still pass. 3) Manual shape comparison: old vs new output must match for roots, children, and grandchildren ordering.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-07T01:19:44.098Z | - |
