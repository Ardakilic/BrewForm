/**
 * BrewForm Type Definitions
 * Shared types for CUID and other common patterns
 */

// ============================================
// CUID Types
// ============================================

/**
 * CUID string type for database IDs
 * This is a branded type for better type safety
 */
export type Cuid = string & { readonly __brand: unique symbol };

/**
 * Helper function to create a CUID type from a string
 * Use this when you have validated that a string is a CUID
 */
export function asCuid(id: string): Cuid {
  return id as Cuid;
}

/**
 * Type guard to check if a string is a valid CUID format
 */
export function isCuid(value: string): value is Cuid {
  // CUID format: c followed by timestamp, random bytes, and counter
  // Example: cjld2cyuq0000l3m5cbp97x63
  const cuidRegex = /^c[0-9a-z]{24}$/i;
  return cuidRegex.test(value);
}

/**
 * Optional CUID type for nullable fields
 */
export type OptionalCuid = Cuid | null | undefined;

// ============================================
// Common ID Types
// ============================================

export type UserId = Cuid;
export type RecipeId = Cuid;
export type RecipeVersionId = Cuid;
export type SessionId = Cuid;
export type VendorId = Cuid;
export type CoffeeId = Cuid;
export type GrinderId = Cuid;
export type BrewerId = Cuid;
export type PortafilterId = Cuid;
export type BasketId = Cuid;
export type PuckScreenId = Cuid;
export type PaperFilterId = Cuid;
export type TamperId = Cuid;
export type UserEquipmentId = Cuid;
export type UserBeanId = Cuid;
export type UserSetupId = Cuid;
export type CommentId = Cuid;
export type ComparisonId = Cuid;
export type AuditLogId = Cuid;
export type UserAnalyticsId = Cuid;

// ============================================
// Entity ID Types Map
// ============================================

export interface EntityIds {
  user: UserId;
  recipe: RecipeId;
  recipeVersion: RecipeVersionId;
  session: SessionId;
  vendor: VendorId;
  coffee: CoffeeId;
  grinder: GrinderId;
  brewer: BrewerId;
  portafilter: PortafilterId;
  basket: BasketId;
  puckScreen: PuckScreenId;
  paperFilter: PaperFilterId;
  tamper: TamperId;
  userEquipment: UserEquipmentId;
  userBean: UserBeanId;
  userSetup: UserSetupId;
  comment: CommentId;
  comparison: ComparisonId;
  auditLog: AuditLogId;
  userAnalytics: UserAnalyticsId;
}

// ============================================
// Database Entity Types
// ============================================

export type DatabaseEntity = keyof EntityIds;

/**
 * Get the CUID type for a specific entity
 */
export type GetIdType<T extends DatabaseEntity> = EntityIds[T];

// ============================================
// Utility Types
// ============================================

/**
 * Convert all string ID fields in an object to CUID types
 */
export type WithCuidIds<T> = {
  [K in keyof T]: K extends `${string}Id` ? Cuid : T[K];
};

/**
 * Convert all optional string ID fields in an object to OptionalCuid types
 */
export type WithOptionalCuidIds<T> = {
  [K in keyof T]: K extends `${string}Id` ? OptionalCuid : T[K];
};

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate and convert a string to CUID
 * Throws an error if invalid
 */
export function validateCuid(value: string): Cuid {
  if (!isCuid(value)) {
    throw new Error(`Invalid CUID format: ${value}`);
  }
  return asCuid(value);
}

/**
 * Safely convert a string to CUID
 * Returns null if invalid
 */
export function safeParseCuid(value: string): Cuid | null {
  return isCuid(value) ? asCuid(value) : null;
}

/**
 * Validate an array of CUIDs
 */
export function validateCuidArray(values: string[]): Cuid[] {
  const cuids: Cuid[] = [];
  for (const value of values) {
    cuids.push(validateCuid(value));
  }
  return cuids;
}

/**
 * Safely parse an array of CUIDs
 * Filters out invalid values
 */
export function safeParseCuidArray(values: string[]): Cuid[] {
  return values.filter(isCuid).map(asCuid);
}
