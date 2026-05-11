## ADDED Requirements

### Requirement: Multi-Select Taste Notes Filter

The Recipe_List_Page SHALL render the Taste_Notes_Filter as a Base_UI_Select component with multiple selection enabled. The system SHALL organize all taste note elements by SCAA_Hierarchy with depth-0 nodes as non-selectable group headers and depth-1 and depth-2 nodes as selectable items. When a user selects multiple taste notes, the system SHALL apply AND logic so that only recipes containing ALL selected taste notes are displayed. The Recipe_List_Page SHALL pass all selected taste note IDs to the API as a comma-separated `tasteNoteIds` query parameter containing at most 10 UUIDs. When a user deselects a taste note, the system SHALL remove that taste note from the active filter and re-fetch the recipe list with the remaining selected taste note IDs. While no taste notes are selected, the Taste_Notes_Filter SHALL display the placeholder label in the trigger button text; while one or more taste notes are selected, the Taste_Notes_Filter SHALL display the count of currently selected taste notes in the trigger button text. The API SHALL accept a `tasteNoteIds` parameter (comma-separated UUIDs, maximum 10) and return only recipes whose current version contains ALL specified taste notes. If the selected taste note combination matches zero recipes, the Recipe_List_Page SHALL display an empty-state message indicating no recipes match the current filter combination. When taste notes are selected or deselected, the Recipe_List_Page SHALL persist the selected taste note IDs in the URL query string so that the filtered view is shareable via URL.

#### Scenario: User selects multiple taste notes
- **WHEN** the Recipe_List_Page loads with taste notes available
- **THEN** the Taste_Notes_Filter SHALL render as a Base_UI_Select with multiple selection enabled
- **AND** depth-0 taste notes SHALL appear as non-selectable group headers
- **AND** depth-1 and depth-2 taste notes SHALL appear as selectable items with checkmark indicators

#### Scenario: AND logic filtering
- **WHEN** a user selects taste note IDs "A" and "B"
- **THEN** the API SHALL receive `tasteNoteIds=A,B`
- **AND** the filtered recipe list SHALL contain only recipes whose current version includes both taste note "A" AND taste note "B"

#### Scenario: Taste note count in trigger
- **WHEN** no taste notes are selected
- **THEN** the Taste_Notes_Filter trigger SHALL display the placeholder text "Select taste notes..."
- **WHEN** 3 taste notes are selected
- **THEN** the trigger SHALL display "3 selected"

#### Scenario: Empty state with no matching recipes
- **WHEN** a user selects a combination of taste notes that matches zero recipes
- **THEN** the Recipe_List_Page SHALL display an empty-state message indicating no recipes match the current filter combination

#### Scenario: URL persistence of taste note selections
- **WHEN** a user selects taste note IDs "A" and "B"
- **THEN** the browser URL SHALL include the query parameter `tasteNoteIds=A,B`
- **AND** reloading the page with that URL SHALL restore the same selected taste notes

### Requirement: Equipment Filter Visibility and Correctness

The Recipe_List_Page SHALL render one Equipment_Filter dropdown for each equipment type that has at least one equipment item (portafilter, basket, tamper, puck_screen, scale, gooseneck_kettle, paper_filter, mesh_filter, cezve, thermometer, other), and SHALL hide the dropdown for any type that has zero items. When the Recipe_List_Page loads, the system SHALL fetch all equipment from the API and group items by their `type` field to populate the Equipment_Filter dropdowns. When a user selects an equipment item from any Equipment_Filter dropdown, the Recipe_List_Page SHALL set that item's ID as the single active equipment filter, replacing any previously selected equipment item from any other dropdown, and SHALL filter recipes to show only those whose equipment list contains the selected item's ID. The Equipment_Filter dropdowns SHALL each display a human-readable label for the equipment type (e.g., "Portafilter", "Puck Screen", "Kettle"). If the equipment API request fails, the Recipe_List_Page SHALL hide all Equipment_Filter dropdowns and SHALL not prevent the rest of the page from loading. If the active equipment filter value is not a valid UUID, the Recipe_List_Page SHALL not send the equipmentId parameter to the recipe list API.

