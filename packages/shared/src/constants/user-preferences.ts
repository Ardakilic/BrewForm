/**
 * User preference enums — single source of truth.
 *
 * All four enums (UnitSystem, TemperatureUnit, Theme, DateFormat) feed the
 * `user_preferences` table's JSON column on the API side and the user-facing
 * settings page on the web side. The Postgres-side preference storage uses
 * `DateFormat` with underscore-separated values (`DD_MM_YYYY`) to stay
 * compatible with the underlying enum, while display strings
 * (`DD/MM/YYYY`) are produced via {@link DATE_FORMAT_DISPLAY}.
 */
export const UNIT_SYSTEM_VALUES = ['metric', 'imperial'] as const;
/** Measurement system for weight and volume display. */
export type UnitSystem = (typeof UNIT_SYSTEM_VALUES)[number];

export const TEMPERATURE_UNIT_VALUES = ['celsius', 'fahrenheit'] as const;
/**
 * Temperature unit for display.
 *
 * Was previously defined inline as a string-union on the `UserPreferences`
 * interface; promoted to a named type here to match the rest of the
 * preference enums.
 */
export type TemperatureUnit = (typeof TEMPERATURE_UNIT_VALUES)[number];

export const THEME_VALUES = ['light', 'dark', 'coffee'] as const;
/** UI colour theme. */
export type Theme = (typeof THEME_VALUES)[number];

/**
 * Stored date display format.
 *
 * Values use underscore separators (`DD_MM_YYYY`) to match the PostgreSQL
 * `date_format` enum exactly. Display strings with slashes/dashes
 * (`DD/MM/YYYY`) must NOT be used as stored values — use
 * {@link DATE_FORMAT_DISPLAY} when rendering the format to users.
 */
export const DATE_FORMAT_VALUES = ['DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD'] as const;
/** See {@link DATE_FORMAT_VALUES} for storage details. */
export type DateFormat = (typeof DATE_FORMAT_VALUES)[number];

/**
 * Map from stored `DateFormat` value to its human-readable display string.
 *
 * The UI should look up display labels through this map rather than string-
 * formatting the stored value directly, so that the database representation
 * (underscores) can stay decoupled from the user-facing representation.
 */
export const DATE_FORMAT_DISPLAY: Record<DateFormat, string> = {
  DD_MM_YYYY: 'DD/MM/YYYY',
  MM_DD_YYYY: 'MM/DD/YYYY',
  YYYY_MM_DD: 'YYYY-MM-DD',
};
