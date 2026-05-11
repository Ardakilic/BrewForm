# Implementation Plan: Recipe UI Improvements

## 1. API and Schema Changes for Multi-Taste-Note Filtering

- [ ] 1.1 Add `tasteNoteIds` parameter to RecipeFilterSchema
  - In `packages/shared/src/schemas/recipe.ts`, add a `tasteNoteIds` field to `RecipeFilterSchema` that accepts an optional comma-separated string of up to 10 UUIDs
  - Keep existing `tasteNoteId` field for backward compatibility (deprecated)
  - Add `.refine()` validation: split by comma, check length ≤ 10, validate each segment as UUID
  - _Requirements: 1.4, 1.7_

- [ ] 1.2 Update recipe service `listRecipes` to support `tasteNoteIds`
  - In `apps/api/src/modules/recipe/service.ts`, add handling for `filters.tasteNoteIds`
  - Split comma-separated string into array, add one `inArray` subquery per taste note ID (AND logic)
  - Keep existing `tasteNoteId` handling as fallback for backward compatibility
  - _Requirements: 1.3, 1.7_

- [ ]* 1.3 Write property test for AND logic filtering (Property 2)
  - **Property 2: AND logic filtering**
  - **Validates: Requirements 1.3**
  - In `apps/api/src/modules/recipe/service.test.ts`, use fast-check to verify that for any subset of taste note IDs, filtered results contain only recipes whose current version has ALL selected taste notes

- [ ]* 1.4 Write property test for tasteNoteIds schema validation (Property 3)
  - **Property 3: Taste note IDs URL round-trip**
  - **Validates: Requirements 1.4, 1.9**
  - In `packages/shared/src/schemas/recipe.test.ts`, use fast-check to verify that any set of 1–10 valid UUIDs serialized as comma-separated string passes schema validation and parses back to the same set

## 2. Internationalization Key Additions

- [ ] 2.1 Add new i18n keys to `en.json` and `tr.json`
  - In `packages/shared/src/i18n/en.json`, add keys: `recipe.list.tasteNotesFilter`, `recipe.list.tasteNotesPlaceholder`, `recipe.list.tasteNotesSelected`, `recipe.list.tasteNotesMax`, `preferences.locale`
  - In `packages/shared/src/i18n/tr.json`, add corresponding Turkish translations for all new keys
  - Ensure 1:1 key parity between en.json and tr.json
  - _Requirements: 9.1, 9.3, 9.4_

- [ ]* 2.2 Write property test for translation key parity (Property 9)
  - **Property 9: Translation key parity**
  - **Validates: Requirements 9.1**
  - In `packages/shared/src/i18n/i18n.test.ts`, use fast-check to verify that for any key present in en.json, a corresponding key exists in tr.json

## 3. Checkpoint - Ensure All Tests Pass

- [ ] 3.1 Run the test suite and ensure all tests pass before proceeding
  - Ensure all tests pass, ask the user if questions arise.

## 4. TasteNotesFilter Component (Base UI Select Multi-Select)

- [ ] 4.1 Create `TasteNotesFilter` component
  - Create `apps/web/src/components/recipe/TasteNotesFilter.tsx`
  - Implement using `Select.Root` with `multiple` prop from `@base-ui-components/react`
  - Props: `allTasteNotes: TasteNoteFlat[]`, `selectedIds: string[]`, `onChange: (ids: string[]) => void`, `placeholder: string`
  - Group taste notes by SCAA hierarchy: depth-0 as `Select.GroupLabel` (non-selectable), depth-1 and depth-2 as `Select.Item` (selectable)
  - Render `Select.Value` with custom function: show placeholder when 0 selected, show "{count} selected" when ≥1 selected
  - Enforce maximum 10 selections in the onChange handler
  - Use `alignItemWithTrigger={false}` on `Select.Positioner`
  - Use `Select.ItemIndicator` with checkmark SVG for selected items
  - Style with Tailwind CSS 4 utility classes only (no inline styles)
  - Ensure minimum 44×44px tap target on trigger button (`min-h-11`)
  - _Requirements: 1.1, 1.2, 1.6, 8.1_