#### Scenario: Equipment filters render per type
- **WHEN** the Recipe_List_Page loads and the equipment API returns items of types "portafilter" and "scale"
- **THEN** exactly two Equipment_Filter dropdowns SHALL render
- **AND** one SHALL be labeled "Portafilter" listing only portafilter items
- **AND** one SHALL be labeled "Scale" listing only scale items

#### Scenario: Single active equipment selection
- **WHEN** a user selects a portafilter item from the Portafilter dropdown
- **THEN** the Recipe_List_Page SHALL send `equipmentId=<portafilter-id>` to the API
- **WHEN** the user then selects a scale item from the Scale dropdown
- **THEN** the Recipe_List_Page SHALL replace the equipment filter with `equipmentId=<scale-id>`
- **AND** the portafilter selection SHALL no longer be active

#### Scenario: Invalid equipment ID validation
- **WHEN** the active equipment filter value is "not-a-uuid"
- **THEN** the Recipe_List_Page SHALL NOT include an `equipmentId` parameter in API requests

#### Scenario: Equipment API failure
- **WHEN** the equipment API request fails
- **THEN** all Equipment_Filter dropdowns SHALL be hidden
- **AND** the Recipe_List_Page SHALL continue loading without blocking

### Requirement: Clear Filters Button Position

When one or more filter parameters (brew method, drink type, visibility, equipment, or taste note) have a non-default value, the Filter_Sidebar SHALL display the "Clear Filters" button at the top of the filter section, immediately after the section heading and before any filter controls. If no filter parameters have a non-default value, the Filter_Sidebar SHALL hide the "Clear Filters" button. When the user clicks the "Clear Filters" button, the Filter_Sidebar SHALL reset all filter parameters to their default values: brew method to "All", drink type to "All", visibility to "All", equipment to "All", taste note to "All", search to empty, and sort to "Newest". When the user clicks the "Clear Filters" button, the Filter_Sidebar SHALL reset the page parameter to 1.

#### Scenario: Clear button visible with active filters
- **WHEN** the user selects a brew method other than "All"
- **THEN** the "Clear Filters" button SHALL be visible at the top of the filter section, immediately after the "Filters" heading

#### Scenario: Clear button hidden with default filters
- **WHEN** all filter parameters are at their default values
- **THEN** the "Clear Filters" button SHALL NOT be rendered in the Filter_Sidebar

#### Scenario: Clear filters resets all parameters
- **WHEN** the user clicks the "Clear Filters" button
- **THEN** all filter parameters SHALL reset to default values
- **AND** the page parameter SHALL reset to 1
- **AND** the recipe list SHALL re-fetch with default parameters

### Requirement: Theme Switcher Label Display

The Theme_Switcher SHALL display exactly 3 theme options using the translation keys `theme.light`, `theme.dark`, and `theme.coffee`, rendering the translated label in both the trigger button and the dropdown items. While the locale is English, the Theme_Switcher SHALL display "Light Roast", "Dark Roast", and "Medium Roast" as the option labels in the trigger and dropdown. While the locale is Turkish, the Theme_Switcher SHALL display "Açık Kavurma", "Koyu Kavurma", and "Orta Kavurma" as the option labels in the trigger and dropdown. When the user changes the locale, the Theme_Switcher SHALL update its displayed labels to reflect the new locale within 500 milliseconds without requiring a page reload. The Theme_Switcher trigger button SHALL display the translated label of the currently selected theme, not the raw theme value ("light", "dark", or "coffee"). If a translation key returns an empty string or undefined, the Theme_Switcher SHALL display the raw theme value ("light", "dark", or "coffee") as a fallback label.

#### Scenario: English theme labels
- **WHEN** the locale is English and the theme is "dark"
- **THEN** the Theme_Switcher trigger SHALL display "Dark Roast"
- **AND** the dropdown items SHALL display "Light Roast", "Dark Roast", and "Medium Roast"

