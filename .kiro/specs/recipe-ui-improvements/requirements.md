# Requirements Document

## Introduction

This feature covers a set of UI improvements across the BrewForm web application: upgrading the recipe list page filters (multi-select taste notes, equipment filter verification, clear button repositioning), fixing the theme switcher label display, restyling the footer language selector with Base UI Select, and simplifying the recipe detail share section layout.

## Glossary

- **Recipe_List_Page**: The page at `/recipes` that displays a filterable, paginated grid of public recipes (`RecipeListPage.tsx`)
- **Taste_Notes_Filter**: The dropdown filter on the Recipe_List_Page that allows users to filter recipes by SCAA flavor wheel taste notes
- **Equipment_Filter**: A set of per-type dropdown filters on the Recipe_List_Page that allow users to filter recipes by equipment items
- **Filter_Sidebar**: The left sidebar on the Recipe_List_Page containing all filter controls
- **Theme_Switcher**: The Base UI Select component in the Navbar that allows users to switch between Light Roast, Dark Roast, and Medium Roast themes
- **Language_Selector**: The component in the Footer that allows users to switch between available locales (English, Turkish)
- **Share_Section**: The card component on the recipe detail page that displays a QR code, copy URL button, download QR button, and social share buttons (`ShareSection.tsx`)
- **Base_UI_Select**: The Select component from `@base-ui-components/react` used for styled dropdowns
- **API**: The BrewForm backend REST API at `/api/v1/`
- **SCAA_Hierarchy**: The Specialty Coffee Association of America flavor wheel hierarchy with three depth levels (root → mid-category → leaf)

## Requirements

### Requirement 1: Multi-Select Taste Notes Filter

**User Story:** As a recipe browser, I want to select multiple taste notes simultaneously, so that I can find recipes that match a specific combination of flavors.

#### Acceptance Criteria

1. WHEN the Recipe_List_Page loads, THE Taste_Notes_Filter SHALL render as a Base_UI_Select component with multiple selection enabled
2. THE Taste_Notes_Filter SHALL display all taste note elements organized by SCAA_Hierarchy with depth-0 nodes as non-selectable group headers and depth-1 and depth-2 nodes as selectable items
3. WHEN a user selects multiple taste notes, THE Taste_Notes_Filter SHALL apply AND logic so that only recipes containing ALL selected taste notes are displayed
4. WHEN multiple taste notes are selected, THE Recipe_List_Page SHALL pass all selected taste note IDs to the API as a comma-separated `tasteNoteIds` query parameter containing at most 10 UUIDs
5. WHEN a user deselects a taste note, THE Taste_Notes_Filter SHALL remove that taste note from the active filter and re-fetch the recipe list with the remaining selected taste note IDs
6. WHILE no taste notes are selected, THE Taste_Notes_Filter SHALL display the placeholder label in the trigger button text; WHILE one or more taste notes are selected, THE Taste_Notes_Filter SHALL display the count of currently selected taste notes in the trigger button text
7. IF the API does not support filtering by multiple taste note IDs, THEN THE API SHALL be updated to accept a `tasteNoteIds` parameter (comma-separated UUIDs, maximum 10) and return only recipes whose current version contains ALL specified taste notes
8. IF the selected taste note combination matches zero recipes, THEN THE Recipe_List_Page SHALL display an empty-state message indicating no recipes match the current filter combination
9. WHEN taste notes are selected or deselected, THE Recipe_List_Page SHALL persist the selected taste note IDs in the URL query string so that the filtered view is shareable via URL

### Requirement 2: Equipment Filter Visibility and Correctness

**User Story:** As a recipe browser, I want to filter recipes by specific equipment items grouped by type, so that I can find recipes compatible with my gear.

#### Acceptance Criteria

1. THE Recipe_List_Page SHALL render one Equipment_Filter dropdown for each equipment type that has at least one equipment item (portafilter, basket, tamper, puck_screen, scale, gooseneck_kettle, paper_filter, mesh_filter, cezve, thermometer, other), and SHALL hide the dropdown for any type that has zero items
2. WHEN the Recipe_List_Page loads, THE Recipe_List_Page SHALL fetch all equipment from the API and group items by their `type` field to populate the Equipment_Filter dropdowns
3. WHEN a user selects an equipment item from any Equipment_Filter dropdown, THE Recipe_List_Page SHALL set that item's ID as the single active equipment filter, replacing any previously selected equipment item from any other dropdown, and SHALL filter recipes to show only those whose equipment list contains the selected item's ID
4. THE Equipment_Filter dropdowns SHALL each display a human-readable label for the equipment type (e.g., "Portafilter", "Puck Screen", "Kettle")
5. IF the equipment API request fails, THEN THE Recipe_List_Page SHALL hide all Equipment_Filter dropdowns and SHALL not prevent the rest of the page from loading
6. IF the active equipment filter value is not a valid UUID, THEN THE Recipe_List_Page SHALL not send the equipmentId parameter to the recipe list API

