## RENAMED Requirements

- FROM: `### Requirement: Pages with useEffect for data fetching must add log.error in existing catch blocks`
- TO: `### Requirement: Page data-loading failures are logged in loaders, actions and resource routes`

- FROM: `### Requirement: VerifyEmailPage logs token verification failure in existing useEffect catch`
- TO: `### Requirement: VerifyEmailPage logs token verification failure in its loader`

## MODIFIED Requirements

### Requirement: Page data-loading failures are logged in loaders, actions and resource routes

Every web page data-loading failure SHALL be logged with `log.error({ err }, '<PageName> <actionName> failed')` from the page's module-scoped logger. After wave 6, page reads run in route loaders, mutations in route actions, and component-level reads in fetcher resource routes (see the `web-data-loading` capability), so the log call SHALL sit in that loader's, action's or resource route's catch path, immediately before it rethrows (a loader, so the route error element renders) or returns `{ ok: false, error }` (an action). No page SHALL reintroduce a `useEffect` fetch to satisfy this requirement, and the log context SHALL carry ids only, never payloads or PII.

#### Scenario: RecipeEditPage loader logs loadRecipe failure when the recipe request rejects

- **WHEN** the `/recipes/:id/edit` loader (in `RecipeEditPage.data.ts`) requests the recipe and the API request rejects with a network error
- **THEN** the system SHALL emit `log.error({ err }, 'RecipeEditPage loadRecipe failed')` before the loader rethrows
- **AND** the route error state renders inside the app shell instead of a blank form

#### Scenario: RecipeEditPage loader logs equipment and bean lookup failures

- **WHEN** the same loader's equipment or beans request rejects
- **THEN** the system SHALL emit `log.error({ err }, 'RecipeEditPage loadEquipment failed')` (or `'RecipeEditPage loadBeans failed'`) before rethrowing

#### Scenario: Admin user detail loader logs loadData failure when the user request rejects

- **WHEN** the `/admin/users/:id` loader requests the user and the API request rejects with a non-404 error
- **THEN** the system SHALL emit `log.error({ err }, 'AdminUserDetailPage loadData failed')` before rethrowing
- **AND** a 404 renders the not-found page without an error log

### Requirement: VerifyEmailPage logs token verification failure in its loader

Email-token verification SHALL run once in the `/verify-email` route loader (with `shouldRevalidate: () => false`), not in a component `useEffect`. When verification fails, the loader SHALL emit `log.error({ err }, 'VerifyEmailPage verifyEmail failed')` and return an error result that the page renders as its error state. The component SHALL keep its dedicated mount/unmount debug-logging `useEffect`.

#### Scenario: VerifyEmailPage logs token verification failure

- **WHEN** `/verify-email?token=...` is opened and the `GET /api/v1/auth/verify-email?token=...` request rejects with a 400 or 404 response
- **THEN** the loader SHALL emit `log.error({ err }, 'VerifyEmailPage verifyEmail failed')`
- **AND** the page renders its error state, and the token is verified at most once even under React StrictMode

#### Scenario: VerifyEmailPage logs mount and unmount

- **WHEN** `VerifyEmailPage` is first rendered
- **THEN** the system SHALL emit `log.debug({}, 'VerifyEmailPage mounted')` from a dedicated mount/unmount `useEffect`
- **AND** on unmount, SHALL emit `log.debug({}, 'VerifyEmailPage unmounted')` from the cleanup function