#### Scenario: Turkish theme labels
- **WHEN** the locale is Turkish and the theme is "light"
- **THEN** the Theme_Switcher trigger SHALL display "Açık Kavurma"
- **AND** the dropdown items SHALL display "Açık Kavurma", "Koyu Kavurma", and "Orta Kavurma"

#### Scenario: Locale change updates labels
- **WHEN** the user switches the locale from English to Turkish
- **THEN** within 500 milliseconds the Theme_Switcher labels SHALL update to Turkish translations without a page reload

#### Scenario: Fallback to raw value on missing translation
- **WHEN** a translation key returns an empty string
- **THEN** the Theme_Switcher SHALL display the raw theme value as the fallback label

### Requirement: Footer Language Selector Styling

The Language_Selector SHALL be implemented using Base_UI_Select instead of a plain HTML `<select>` element. The Language_Selector SHALL display each locale option with a flag emoji prefix and the full localized language name: "🇬🇧 English" for English and "🇹🇷 Türkçe" for Turkish. The Language_Selector SHALL use a pill-shaped trigger with a chevron icon, a dropdown popup positioned below the trigger, and a checkmark indicator on the currently selected locale option, matching the Theme_Switcher component structure. When the user selects a different language, the Language_Selector SHALL call the setLocale function and the application locale SHALL update without a full page reload within 100 milliseconds. The Language_Selector SHALL use only Tailwind CSS 4 utility classes for styling with zero inline `style` attributes in its rendered output. The Language_Selector trigger SHALL display the flag emoji and localized language name of the currently active locale as its resting-state label. If the availableLocales list is empty, the Language_Selector SHALL not render any selector element in the footer.

#### Scenario: Language selector renders with Base UI Select
- **WHEN** the Footer renders with availableLocales containing "en" and "tr"
- **THEN** the Language_Selector SHALL render as a Base_UI_Select component
- **AND** the trigger SHALL display "🇬🇧 English" when the active locale is "en"
- **AND** the dropdown SHALL list "🇬🇧 English" and "🇹🇷 Türkçe" with a checkmark on the active option

#### Scenario: Language change updates locale
- **WHEN** the user selects "🇹🇷 Türkçe" from the Language_Selector
- **THEN** the setLocale function SHALL be called with "tr"
- **AND** the application locale SHALL update to Turkish within 100 milliseconds without a page reload

#### Scenario: No inline styles
- **WHEN** the Language_Selector renders
- **THEN** its output SHALL contain zero inline `style` attributes
- **AND** all styling SHALL use Tailwind CSS 4 utility classes

#### Scenario: Empty available locales
- **WHEN** the availableLocales array is empty
- **THEN** the Language_Selector SHALL not render any selector element

### Requirement: Share Section Layout Simplification

The Share_Section SHALL NOT render the readonly URL text display element (the `div[role="textbox"]` showing the shareable URL). The Share_Section SHALL render the QR code image (128×128 pixels) on the left side of the section as the first flex child. The Share_Section SHALL render "Copy URL" and "Download QR" buttons on the first row to the right of the QR code. The Share_Section SHALL render social share buttons (X/Twitter, Facebook, WhatsApp) on the second row to the right of the QR code. When the user clicks the "Copy URL" button, the Share_Section SHALL copy the full recipe URL to the clipboard and display a "Copied!" confirmation for 3 seconds before reverting to the default label. If the clipboard write operation fails, the Share_Section SHALL display an error indication for 3 seconds before reverting to the default label. The Share_Section layout SHALL be responsive: on viewports narrower than the `sm` breakpoint (640px), the QR code SHALL stack above the buttons in a single column layout.

#### Scenario: Share section without URL textbox
- **WHEN** the Share_Section renders
- **THEN** it SHALL NOT contain a `div[role="textbox"]` element
- **AND** it SHALL render a QR code image of 128×128 pixels as the first flex child

#### Scenario: Action button layout
- **WHEN** the Share_Section renders on a viewport at or above the `sm` breakpoint
- **THEN** the layout SHALL display the QR code on the left
- **AND** the first row to the right SHALL contain "Copy URL" and "Download QR" buttons
- **AND** the second row to the right SHALL contain X/Twitter, Facebook, and WhatsApp buttons