- [~] 4.2 Write property test for taste note hierarchy rendering (Property 1)
  - **Property 1: Taste note hierarchy rendering**
  - **Validates: Requirements 1.2**
  - In `apps/web/src/components/recipe/TasteNotesFilter.test.tsx`, use fast-check to verify that for any set of taste notes with varying depths, depth-0 nodes render as non-selectable group headers and depth-1/depth-2 nodes render as selectable items

- [~] 4.3 Write property test for trigger label (Property 4)
  - **Property 4: Trigger label reflects selection count**
  - **Validates: Requirements 1.6**
  - In `apps/web/src/components/recipe/TasteNotesFilter.test.tsx`, use fast-check to verify that for any N selected taste notes (0 ≤ N ≤ 10), the trigger displays placeholder when N=0 and count label when N>0

## 5. RecipeListPage Updates

- [ ] 5.1 Integrate TasteNotesFilter and update filter state management
  - In `apps/web/src/pages/recipes/RecipeListPage.tsx`:
  - Replace single `tasteNoteId` URL param with `tasteNoteIds` (comma-separated)
  - Parse `tasteNoteIds` from URL into array, pass to TasteNotesFilter as `selectedIds`
  - Update `updateFilter` to handle array-valued params (serialize array to comma-separated string)
  - Pass `tasteNoteIds` to API call as comma-separated string parameter
  - Remove old single-select taste note `<select>` element
  - Import and render `TasteNotesFilter` component in the filter sidebar
  - _Requirements: 1.1, 1.4, 1.5, 1.9_

- [ ] 5.2 Reposition "Clear Filters" button to top of filter sidebar
  - Move the "Clear Filters" button from the bottom of the filter card to immediately after the "Filters" heading
  - Compute `hasActiveFilters` boolean: true if any of brewMethod, drinkType, visibility, equipmentId, tasteNoteIds, or search differ from default
  - Show button only when `hasActiveFilters` is true
  - On click: reset all params including `tasteNoteIds` and page
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 5.3 Add responsive filter sidebar mobile toggle
  - Add a toggle button (visible below `lg` breakpoint) that expands/collapses the filter sidebar
  - Use `hidden lg:block` on the sidebar by default, with state-controlled visibility on mobile
  - Toggle button: minimum 44×44px tap target, appropriate ARIA attributes (`aria-expanded`, `aria-controls`)
  - When collapsed, hide filter controls; when expanded, show them
  - _Requirements: 8.2_

- [~] 5.4 Write property test for clear button visibility (Property 7)
  - **Property 7: Clear button visibility reflects filter state**
  - **Validates: Requirements 3.1, 3.2**
  - In `apps/web/src/pages/recipes/RecipeListPage.test.tsx`, use fast-check to verify that for any combination of filter values, the clear button is visible iff at least one filter differs from default

- [~] 5.5 Write property test for equipment grouping (Property 5)
  - **Property 5: Equipment grouping correctness**
  - **Validates: Requirements 2.1, 2.2**
  - In `apps/web/src/pages/recipes/RecipeListPage.test.tsx`, use fast-check to verify that for any list of equipment items, grouping by type produces exactly one non-empty bucket per distinct type

- [~] 5.6 Write property test for UUID validation (Property 6)
  - **Property 6: UUID validation prevents invalid filter params**
  - **Validates: Requirements 2.6**
  - In `apps/web/src/pages/recipes/RecipeListPage.test.tsx`, use fast-check to verify that non-UUID strings are never sent as equipmentId to the API

## 6. ThemeSwitcher Fix

- [ ] 6.1 Fix ThemeSwitcher `Select.Value` to display translated labels
  - In `apps/web/src/components/layout/Navbar.tsx`, update the `ThemeSwitcher` component
  - Change `<Select.Value />` to use a render function: `<Select.Value>{() => t(\`theme.\${theme}\`) || theme}</Select.Value>`
  - This ensures the trigger shows "Light Roast" / "Dark Roast" / "Medium Roast" (or Turkish equivalents) instead of raw "light" / "dark" / "coffee"
  - Fallback to raw value if translation returns empty/undefined
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