### Requirement 3: Clear Filters Button Position

**User Story:** As a recipe browser, I want the clear filters button at the top of the filter section, so that I can quickly reset all filters without scrolling.

#### Acceptance Criteria

1. WHEN one or more filter parameters (brew method, drink type, visibility, equipment, or taste note) have a non-default value, THE Filter_Sidebar SHALL display the "Clear Filters" button at the top of the filter section, immediately after the section heading and before any filter controls
2. IF no filter parameters (brew method, drink type, visibility, equipment, or taste note) have a non-default value, THEN THE Filter_Sidebar SHALL hide the "Clear Filters" button
3. WHEN the user clicks the "Clear Filters" button, THE Filter_Sidebar SHALL reset all filter parameters to their default values: brew method to "All", drink type to "All", visibility to "All", equipment to "All", taste note to "All", search to empty, and sort to "Newest"
4. WHEN the user clicks the "Clear Filters" button, THE Filter_Sidebar SHALL reset the page parameter to 1

### Requirement 4: Theme Switcher Label Display

**User Story:** As a user, I want the theme switcher to display the correct localized theme names ("Light Roast", "Dark Roast", "Medium Roast"), so that I can identify themes by their coffee-themed names.

#### Acceptance Criteria

1. THE Theme_Switcher SHALL display exactly 3 theme options using the translation keys `theme.light`, `theme.dark`, and `theme.coffee`, rendering the translated label in both the trigger button and the dropdown items
2. WHILE the locale is English, THE Theme_Switcher SHALL display "Light Roast", "Dark Roast", and "Medium Roast" as the option labels in the trigger and dropdown
3. WHILE the locale is Turkish, THE Theme_Switcher SHALL display "Açık Kavurma", "Koyu Kavurma", and "Orta Kavurma" as the option labels in the trigger and dropdown
4. WHEN the user changes the locale, THE Theme_Switcher SHALL update its displayed labels to reflect the new locale within 500 milliseconds without requiring a page reload
5. THE Theme_Switcher trigger button SHALL display the translated label of the currently selected theme, not the raw theme value ("light", "dark", or "coffee")
6. IF a translation key returns an empty string or undefined, THEN THE Theme_Switcher SHALL display the raw theme value ("light", "dark", or "coffee") as a fallback label

### Requirement 5: Footer Language Selector Styling

**User Story:** As a user, I want the footer language selector to be styled consistently with the rest of the application using Base UI components, so that the UI feels cohesive.

#### Acceptance Criteria

1. THE Language_Selector SHALL be implemented using Base_UI_Select instead of a plain HTML `<select>` element
2. THE Language_Selector SHALL display each locale option with a flag emoji prefix and the full localized language name: "🇬🇧 English" for English and "🇹🇷 Türkçe" for Turkish
3. THE Language_Selector SHALL use a pill-shaped trigger with a chevron icon, a dropdown popup positioned below the trigger, and a checkmark indicator on the currently selected locale option, matching the Theme_Switcher component structure
4. WHEN the user selects a different language, THE Language_Selector SHALL call the setLocale function and the application locale SHALL update without a full page reload within 100 milliseconds
5. THE Language_Selector SHALL use only Tailwind CSS 4 utility classes for styling with zero inline `style` attributes in its rendered output
6. THE Language_Selector trigger SHALL display the flag emoji and localized language name of the currently active locale as its resting-state label
7. IF the availableLocales list is empty, THEN THE Language_Selector SHALL not render any selector element in the footer

### Requirement 6: Share Section Layout Simplification

**User Story:** As a recipe viewer, I want a cleaner share section layout without the redundant URL display, so that the sharing controls are concise and easy to use.

#### Acceptance Criteria

1. THE Share_Section SHALL NOT render the readonly URL text display element (the `div[role="textbox"]` showing the shareable URL)
2. THE Share_Section SHALL render the QR code image (128×128 pixels) on the left side of the section as the first flex child
3. THE Share_Section SHALL render "Copy URL" and "Download QR" buttons on the first row to the right of the QR code
4. THE Share_Section SHALL render social share buttons (X/Twitter, Facebook, WhatsApp) on the second row to the right of the QR code
5. WHEN the user clicks the "Copy URL" button, THE Share_Section SHALL copy the full recipe URL to the clipboard and display a "Copied!" confirmation for 3 seconds before reverting to the default label
6. IF the clipboard write operation fails, THEN THE Share_Section SHALL display an error indication for 3 seconds before reverting to the default label
7. THE Share_Section layout SHALL be responsive: on viewports narrower than the `sm` breakpoint (640px), the QR code SHALL stack above the buttons in a single column layout