#### Scenario: Responsive stacking on mobile
- **WHEN** the viewport width is below the `sm` breakpoint (640px)
- **THEN** the QR code SHALL stack above the buttons in a single vertical column

#### Scenario: Copy URL success
- **WHEN** the user clicks the "Copy URL" button
- **THEN** the full recipe URL SHALL be copied to the clipboard
- **AND** the button SHALL display "Copied!" for 3 seconds before reverting to "Copy URL"

#### Scenario: Copy URL failure
- **WHEN** the user clicks the "Copy URL" button and the clipboard write fails
- **THEN** the button SHALL display an error indication for 3 seconds before reverting to "Copy URL"

### Requirement: Test Coverage

When the Taste_Notes_Filter is rendered with at least 2 taste notes selected, the test suite SHALL verify that the Recipe_List_Page passes all selected taste note IDs to the API as a comma-separated `tasteNoteIds` query parameter, confirming AND logic by asserting the resulting recipe list only includes recipes containing ALL selected notes. If one or more filters are active, the test suite SHALL verify that the "Clear Filters" button is visible at the top of the Filter_Sidebar immediately after the section heading. If no filters are active, the test suite SHALL verify that the "Clear Filters" button is not rendered in the Filter_Sidebar. The test suite SHALL verify that the Theme_Switcher renders the translated theme labels for English and Turkish locales by switching locale and asserting the displayed option labels match the expected translations. The test suite SHALL verify that the Language_Selector renders each available locale as an option displaying a flag emoji prefix and full language name. The test suite SHALL verify that the Share_Section does not render the readonly URL text display element, and renders action buttons in two rows. The test suite SHALL verify that the Equipment_Filter renders one dropdown per equipment type that has at least one item, with each dropdown displaying a human-readable type label and listing only equipment items belonging to that type. When the user clicks the "Clear Filters" button, the test suite SHALL verify that all filter values are reset to their default state and the recipe list is updated accordingly.

#### Scenario: Taste notes AND logic test
- **WHEN** the test suite runs with 2 taste notes selected
- **THEN** it SHALL verify the API receives `tasteNoteIds` as a comma-separated string
- **AND** it SHALL verify the filtered results contain only recipes with ALL selected taste notes

#### Scenario: Clear filters visibility test
- **WHEN** filters are active
- **THEN** the test suite SHALL verify the "Clear Filters" button is visible at the top of the Filter_Sidebar after the heading
- **WHEN** no filters are active
- **THEN** the test suite SHALL verify the "Clear Filters" button is not rendered

#### Scenario: Theme switcher translation test
- **WHEN** the test suite verifies the Theme_Switcher in English locale
- **THEN** it SHALL assert the labels are "Light Roast", "Dark Roast", "Medium Roast"
- **WHEN** the locale switches to Turkish
- **THEN** it SHALL assert the labels are "Açık Kavurma", "Koyu Kavurma", "Orta Kavurma"

#### Scenario: Language selector rendering test
- **WHEN** the test suite verifies the Language_Selector
- **THEN** it SHALL assert each option displays a flag emoji prefix and full language name ("🇬🇧 English", "🇹🇷 Türkçe")

#### Scenario: Share section layout test
- **WHEN** the test suite verifies the Share_Section
- **THEN** it SHALL assert no `div[role="textbox"]` is present
- **AND** it SHALL assert "Copy URL" and "Download QR" buttons render on the first row
- **AND** it SHALL assert social share buttons render on the second row

#### Scenario: Equipment filter grouping test
- **WHEN** the test suite verifies the Equipment_Filter
- **THEN** it SHALL assert one dropdown renders per equipment type with at least one item
- **AND** each dropdown SHALL display a human-readable type label
- **AND** each dropdown SHALL list only items of that type

#### Scenario: Clear filters resets state test
- **WHEN** the test suite simulates clicking the "Clear Filters" button
- **THEN** it SHALL verify all filter values reset to defaults
- **AND** it SHALL verify the recipe list updates with default parameters

### Requirement: Responsive Design