- [~] 6.2 Write property test for theme switcher labels (Property 8)
  - **Property 8: Theme switcher displays translated labels**
  - **Validates: Requirements 4.5**
  - In `apps/web/src/components/layout/Navbar.test.tsx`, use fast-check to verify that for any theme value and locale combination, the trigger displays the translated label (not the raw value) when translation is non-empty

## 7. Checkpoint - Ensure All Tests Pass

- [ ] 7.1 Run the test suite and ensure all tests pass before proceeding
  - Ensure all tests pass, ask the user if questions arise.

## 8. LanguageSelector Refactor (Base UI Select in Footer)

- [~] 8.1 Create `LanguageSelector` component with Base UI Select
  - Create `apps/web/src/components/layout/LanguageSelector.tsx`
  - Implement using `Select.Root` from `@base-ui-components/react`
  - Props: `locale: string`, `setLocale: (locale: 'en' | 'tr') => void`, `availableLocales: string[]`
  - Hardcoded display labels: `en` → "🇬🇧 English", `tr` → "🇹🇷 Türkçe" (not from i18n)
  - Pill-shaped trigger with chevron icon, dropdown popup below trigger
  - `Select.ItemIndicator` with checkmark on selected locale
  - Use only Tailwind CSS 4 utility classes (zero inline `style` attributes)
  - Minimum 44×44px tap target on all interactive elements (`min-h-11`)
  - If `availableLocales` is empty, render nothing
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.5_

- [~] 8.2 Integrate LanguageSelector into Footer
  - In `apps/web/src/components/layout/Footer.tsx`, replace the native `<select>` with the new `LanguageSelector` component
  - Remove all inline `style` attributes from the language selector section
  - Pass `locale`, `setLocale`, and `availableLocales` props
  - _Requirements: 5.1, 5.5_

- [~] 8.3 Write example-based tests for LanguageSelector
  - In `apps/web/src/components/layout/LanguageSelector.test.tsx`
  - Test: renders flag emoji + language name for each locale option
  - Test: calls setLocale when a different language is selected
  - Test: renders nothing when availableLocales is empty
  - Test: displays currently active locale in trigger
  - _Requirements: 7.5_

## 9. ShareSection Layout Simplification

- [~] 9.1 Simplify ShareSection layout
  - In `apps/web/src/components/recipe/ShareSection.tsx`:
  - Remove the `div[role="textbox"]` readonly URL display element
  - Keep the flex container with `flex-col sm:flex-row` for responsive layout
  - QR code (128×128px) remains as first flex child on the left
  - Right side: Row 1 = "Copy URL" + "Download QR" buttons; Row 2 = social share buttons (X/Twitter, Facebook, WhatsApp)
  - Ensure responsive stacking: column layout below `sm` breakpoint, row layout at `sm` and above
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7_

- [~] 9.2 Write example-based tests for ShareSection
  - In `apps/web/src/components/recipe/ShareSection.test.tsx`
  - Test: does not render the readonly URL textbox element
  - Test: renders QR code image with correct dimensions
  - Test: renders "Copy URL" and "Download QR" buttons
  - Test: renders social share buttons (X/Twitter, Facebook, WhatsApp)
  - Test: copy button shows "Copied!" for 3 seconds after successful copy
  - Test: copy button shows error state for 3 seconds on clipboard failure
  - _Requirements: 7.6_

## 10. Final Checkpoint - Ensure All Tests Pass

- [ ] 10.1 Run the test suite and ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All components use Tailwind CSS 4 utility classes (no inline styles for new code)
- Base UI Select documentation should be consulted via context7 MCP during implementation
- The project uses Deno monorepo — do NOT use npm/npx/bun commands; use `deno task` instead

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.2"] },
    { "id": 2, "tasks": ["1.3", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 5, "tasks": ["5.4", "5.5", "5.6", "6.2", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 7, "tasks": ["9.2"] }
  ]
}
```
