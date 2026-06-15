## ADDED Requirements

### Requirement: Web page components log mount and unmount lifecycle

Every web page component SHALL emit a `log.debug` call when it mounts and a `log.debug` call when it unmounts via a `useEffect` hook with an empty dependency array.

#### Scenario: Page component logs mount

- **WHEN** the `RecipeEditPage` component is first rendered
- **THEN** the system SHALL emit `log.debug({}, 'RecipeEditPage mounted')` from within a `useEffect(() => { ... }, [])`

#### Scenario: Page component logs unmount

- **WHEN** the user navigates away from `RecipeEditPage` causing it to unmount
- **THEN** the system SHALL emit `log.debug({}, 'RecipeEditPage unmounted')` from the `useEffect` cleanup function

#### Scenario: Page with route parameters includes IDs in mount log

- **WHEN** a page receives route parameters (e.g., slug or id) from `useParams`
- **THEN** the mount log SHALL include the relevant identifier (e.g., `log.debug({ slug }, 'RecipeEditPage mounted')`)

### Requirement: Web page components log async operation failures

Every async operation (data fetching, form submission) within a page component that has a catch block SHALL emit `log.error({ err }, '<PageName> <actionName> failed')` in the catch handler.

#### Scenario: Data fetch failure is logged

- **WHEN** `RecipeEditPage` attempts to load recipe data and the API call fails
- **THEN** the system SHALL emit `log.error({ err }, 'RecipeEditPage loadRecipe failed')` in the catch block

#### Scenario: Form submission failure is logged

- **WHEN** `ForgotPasswordPage` attempts to send a password reset email and the API call fails
- **THEN** the system SHALL emit `log.error({ err }, 'ForgotPasswordPage sendResetEmail failed')` in the catch block

### Requirement: Auth context provider logs authentication state changes

The AuthContext provider SHALL log login, logout, and token refresh events using log.info for state transitions and log.error/log.warn for failures.

#### Scenario: User login is logged

- **WHEN** a user successfully logs in
- **THEN** the system SHALL emit `log.info({ userId }, 'AuthContext user logged in')`

#### Scenario: User logout is logged

- **WHEN** a user logs out
- **THEN** the system SHALL emit `log.info({}, 'AuthContext user logged out')`

#### Scenario: Token refresh failure is logged

- **WHEN** a token refresh attempt fails
- **THEN** the system SHALL emit `log.warn({ err }, 'AuthContext token refresh failed — session may be expired')` in the catch block

#### Scenario: Login failure is logged

- **WHEN** a login attempt fails
- **THEN** the system SHALL emit `log.error({ err }, 'AuthContext login failed')` in the catch block

### Requirement: Error boundary component logs render errors

The ErrorBoundary component SHALL log caught render errors with their component stack trace at error level.

#### Scenario: Render error is caught and logged

- **WHEN** a child component throws a render error caught by ErrorBoundary
- **THEN** the system SHALL emit `log.error({ err, componentStack }, 'ErrorBoundary caught render error')`

#### Scenario: Error boundary reset is logged

- **WHEN** the user triggers an error boundary reset
- **THEN** the system SHALL emit `log.info({}, 'ErrorBoundary reset triggered')`

### Requirement: Web page loggers follow naming convention

Each web page component SHALL use the component's PascalCase name as the logger name.

#### Scenario: Page logger uses PascalCase

- **WHEN** `RecipeEditPage` instantiates its logger
- **THEN** the logger SHALL be created with `createLogger('RecipeEditPage')`

#### Scenario: Logger import uses @ alias or relative path

- **WHEN** a web page imports `createLogger`
- **THEN** the import path SHALL be either `@/utils/logger.ts` or a valid relative path to `apps/web/src/utils/logger.ts`

### Requirement: Pages with useEffect for data fetching must add log.error in existing catch blocks

Web page components that use `useEffect` to fetch data from API endpoints and already have `try/catch` error handling SHALL add a `log.error({ err }, '<PageName> <actionName> failed')` call in every existing catch block, without restructuring the existing error handling logic.

#### Scenario: RecipeEditPage logs loadRecipe failure when API call for recipe data rejects

- **WHEN** `RecipeEditPage` mounts and calls `fetchRecipe(slug)` inside a `useEffect`, and the API request rejects with a network error
- **THEN** the system SHALL emit `log.error({ err }, 'RecipeEditPage loadRecipe failed')` in the existing catch block
- **AND** the existing `setError(...)` or `setIsLoading(false)` state updates SHALL still execute after the log call

#### Scenario: RecipeEditPage logs loadBeans failure when bean list fetch rejects

- **WHEN** `RecipeEditPage` calls `fetchBeans()` inside a `useEffect`, and the API request rejects
- **THEN** the system SHALL emit `log.error({ err }, 'RecipeEditPage loadBeans failed')` in the existing catch block

#### Scenario: RecipeEditPage logs loadEquipment failure when equipment list fetch rejects

