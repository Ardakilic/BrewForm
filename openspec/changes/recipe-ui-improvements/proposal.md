# Proposal: Recipe UI Improvements

## Why

The BrewForm recipe browsing experience needs coordinated UI improvements to help users find recipes more effectively across devices, ensure consistent component styling, and fix known display issues. Users currently cannot filter by multiple taste notes simultaneously, equipment filters need verification for correctness, the clear filters button is poorly positioned, the theme switcher shows raw values instead of localized labels, the footer language selector uses inconsistent native styling, and the share section contains a redundant URL display. These gaps reduce usability and create an inconsistent visual experience.

## What Changes

- **Multi-Select Taste Notes Filter**: Replace the single-select taste note filter on the Recipe List Page with a Base UI Select multi-select component. Users can select up to 10 taste notes; the API applies AND logic so only recipes containing ALL selected taste notes are returned. Selected IDs are persisted in the URL as a comma-separated `tasteNoteIds` parameter.
- **Equipment Filter Verification**: Verify that equipment filters render one dropdown per equipment type that has at least one item, with correct human-readable labels. Ensure invalid equipment IDs are not sent to the API, and hide filters on API failure.
- **Clear Filters Button Repositioning**: Move the "Clear Filters" button from the bottom of the filter sidebar to immediately after the "Filters" heading. Show it only when any filter differs from its default value.
- **Theme Switcher Label Fix**: Fix the Navbar Theme Switcher so its trigger displays translated theme labels ("Light Roast", "Dark Roast", "Medium Roast") instead of raw values ("light", "dark", "coffee").
- **Footer Language Selector Restyling**: Replace the native `<select>` language selector in the Footer with a Base UI Select component styled consistently with the Theme Switcher, showing flag emoji + full language names.
- **Share Section Layout Simplification**: Remove the readonly URL textbox from the recipe detail Share Section. Layout becomes a responsive flex with QR code on the left and action buttons (Copy URL, Download QR, social shares) on the right.
- **Responsive Filter Sidebar Toggle**: Add a mobile toggle button for the filter sidebar on viewports below the `lg` breakpoint, with minimum 44×44px tap targets.
- **Internationalization Completeness**: Add all new UI label keys to both `en.json` and `tr.json`, maintaining 1:1 key parity with grammatically correct Turkish translations.
- **Test Coverage**: Add property-based tests (fast-check) and example-based unit tests for all UI changes, covering filtering logic, URL round-trips, component rendering, and responsive behavior.

## Capabilities

### New Capabilities

- `recipe-ui`: Covers all Recipe List Page, Navbar, Footer, and recipe detail UI improvements including multi-select taste notes filtering, equipment filter correctness, clear button repositioning, theme switcher label display, language selector styling, share section layout, responsive filter sidebar, and internationalization completeness.

### Modified Capabilities

- *(none — this is a new feature set with no existing spec-level behavior changes to previously defined capabilities)*

## Impact

- **Frontend**: `apps/web/src/pages/recipes/RecipeListPage.tsx`, `apps/web/src/components/recipe/TasteNotesFilter.tsx` (new), `apps/web/src/components/recipe/ShareSection.tsx`, `apps/web/src/components/layout/Navbar.tsx`, `apps/web/src/components/layout/Footer.tsx`, `apps/web/src/components/layout/LanguageSelector.tsx` (new)
- **API**: `apps/api/src/modules/recipe/service.ts` (adds `tasteNoteIds` parameter support with AND logic), `packages/shared/src/schemas/recipe.ts` (adds `tasteNoteIds` validation)
- **Shared**: `packages/shared/src/i18n/en.json`, `packages/shared/src/i18n/tr.json` (new translation keys)
- **Tests**: New test files for TasteNotesFilter, LanguageSelector, ShareSection, RecipeListPage filter logic, and property tests for schema validation and i18n parity
