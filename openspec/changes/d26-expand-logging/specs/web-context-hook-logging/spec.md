## ADDED Requirements

### Requirement: Theme context logs theme changes

The ThemeContext provider SHALL emit a `log.debug` call when the theme is toggled, including the new theme value.

#### Scenario: Theme toggle is logged

- **WHEN** the user switches from light to dark theme
- **THEN** the system SHALL emit `log.debug({ theme: 'dark' }, 'ThemeContext theme changed')`

### Requirement: I18n context logs locale changes

The I18nContext provider SHALL emit a `log.debug` call when the locale is changed, including the new locale value.

#### Scenario: Locale change is logged

- **WHEN** the user switches from English to Turkish
- **THEN** the system SHALL emit `log.debug({ locale: 'tr' }, 'I18nContext locale changed')`

### Requirement: useDebounce hook logs timer lifecycle at trace level

The useDebounce hook SHALL emit `log.trace` calls when the debounce timer is set and cleared, to avoid noise at higher log levels.

#### Scenario: Debounce timer set is logged

- **WHEN** the debounced value changes and a new timer is scheduled
- **THEN** the system SHALL emit `log.trace({ value }, 'useDebounce timer set')` when the timer is created

#### Scenario: Debounce timer cleared is logged

- **WHEN** the debounced value changes again before the previous timer fires
- **THEN** the system SHALL emit `log.trace({}, 'useDebounce timer cleared')` in the cleanup function

### Requirement: useUnitSystem hook logs unit system reads at trace level

The useUnitSystem hook SHALL emit a `log.trace` call when the unit system is read from user preferences.

#### Scenario: Unit system read is logged

- **WHEN** `useUnitSystem()` returns `'metric'` based on user preferences
- **THEN** the system SHALL emit `log.trace({ unitSystem: 'metric' }, 'useUnitSystem unit system read')`

### Requirement: useStaticCacheSync hook logs mount/unmount and cache bust events

The useStaticCacheSync hook SHALL log its mount/unmount lifecycle and SHALL log when a cross-tab cache bust event is detected.

#### Scenario: Hook mount is logged

- **WHEN** `useStaticCacheSync` is first mounted in `App.tsx`
- **THEN** the system SHALL emit `log.debug({}, 'useStaticCacheSync mounted')`

#### Scenario: Hook unmount is logged

- **WHEN** the component using `useStaticCacheSync` unmounts
- **THEN** the system SHALL emit `log.debug({}, 'useStaticCacheSync unmounted')` from the cleanup function

#### Scenario: Cross-tab cache bust is logged

- **WHEN** a `storage` event with key `'brewform-static-cache-bust'` is received from another browser tab
- **THEN** the system SHALL emit `log.debug({ key: 'brewform-static-cache-bust' }, 'useStaticCacheSync cross-tab cache bust detected')` before calling `invalidateStaticCache()`

### Requirement: Context and hook loggers follow PascalCase naming

Each context provider and hook SHALL use its PascalCase name as the logger name.

#### Scenario: ThemeContext logger naming

- **WHEN** `ThemeContext.tsx` instantiates its logger
- **THEN** the logger SHALL be created with `createLogger('ThemeContext')`

#### Scenario: useDebounce logger naming

- **WHEN** `useDebounce.ts` instantiates its logger
- **THEN** the logger SHALL be created with `createLogger('useDebounce')`

### Requirement: useStaticCacheSync coverage includes all lifecycle and event paths

The `useStaticCacheSync` hook manages cross-tab cache synchronization via the browser `storage` event. The hook's logging coverage SHALL be as complete as a web page component: mount, unmount, and all event-driven actions.

#### Scenario: useStaticCacheSync has module-scoped logger

- **WHEN** `useStaticCacheSync.ts` is loaded
- **THEN** the file SHALL contain `import { createLogger } from '@/utils/logger.ts'`
- **AND** SHALL contain `const log = createLogger('useStaticCacheSync')`