- **WHEN** `RecipeEditPage` calls `fetchEquipment()` inside a `useEffect`, and the API request rejects
- **THEN** the system SHALL emit `log.error({ err }, 'RecipeEditPage loadEquipment failed')` in the existing catch block

#### Scenario: Admin user detail page logs loadData failure when user fetch rejects

- **WHEN** `AdminUserDetailPage` calls `fetchUser(userId)` inside a `useEffect`, and the API request rejects
- **THEN** the system SHALL emit `log.error({ err }, 'AdminUserDetailPage loadData failed')` in the existing catch block

### Requirement: Pages with form submission handlers must add log.error in submission catch blocks

Web page components that handle form submissions (create, update, delete operations) and already wrap the submission in `try/catch` SHALL add a `log.error({ err }, '<PageName> <actionName> failed')` call in every submission catch block.

#### Scenario: RecipeEditPage logs saveRecipe failure when form submission rejects

- **WHEN** a user submits the recipe edit form on `RecipeEditPage` and the `PUT /api/v1/recipes/:id` request rejects
- **THEN** the system SHALL emit `log.error({ err }, 'RecipeEditPage saveRecipe failed')` in the form submission catch block
- **AND** the existing error UI state (toast, inline error, etc.) SHALL still be set

#### Scenario: ForgotPasswordPage logs sendResetEmail failure

- **WHEN** a user submits the forgot password form and the `POST /api/v1/auth/forgot-password` request rejects
- **THEN** the system SHALL emit `log.error({ err }, 'ForgotPasswordPage sendResetEmail failed')` in the form submission catch block

#### Scenario: ResetPasswordPage logs resetPassword failure

- **WHEN** a user submits the reset password form and the `POST /api/v1/auth/reset-password` request rejects
- **THEN** the system SHALL emit `log.error({ err }, 'ResetPasswordPage resetPassword failed')` in the form submission catch block

#### Scenario: LoginPage already has logging; no duplicate additions needed

- **WHEN** `LoginPage` handles a login form submission failure
- **THEN** the existing `log.error({ err }, 'LoginPage login failed')` SHALL satisfy this requirement
- **AND** no new log calls SHALL be added to `LoginPage`'s catch blocks

### Requirement: AuthContext must log user banned state when detected

The AuthContext provider SHALL detect and log when an authenticated user's account has been banned. This applies both to the initial auth check (login response, token refresh response) and to any subsequent API calls that return a 403 with a banned-account indicator.

#### Scenario: AuthContext logs banned user on login response

- **WHEN** the login API returns a response indicating the user account is banned (e.g., HTTP 403 with `{ code: 'ACCOUNT_BANNED' }`)
- **THEN** the system SHALL emit `log.warn({ userId }, 'AuthContext user account is banned')` before updating state to reflect the banned status

#### Scenario: AuthContext logs banned user on token refresh response

- **WHEN** the token refresh API returns a 403 response indicating the user was banned after initial login
- **THEN** the system SHALL emit `log.warn({ userId }, 'AuthContext user account is banned')` before clearing auth state

#### Scenario: AuthContext logs token refresh lifecycle at debug level

- **WHEN** token refresh is triggered (on mount or periodically)
- **THEN** the system SHALL emit `log.debug({}, 'AuthContext token refresh started')` before the refresh request
- **AND** SHALL emit `log.debug({}, 'AuthContext token refresh completed')` on successful refresh

### Requirement: VerifyEmailPage logs token verification failure in existing useEffect catch

The `VerifyEmailPage` component already has a `useEffect` that calls the email verification API on mount and includes a catch block for error handling. The log expansion SHALL add a `log.error` call in that existing catch block without restructuring the effect.

#### Scenario: VerifyEmailPage logs token verification failure

- **WHEN** `VerifyEmailPage` mounts and the `GET /api/v1/auth/verify-email?token=...` request rejects with a 400 or 404 response
- **THEN** the system SHALL emit `log.error({ err }, 'VerifyEmailPage verifyEmail failed')` in the existing `useEffect` catch block
- **AND** the existing error state update (e.g., `setError(...)`, `setStatus('error')`) SHALL still execute

#### Scenario: VerifyEmailPage logs mount and unmount

- **WHEN** `VerifyEmailPage` is first rendered
- **THEN** the system SHALL emit `log.debug({}, 'VerifyEmailPage mounted')` from a dedicated mount/unmount `useEffect`
- **AND** on unmount, SHALL emit `log.debug({}, 'VerifyEmailPage unmounted')` from the cleanup function

### Requirement: AuthContext logs registration failures

The AuthContext provider SHALL log registration attempts that fail, using `log.error` with the error object, to provide visibility into sign-up problems.

#### Scenario: Registration failure is logged

- **WHEN** a user registration attempt fails (e.g., duplicate email, validation error, server error)
- **THEN** the system SHALL emit `log.error({ err }, 'AuthContext registration failed')` in the registration catch block
- **AND** the existing error state (returned to the calling component) SHALL be unchanged
