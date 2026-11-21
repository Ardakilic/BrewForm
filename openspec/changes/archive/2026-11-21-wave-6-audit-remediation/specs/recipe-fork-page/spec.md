## ADDED Requirements

### Requirement: Fork page is served at /recipes/:id/fork for signed-in users
The web router SHALL serve `RecipeForkPage` (lazy-loaded) at `/recipes/:id/fork`, wrapped in `RequireAuth`, so only authenticated users can reach it and anonymous visitors are redirected to `/login`.

#### Scenario: Authenticated user opens the fork page
- **WHEN** a signed-in user navigates to `/recipes/:id/fork`
- **THEN** the page loads and shows the source recipe title with a pre-filled fork-title input

#### Scenario: Anonymous visitor is redirected
- **WHEN** a signed-out visitor navigates to `/recipes/:id/fork`
- **THEN** they are redirected to `/login`

### Requirement: Source recipe title is loaded and shown
The fork page SHALL fetch the source recipe with `recipeApi.get(id)`, display its title, pre-fill the title input with the translated `recipe.fork.ofTitle` string (en: "Fork of {title}"), and show the translated `recipe.fork.loadError` message ("Failed to load recipe") when the fetch fails.

#### Scenario: Source loads
- **WHEN** the page mounts with a valid recipe id
- **THEN** the source title is displayed and the input reads "Fork of <source title>" in the active locale

#### Scenario: Source fails to load
- **WHEN** `recipeApi.get` rejects
- **THEN** the translated load-error message is displayed and the error is logged with the `err` object

### Requirement: Fork title is editable and capped at 200 characters
The fork-title input SHALL accept a custom title with `maxLength={200}`, and an empty or whitespace-only title SHALL be sent as `undefined` so the API defaults it to `"Fork of <source title>"`.

#### Scenario: User customises the title
- **WHEN** the user edits the input
- **THEN** the input reflects the new value and never exceeds 200 characters

#### Scenario: Cleared title falls back on the server
- **WHEN** the user clears the input and submits
- **THEN** `recipeApi.fork(id, undefined)` is called and the created fork is titled "Fork of <source title>"

### Requirement: Fork submission navigates to the new recipe's editor
Submitting SHALL call `recipeApi.fork(id, title)`, disable the submit button while the request is in flight, navigate to `/recipes/<newId>/edit` on success, and on failure show the error message, re-enable the button and log the error.

#### Scenario: Successful fork
- **WHEN** the user submits the form
- **THEN** the button is disabled during the request and the user lands on the new recipe's edit page

#### Scenario: Fork fails
- **WHEN** the API rejects with 403 or 404
- **THEN** the error message is shown and the submit button is enabled again

### Requirement: Fork page is excluded from search indexing
The fork page SHALL render `SEOHead` with `noIndex`, producing `<meta name="robots" content="noindex, nofollow">`, and a translated `recipe.fork.seoTitle` title.

#### Scenario: Robots meta is present
- **WHEN** the fork page renders
- **THEN** the document head contains `<meta name="robots" content="noindex, nofollow">`

### Requirement: Fork page logs lifecycle and actions
The fork page SHALL use a module-scoped `createLogger('RecipeForkPage')` and log mount and unmount, source-load start, completion and failure, and fork start, completion and failure, with recipe ids and never personal data.

#### Scenario: Mount and unmount are logged
- **WHEN** the page mounts and then unmounts
- **THEN** debug logs `RecipeForkPage mounted` and `RecipeForkPage unmounted` are emitted with the recipe id
