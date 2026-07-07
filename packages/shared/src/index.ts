/**
 * @brewform/shared — Types, Zod schemas, constants, utils, and i18n
 * shared between the API (apps/api) and web frontend (apps/web).
 *
 * All relative imports use explicit .ts extensions.
 */
export * from './types/index.ts';
export * from './schemas/index.ts';
// Disambiguate names that exist in BOTH ./types and ./schemas barrels.
// The ./schemas versions (Zod-inferred from request/response schemas) are the
// canonical types per the wave-4 schema-type-export work; the ./types versions
// (hand-written interfaces) remain reachable via the `@brewform/shared/types`
// subpath. An explicit re-export overrides the `export *` ambiguity (TS2308) in
// favour of the schemas version.
export type { Follow, PaginationMeta, UserPreferences } from './schemas/index.ts';
export * from './constants/index.ts';
export * from './utils/index.ts';
export * from './logger/index.ts';
