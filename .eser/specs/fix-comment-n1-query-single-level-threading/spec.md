# Spec: fix-comment-n1-query-single-level-threading

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

The comment reader (findByRecipe in apps/api/src/modules/comment/model.ts) loops over each top-level comment and issues a separate SELECT for replies, causing N+1 queries. The reader only attaches one level of replies. createComment() in service.ts allows parentCommentId to reference any comment, including replies, but the reader cannot display deeper nesting. Performance degrades linearly with comment count. No UI changes are involved.

_-- Arda Kilicdagi_

### ambition

1-star: Eliminate N+1 by fetching all replies in a single query and grouping in-memory. Keep the exact same commentsWithReplies output shape. 10-star: Full multi-level nested threading with recursive reply trees and corresponding UI rendering. For this spec, we target 1-star — fix the performance bug and align data integrity with reader capabilities.

_-- Arda Kilicdagi_

### user_impact

Minimal. The API response shape remains identical. If we additionally enforce single-level threading in createComment(), any future attempts to post nested replies will be rejected. Existing data is unaffected since the reader already could not render deeper nesting.

_-- Arda Kilicdagi_

### verification

Run `make check` for type-checking across the monorepo. Run `make test-api` to ensure existing comment tests pass. Verify the model.ts logic manually by reviewing the replaced loop. No new tests are strictly required because the fix is a pure performance/integrity refactor with no behavior change to the output shape.

_-- Arda Kilicdagi_

### scope_boundary

This spec does NOT: change the API response schema, add recursive tree rendering, modify the database schema, change pagination logic, or add new endpoints. It does NOT introduce new inputs or trust boundaries. Threat model unchanged.

_-- Arda Kilicdagi_

### reversibility

No. This is a purely code-level refactor. No database migrations, schema changes, or irreversible API contract changes are involved. The output shape of findByRecipe remains identical. If needed, the per-comment loop can be restored by reverting the code change.

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

- This spec does NOT: change the API response schema, add recursive tree rendering, modify the database schema, change pagination logic, or add new endpoints
- It does NOT introduce new inputs or trust boundaries
- Threat model unchanged.

## Tasks

- [x] task-1: In `apps/api/src/modules/comment/model.ts`, replace the per-comment reply loop in `findByRecipe` with a single bulk query. After fetching top-level comments, query all replies where `parentCommentId IN (top-level ids)` in one SELECT. Group replies in-memory by `parentCommentId` using a Map. Map over top-level comments and attach `replies` from the grouped Map. Keep the exact same `commentsWithReplies` output shape.
-
- [x] task-2: Run `make check` for type-checking across the monorepo.
-
- [x] task-3: Run `make test-api` to ensure existing comment tests pass.

Remove: tasks about documentation updates (no public API changes) and writing new tests (pure performance refactor with identical output shape).

## Verification

- Run `make check` for type-checking across the monorepo
- Run `make test-api` to ensure existing comment tests pass
- Verify the model.ts logic manually by reviewing the replaced loop
- No new tests are strictly required because the fix is a pure performance/integrity refactor with no behavior change to the output shape.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-06T21:00:10.229Z | - |
