## ADDED Requirements

### Requirement: Critical fetch failures show user-facing error

When a client-side data fetch essential for rendering the page fails (e.g., the main recipe data in RecipeFocusModePage), the component SHALL display a user-facing error message via i18n and SHALL log the error with structured context including the error object and relevant identifiers (e.g., the recipe slug).

The error state SHALL take visual priority over the loading state — if both `error` and `!recipe` are true, the error message SHALL be displayed, not the loading spinner.

#### Scenario: Recipe fetch fails in focus mode

- **WHEN** `recipeApi.get(slug)` rejects with an Error on the RecipeFocusModePage
- **THEN** the UI SHALL display the translated `recipe.focusMode.loadError` message in a centered text block styled with `color: var(--error)`
- **AND** a structured `log.error({ err, slug })` call SHALL be emitted with message "Failed to fetch recipe for focus mode"
- **AND** the loading spinner SHALL NOT be displayed

#### Scenario: Recipe fetch succeeds in focus mode

- **WHEN** `recipeApi.get(slug)` resolves successfully on the RecipeFocusModePage
- **THEN** the error state SHALL NOT be displayed
- **AND** the recipe content SHALL render normally

### Requirement: Non-critical fetch failures log silently

When a client-side data fetch that is optional or degrades gracefully fails (e.g., taste notes autocomplete list, bean pre-fill from URL param), the component SHALL log the error with structured context and SHALL NOT display any user-facing error message. The component SHALL continue to render its default state (empty list, empty form field, etc.).

#### Scenario: Taste notes fetch fails in focus mode

- **WHEN** `tasteApi.flat()` rejects with an Error on the RecipeFocusModePage
- **THEN** a structured `log.error({ err })` call SHALL be emitted with message "Failed to fetch taste notes for focus mode"
- **AND** the page SHALL render normally with taste notes data as an empty array
- **AND** no user-facing error message SHALL be shown

#### Scenario: Bean pre-fill fetch fails in recipe create page

- **WHEN** `beanApi.get(beanId)` rejects with an Error on the RecipeCreatePage (triggered by `?beanId=<uuid>` URL param)
- **THEN** a structured `log.error({ err, beanId })` call SHALL be emitted with message "Failed to pre-fill bean info from URL param"
- **AND** the form SHALL render normally with empty bean-related fields
- **AND** no user-facing error message SHALL be shown

#### Scenario: Taste notes autocomplete list fetch fails

- **WHEN** `api.get('/taste-notes/flat')` rejects with an Error in the TasteAutocomplete component
- **THEN** a structured `log.error({ err })` call SHALL be emitted with message "Failed to fetch taste notes list"
- **AND** the autocomplete SHALL render with an empty suggestions list
- **AND** the "Loading taste notes..." placeholder SHALL NOT persist (the fetch completed, it just failed)
- **AND** no user-facing error message SHALL be shown

### Requirement: Structured logging follows project conventions

All new `log.error()` calls SHALL follow the project's logging conventions as defined in AGENTS.md:
- SHALL include the `err` object as the first argument
- SHALL include relevant traceable identifiers (e.g., `slug`, `beanId`) in the context object
- SHALL use a descriptive message string as the second argument
- SHALL NOT include passwords, tokens, secrets, API keys, or PII
- SHALL create a module-scoped logger once at the top of the file via `createLogger('ModuleName')`

#### Scenario: Logger is instantiated per component

- **WHEN** a component file imports `createLogger`
- **THEN** the file SHALL contain exactly one top-level `const log = createLogger(...)` call with a human-readable module name matching the component name
- **AND** no `console.log`, `console.error`, or `console.warn` calls SHALL be added

### Requirement: i18n keys are provided for both supported locales

Any new user-facing error message SHALL have a corresponding translation key in both `packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/tr.json`. Keys SHALL follow the existing namespace hierarchy (e.g., `recipe.focusMode.*`).

#### Scenario: Error message displays in English

- **WHEN** the locale is set to `en` and `recipe.focusMode.loadError` is rendered
- **THEN** the user SHALL see "Failed to load recipe"

#### Scenario: Error message displays in Turkish

- **WHEN** the locale is set to `tr` and `recipe.focusMode.loadError` is rendered
- **THEN** the user SHALL see "Tarif yüklenemedi"

### Requirement: Exported functions have JSDoc docblocks

All exported functions, components, and interfaces in the affected source files SHALL have JSDoc docblocks (`/** ... */`) immediately preceding the declaration. Docblocks for components SHALL describe the component's purpose. Docblocks for helper functions SHALL describe behavior, parameters, and side effects.

This applies to ALL currently undocumented exported declarations in the affected files, not just the ones being modified for error handling.

#### Scenario: Component docblock is present

- **WHEN** a file exports a React component function (e.g., `RecipeFocusModePage`, `RecipeCreatePage`, `TasteAutocomplete`)
- **THEN** a `/** ... */` JSDoc block SHALL be present immediately before the `export function` declaration
- **AND** the docblock SHALL describe the component's purpose and any notable behavior

#### Scenario: Helper function docblock is present

- **WHEN** a file exports or contains a named helper function (e.g., `toggleNote`, `handleSubmit`, `handleKeyDown`, `handleFork`)
- **THEN** a `/** ... */` JSDoc block SHALL be present before the function declaration
- **AND** the docblock SHALL describe the function's behavior, parameters, and side effects

#### Scenario: Interface docblock is present

- **WHEN** a file defines an exported interface (e.g., `TasteNote`, `Props`)
- **THEN** a `/** ... */` JSDoc block SHALL be present before the interface declaration
- **AND** the docblock SHALL describe what the interface represents
