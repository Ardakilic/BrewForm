# Spec: fix-tastenotesfilter-popup-scrollability-add

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

Users open the Taste Notes multi-select dropdown on the recipes page. With 100+ SCAA taste notes, the popup extends to full browser height and is not scrollable, making items at the bottom inaccessible. There is no way to search/filter the list, so users must manually scan all items. The dropdown trigger arrow sits next to the text instead of at the right edge like native selects, causing visual misalignment. The popup items have card-like styling (rounded-md mx-1) that looks different from native option elements. Pain level: 8/10.

_-- Arda Kilicdagi_

### ambition

1-star: Popup has max-height and is scrollable. 10-star: Popup has max-height with smooth scroll, internal search that filters items in real-time, arrow aligned to the right edge matching all native selects, and flat option styling consistent with the rest of the UI. Search resets when popup closes. Empty state shown when search yields no results. Design intentionality target: 8/10.

_-- Arda Kilicdagi_

### reversibility

No irreversible decisions. All changes are in CSS classes and React state within TasteNotesFilter.tsx. Can revert by restoring original class names and removing search state.

_-- Arda Kilicdagi_

### user_impact

Bug fix and UX improvement. No breaking changes. Users will now be able to scroll through taste notes and search them.

_-- Arda Kilicdagi_

### verification

Unit tests in TasteNotesFilter.test.tsx: (1) verify popup has max-height and overflow classes, (2) verify search input filters items, (3) verify search resets on popup close, (4) verify trigger has justify-between for arrow alignment, (5) verify items do not have rounded-md or mx-1. Run vitest via deno run -A npm:vitest from apps/web.

_-- Arda Kilicdagi_

### scope_boundary

This does NOT: change the API, modify the database schema, add new filters to RecipeListPage, change how taste notes data is fetched, or replace native selects with Base UI across the entire app.

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

- This does NOT: change the API, modify the database schema, add new filters to RecipeListPage, change how taste notes data is fetched, or replace native selects with Base UI across the entire app.

## Tasks

- [x] task-1: Add max-h-80 and overflow-y-auto to Select.Popup in TasteNotesFilter.tsx for scrollability. Wrap items in Select.List. Add Select.ScrollUpArrow and Select.ScrollDownArrow. Files: apps/web/src/components/recipe/TasteNotesFilter.tsx.
- [x] task-2: Add internal search input inside the popup with useState for query. Filter displayed items by name (case-insensitive). Show empty state when no matches. Reset search on popup close via onOpenChange. Show all depth levels (depth >= 1) not just 1 and 2. Files: apps/web/src/components/recipe/TasteNotesFilter.tsx.
- [x] task-3: Fix trigger arrow alignment by adding justify-between to Select.Trigger className so the arrow sits at the right edge like native selects. Files: apps/web/src/components/recipe/TasteNotesFilter.tsx.
- [x] task-4: Flatten option styling by removing rounded-md and mx-1 from Select.Item className. Keep clean padding and hover states. Files: apps/web/src/components/recipe/TasteNotesFilter.tsx.
- [x] task-5: Add/update tests in TasteNotesFilter.test.tsx: (1) popup has max-h and overflow classes, (2) search input exists and filters items, (3) search resets when popup closes, (4) trigger has justify-between, (5) items lack rounded-md/mx-1. Files: apps/web/src/components/recipe/TasteNotesFilter.test.tsx.
- [x] task-6: Run all tests via deno run -A npm:vitest from apps/web/.
- [x] task-7: Type-check affected files.

## Verification

- Unit tests in TasteNotesFilter.test.tsx: (1) verify popup has max-height and overflow classes, (2) verify search input filters items, (3) verify search resets on popup close, (4) verify trigger has justify-between for arrow alignment, (5) verify items do not have rounded-md or mx-1
- Run vitest via deno run -A npm:vitest from apps/web.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-12T22:55:49.600Z | - |
