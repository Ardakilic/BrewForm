## ADDED Requirements

### Requirement: Unit system display reflects user preference

The system SHALL display recipe measurement values (weight, volume, temperature) in the unit system specified by the authenticated user's preferences.

When no user is authenticated, or when the user has no preferences record, the system SHALL fall back to the metric system.

#### Scenario: Authenticated user with metric preference sees metric units

- **WHEN** an authenticated user whose `unitSystem` preference is `'metric'` views a recipe detail or recipe versions page
- **THEN** the system SHALL display all weight and volume measurements in metric units (grams, milliliters, liters, etc.)

#### Scenario: Authenticated user with imperial preference sees imperial units

- **WHEN** an authenticated user whose `unitSystem` preference is `'imperial'` views a recipe detail or recipe versions page
- **THEN** the system SHALL display all weight and volume measurements in imperial units (ounces, fluid ounces, gallons, etc.)

#### Scenario: Unauthenticated user sees metric units

- **WHEN** an unauthenticated user (no user object available) views a recipe page
- **THEN** the system SHALL display all measurements in metric units

### Requirement: Unit system display reacts to preference changes without page reload

The system SHALL update the displayed unit system on all currently rendered recipe pages when the user changes their unit system preference in Settings, without requiring a full page navigation or reload.

#### Scenario: Changing unit system in Settings immediately updates recipe detail page

- **WHEN** a user is viewing a recipe detail page AND navigates to Settings AND changes the unit system from metric to imperial AND saves
- **THEN** upon returning to the recipe detail page (via back navigation or tab switch), the displayed units SHALL reflect imperial measurements

#### Scenario: Changing unit system in Settings updates recipe versions page

- **WHEN** a user is viewing a recipe versions page AND navigates to Settings AND changes the unit system from imperial to metric AND saves
- **THEN** upon returning to the recipe versions page, the displayed units SHALL reflect metric measurements

### Requirement: Preference data flows through existing auth infrastructure

The system SHALL include the user's preferences in the `/users/me` API response so that the frontend `AuthUser` object carries the data needed for unit system display.

The `useUnitSystem` hook SHALL derive its return value from `useAuth().user?.preferences?.unitSystem` rather than from `localStorage`.

#### Scenario: /users/me includes preferences after backend change

- **WHEN** the API receives a GET request to `/users/me` from an authenticated user
- **THEN** the response SHALL include a `preferences` field containing the user's `unitSystem`, `temperatureUnit`, `theme`, `locale`, `timezone`, `dateFormat`, and `emailNotifications`

#### Scenario: useUnitSystem returns value from AuthContext

- **WHEN** the `useUnitSystem` hook is called within an `AuthProvider` context where `user.preferences.unitSystem` is `'imperial'`
- **THEN** the hook SHALL return `'imperial'`

#### Scenario: useUnitSystem falls back to metric when preferences missing

- **WHEN** the `useUnitSystem` hook is called within an `AuthProvider` context where `user.preferences` is undefined (e.g., new account or SSR)
- **THEN** the hook SHALL return `'metric'`

### Requirement: Dead localStorage code path is removed

The system SHALL NOT read from or write to any `localStorage` key for unit system preferences. The `brewform-preferences` key SHALL be removed from the `useUnitSystem` implementation.

#### Scenario: No localStorage read performed for unit system

- **WHEN** the `useUnitSystem` hook executes
- **THEN** the system SHALL NOT call `localStorage.getItem('brewform-preferences')` or any `localStorage` method
