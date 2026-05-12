# Spec: update-tasteautocomplete-show-notes-default-search

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

TasteAutocomplete requires 3+ characters before showing taste notes. Users cannot browse full SCAA wheel. Categories appear as selectable items. Pain 7/10.

_-- Arda Kilicdagi_

### ambition

1-star: Show all notes on focus. 10-star: Hierarchical browse, real-time search, categories as headers, keyboard nav. Target 8/10.

_-- Arda Kilicdagi_

### reversibility

Reversible — only component state/rendering changes.

_-- Arda Kilicdagi_

### user_impact

UX improvement. No breaking changes.

_-- Arda Kilicdagi_

### verification

Unit tests: show all notes on focus, search filters, categories not selectable, chips render. Run vitest.

_-- Arda Kilicdagi_

### scope_boundary

Does NOT change API, schema, other pages. Only TasteAutocomplete.

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

## Design States (empty, loading, error, success) (beautiful-product)

_To be addressed during execution._

## Mobile Layout (beautiful-product)

_To be addressed during execution._

## Interaction Design (beautiful-product)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Out of Scope

- Does NOT change API, schema, other pages
- Only TasteAutocomplete.

## Tasks

- [ ] task-1: Hierarchical browse, real-time search, categories as headers, keyboard nav. Target 8/10
- [ ] task-2: Unit tests: show all notes on focus, search filters, categories not selectable, chips render. Run vitest.
- [ ] task-3: Write or update tests for all new and changed behavior
- [ ] task-4: Update documentation for all public-facing changes (README, API docs, CHANGELOG)

## Verification

- Unit tests: show all notes on focus, search filters, categories not selectable, chips render
- Run vitest.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-12T23:13:35.112Z | - |
