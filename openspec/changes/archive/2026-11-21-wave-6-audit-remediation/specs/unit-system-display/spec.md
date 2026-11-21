## ADDED Requirements

### Requirement: Unit system display reflects the user preference
The web app SHALL display recipe measurements (weight, volume, temperature) in the unit system from the authenticated user's preferences, and SHALL fall back to metric when no user is signed in, the user has no preferences record, or `unitSystem` is undefined.

#### Scenario: Metric preference
- **WHEN** a signed-in user whose `unitSystem` is `'metric'` views a recipe detail or versions page
- **THEN** weights and volumes are shown in metric units

#### Scenario: Imperial preference
- **WHEN** a signed-in user whose `unitSystem` is `'imperial'` views the same pages
- **THEN** weights and volumes are shown in imperial units

#### Scenario: Anonymous visitor
- **WHEN** a signed-out visitor views a recipe page
- **THEN** measurements are shown in metric units

### Requirement: Unit display reacts to preference changes without a reload
Changing the unit system in Settings SHALL update every subsequently rendered recipe view without a full page reload, because Settings refreshes the auth user after saving and the unit hook reads that user reactively.

#### Scenario: Detail page updates after a Settings change
- **WHEN** a user switches from metric to imperial in Settings, saves, and navigates back to a recipe detail page
- **THEN** the page shows imperial units without a browser reload

### Requirement: Preferences flow through the authenticated user
`GET /api/v1/users/me` SHALL include a `preferences` object (`unitSystem`, `temperatureUnit`, `theme`, `locale`, `timezone`, `dateFormat` and the flat `notify*` notification flags), and the `useUnitSystem` hook (`apps/web/src/hooks/useUnitSystem.ts`) SHALL return `useAuth().user?.preferences?.unitSystem ?? 'metric'`.

#### Scenario: /users/me carries preferences
- **WHEN** an authenticated client calls `GET /api/v1/users/me`
- **THEN** the response data contains `preferences.unitSystem` and the other preference fields, validated by `SelfUserOutputSchema`

#### Scenario: Hook reads auth context
- **WHEN** `useUnitSystem` runs inside an `AuthProvider` whose user has `preferences.unitSystem = 'imperial'`
- **THEN** it returns `'imperial'`, and it returns `'metric'` when `preferences` is undefined

### Requirement: Unit preference is never read from localStorage
The unit-system code path SHALL NOT read or write any `localStorage` key (including the retired `brewform-preferences` key).

#### Scenario: No storage access
- **WHEN** `useUnitSystem` executes in a test with a spied `localStorage`
- **THEN** no `localStorage` method is called
