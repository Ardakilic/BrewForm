/**
 * User and profile type definitions shared between API and frontend.
 *
 * Defines the authenticated user object, public profile shape,
 * and user-configurable preferences.
 *
 * Preference enum types are aliased to the corresponding constants in
 * `@brewform/shared/constants` so the database enum, Zod schema, and
 * TypeScript union share a single source of truth.
 */
import type {
  DateFormat as _DateFormat,
  TemperatureUnit as _TemperatureUnit,
  Theme as _Theme,
  UnitSystem as _UnitSystem,
} from '../constants/user-preferences.ts';

/** UI colour theme. */
export type Theme = _Theme;

/** Measurement system for weight and volume display. */
export type UnitSystem = _UnitSystem;

/**
 * Date display format.
 * Stored values use underscore separators to match the PostgreSQL `date_format` enum.
 * For human-readable display strings (e.g. `DD/MM/YYYY`) use the
 * `DATE_FORMAT_DISPLAY` map from `@brewform/shared/constants`.
 */
export type DateFormat = _DateFormat;

/** Temperature unit for display. */
export type TemperatureUnit = _TemperatureUnit;

/**
 * Serialisable user preferences stored in the `preferences` JSON column.
 *
 * These control display behaviour (units, theme, locale) and email
 * notification settings.
 */
export interface UserPreferences {
  unitSystem: UnitSystem;
  temperatureUnit: TemperatureUnit;
  theme: Theme;
  locale: string;
  timezone: string;
  dateFormat: DateFormat;
  emailNotifications: {
    newFollower: boolean;
    recipeLiked: boolean;
    recipeCommented: boolean;
    followedUserPosted: boolean;
  };
}

/**
 * Authenticated user object returned on login/signup and accessible
 * via `ctx.get('user')` in route handlers.
 */
export interface User {
  /** UUID primary key */
  id: string;
  email: string;
  /** Unique public handle */
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  preferences: UserPreferences;
  /** Whether the onboarding flow has been completed */
  onboardingCompleted: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Public-facing user profile returned by `GET /api/v1/users/:username`.
 *
 * Sensitive fields (email, full preferences) are excluded.
 */
export interface UserProfile {
  /** UUID primary key */
  id: string;
  /** Unique public handle */
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  /** Number of public recipes */
  publicRecipeCount: number;
  followerCount: number;
  followingCount: number;
  /** Badges the user has earned */
  badges: Array<{ id: string; name: string; icon: string }>;
  /** User's hand-picked featured recipes (up to a platform limit) */
  featuredRecipes: Array<{
    id: string;
    slug: string;
    title: string;
    photoUrl: string | null;
    rating: number | null;
  }>;
  createdAt: Date;
}