While the viewport width is below the `lg` breakpoint (1024px), the Taste_Notes_Filter multi-select dropdown SHALL render all selectable options and the trigger button with a minimum tap target size of 44×44px. While the viewport width is below the `lg` breakpoint (1024px), the Filter_Sidebar SHALL collapse into a hidden panel with a visible toggle button (minimum 44×44px tap target) that expands and collapses the filter controls on tap. While the viewport width is below the `lg` breakpoint (1024px), the Share_Section layout SHALL stack the QR code above the action buttons in a single vertical column. While the viewport width is at or above the `lg` breakpoint (1024px), the Share_Section layout SHALL display the QR code on the left and action buttons on the right in a horizontal row. The Language_Selector dropdown SHALL render all options with a minimum tap target size of 44×44px, support opening and closing via touch input, and be navigable using screen readers with appropriate ARIA roles and labels.

#### Scenario: Mobile taste notes tap target
- **WHEN** the viewport width is below the `lg` breakpoint
- **THEN** the Taste_Notes_Filter trigger and all selectable options SHALL have a minimum tap target size of 44×44px

#### Scenario: Mobile filter sidebar toggle
- **WHEN** the viewport width is below the `lg` breakpoint
- **THEN** the Filter_Sidebar SHALL be hidden by default
- **AND** a toggle button with minimum 44×44px tap target SHALL be visible
- **AND** tapping the toggle button SHALL expand or collapse the filter controls

#### Scenario: Responsive share section
- **WHEN** the viewport width is below the `lg` breakpoint
- **THEN** the Share_Section SHALL display the QR code stacked above the action buttons in a single vertical column
- **WHEN** the viewport width is at or above the `lg` breakpoint
- **THEN** the Share_Section SHALL display the QR code on the left and action buttons on the right in a horizontal row

#### Scenario: Language selector accessibility
- **WHEN** the Language_Selector dropdown is open
- **THEN** all options SHALL have a minimum tap target size of 44×44px
- **AND** the dropdown SHALL support opening and closing via touch input
- **AND** the dropdown SHALL be navigable using screen readers with appropriate ARIA roles and labels

### Requirement: Internationalization Completeness

When new translation keys are added to `en.json` for any feature, the `tr.json` file SHALL contain a corresponding entry for every key present in `en.json`, maintaining 1:1 key parity between the two locale files. The Language Selector option labels ("🇬🇧 English", "🇹🇷 Türkçe") SHALL be hardcoded display values rendered directly in component markup and SHALL NOT be referenced via translation keys in `en.json` or `tr.json`. If a key exists in `en.json` but is absent from `tr.json`, the system SHALL fall back to the English value for that key at runtime, and the `tr.json` file SHALL be updated to include a human-written Turkish translation before the feature is considered complete. When a new locale key is added, the corresponding Turkish translation in `tr.json` SHALL be a grammatically correct Turkish string that conveys the same meaning as the English value, and SHALL NOT be an empty string, a copy of the English text, or an auto-generated placeholder.

#### Scenario: Key parity between locales
- **WHEN** a new key is added to `en.json`
- **THEN** a corresponding key with a Turkish translation SHALL exist in `tr.json`
- **AND** the two files SHALL maintain 1:1 key parity

#### Scenario: Hardcoded language selector labels
- **WHEN** the Language_Selector renders
- **THEN** the option labels SHALL be hardcoded as "🇬🇧 English" and "🇹🇷 Türkçe"
- **AND** these labels SHALL NOT be looked up via translation keys

#### Scenario: Missing Turkish translation fallback
- **WHEN** a key exists in `en.json` but is absent from `tr.json`
- **THEN** at runtime the system SHALL display the English value as a fallback
- **AND** the missing key SHALL be added to `tr.json` with a human-written Turkish translation before the feature is considered complete

#### Scenario: Grammatically correct Turkish translations
- **WHEN** a new key is added to `tr.json`
- **THEN** its value SHALL be a grammatically correct Turkish string
- **AND** it SHALL convey the same meaning as the English value
- **AND** it SHALL NOT be an empty string, a copy of the English text, or an auto-generated placeholder