### Requirement 7: Test Coverage

**User Story:** As a developer, I want all UI changes to have test coverage, so that regressions are caught early.

#### Acceptance Criteria

1. WHEN the Taste_Notes_Filter is rendered with at least 2 taste notes selected, THE test suite SHALL verify that the Recipe_List_Page passes all selected taste note IDs to the API as a comma-separated `tasteNoteIds` query parameter, confirming AND logic by asserting the resulting recipe list only includes recipes containing ALL selected notes
2. IF one or more filters are active (any of: brew method, drink type, visibility, equipment, taste notes, search, or sort differ from default), THEN THE test suite SHALL verify that the "Clear Filters" button is visible at the top of the Filter_Sidebar immediately after the section heading
3. IF no filters are active, THEN THE test suite SHALL verify that the "Clear Filters" button is not rendered in the Filter_Sidebar
4. THE test suite SHALL verify that the Theme_Switcher renders the translated theme labels for English ("Light Roast", "Dark Roast", "Medium Roast") and Turkish ("Açık Kavurma", "Koyu Kavurma", "Orta Kavurma") locales by switching locale and asserting the displayed option labels match the expected translations
5. THE test suite SHALL verify that the Language_Selector renders each available locale as an option displaying a flag emoji prefix and full language name ("🇬🇧 English" and "🇹🇷 Türkçe")
6. THE test suite SHALL verify that the Share_Section does not render the readonly URL text display element, and renders action buttons in two rows: "Copy URL" and "Download QR" on the first row, followed by social share buttons (X/Twitter, Facebook, WhatsApp) on the second row
7. THE test suite SHALL verify that the Equipment_Filter renders one dropdown per equipment type that has at least one item, with each dropdown displaying a human-readable type label (e.g., "Portafilter", "Puck Screen") and listing only equipment items belonging to that type
8. WHEN the user clicks the "Clear Filters" button, THE test suite SHALL verify that all filter values (brew method, drink type, visibility, equipment, taste notes, search, sort) are reset to their default state and the recipe list is updated accordingly

### Requirement 8: Responsive Design

**User Story:** As a mobile user, I want all UI improvements to work correctly on mobile, tablet, and desktop viewports, so that the experience is consistent across devices.

#### Acceptance Criteria

1. WHILE the viewport width is below the `lg` breakpoint (1024px), THE Taste_Notes_Filter multi-select dropdown SHALL render all selectable options and the trigger button with a minimum tap target size of 44×44px
2. WHILE the viewport width is below the `lg` breakpoint (1024px), THE Filter_Sidebar SHALL collapse into a hidden panel with a visible toggle button (minimum 44×44px tap target) that expands and collapses the filter controls on tap
3. WHILE the viewport width is below the `lg` breakpoint (1024px), THE Share_Section layout SHALL stack the QR code above the action buttons in a single vertical column
4. WHILE the viewport width is at or above the `lg` breakpoint (1024px), THE Share_Section layout SHALL display the QR code on the left and action buttons on the right in a horizontal row
5. THE Language_Selector dropdown SHALL render all options with a minimum tap target size of 44×44px, support opening and closing via touch input, and be navigable using screen readers with appropriate ARIA roles and labels

### Requirement 9: Internationalization Completeness

**User Story:** As a Turkish-speaking user, I want all new UI labels and filter names to be translated, so that the application is fully localized.

#### Acceptance Criteria

1. WHEN new translation keys are added to `en.json` for any feature (including multi-select taste notes filter keys such as selected count text and placeholder), THE `tr.json` file SHALL contain a corresponding entry for every key present in `en.json`, maintaining 1:1 key parity between the two locale files
2. THE Language Selector option labels ("🇬🇧 English", "🇹🇷 Türkçe") SHALL be hardcoded display values rendered directly in component markup and SHALL NOT be referenced via translation keys in `en.json` or `tr.json`
3. IF a key exists in `en.json` but is absent from `tr.json`, THEN THE system SHALL fall back to the English value for that key at runtime, and THE `tr.json` file SHALL be updated to include a human-written Turkish translation before the feature is considered complete
4. WHEN a new locale key is added, THE corresponding Turkish translation in `tr.json` SHALL be a grammatically correct Turkish string that conveys the same meaning as the English value, and SHALL NOT be an empty string, a copy of the English text, or an auto-generated placeholder
