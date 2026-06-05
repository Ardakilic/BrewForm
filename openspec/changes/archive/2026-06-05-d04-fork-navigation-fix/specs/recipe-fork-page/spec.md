## ADDED Requirements

### Requirement: Fork page accessible at /recipes/:id/fork
The system SHALL serve a fork confirmation page at the route `/recipes/:id/fork` for authenticated users. The route MUST require authentication via `RequireAuth`.

#### Scenario: Authenticated user navigates to fork page
- **WHEN** an authenticated user navigates to `/recipes/:id/fork`
- **THEN** the fork page loads and displays the source recipe title with a pre-filled fork title input

#### Scenario: Unauthenticated user navigates to fork page
- **WHEN** an unauthenticated user navigates to `/recipes/:id/fork`
- **THEN** the system redirects them to `/login`

### Requirement: Source recipe title displayed on fork page
The system SHALL fetch the source recipe via `recipeApi.get(id)` and display its title on the fork page. If the fetch fails, the system SHALL display an error message.

#### Scenario: Source recipe loaded successfully
- **WHEN** the fork page mounts with a valid recipe UUID
- **THEN** the source recipe title is displayed and the fork title input is pre-filled with `"Fork of <source title>"`

#### Scenario: Source recipe not found
- **WHEN** the fork page mounts with an invalid recipe UUID
- **THEN** an error message is displayed: "Failed to load recipe"

### Requirement: Custom fork title input
The system SHALL provide a text input for the fork title, pre-filled with `"Fork of <source title>"` and capped at 200 characters. The input MUST accept an optional custom title.

#### Scenario: User customizes fork title
- **WHEN** the user changes the title in the fork title input
- **THEN** the input reflects the new value, truncated if exceeding 200 characters

#### Scenario: User clears fork title
- **WHEN** the user clears the title input and submits
- **THEN** the server defaults the title to `"Fork of <source title>"`

### Requirement: Fork submission and navigation
The system SHALL call `recipeApi.fork(id, title)` on form submission, disable the submit button during the API call, and navigate to `/recipes/${result.id}/edit` on success. On failure, the system SHALL display the error message.

#### Scenario: Successful fork
- **WHEN** the user clicks the fork submit button
- **THEN** the button is disabled, the API is called, and on success the user is navigated to the new recipe's edit page

#### Scenario: Fork fails
- **WHEN** the fork API call fails (e.g., 403 forbidden, 404 not found)
- **THEN** the error message is displayed to the user and the submit button is re-enabled

### Requirement: SEO metadata on fork page
The system SHALL include `noIndex` SEO metadata on the fork page, as it is a transient action page not intended for search engine indexing.

#### Scenario: Fork page renders with noIndex
- **WHEN** the fork page is rendered
- **THEN** the page includes `<meta name="robots" content="noindex, nofollow">`