#### Scenario: useStaticCacheSync logs event listener registration on mount

- **WHEN** the `useEffect` in `useStaticCacheSync` registers the `storage` event listener via `window.addEventListener('storage', handler)`
- **THEN** the system SHALL have emitted `log.debug({}, 'useStaticCacheSync mounted')` before the listener is registered

#### Scenario: useStaticCacheSync logs event listener removal on unmount

- **WHEN** the `useEffect` cleanup function removes the `storage` event listener via `window.removeEventListener('storage', handler)`
- **THEN** the system SHALL emit `log.debug({}, 'useStaticCacheSync unmounted')` from the cleanup function

#### Scenario: Non-cache-bust storage events are not logged

- **WHEN** a `storage` event is received with a key other than `'brewform-static-cache-bust'` (e.g., `'theme'`, `'locale'`)
- **THEN** the system SHALL NOT emit any log call for that event (to avoid noise from unrelated storage events)

#### Scenario: useStaticCacheSync logs the cache invalidation action

- **WHEN** the cross-tab cache bust event is detected and `invalidateStaticCache()` is called
- **THEN** the log call SHALL occur BEFORE the `invalidateStaticCache()` call
- **AND** the `invalidateStaticCache()` call SHALL still execute after the log

### Requirement: useDebounce must use log.trace to avoid noise at debug level

The `useDebounce` hook is a high-frequency hook — it creates and clears timers on every keystroke or rapid value change. Using `log.debug` for these events would flood the debug log and make it unusable for troubleshooting other components. The hook SHALL use `log.trace` exclusively so that its output is only visible when `LOG_LEVEL=trace` is explicitly set.

#### Scenario: useDebounce timer set uses log.trace, not log.debug

- **WHEN** the debounced value changes (e.g., user types a character in a search input) and a new `setTimeout` is created
- **THEN** the system SHALL emit `log.trace({ value }, 'useDebounce timer set')` — using `trace`, NOT `debug`

#### Scenario: useDebounce timer clear uses log.trace, not log.debug

- **WHEN** the debounced value changes and the previous `setTimeout` is cleared via `clearTimeout`
- **THEN** the system SHALL emit `log.trace({}, 'useDebounce timer cleared')` — using `trace`, NOT `debug`

#### Scenario: useDebounce at LOG_LEVEL=debug produces zero log output from the hook

- **WHEN** the application is running with `VITE_LOG_LEVEL=debug`
- **THEN** the `useDebounce` hook SHALL produce zero log output (all calls are `trace` level and filtered)
- **AND** debug-level logs from other components (pages, contexts) SHALL still be visible

#### Scenario: useDebounce at LOG_LEVEL=trace produces timer lifecycle output

- **WHEN** the application is running with `VITE_LOG_LEVEL=trace`
- **THEN** `useDebounce` SHALL emit `log.trace` calls for timer set and clear events
- **AND** this output SHALL only be used for deep debugging of debounce behavior, not for routine development

### Requirement: Theme context preserves existing theme state during logging

The ThemeContext SHALL emit the theme change log call AFTER updating the theme state (or before, consistently), and SHALL NOT block, delay, or alter the theme toggle behavior. The log call SHALL be a fire-and-forget side effect.

#### Scenario: Theme toggle completes even if logger is unavailable

- **WHEN** the user toggles the theme
- **THEN** the theme SHALL change regardless of whether the logger is functional
- **AND** any logger error SHALL NOT propagate to the theme toggle flow

### Requirement: I18n context preserves existing locale state during logging

The I18nContext SHALL emit the locale change log call without affecting the i18n library's locale switching behavior or the re-render cascade of translated components.

#### Scenario: Locale change completes even if logger is unavailable

- **WHEN** the user changes the locale
- **THEN** the locale SHALL change and all translated content SHALL update regardless of logger status
- **AND** any logger error SHALL NOT prevent the locale change from taking effect
